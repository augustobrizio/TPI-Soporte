"""rag_chunk embedding a 768 dims (Gemini text-embedding-004)

Cambio de proveedor de embeddings (OpenAI 1536 -> Gemini 768). Los vectores de
un modelo no son comparables con los de otro, así que recreamos la columna
vacía en vez de "convertir": cambiar de modelo obliga a re-embeber el corpus.

Revision ID: e6a7b8c9d0f1
Revises: d5f6a7b8c9e0
Create Date: 2026-08-17
"""
from __future__ import annotations

import sqlalchemy as sa
from pgvector.sqlalchemy import Vector

from alembic import op

revision: str = "e6a7b8c9d0f1"
down_revision: str = "d5f6a7b8c9e0"
branch_labels = None
depends_on = None


def _recrear_embedding(dim: int) -> None:
    """Recrea la columna `embedding` con la dimensión `dim` y su índice HNSW.

    El índice depende de la columna, así que se suelta antes y se rehace después.
    """
    op.drop_index("ix_rag_chunk_embedding_hnsw", table_name="rag_chunk")
    op.drop_column("rag_chunk", "embedding")
    op.add_column(
        "rag_chunk", sa.Column("embedding", Vector(dim), nullable=False)
    )
    op.create_index(
        "ix_rag_chunk_embedding_hnsw",
        "rag_chunk",
        ["embedding"],
        postgresql_using="hnsw",
        postgresql_with={"m": 16, "ef_construction": 64},
        postgresql_ops={"embedding": "vector_cosine_ops"},
    )


def upgrade() -> None:
    _recrear_embedding(768)


def downgrade() -> None:
    _recrear_embedding(1536)
