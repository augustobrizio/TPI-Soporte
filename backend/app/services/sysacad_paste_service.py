"""Servicio de importacion masiva desde texto pegado de SYSACAD.

Flujo en dos pasos:
  1. parsear_texto() -> PreviewImportSysacad
       Parsea el texto tab-separado que el alumno copia del Estado Academico,
       hace fuzzy matching contra la DB y devuelve un preview para revisar.
  2. confirmar_importacion() -> ResultadoImportSysacad
       Aplica el batch upsert con los items que el alumno confirmo.

Sin dependencias externas de APIs. Solo rapidfuzz (instalado localmente).
"""
from __future__ import annotations

import logging
import re

from rapidfuzz import fuzz, process
from sqlalchemy.orm import Session

from app.core.texto import normalizar_texto
from app.db.models.academico import CondicionMateria
from app.repositories import comision_repo, materia_repo
from app.schemas.materia import (
    ConfirmarImportIn,
    ItemImportMapeado,
    PreviewImportSysacad,
    ResultadoImportSysacad,
)
from app.services import comision_service

logger = logging.getLogger(__name__)

# Score minimo para considerar un match valido y marcarlo como importar=True.
CONFIANZA_MINIMA = 0.72

# Materias del cursillo / pre-ingreso que NO pertenecen al plan de carrera.
# Se excluyen antes del fuzzy-matching para evitar falsos positivos
# (ej: "Física" del cursillo coincide con "Física I" al 86%).
# Los nombres van normalizados (``normalizar_texto``): una sola grafia por
# materia cubre mayusculas y tildes.
_CURSILLO_EXCLUIR: frozenset[str] = frozenset({
    "fisica",
    "matematica",
    "quimica",
    "taller de orientacion universitaria",
    "taller de ingreso",
    "ingreso a la universidad",
    "ingles tecnico",
})

# Prioridad de condiciones para deduplicacion (mayor numero = mayor prioridad).
_PRIO: dict[CondicionMateria, int] = {
    CondicionMateria.APROBADO: 4,
    CondicionMateria.CURSANDO: 3,
    CondicionMateria.REGULAR: 2,
    CondicionMateria.LIBRE: 1,
    CondicionMateria.NONE: 0,
}


# ---------------------------------------------------------------------------
# Parseo del campo "Estado" de SYSACAD
# ---------------------------------------------------------------------------

def _parsear_condicion(estado_texto: str) -> tuple[CondicionMateria, float | None]:
    """Interpreta el texto del campo Estado y devuelve (condicion, nota).

    Patrones conocidos de SYSACAD:
      "Aprobada con 8 (90 hs.) Tomo: 2 Folio: 45"  -> aprobado, nota=8
      "Aprobada con 7,5 (120 hs.) ..."              -> aprobado, nota=7.5
      "Cursa en 4K02 Aula 501 Zeballos 1341"        -> cursando, nota=None
      "Regular"                                      -> regular, nota=None
    """
    texto = estado_texto.strip().lower()

    if "aprobad" in texto:
        match = re.search(r"con\s+(\d+(?:[.,]\d+)?)", texto)
        nota: float | None = None
        if match:
            nota = float(match.group(1).replace(",", "."))
        return CondicionMateria.APROBADO, nota

    if "cursa" in texto:
        return CondicionMateria.CURSANDO, None

    if "regular" in texto:
        return CondicionMateria.REGULAR, None

    return CondicionMateria.LIBRE, None


# Nombre de comision tal como lo escribe SYSACAD dentro del estado: un digito
# de año, letras opcionales de especialidad y el numero ('4K02', '3EK02').
# Es el mismo formato que ``Comision.nombre``, asi que se compara de una.
_RE_COMISION = re.compile(r"\b(\d[A-Z]{0,3}K\d{1,3})\b", re.IGNORECASE)


def _parsear_comision(estado_texto: str) -> str | None:
    """Extrae la comision de un estado 'Cursa en 4K02 Aula 501 Zeballos 1341'.

    Devuelve None si el texto no la trae. La direccion de la sede no confunde
    al patron: exige la 'K' entre los dos numeros ('Zeballos 1341' no matchea).
    """
    match = _RE_COMISION.search(estado_texto)
    return match.group(1).upper() if match else None


# ---------------------------------------------------------------------------
# Parseo del texto pegado
# ---------------------------------------------------------------------------

def _parsear_texto(texto: str) -> list[dict]:
    """Extrae filas validas del texto copiado del Estado Academico de SYSACAD.

    El formato esperado es tab-separado, una fila por linea:
      <anio_carrera>  <nombre>  <estado_texto>  [<anio_cursada>]

    - Filas donde la primera columna no es un entero 1-9 se descartan
      (headers, filas en blanco, filas de seccion).
    - Filas con estado vacio se descartan (materias sin registro).
    - Duplicados (mismo nombre, puede pasar si pegan dos veces) se
      resuelven quedandose con el de mayor prioridad de condicion.
    """
    # key: normalizar_texto(nombre) -> dict con los campos del item
    visto: dict[str, dict] = {}

    for linea in texto.splitlines():
        cols = linea.split("\t")

        # Minimo: anio + nombre
        if len(cols) < 2:
            continue

        # Primera columna: anio de carrera (0-9; 0 = pre-ingreso o sin anio)
        try:
            anio_carrera = int(cols[0].strip())
            if not 0 <= anio_carrera <= 9:
                continue
        except ValueError:
            continue  # header o fila de seccion

        nombre = cols[1].strip()
        if not nombre:
            continue

        # Excluir materias del cursillo / pre-ingreso (nombres exactos normalizados)
        nombre_norm = normalizar_texto(nombre)
        if nombre_norm in _CURSILLO_EXCLUIR:
            continue

        # Tercera columna: estado (puede estar vacia)
        estado_texto = cols[2].strip() if len(cols) > 2 else ""
        if not estado_texto:
            continue  # sin estado = sin registro, ignorar

        # Cuarta columna: anio cursada (ej: 2023) — opcional
        anio_cursada: int | None = None
        if len(cols) > 3:
            try:
                posible_anio = int(cols[3].strip())
                if 1990 <= posible_anio <= 2100:
                    anio_cursada = posible_anio
            except ValueError:
                pass

        # Fallback: extraer anio del texto de estado (ej: "Aprobada en 2023",
        # "Aprobada con 8 (90 hs.) en 2023", "Aprobada en 2do cuat. 2022")
        if anio_cursada is None:
            year_match = re.search(r"\b(20\d{2})\b", estado_texto)
            if year_match:
                anio_cursada = int(year_match.group(1))

        condicion, nota = _parsear_condicion(estado_texto)

        # La comision solo tiene sentido para lo que se esta cursando ahora:
        # es lo que despues selecciona la cursada en la grilla de Horarios.
        comision_nombre = (
            _parsear_comision(estado_texto)
            if condicion == CondicionMateria.CURSANDO
            else None
        )

        # Deduplicar: quedarse con el estado de mayor prioridad
        key = nombre_norm
        if key in visto:
            existing_prio = _PRIO.get(visto[key]["condicion"], 0)
            new_prio = _PRIO.get(condicion, 0)
            if new_prio <= existing_prio:
                continue  # el que ya tenemos es mejor o igual

        visto[key] = {
            "nombre": nombre,
            "estado_texto": estado_texto,
            "condicion": condicion,
            "nota": nota,
            "anio_cursada": anio_cursada,
            "comision_nombre": comision_nombre,
        }

    return list(visto.values())


# ---------------------------------------------------------------------------
# Fuzzy matching contra la DB
# ---------------------------------------------------------------------------

def _matchear_materias(
    items_parsed: list[dict],
    db: Session,
) -> list[ItemImportMapeado]:
    """Para cada item parseado busca la mejor materia en la DB por nombre.

    El matcheo va contra el nombre **normalizado** (minusculas, sin tildes, sin
    puntuacion). rapidfuzz no normaliza por su cuenta: sin esto, comparar
    "SOPORTE A LAS BASES DE DATOS CON PROGRAMACION VISUAL" —como lo escribe
    SYSACAD— contra "Soporte a las Bases de Datos con Programación Visual"
    daba 19.6% y elegia otra materia. Con el processor da 100%.
    """
    todas = materia_repo.list_materias(db)
    nombre_a_codigo: dict[str, tuple[str, str]] = {
        m.nombre: (m.codigo, m.nombre) for m in todas
    }
    opciones = list(nombre_a_codigo.keys())

    resultado: list[ItemImportMapeado] = []

    for item in items_parsed:
        match = process.extractOne(
            item["nombre"],
            opciones,
            scorer=fuzz.token_sort_ratio,
            processor=normalizar_texto,
            score_cutoff=0,
        )

        if match is None:
            resultado.append(
                ItemImportMapeado(
                    nombre_original=item["nombre"],
                    estado_texto=item["estado_texto"],
                    materia_codigo=None,
                    materia_nombre=None,
                    confianza=0.0,
                    condicion=item["condicion"],
                    nota=item["nota"],
                    anio_cursada=item["anio_cursada"],
                    comision_nombre=item["comision_nombre"],
                    importar=False,
                )
            )
            continue

        nombre_match, score, _ = match
        confianza = round(score / 100.0, 4)
        codigo, nombre_real = nombre_a_codigo[nombre_match]

        resultado.append(
            ItemImportMapeado(
                nombre_original=item["nombre"],
                estado_texto=item["estado_texto"],
                materia_codigo=codigo,
                materia_nombre=nombre_real,
                confianza=confianza,
                condicion=item["condicion"],
                nota=item["nota"],
                anio_cursada=item["anio_cursada"],
                comision_nombre=item["comision_nombre"],
                importar=confianza >= CONFIANZA_MINIMA,
            )
        )

    return resultado


# ---------------------------------------------------------------------------
# Seleccion automatica de la comision que el alumno esta cursando
# ---------------------------------------------------------------------------

def _autoseleccionar_cursada(
    db: Session,
    usuario_id: int,
    item: ItemImportMapeado,
) -> bool:
    """Deja elegida la comision que el estado de SYSACAD declaraba.

    Sin esto la materia se importaba como 'cursando' pero sin ``cursada_id``, y
    la grilla de Horarios —que se pinta desde ese campo— quedaba vacia.

    Elige la cursada mas reciente de esa comision, prefiriendo el año que traiga
    el pegado si existe. Devuelve False —sin romper nada— cuando la comision no
    esta cargada: el import no se cae por no encontrarla.
    """
    if item.condicion != CondicionMateria.CURSANDO or not item.comision_nombre:
        return False
    if not item.materia_codigo:
        return False

    candidatas = comision_repo.cursadas_por_nombre_comision(
        db,
        materia_codigo=item.materia_codigo,
        comision_nombre=item.comision_nombre,
    )
    if not candidatas:
        logger.info(
            "Comision %s no encontrada para %s: se importa sin seleccionarla.",
            item.comision_nombre,
            item.materia_codigo,
        )
        return False

    # Las candidatas ya vienen por año desc / cuatrimestre asc. Si el pegado
    # trae el año, se respeta; si no, gana la mas reciente. Para las anuales
    # —cargadas en ambos cuatrimestres— cualquiera sirve: el front resuelve la
    # comision cruzando los dos.
    elegida = candidatas[0]
    if item.anio_cursada is not None:
        del_anio = [c for c in candidatas if c.comision.anio == item.anio_cursada]
        if del_anio:
            elegida = del_anio[0]

    # Pasa por el servicio de comisiones para no duplicar sus validaciones
    # (que la cursada exista y sea de esta materia).
    comision_service.seleccionar_cursada(
        db,
        usuario_id=usuario_id,
        materia_codigo=item.materia_codigo,
        cursada_id=elegida.id,
    )
    return True


# ---------------------------------------------------------------------------
# API publica del servicio
# ---------------------------------------------------------------------------

def parsear_texto(texto: str, db: Session) -> PreviewImportSysacad:
    """Paso 1: parsea el texto pegado y hace fuzzy matching. No toca la DB.

    Raises ValueError si el texto no contiene filas validas.
    """
    advertencias: list[str] = []

    items_parsed = _parsear_texto(texto)

    if not items_parsed:
        raise ValueError(
            "No se encontraron materias en el texto. "
            "Asegurate de copiar la tabla completa del Estado Academico de SYSACAD."
        )

    items_mapeados = _matchear_materias(items_parsed, db)

    sin_match = [i for i in items_mapeados if i.confianza < CONFIANZA_MINIMA]
    if sin_match:
        nombres = ", ".join(f'"{i.nombre_original}"' for i in sin_match[:4])
        sufijo = f" y {len(sin_match) - 4} mas" if len(sin_match) > 4 else ""
        advertencias.append(
            f"{len(sin_match)} materia(s) no se pudieron mapear automaticamente: "
            f"{nombres}{sufijo}. Elegiles la materia a mano en la tabla de abajo."
        )

    total_mapeados = sum(1 for i in items_mapeados if i.confianza >= CONFIANZA_MINIMA)

    return PreviewImportSysacad(
        items=items_mapeados,
        total_parseados=len(items_parsed),
        total_mapeados=total_mapeados,
        advertencias=advertencias,
    )


def confirmar_importacion(
    db: Session,
    usuario_id: int,
    payload: ConfirmarImportIn,
) -> ResultadoImportSysacad:
    """Paso 2: aplica el batch upsert para los items con importar=True.

    Si ``payload.reemplazar`` es True, primero borra todo el historial previo
    del usuario para que el pegado quede como única fuente de verdad (evita que
    se acumulen materias de importaciones anteriores, ej: electivas distintas).
    Todo ocurre en la misma transacción: si algo falla, no se commitea nada.

    A las materias en curso que traigan comisión ("Cursa en 4K02") además se
    les deja seleccionada la cursada, que es lo que pinta la grilla de Horarios
    y la agenda del panel. Si esa comisión no está cargada, la materia se
    importa igual: el import no depende de encontrarla.
    """
    from app.repositories.materia_repo import (
        delete_all_usuario_materias,
        upsert_usuario_materia,
    )

    importadas = 0
    omitidas = 0
    eliminadas = 0
    comisiones_asignadas = 0
    errores: list[str] = []

    if payload.reemplazar:
        eliminadas = delete_all_usuario_materias(db, usuario_id)
        db.flush()

    for item in payload.items:
        if not item.importar or not item.materia_codigo:
            omitidas += 1
            continue

        try:
            upsert_usuario_materia(
                db,
                usuario_id=usuario_id,
                materia_codigo=item.materia_codigo,
                condicion=item.condicion,
                nota=item.nota,
                anio_cursada=item.anio_cursada,
            )
            importadas += 1
        except Exception as e:  # noqa: BLE001
            logger.warning("Error importando %s: %s", item.materia_codigo, e)
            errores.append(f"{item.materia_nombre or item.materia_codigo}: {e}")
            omitidas += 1
            continue

        # La comision va aparte: si falla, la materia ya quedo importada igual.
        try:
            if _autoseleccionar_cursada(db, usuario_id, item):
                comisiones_asignadas += 1
        except Exception as e:  # noqa: BLE001
            logger.warning(
                "No se pudo seleccionar la comision %s de %s: %s",
                item.comision_nombre,
                item.materia_codigo,
                e,
            )

    db.commit()
    return ResultadoImportSysacad(
        importadas=importadas,
        omitidas=omitidas,
        eliminadas=eliminadas,
        comisiones_asignadas=comisiones_asignadas,
        errores=errores,
    )
