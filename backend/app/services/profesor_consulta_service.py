"""Service que sincroniza horarios de consulta y catedras desde FRRO.

Hace full refresh de ``horario_consulta`` y ``materia_profesor`` (las dos
tablas que administra este scraper). Los profesores se resuelven contra el
padron con ``services/profesor_matching``, que preserva sus IDs ante
re-corridas aunque la pagina cambie la grafia del nombre.

El nombre de materia que viene del sitio se matchea por fuzzy contra el
plan de estudios usando el mismo umbral que SYSACAD (0.72). Profesores
cuya materia no matchea se cargan igual con sus horarios, pero no se les
crea fila en ``materia_profesor`` y el caso se reporta en advertencias.
"""
from __future__ import annotations

import logging

from rapidfuzz import fuzz, process, utils
from sqlalchemy.orm import Session

from app.repositories import materia_repo, profesor_repo
from app.schemas.profesor import ResultadoSincHorarios
from app.scrapers import profesores as profesores_scraper
from app.services import profesor_matching as matching

logger = logging.getLogger(__name__)

CONFIANZA_MIN_MATERIA = 0.72


def _matchear_materia(
    nombre_raw: str, opciones: dict[str, str]
) -> tuple[str, float] | None:
    """Fuzzy match de un nombre de materia contra ``{nombre_materia: codigo}``.

    Devuelve ``(codigo, confianza)`` si supera el umbral, o ``None`` si no.
    """
    match = process.extractOne(
        nombre_raw,
        list(opciones.keys()),
        scorer=fuzz.token_sort_ratio,
        processor=utils.default_process,
        score_cutoff=0,
    )
    if match is None:
        return None
    nombre_match, score, _ = match
    confianza = score / 100.0
    if confianza < CONFIANZA_MIN_MATERIA:
        return None
    return opciones[nombre_match], confianza


def sincronizar_horarios_consulta(db: Session) -> ResultadoSincHorarios:
    """Full refresh de horarios + asociaciones materia-profesor desde FRRO.

    Los profesores se upsertean (no se borran) para preservar IDs y futuras FKs.
    NO hace ``db.commit()`` — eso es responsabilidad del endpoint.

    Raises:
        ValueError: si el scraper no devuelve filas (cambio la pagina o falla
            el parseo).
        httpx.HTTPError: si falla la descarga del sitio.
    """
    html = profesores_scraper.fetch_html()
    items = profesores_scraper.parsear_html(html)
    if not items:
        raise ValueError(
            "El scraper no devolvio filas. ¿Cambio la pagina o el formato?"
        )

    horarios_borrados = profesor_repo.delete_all_horarios(db)
    mp_borrados = profesor_repo.delete_all_materia_profesor(db)

    materias = materia_repo.list_materias(db)
    opciones = {m.nombre: m.codigo for m in materias}
    indice = matching.IndicePadron.cargar(db)

    profesores_tocados: set[int] = set()
    pares_mp_vistos: set[tuple[str, int]] = set()
    materias_no_mapeadas: set[str] = set()
    horarios_creados = 0
    materia_profesor_creados = 0
    errores: list[str] = []

    for item in items:
        try:
            prof, _ = matching.obtener_o_crear(
                db, indice, nombre=item.nombre_profesor, email=item.email
            )
            profesores_tocados.add(prof.id)

            profesor_repo.add_horario(
                db,
                profesor_id=prof.id,
                dia=item.dia,
                hora_inicio=item.hora_inicio,
                hora_fin=item.hora_fin,
                modalidad=item.modalidad,
                aula=item.aula,
            )
            horarios_creados += 1

            if item.materia_nombre:
                match = _matchear_materia(item.materia_nombre, opciones)
                if match is None:
                    materias_no_mapeadas.add(item.materia_nombre)
                else:
                    codigo, _confianza = match
                    par = (codigo, prof.id)
                    if par not in pares_mp_vistos:
                        profesor_repo.add_materia_profesor(
                            db, materia_codigo=codigo, profesor_id=prof.id
                        )
                        pares_mp_vistos.add(par)
                        materia_profesor_creados += 1
        except Exception as e:  # noqa: BLE001
            logger.warning("Error procesando %s: %s", item.nombre_profesor, e)
            errores.append(f"{item.nombre_profesor}: {e}")

    advertencias = [
        f'Materia "{nombre}" no se pudo mapear automaticamente al plan'
        for nombre in sorted(materias_no_mapeadas)
    ]

    return ResultadoSincHorarios(
        profesores_tocados=len(profesores_tocados),
        horarios_borrados=horarios_borrados,
        horarios_creados=horarios_creados,
        materia_profesor_borrados=mp_borrados,
        materia_profesor_creados=materia_profesor_creados,
        advertencias=advertencias,
        errores=errores,
    )
