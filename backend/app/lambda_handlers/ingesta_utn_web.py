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
        db.close()
