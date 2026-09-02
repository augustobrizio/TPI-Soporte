"""mensaje.tools_json (registrar qué tools usó cada respuesta del agente)

Para el feedback loop: guardamos por respuesta la lista de tools que el agente
usó. NULL o "[]" = no usó ninguna, la señal de que el chatbot no pudo apoyar la
respuesta en datos reales. Columna aditiva y nullable: no toca lo existente.

Revision ID: c2d3e4f5a6b7
Revises: c8d3f2a91e57
Create Date: 2026-09-02
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision: str = "c2d3e4f5a6b7"
down_revision: str = "c8d3f2a91e57"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "mensaje",
        sa.Column("tools_json", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("mensaje", "tools_json")
