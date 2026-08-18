"""evento_calendario.usuario_id (aislar eventos personales por alumno)

Los eventos personales del alumno (origen='usuario') se guardaban sin dueño y
se listaban global: cada alumno veía los TPs/exámenes de los demás. Agregamos
``usuario_id`` (NULL = evento compartido de FRRO). Los eventos 'usuario' que ya
existían no tienen dueño asignable y estaban filtrándose, así que se eliminan.

Revision ID: b9c0d1e2f3a4
Revises: a8b9c0d1e2f3
Create Date: 2026-08-17
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision: str = "b9c0d1e2f3a4"
down_revision: str = "a8b9c0d1e2f3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "evento_calendario",
        sa.Column("usuario_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_evento_calendario_usuario_id_usuario",
        "evento_calendario",
        "usuario",
        ["usuario_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(
        "ix_evento_calendario_usuario_id", "evento_calendario", ["usuario_id"]
    )
    # Eventos personales huérfanos (sin dueño asignable) que estaban filtrándose.
    op.execute("DELETE FROM evento_calendario WHERE origen = 'usuario'")


def downgrade() -> None:
    op.drop_index("ix_evento_calendario_usuario_id", table_name="evento_calendario")
    op.drop_constraint(
        "fk_evento_calendario_usuario_id_usuario",
        "evento_calendario",
        type_="foreignkey",
    )
    op.drop_column("evento_calendario", "usuario_id")
