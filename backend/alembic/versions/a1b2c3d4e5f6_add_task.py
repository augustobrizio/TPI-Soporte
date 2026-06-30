"""add task table (to-do list personal del alumno)

Revision ID: a1b2c3d4e5f6
Revises: c1d2e3f4a5b6
Create Date: 2026-06-24

"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "a1b2c3d4e5f6"
down_revision = "c1d2e3f4a5b6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "task",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("usuario_id", sa.Integer(), sa.ForeignKey("usuario.id"), nullable=False),
        sa.Column("titulo", sa.Text(), nullable=False),
        sa.Column("descripcion", sa.Text(), nullable=True),
        sa.Column("completada", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("fecha_vencimiento", sa.DateTime(), nullable=True),
        sa.Column("prioridad", sa.Text(), nullable=True),
        sa.Column("materia_codigo", sa.Text(), sa.ForeignKey("materia.codigo", ondelete="SET NULL"), nullable=True),
        sa.Column("orden", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=True),
    )
    op.create_index("ix_task_usuario_id", "task", ["usuario_id"])


def downgrade() -> None:
    op.drop_index("ix_task_usuario_id", table_name="task")
    op.drop_table("task")
