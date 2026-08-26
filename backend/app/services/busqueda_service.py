"""Buscador global: una consulta, resultados de los cuatro dominios.

**Por qué el filtrado es en Python y no en SQL.** El buscador tiene que
ignorar acentos ("analisis" encuentra "Análisis Matemático") y Postgres sólo
hace eso con la extensión ``unaccent``, que además no existe en el SQLite de
los tests. Como ya hay una única implementación de normalización en el
proyecto (``core.texto.normalizar_texto``, la que usan el matcher de
profesores y el pegado de SYSACAD), se reusa esa: un solo criterio de "estas
dos grafías son la misma cosa" en todo el sistema.

El costo es traer las filas y descartarlas en memoria, y por eso cada
repositorio expone un listado liviano y acotado. Con el tamaño real del
dominio —una sesentena de materias, un par de cientos de profesores, unas
decenas de comisiones— es despreciable. La única entidad que crece sin techo
son las novedades, y ahí el listado ya viene con ventana.
"""
from __future__ import annotations

from collections.abc import Iterable

from rapidfuzz import fuzz
from sqlalchemy.orm import Session

from app.core.texto import normalizar_texto
from app.db.models.academico import Comision, Materia
from app.db.models.novedad import Novedad
from app.db.models.profesor import Profesor
from app.repositories import comision_repo, materia_repo, novedad_repo, profesor_repo
from app.schemas.busqueda import ItemBusqueda, RespuestaBusqueda

#: Abajo de esto no se busca: con una sola letra matchea medio padrón y la
#: lista de resultados deja de ser una respuesta para ser ruido.
LARGO_MINIMO = 2

#: Cuántos resultados devuelve cada grupo. Es un command palette, no un
#: listado: si lo que buscabas no está en los primeros, conviene afinar la
#: consulta antes que scrollear.
LIMITE_POR_TIPO = 5

# Puntajes de match, de mejor a peor. Se usan para ordenar: el que arranca
# con lo que escribiste va antes que el que lo menciona por la mitad.
_EMPIEZA = 0
_EMPIEZA_PALABRA = 1
_CONTIENE = 2
#: Último recurso, y a propósito lejos de los exactos: cualquier match exacto
#: tiene que ganarle a uno aproximado aunque sea por el medio de la palabra.
_APROXIMADO = 5

#: El match aproximado sólo se intenta con tokens largos. Con tres letras,
#: "mat" se parece a demasiadas cosas y el buscador empieza a inventar.
_LARGO_MINIMO_APROXIMADO = 5
#: Similitud (0-100) para aceptar un token aproximado. 85 deja pasar la
#: variación de género y número del español —"matemática"/"matemático",
#: "algoritmos"/"algoritmo"— y corta antes de emparentar palabras distintas.
_UMBRAL_APROXIMADO = 85


def _puntaje_token(texto_norm: str, token: str) -> int | None:
    """Qué tan bien matchea un token contra un texto ya normalizado.

    Devuelve ``None`` si no matchea. Números más chicos son mejores.

    Los tres primeros escalones son exactos. El cuarto usa rapidfuzz —la misma
    librería con la que el import de SYSACAD matchea materias— para cubrir la
    variación de género y número: sin él, buscar "matematica" no encuentra
    "Análisis Matemático", que es exactamente lo que uno escribe cuando no se
    acuerda del nombre completo de la materia.
    """
    if texto_norm.startswith(token):
        return _EMPIEZA
    if f" {token}" in texto_norm:
        return _EMPIEZA_PALABRA
    if token in texto_norm:
        return _CONTIENE
    if (
        len(token) >= _LARGO_MINIMO_APROXIMADO
        and fuzz.partial_ratio(token, texto_norm) >= _UMBRAL_APROXIMADO
    ):
        return _APROXIMADO
    return None


def _puntaje(texto: str | None, tokens: list[str]) -> int | None:
    """Puntaje de un candidato contra la consulta entera.

    **Todos** los tokens tienen que aparecer: buscar "analisis 2" no puede
    traer todas las materias que dicen "análisis". El puntaje final es la
    suma, así que matchear al principio de cada palabra pesa más que
    matchear por el medio.
    """
    if not texto:
        return None
    texto_norm = normalizar_texto(texto)
    total = 0
    for token in tokens:
        parcial = _puntaje_token(texto_norm, token)
        if parcial is None:
            return None
        total += parcial
    return total


def _mejor_puntaje(textos: Iterable[str | None], tokens: list[str]) -> int | None:
    """El mejor puntaje entre varios campos del mismo candidato.

    Una materia matchea por nombre o por código; el que ande mejor manda.
    """
    puntajes = [p for p in (_puntaje(t, tokens) for t in textos) if p is not None]
    return min(puntajes) if puntajes else None


def _recortar(texto: str | None, largo: int = 90) -> str | None:
    """Primera línea del texto, recortada. ``None`` si no hay nada que mostrar."""
    if not texto:
        return None
    limpio = " ".join(texto.split())
    if not limpio:
        return None
    return limpio if len(limpio) <= largo else f"{limpio[: largo - 1]}…"


def _top(
    candidatos: list[tuple[int, str, ItemBusqueda]], limite: int
) -> list[ItemBusqueda]:
    """Ordena por puntaje (y por título para desempatar) y corta."""
    candidatos.sort(key=lambda c: (c[0], c[1]))
    return [item for _, _, item in candidatos[:limite]]


# ---------------------------------------------------------------------------
# Un buscador por dominio
# ---------------------------------------------------------------------------
def _buscar_materias(
    db: Session, tokens: list[str], limite: int
) -> list[ItemBusqueda]:
    encontradas: list[tuple[int, str, ItemBusqueda]] = []
    materia: Materia
    for materia in materia_repo.list_materias(db):
        puntaje = _mejor_puntaje((materia.nombre, materia.codigo), tokens)
        if puntaje is None:
            continue
        detalle = materia.codigo
        if materia.anio_carrera:
            detalle = f"{materia.codigo} · {materia.anio_carrera}° año"
        encontradas.append(
            (
                puntaje,
                materia.nombre,
                ItemBusqueda(
                    tipo="materia",
                    id=materia.codigo,
                    titulo=materia.nombre,
                    detalle=detalle,
                    # El campo es Literal: cualquier otro valor de la columna
                    # (o NULL) se manda como None y el frontend cae al grafo
                    # de troncales, que es el que se abre por defecto.
                    tipo_materia=(
                        materia.tipo if materia.tipo in ("troncal", "electiva") else None
                    ),
                ),
            )
        )
    return _top(encontradas, limite)


def _buscar_profesores(
    db: Session, tokens: list[str], limite: int
) -> list[ItemBusqueda]:
    encontrados: list[tuple[int, str, ItemBusqueda]] = []
    profesor: Profesor
    for profesor in profesor_repo.list_profesores(db):
        if not profesor.nombre:
            continue
        puntaje = _mejor_puntaje((profesor.nombre, profesor.email), tokens)
        if puntaje is None:
            continue
        encontrados.append(
            (
                puntaje,
                profesor.nombre,
                ItemBusqueda(
                    tipo="profesor",
                    id=str(profesor.id),
                    titulo=profesor.nombre,
                    detalle=profesor.email,
                ),
            )
        )
    return _top(encontrados, limite)


def _buscar_comisiones(
    db: Session, tokens: list[str], limite: int
) -> list[ItemBusqueda]:
    encontradas: list[tuple[int, str, ItemBusqueda]] = []
    comision: Comision
    for comision in comision_repo.listar_livianas(db):
        if not comision.nombre:
            continue
        puntaje = _puntaje(comision.nombre, tokens)
        if puntaje is None:
            continue
        encontradas.append(
            (
                puntaje,
                comision.nombre,
                ItemBusqueda(
                    tipo="comision",
                    # El id es el de la fila y no el nombre: el mismo nombre
                    # ("1K01") existe una vez por año académico, así que
                    # identificar por nombre devolvía resultados que el
                    # frontend no podía distinguir entre sí.
                    id=str(comision.id),
                    titulo=comision.nombre,
                    detalle=f"Comisión {comision.anio}" if comision.anio else "Comisión",
                ),
            )
        )
    return _top(encontradas, limite)


def _buscar_novedades(
    db: Session, tokens: list[str], limite: int
) -> list[ItemBusqueda]:
    encontradas: list[tuple[int, str, ItemBusqueda]] = []
    novedad: Novedad
    for novedad in novedad_repo.listar_recientes(db):
        if not novedad.titulo:
            continue
        puntaje = _mejor_puntaje((novedad.titulo, novedad.descripcion), tokens)
        if puntaje is None:
            continue
        encontradas.append(
            (
                puntaje,
                novedad.titulo,
                ItemBusqueda(
                    tipo="novedad",
                    id=str(novedad.id),
                    titulo=novedad.titulo,
                    detalle=_recortar(novedad.descripcion),
                ),
            )
        )
    return _top(encontradas, limite)


# ---------------------------------------------------------------------------
# Entrada pública
# ---------------------------------------------------------------------------
def buscar(
    db: Session, query: str, *, limite_por_tipo: int = LIMITE_POR_TIPO
) -> RespuestaBusqueda:
    """Busca ``query`` en materias, profesores, comisiones y novedades.

    Devuelve los grupos vacíos —no un error— cuando la consulta es demasiado
    corta o no matchea nada: para el que escribe en el buscador, "todavía no
    hay nada" y "no encontré nada" se ven igual, y ninguno de los dos es una
    falla que amerite un 4xx.
    """
    tokens = normalizar_texto(query).split()
    if not tokens or len(normalizar_texto(query)) < LARGO_MINIMO:
        return RespuestaBusqueda(query=query, total=0)

    materias = _buscar_materias(db, tokens, limite_por_tipo)
    profesores = _buscar_profesores(db, tokens, limite_por_tipo)
    comisiones = _buscar_comisiones(db, tokens, limite_por_tipo)
    novedades = _buscar_novedades(db, tokens, limite_por_tipo)

    return RespuestaBusqueda(
        query=query,
        total=len(materias) + len(profesores) + len(comisiones) + len(novedades),
        materias=materias,
        profesores=profesores,
        comisiones=comisiones,
        novedades=novedades,
    )
