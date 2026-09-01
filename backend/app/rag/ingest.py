"""Ingesta del corpus RAG: de texto crudo a filas en ``rag_chunk``.

Une las tres piezas del pipeline offline que "carga el cerebro":
``chunk_text`` (cortar) -> ``embed_textos`` (vectorizar) -> guardar en la DB.
Se corre a mano o desde un worker, nunca en cada request del chat.
"""
from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from app.db.models.rag import RagChunk
from app.rag.chunker import chunk_text
from app.rag.embeddings import embed_textos

logger = logging.getLogger(__name__)


def ingestar_documento(
    db: Session,
    *,
    texto: str,
    fuente: str,
    url: str | None = None,
    titulo: str | None = None,
) -> int:
    """Corta, embebe y guarda un documento. Devuelve la cantidad de chunks.

    No hace commit: el llamador controla la transacción (así puede ingestar
    varios documentos y commitear una sola vez, o abortar todo si algo falla).
    """
    fragmentos = chunk_text(texto)
    if not fragmentos:
        logger.info("Documento vacío, nada para ingestar (fuente=%s)", fuente)
        return 0

    # Una sola llamada a la API para todos los fragmentos del documento.
    vectores = embed_textos(fragmentos)

    filas = [
        RagChunk(
            contenido=fragmento,
            embedding=vector,
            fuente=fuente,
            url=url,
            titulo=titulo,
            chunk_index=i,
        )
        for i, (fragmento, vector) in enumerate(
            zip(fragmentos, vectores, strict=True)
        )
    ]
    db.add_all(filas)
    logger.info(
        "Ingestados %d chunks (fuente=%s, titulo=%r)", len(filas), fuente, titulo
    )
    return len(filas)
