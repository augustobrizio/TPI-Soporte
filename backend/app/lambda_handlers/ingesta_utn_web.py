"""Handler de Lambda: ingesta del sitio web de FRRO.

Mismo callable que usa el scheduler in-process y el endpoint
``POST /novedades/sincronizar`` — la Lambda solo decide *cuándo* se llama.
"""
from __future__ import annotations

import logging

from app.db.session import SessionLocal
from app.scrapers.novedades.utn_web import UtnWebFuente
from app.services import novedad_service

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def _flush_trazas() -> None:
    """Vacía las trazas de LangSmith antes de devolver el control.

    LangChain manda las trazas en un thread de background, pero Lambda congela
    el entorno de ejecución apenas retorna el handler: sin este flush las
    trazas se pierden y el proyecto de LangSmith queda vacío. Ojo que
    ``LANGCHAIN_CALLBACKS_BACKGROUND=false`` NO sirve — en langchain-core 1.x
    esa variable ya no se lee (verificado: no aparece en el paquete).
    """
    try:
        from langchain_core.tracers.langchain import wait_for_all_tracers

        wait_for_all_tracers()
    except Exception:  # noqa: BLE001 — la observabilidad nunca tumba la ingesta
        logger.warning("No se pudieron flushear las trazas de LangSmith", exc_info=True)


def handler(event, context):
    db = SessionLocal()
    try:
        resultado = novedad_service.run_ingesta_novedades(db, [UtnWebFuente()])
        for f in resultado.fuentes:
            logger.info(
                "Ingesta %s: vistos=%d nuevos=%d novedades=%d descartados=%d estado=%s",
                f.fuente,
                f.items_vistos,
                f.items_nuevos,
                f.items_novedad,
                f.items_descartados,
                f.estado,
            )
        # Idem ingesta_instagram: sin esto la Lambda reporta exito con la
        # ingesta caida (el service atrapa los fallos de fuente).
        fallidas = [f.fuente for f in resultado.fuentes if f.estado == "error"]
        if fallidas:
            logger.error("INGESTA_FALLIDA fuentes=%s", ",".join(fallidas))
        return {"ok": not fallidas, "fuentes": [f.fuente for f in resultado.fuentes]}
    except Exception:
        logger.exception("Ingesta web falló")
        db.rollback()
        raise
    finally:
        _flush_trazas()
        db.close()
