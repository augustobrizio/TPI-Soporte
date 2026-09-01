"""Jobs de ingesta: wrappers finos que adaptan disparador -> callable del service."""
from __future__ import annotations

import logging

from app.config import get_settings
from app.db.session import SessionLocal
from app.services import novedad_service

logger = logging.getLogger(__name__)


def ingesta_instagram() -> None:
    settings = get_settings()
    if not settings.instagram_handles_list:
        logger.info("Ingesta Instagram omitida: fuente no configurada.")
        return
    from app.scrapers.novedades.instagram import InstagramFuente

    _run([InstagramFuente()])


def ingesta_utn_web() -> None:
    settings = get_settings()
    if not settings.utn_novedades_url:
        logger.info("Ingesta UTN web omitida: fuente no configurada.")
        return
    from app.scrapers.novedades.utn_web import UtnWebFuente

    _run([UtnWebFuente()])


def _run(fuentes) -> None:
    db = SessionLocal()
    try:
        resultado = novedad_service.run_ingesta_novedades(db, fuentes)
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
    except Exception:  # noqa: BLE001
        logger.exception("Job de ingesta falló")
        db.rollback()
    finally:
        db.close()
