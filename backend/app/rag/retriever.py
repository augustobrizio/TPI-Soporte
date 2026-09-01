"""Retriever del RAG: la búsqueda por significado.

Embebe la pregunta y le pide a Postgres los fragmentos más cercanos por
distancia coseno (operador ``<=>``, vía el índice HNSW). Es la parte ONLINE:
corre en cada pregunta y lo único que gasta API es embeber la consulta (una
frase); la búsqueda en sí la resuelve Neon, gratis.
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.models.rag import RagChunk
from app.rag.embeddings import embed_consulta


def recuperar(
    db: Session, pregunta: str, top_k: int | None = None
) -> list[tuple[RagChunk, float]]:
    """Devuelve los `top_k` fragmentos más parecidos a `pregunta`.

    Cada resultado es ``(fragmento, distancia)``. La distancia coseno va de 0
    (idéntico significado) a 2 (opuesto): cuanto más chica, más relevante.
    """
    k = top_k if top_k is not None else get_settings().rag_top_k

    # 1. La pregunta se convierte en vector con el MISMO modelo que el corpus.
    vector = embed_consulta(pregunta)

    # 2. cosine_distance() genera el operador <=>, que aprovecha el índice HNSW
    #    creado con vector_cosine_ops. Si no coincidieran, el índice se ignora.
    distancia = RagChunk.embedding.cosine_distance(vector)
    stmt = (
        select(RagChunk, distancia.label("distancia"))
        .order_by(distancia)
        .limit(k)
    )

    # 3. Postgres devuelve los k vecinos más cercanos, ya ordenados.
    return [(fila[0], fila[1]) for fila in db.execute(stmt)]
