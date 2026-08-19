"""rag_chunk (corpus del chatbot con embeddings pgvector)

Revision ID: d5f6a7b8c9e0
Revises: c4d5e6f7a8b9
Create Date: 2026-08-17
"""
from __future__ import annotations

import sqlalchemy as sa
from pgvector.sqlalchemy import Vector

from alembic import op

revision: str = "d5f6a7b8c9e0"
down_revision: str = "c4d5e6f7a8b9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Activa pgvector en la DB. Sin esto, el tipo `vector` no existe y el
    # create_table falla. IF NOT EXISTS: es idempotente y no pisa nada.
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.create_table(
        "rag_chunk",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("contenido", sa.Text(), nullable=False),
        sa.Column("embedding", Vector(1536), nullable=False),
        sa.Column("fuente", sa.Text(), nullable=False),
        sa.Column("url", sa.Text(), nullable=True),
        sa.Column("titulo", sa.Text(), nullable=True),
        sa.Column("chunk_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_rag_chunk_fuente", "rag_chunk", ["fuente"])

    # Índice HNSW para búsqueda por vecino más cercano. Sin índice, Postgres
    # compara la pregunta contra TODAS las filas (lento cuando el corpus crece).
    # vector_cosine_ops = distancia coseno; DEBE coincidir con el operador que
    # use el retriever (<=>). HNSW no requiere entrenamiento y da buena recall.
    op.create_index(
        "ix_rag_chunk_embedding_hnsw",
        "rag_chunk",
        ["embedding"],
        postgresql_using="hnsw",
        postgresql_with={"m": 16, "ef_construction": 64},
        postgresql_ops={"embedding": "vector_cosine_ops"},
    )


def downgrade() -> None:
    op.drop_index("ix_rag_chunk_embedding_hnsw", table_name="rag_chunk")
    op.drop_index("ix_rag_chunk_fuente", table_name="rag_chunk")
    op.drop_table("rag_chunk")
    # No borramos la extensión: podría estar en uso por otras tablas a futuro.
