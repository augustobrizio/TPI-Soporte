"""estado_dia: override manual del estado de cursada

Revision ID: f1a2b3c4d5e6
Revises: c2d3e4f5a6b7
Create Date: 2026-09-06

El estado de un dia se deriva del calendario (mesa o feriado = sin cursada).
Esta tabla es la excepcion: lo que la facultad no publica como evento y sin
embargo suspende la actividad (un paro, una asamblea), o al reves un dia que
el calendario da por caido y en realidad se cursa.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "c2d3e4f5a6b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "estado_dia",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("fecha", sa.Date(), nullable=False),
        sa.Column("se_cursa", sa.Boolean(), nullable=False),
        sa.Column("motivo", sa.Text(), nullable=True),
        sa.Column("detalle", sa.Text(), nullable=True),
        sa.Column(
            "origen", sa.Text(), server_default="admin", nullable=False
        ),
        sa.Column("usuario_id", sa.Integer(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=True
        ),
        sa.Column(
            "updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=True
        ),
        sa.ForeignKeyConstraint(["usuario_id"], ["usuario.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("fecha", name="uq_estado_dia_fecha"),
    )
    op.create_index(op.f("ix_estado_dia_fecha"), "estado_dia", ["fecha"])
    op.create_index(op.f("ix_estado_dia_origen"), "estado_dia", ["origen"])


def downgrade() -> None:
    op.drop_index(op.f("ix_estado_dia_origen"), table_name="estado_dia")
    op.drop_index(op.f("ix_estado_dia_fecha"), table_name="estado_dia")
    op.drop_table("estado_dia")
