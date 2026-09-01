"""Ingesta del corpus RAG desde las fuentes web.

Uso:
    docker compose exec backend uv run python -m scripts.ingestar_rag --todas
    docker compose exec backend uv run python -m scripts.ingestar_rag --fuente gradiente
    docker compose exec backend uv run python -m scripts.ingestar_rag --limpiar-demo

Idempotente por fuente: borra los chunks de la fuente y re-inserta. Correrlo
varias veces no duplica. Todo corre en una transacción: si algo falla, rollback.
"""
from __future__ import annotations

import argparse
import logging
import sys

from sqlalchemy import delete

from app.db.models.rag import RagChunk
from app.db.session import SessionLocal
from app.rag.ingest import ingestar_fuente
from app.scrapers.base import FuenteRAG
from app.scrapers.frro_web import FrroWebFuente
from app.scrapers.gradiente import GradienteFuente
from app.scrapers.pdfs import PdfFuente

logging.basicConfig(
    level=logging.INFO, format="%(levelname)s %(name)s: %(message)s"
)
logger = logging.getLogger("ingestar_rag")

# Registro de fuentes disponibles. Sumar una fuente nueva = agregarla acá.
FUENTES: dict[str, type[FuenteRAG]] = {
    "gradiente": GradienteFuente,
    "frro_web": FrroWebFuente,
    "frro_pdf": PdfFuente,
}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Ingesta del corpus RAG.")
    parser.add_argument(
        "--fuente",
        choices=sorted(FUENTES),
        action="append",
        help="Fuente a ingestar (repetible).",
    )
    parser.add_argument(
        "--todas", action="store_true", help="Ingestar todas las fuentes."
    )
    parser.add_argument(
        "--limpiar-demo",
        action="store_true",
        help="Borrar los chunks de prueba (fuente=demo_seed).",
    )
    args = parser.parse_args(argv)

    seleccion = sorted(FUENTES) if args.todas else (args.fuente or [])
    if not seleccion and not args.limpiar_demo:
        parser.error("Indicá --fuente, --todas o --limpiar-demo.")

    db = SessionLocal()
    try:
        if args.limpiar_demo:
            n = db.execute(
                delete(RagChunk).where(RagChunk.fuente == "demo_seed")
            ).rowcount
            logger.info("demo_seed: %s chunks borrados", n)

        for nombre in seleccion:
            fuente = FUENTES[nombre]()
            logger.info("Trayendo documentos de %s ...", nombre)
            docs = list(fuente.fetch_documentos())
            total = ingestar_fuente(db, nombre=nombre, documentos=docs)
            logger.info(
                "Fuente %s: %d documentos -> %d chunks", nombre, len(docs), total
            )

        db.commit()
        logger.info("Ingesta OK (commit).")
    except Exception:
        db.rollback()
        logger.exception("Falló la ingesta; se hizo rollback.")
        return 1
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
