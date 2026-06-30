"""task: agregar tipo y estimado_horas

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-06-24

"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "b2c3d4e5f6a7"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("task", sa.Column("tipo", sa.Text(), nullable=True))
    op.add_column("task", sa.Column("estimado_horas", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("task", "estimado_horas")
    op.drop_column("task", "tipo")
