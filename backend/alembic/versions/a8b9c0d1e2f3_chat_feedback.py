"""chat_feedback (👍/👎 + motivo sobre respuestas del asistente)

Revision ID: a8b9c0d1e2f3
Revises: f7b8c9d0e1a2
Create Date: 2026-08-17
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision: str = "a8b9c0d1e2f3"
down_revision: str = "f7b8c9d0e1a2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "chat_feedback",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("mensaje_id", sa.Integer(), nullable=False),
        sa.Column("usuario_id", sa.Integer(), nullable=False),
        sa.Column("util", sa.Boolean(), nullable=False),
        sa.Column("motivo", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=True),
        sa.ForeignKeyConstraint(["mensaje_id"], ["mensaje.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["usuario_id"], ["usuario.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "mensaje_id", "usuario_id", name="uq_chat_feedback_mensaje_usuario"
        ),
    )
    op.create_index("ix_chat_feedback_mensaje_id", "chat_feedback", ["mensaje_id"])
    op.create_index("ix_chat_feedback_usuario_id", "chat_feedback", ["usuario_id"])


def downgrade() -> None:
    op.drop_index("ix_chat_feedback_usuario_id", table_name="chat_feedback")
    op.drop_index("ix_chat_feedback_mensaje_id", table_name="chat_feedback")
    op.drop_table("chat_feedback")
