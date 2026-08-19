"""fuentes verificables: fecha en rag_chunk + fuentes por mensaje

Revision ID: f7b8c9d0e1a2
Revises: e6a7b8c9d0f1
Create Date: 2026-08-17
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision: str = "f7b8c9d0e1a2"
down_revision: str = "e6a7b8c9d0f1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "rag_chunk",
        sa.Column("fecha_actualizacion", sa.DateTime(), nullable=True),
    )
    op.add_column("mensaje", sa.Column("fuentes_json", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("mensaje", "fuentes_json")
    op.drop_column("rag_chunk", "fecha_actualizacion")
