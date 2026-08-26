"""Services que enriquecen el padron de profesores desde las sheets de UTNTAC.

Dos flujos:

- ``sincronizar_mails`` — sheet de mails: resuelve cada fila contra el padron;
  si encuentra al profesor le pone el email (solo si no tenia), y si no lo
  encuentra lo crea con su email.

- ``sincronizar_catedras`` — sheet de catedras: para cada (asignatura, profesor)
  upsertea el profesor y crea ``materia_profesor`` si
  la asignatura matchea (fuzzy) contra el plan ISI. Asignaturas que no
  pertenecen al plan ISI (FISICA, INGLES, etc.) quedan reportadas como
  no mapeadas pero el profesor igualmente se crea.

Ambos servicios son idempotentes: re-correrlos no genera duplicados ni
sobreescribe emails ya cargados. Quien decide si un nombre de la sheet es un
profesor que ya esta en el padron es ``services/profesor_matching`` — estas
sheets escriben los nombres mas cortos que el padron FRRO ('Ripani, Luciano' vs
'RIPANI, Luciano Ernesto'), asi que comparar strings no alcanza.
"""
from __future__ import annotations

import logging

from rapidfuzz import fuzz, process, utils
from sqlalchemy.orm import Session

from app.repositories import materia_repo, profesor_repo, review_repo
from app.schemas.profesor import ResultadoSincCatedras, ResultadoSincMails
from app.scrapers import profesores_utntac_catedras as scraper_catedras
from app.scrapers import profesores_utntac_mails as scraper_mails
from app.services import profesor_matching as matching

logger = logging.getLogger(__name__)

CONFIANZA_MIN_MATERIA = 0.72


# ---------------------------------------------------------------------------
# Sheet 1: mails
# ---------------------------------------------------------------------------

def sincronizar_mails(db: Session) -> ResultadoSincMails:
    """Lee la sheet de mails y enriquece el padron.

    - Si el profesor existe y no tiene email: se lo seteamos.
    - Si el profesor existe y ya tiene email: no se toca (no sobreescribe).
    - Si el profesor no existe: se crea con su email.

    NO hace ``db.commit()`` — eso es responsabilidad del endpoint.
    """
    texto = scraper_mails.fetch_csv()
    items = scraper_mails.parsear_csv(texto)

    indice = matching.IndicePadron.cargar(db)

    emails_seteados = 0
    emails_ya_existentes = 0
    profesores_creados = 0
    errores: list[str] = []

    for item in items:
        try:
            # Esta sheet escribe los nombres mas cortos que el padron FRRO
            # ('Ripani, Luciano' vs 'RIPANI, Luciano Ernesto'): el matching va
            # por ``IndicePadron``, no por string exacto.
            previo = indice.resolver(item.nombre, item.email)
            tenia_email = bool(previo is not None and previo.email)

            _, creado = matching.obtener_o_crear(
                db, indice, nombre=item.nombre, email=item.email
            )
            if creado:
                profesores_creados += 1
            elif tenia_email:
                emails_ya_existentes += 1
            else:
                emails_seteados += 1
        except Exception as e:  # noqa: BLE001
            logger.warning("Error procesando mail de %s: %s", item.nombre, e)
            errores.append(f"{item.nombre}: {e}")

    return ResultadoSincMails(
        filas_procesadas=len(items),
        emails_seteados=emails_seteados,
        emails_ya_existentes=emails_ya_existentes,
        profesores_creados=profesores_creados,
        errores=errores,
    )


# ---------------------------------------------------------------------------
# Sheet 2: catedras (profesor + asignatura)
# ---------------------------------------------------------------------------

def _matchear_materia(
    nombre_raw: str, opciones: dict[str, str]
) -> str | None:
    """Fuzzy match de nombre de asignatura contra el plan. Devuelve codigo o None."""
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
    if (score / 100.0) < CONFIANZA_MIN_MATERIA:
        return None
    return opciones[nombre_match]


def sincronizar_catedras(db: Session) -> ResultadoSincCatedras:
    """Lee la sheet de catedras y crea profesores + materia_profesor.

    - Profesor: upsert por nombre normalizado (case/accent-insensitive).
    - Asignatura: fuzzy match contra el plan ISI; si no matchea, el profesor
      se crea igual pero no se crea la asociacion en ``materia_profesor``.
    - ``materia_profesor`` se inserta solo si el par (codigo, profesor_id)
      no existe ya — esto preserva las asociaciones cargadas por el scraper
      de horarios FRRO.

    NO hace ``db.commit()`` — eso es responsabilidad del endpoint.
    """
    texto = scraper_catedras.fetch_csv()
    items = scraper_catedras.parsear_csv(texto)

    indice = matching.IndicePadron.cargar(db)
    materias = materia_repo.list_materias(db)
    opciones = {m.nombre: m.codigo for m in materias}
    reviews_idx = review_repo.reviews_por_par(db)  # precarga: evita SELECT por fila

    profesores_creados = 0
    materia_profesor_creados = 0
    materia_profesor_ya_existentes = 0
    reviews_creadas = 0
    reviews_actualizadas = 0
    asignaturas_no_mapeadas: set[str] = set()
    errores: list[str] = []

    for item in items:
        try:
            prof, creado = matching.obtener_o_crear(
                db, indice, nombre=item.nombre_profesor, email=None
            )
            if creado:
                profesores_creados += 1

            codigo = _matchear_materia(item.asignatura, opciones)
            if codigo is None:
                asignaturas_no_mapeadas.add(item.asignatura)
                continue

            if profesor_repo.existe_materia_profesor(
                db, materia_codigo=codigo, profesor_id=prof.id
            ):
                materia_profesor_ya_existentes += 1
            else:
                profesor_repo.add_materia_profesor(
                    db, materia_codigo=codigo, profesor_id=prof.id
                )
                materia_profesor_creados += 1

            # Reseña: upsert solo si la fila trae votos.
            if item.total_votos > 0:
                creada = review_repo.upsert_review(
                    db,
                    materia_codigo=codigo,
                    profesor_id=prof.id,
                    clasificacion=item.clasificacion,
                    cantidad_respuestas=item.cantidad_respuestas,
                    super_recomiendo=item.super_recomiendo,
                    recomiendo=item.recomiendo,
                    normal=item.normal,
                    evitaria=item.evitaria,
                    super_evitaria=item.super_evitaria,
                    cache=reviews_idx,
                )
                if creada:
                    reviews_creadas += 1
                else:
                    reviews_actualizadas += 1
        except Exception as e:  # noqa: BLE001
            logger.warning(
                "Error procesando %s / %s: %s",
                item.nombre_profesor,
                item.asignatura,
                e,
            )
            errores.append(f"{item.nombre_profesor} ({item.asignatura}): {e}")

    return ResultadoSincCatedras(
        filas_procesadas=len(items),
        profesores_creados=profesores_creados,
        materia_profesor_creados=materia_profesor_creados,
        materia_profesor_ya_existentes=materia_profesor_ya_existentes,
        reviews_creadas=reviews_creadas,
        reviews_actualizadas=reviews_actualizadas,
        asignaturas_no_mapeadas=sorted(asignaturas_no_mapeadas),
        errores=errores,
    )
