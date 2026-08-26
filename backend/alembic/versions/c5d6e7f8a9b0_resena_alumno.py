"""resena_alumno (reseñas cargadas por alumnos, feature 004)

Revision ID: c5d6e7f8a9b0
Revises: b9c0d1e2f3a4
Create Date: 2026-08-26
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "c5d6e7f8a9b0"
down_revision: str = "b9c0d1e2f3a4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "resena_alumno",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("usuario_id", sa.Integer(), nullable=False),
        sa.Column("profesor_id", sa.Integer(), nullable=False),
        sa.Column("materia_codigo", sa.Text(), nullable=False),
        sa.Column("nivel", sa.Integer(), nullable=False),
        sa.Column("comentario", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=True),
        sa.ForeignKeyConstraint(["usuario_id"], ["usuario.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["profesor_id"], ["profesor.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["materia_codigo"], ["materia.codigo"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "usuario_id", "profesor_id", "materia_codigo", name="uq_resena_usuario_catedra"
        ),
    )
    op.create_index("ix_resena_alumno_usuario_id", "resena_alumno", ["usuario_id"])
    op.create_index("ix_resena_alumno_profesor_id", "resena_alumno", ["profesor_id"])
    op.create_index("ix_resena_alumno_materia_codigo", "resena_alumno", ["materia_codigo"])


def downgrade() -> None:
    op.drop_index("ix_resena_alumno_materia_codigo", table_name="resena_alumno")
    op.drop_index("ix_resena_alumno_profesor_id", table_name="resena_alumno")
    op.drop_index("ix_resena_alumno_usuario_id", table_name="resena_alumno")
    op.drop_table("resena_alumno")
