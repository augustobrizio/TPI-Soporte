"""Lógica de negocio para comisiones y el builder de horarios."""
from __future__ import annotations

import unicodedata
from datetime import time

from sqlalchemy.orm import Session

from app.db.models.academico import (
    CondicionMateria,
    Correlatividad,
    Cursada,
    Materia,
    UsuarioMateria,
)
from app.repositories import comision_repo, materia_repo, resena_repo, review_repo
from app.services import review_service
from app.schemas.comision import (
    AsignacionOut,
    ComisionCursadaOut,
    ComisionOut,
    Criterio,
    CursadaOut,
    HorarioOut,
    MateriaCursableOut,
    OptimizacionOut,
    ProfesorMiniOut,
    Turno,
)
from app.services import correlatividad_service


def comisiones_con_profesores(
    db: Session, *, anio: int | None = None
) -> list[ComisionOut]:
    """Comisiones (opcionalmente por año) con materias, profesor resuelto y horarios.

    Alimenta la vista de comisiones. ``profesor`` puede ser None (docente ambiguo
    o sin match); la UI cae entonces al ``docente`` (apellido crudo).
    """
    comisiones = comision_repo.listar_comisiones_con_profesor(db, anio=anio)
    reviews = review_repo.reviews_por_par(db)  # {(materia_codigo, profesor_id): ReviewCatedra} (UTNTAC)
    tallies = resena_repo.tallies_por_par(db)  # {(materia_codigo, profesor_id): {nivel: n}} (alumnos)
    salida: list[ComisionOut] = []
    for com in comisiones:
        cursadas_out: list[CursadaOut] = []
        notas_comision: list[float | None] = []
        # Deduplicar: las materias anuales las carga el seed en ambos
        # cuatrimestres con horario idéntico. Colapsamos por (materia, horario)
        # para que cada materia aparezca una sola vez.
        vistos: set[tuple[str, tuple]] = set()
        for cur in sorted(
            com.cursadas, key=lambda c: (c.materia.nombre if c.materia else "")
        ):
            horarios_ord = sorted(
                cur.horarios,
                key=lambda h: (h.dia or "", h.hora_inicio or time.min),
            )
            clave = (
                cur.materia_codigo,
                tuple((h.dia, h.hora_inicio, h.hora_fin, h.aula) for h in horarios_ord),
            )
            if clave in vistos:
                continue
            vistos.add(clave)

            # Nota combinada: votos de UTNTAC + reseñas de alumnos (feature 004).
            review = None
            votos = None
            if cur.profesor is not None:
                par = (cur.materia_codigo, cur.profesor.id)
                review = reviews.get(par)
                tally = tallies.get(par)
                if review is not None or tally:
                    votos = review_service.votos_combinados(review, tally)
            nota = votos.nota if votos is not None else None
            notas_comision.append(nota)

            cursadas_out.append(
                CursadaOut(
                    id=cur.id,
                    materia_codigo=cur.materia_codigo,
                    materia_nombre=cur.materia.nombre if cur.materia else None,
                    cuatrimestre=cur.cuatrimestre,
                    cuatrimestre_materia=cur.materia.cuatrimestre if cur.materia else None,
                    docente=cur.docente,
                    profesor=(
                        ProfesorMiniOut(id=cur.profesor.id, nombre=cur.profesor.nombre)
                        if cur.profesor is not None
                        else None
                    ),
                    nota=nota,
                    clasificacion=review.clasificacion if review is not None else None,
                    cantidad_respuestas=votos.cantidad if votos is not None else None,
                    horarios=[
                        HorarioOut(
                            dia=h.dia,
                            hora_inicio=h.hora_inicio,
                            hora_fin=h.hora_fin,
                            aula=h.aula,
                        )
                        for h in horarios_ord
                    ],
                )
            )
        sc = review_service.score_comision(notas_comision)
        salida.append(
            ComisionOut(
                id=com.id,
                nombre=com.nombre,
                anio=com.anio,
                score=sc.score,
                score_con_review=sc.con_review,
                score_total=sc.total,
                cursadas=cursadas_out,
            )
        )
    return salida


def materias_cursables_con_comisiones(
    db: Session,
    usuario_id: int,
    anio: int,
    cuatrimestre: int,
) -> list[MateriaCursableOut]:
    """Devuelve las materias que el usuario puede cursar junto con sus comisiones
    disponibles para el año y cuatrimestre indicados.

    Incluye materias en estado 'cursable' y también las que ya están 'cursando'
    (por si el usuario quiere cambiar de comisión).
    """
    todas_las_materias = materia_repo.list_materias(db)
    # Condiciones y cursadas elegidas salen juntas: son la misma fila de
    # usuario_materia (materia_codigo -> cursada_id para las seleccionadas).
    condiciones, selecciones = materia_repo.condiciones_y_cursadas_usuario(
        db, usuario_id
    )

    # Todas las correlativas en un solo query e indexadas por materia destino.
    # Pedirlas de a una dentro del loop hacía ~50 round-trips contra Neon (que
    # es remota): 17s de latencia de red para 10 KB de datos.
    correlativas_por_materia: dict[str, list[Correlatividad]] = {}
    for corr in materia_repo.correlativas_de(
        db, [m.codigo for m in todas_las_materias]
    ):
        correlativas_por_materia.setdefault(corr.materia_codigo, []).append(corr)

    # Determinar qué materias son cursables o cursando
    codigos_objetivo: list[str] = []
    for materia in todas_las_materias:
        condicion = condiciones.get(materia.codigo, CondicionMateria.NONE)
        # Excluir las ya terminadas
        if condicion in (CondicionMateria.APROBADO, CondicionMateria.REGULAR):
            continue
        estado = correlatividad_service.calcular_estado(
            materia,
            condicion,
            correlativas_por_materia.get(materia.codigo, []),
            condiciones,
        )
        if estado in ("cursable", "cursando"):
            codigos_objetivo.append(materia.codigo)

    if not codigos_objetivo:
        return []

    cursadas = comision_repo.cursadas_para_materias(
        db, codigos=codigos_objetivo, anio=anio, cuatrimestre=cuatrimestre
    )

    # Agrupar por materia
    por_materia: dict[str, tuple[Materia, list[Cursada]]] = {}
    for cursada in cursadas:
        codigo = cursada.materia_codigo
        if codigo not in por_materia:
            por_materia[codigo] = (cursada.materia, [])
        por_materia[codigo][1].append(cursada)

    resultado: list[MateriaCursableOut] = []
    for codigo in codigos_objetivo:
        if codigo not in por_materia:
            continue
        materia, lista_cursadas = por_materia[codigo]
        comisiones_out = [
            ComisionCursadaOut(
                comision_id=c.comision.id,
                comision_nombre=c.comision.nombre,
                cursada_id=c.id,
                docente=c.docente,
                horarios=[
                    HorarioOut(
                        dia=h.dia,
                        hora_inicio=h.hora_inicio,
                        hora_fin=h.hora_fin,
                        aula=h.aula,
                    )
                    for h in sorted(c.horarios, key=lambda h: (h.dia or "", h.hora_inicio or ""))
                ],
            )
            for c in lista_cursadas
        ]
        resultado.append(
            MateriaCursableOut(
                materia_codigo=codigo,
                materia_nombre=materia.nombre,
                anio_carrera=materia.anio_carrera,
                es_anual=(materia.cuatrimestre or "").strip().lower() == "anual",
                cursada_seleccionada_id=selecciones.get(codigo),
                comisiones=comisiones_out,
            )
        )

    resultado.sort(key=lambda m: (m.anio_carrera or 99, m.materia_codigo))
    return resultado


def seleccionar_cursada(
    db: Session,
    usuario_id: int,
    materia_codigo: str,
    cursada_id: int,
) -> UsuarioMateria:
    """Asigna una cursada específica al registro usuario_materia.

    Si no existe el registro, lo crea con condicion='cursando'.
    """
    cursada = comision_repo.get_cursada(db, cursada_id)
    if cursada is None:
        raise ValueError(f"Cursada {cursada_id} no encontrada.")
    if cursada.materia_codigo != materia_codigo:
        raise ValueError(
            f"La cursada {cursada_id} no corresponde a la materia '{materia_codigo}'."
        )

    registro = comision_repo.get_cursada_usuario(db, usuario_id, materia_codigo)
    if registro is None:
        registro = UsuarioMateria(
            usuario_id=usuario_id,
            materia_codigo=materia_codigo,
            condicion=CondicionMateria.CURSANDO,
            cursada_id=cursada_id,
        )
        db.add(registro)
    else:
        registro.cursada_id = cursada_id
        if registro.condicion == CondicionMateria.NONE:
            registro.condicion = CondicionMateria.CURSANDO

    return registro


def deseleccionar_cursada(
    db: Session, usuario_id: int, materia_codigo: str
) -> bool:
    """Quita la cursada seleccionada sin borrar el registro usuario_materia."""
    registro = comision_repo.get_cursada_usuario(db, usuario_id, materia_codigo)
    if registro is None or registro.cursada_id is None:
        return False
    registro.cursada_id = None
    return True


# ---------------------------------------------------------------------------
# Optimizador de horarios
# ---------------------------------------------------------------------------

# Bloque = (dia_normalizado, minuto_inicio, minuto_fin)
_Bloque = tuple[str, int, int]

# Límite de seguridad para evitar cuelgues en combinaciones patológicas.
_MAX_NODOS = 3_000_000


def _norm_dia(dia: str) -> str:
    s = unicodedata.normalize("NFKD", dia.lower())
    return "".join(c for c in s if not unicodedata.combining(c)).strip()


def _a_minutos(t: time | None) -> int | None:
    if t is None:
        return None
    return t.hour * 60 + t.minute


def _bloques_de(cursada: Cursada) -> list[_Bloque]:
    """Bloques (dia, inicio, fin) en minutos de una cursada."""
    out: list[_Bloque] = []
    for h in cursada.horarios:
        if not h.dia:
            continue
        ini = _a_minutos(h.hora_inicio)
        fin = _a_minutos(h.hora_fin)
        if ini is None or fin is None:
            continue
        if fin <= ini:  # cruza la medianoche
            fin += 24 * 60
        out.append((_norm_dia(h.dia), ini, fin))
    return out


def _solapan(a: list[_Bloque], b: list[_Bloque]) -> bool:
    for d1, s1, e1 in a:
        for d2, s2, e2 in b:
            if d1 == d2 and s1 < e2 and e1 > s2:
                return True
    return False


# Días hábiles para liberar (sin sábado).
_DIAS_LABORABLES = ["lunes", "martes", "miercoles", "jueves", "viernes"]

# Ventanas de turno en minutos desde medianoche.
_TURNOS: dict[str, tuple[int, int]] = {
    "manana": (7 * 60, 13 * 60),        # 07:00 – 13:00
    "tarde": (13 * 60, 18 * 60 + 30),   # 13:00 – 18:30
    "noche": (18 * 60 + 30, 24 * 60),   # 18:30 – 24:00
}


def _por_dia(elegidas: list[tuple[Cursada, list[_Bloque]]]) -> dict[str, list[tuple[int, int]]]:
    por_dia: dict[str, list[tuple[int, int]]] = {}
    for _cursada, bloques in elegidas:
        for dia, ini, fin in bloques:
            por_dia.setdefault(dia, []).append((ini, fin))
    return por_dia


def _huecos_dias(por_dia: dict[str, list[tuple[int, int]]]) -> tuple[int, int]:
    huecos = 0
    for tramos in por_dia.values():
        tramos.sort()
        for k in range(1, len(tramos)):
            gap = tramos[k][0] - tramos[k - 1][1]
            if gap > 0:
                huecos += gap
    return huecos, len(por_dia)


def _minutos_fuera_turno(elegidas: list[tuple[Cursada, list[_Bloque]]], turno: str) -> int:
    """Suma de minutos de clase que caen fuera de la franja preferida."""
    win = _TURNOS.get(turno)
    if win is None:
        return 0
    ws, we = win
    fuera = 0
    for _cursada, bloques in elegidas:
        for _dia, ini, fin in bloques:
            overlap = max(0, min(fin, we) - max(ini, ws))
            fuera += (fin - ini) - overlap
    return fuera


def _evaluar(
    elegidas: list[tuple[Cursada, list[_Bloque]]],
    criterio: Criterio,
    dia_libre: str | None,
    turno: str | None,
) -> tuple[int, int, int]:
    """Devuelve (score, huecos, dias). Menor score es mejor."""
    por_dia = _por_dia(elegidas)
    huecos, dias = _huecos_dias(por_dia)

    if criterio == "dias":
        # Si pidieron un día libre, priorizar liberarlo por encima de todo.
        usa_libre = 1 if (dia_libre and _norm_dia(dia_libre) in por_dia) else 0
        score = usa_libre * 10_000_000 + dias * 100_000 + huecos
    elif criterio == "turno":
        fuera = _minutos_fuera_turno(elegidas, turno or "manana")
        score = fuera * 1_000 + huecos          # respetar turno, desempatar por huecos
    else:  # "huecos"
        score = huecos * 1_000 + dias           # clases seguidas, desempatar por días

    return score, huecos, dias


def _existe_combinacion(
    grupos: list[tuple[str, list[Cursada]]],
    bloques: dict[int, list[_Bloque]],
    dia_excluido: str,
) -> bool:
    """¿Existe alguna combinación sin superposición que NO use `dia_excluido`?"""
    elegidas: list[list[_Bloque]] = []

    def bt(i: int) -> bool:
        if i == len(grupos):
            return True
        _cod, lst = grupos[i]
        for c in lst:
            b = bloques[c.id]
            if any(d == dia_excluido for d, _s, _e in b):
                continue
            if any(_solapan(b, eb) for eb in elegidas):
                continue
            elegidas.append(b)
            if bt(i + 1):
                return True
            elegidas.pop()
        return False

    return bt(0)


def optimizar_horario(
    db: Session,
    materias: list[str],
    anio: int,
    cuatrimestre: int,
    criterio: Criterio,
    dia_libre: str | None = None,
    turno: Turno | None = None,
) -> OptimizacionOut:
    """Prueba combinaciones de comisiones (una por materia) y devuelve la mejor
    sin superposiciones según el criterio elegido.

    Usa backtracking con poda: descarta una rama apenas detecta un choque.
    """
    if not materias:
        return OptimizacionOut(ok=False, motivo="Elegí al menos una materia.", criterio=criterio)

    cursadas = comision_repo.cursadas_para_materias(
        db, codigos=materias, anio=anio, cuatrimestre=cuatrimestre
    )

    por_materia: dict[str, list[Cursada]] = {}
    for c in cursadas:
        por_materia.setdefault(c.materia_codigo, []).append(c)

    sin_comision = [m for m in materias if m not in por_materia]

    grupos = [(cod, lst) for cod, lst in por_materia.items()]
    if not grupos:
        return OptimizacionOut(
            ok=False,
            motivo="Ninguna de las materias elegidas tiene comisiones este cuatrimestre.",
            criterio=criterio,
            materias_sin_comision=sin_comision,
        )

    # Pre-cálculo de bloques + orden por menos opciones (poda más temprana).
    bloques: dict[int, list[_Bloque]] = {c.id: _bloques_de(c) for _cod, lst in grupos for c in lst}
    grupos.sort(key=lambda g: len(g[1]))

    elegidas: list[tuple[Cursada, list[_Bloque]]] = []
    mejor: dict[str, object] = {"score": None, "choice": None, "huecos": 0, "dias": 0}
    nodos = {"n": 0}

    def backtrack(i: int) -> None:
        if nodos["n"] > _MAX_NODOS:
            return
        nodos["n"] += 1
        if i == len(grupos):
            score, huecos, dias = _evaluar(elegidas, criterio, dia_libre, turno)
            if mejor["score"] is None or score < mejor["score"]:  # type: ignore[operator]
                mejor["score"] = score
                mejor["choice"] = list(elegidas)
                mejor["huecos"] = huecos
                mejor["dias"] = dias
            return
        _cod, lst = grupos[i]
        for c in lst:
            b = bloques[c.id]
            if any(_solapan(b, eb) for _ec, eb in elegidas):
                continue
            elegidas.append((c, b))
            backtrack(i + 1)
            elegidas.pop()

    backtrack(0)

    if mejor["choice"] is None:
        return OptimizacionOut(
            ok=False,
            motivo="No hay ninguna combinación sin superposición horaria. Probá quitar alguna materia.",
            criterio=criterio,
            combinaciones_evaluadas=nodos["n"],
            materias_sin_comision=sin_comision,
        )

    asignaciones: list[AsignacionOut] = []
    for cursada, _b in mejor["choice"]:  # type: ignore[union-attr]
        asignaciones.append(
            AsignacionOut(
                materia_codigo=cursada.materia_codigo,
                materia_nombre=cursada.materia.nombre if cursada.materia else cursada.materia_codigo,
                comision_id=cursada.comision.id,
                comision_nombre=cursada.comision.nombre,
                cursada_id=cursada.id,
                horarios=[
                    HorarioOut(dia=h.dia, hora_inicio=h.hora_inicio, hora_fin=h.hora_fin, aula=h.aula)
                    for h in sorted(cursada.horarios, key=lambda h: (h.dia or "", h.hora_inicio or time()))
                ],
            )
        )
    asignaciones.sort(key=lambda a: a.materia_nombre)

    # Análisis de día libre: si se pidió uno y no se pudo, listar cuáles sí se pueden.
    dia_libre_ok = True
    dias_libres_posibles: list[str] = []
    if criterio == "dias" and dia_libre:
        usados = {d for _c, b in mejor["choice"] for d, _s, _e in b}  # type: ignore[union-attr]
        dia_libre_ok = _norm_dia(dia_libre) not in usados
        if not dia_libre_ok:
            dias_libres_posibles = [
                d for d in _DIAS_LABORABLES if _existe_combinacion(grupos, bloques, d)
            ]

    return OptimizacionOut(
        ok=True,
        criterio=criterio,
        total_huecos_min=int(mejor["huecos"]),  # type: ignore[arg-type]
        dias_usados=int(mejor["dias"]),          # type: ignore[arg-type]
        combinaciones_evaluadas=nodos["n"],
        materias_sin_comision=sin_comision,
        asignaciones=asignaciones,
        dia_libre_ok=dia_libre_ok,
        dias_libres_posibles=dias_libres_posibles,
    )
