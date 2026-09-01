"""novedad: estado_llm y moderado_manual

Guarda la decisión del clasificador aparte del estado efectivo, para que la
moderación manual no la pise. ``WHERE moderado_manual AND estado <> estado_llm``
devuelve los errores del LLM, que es con lo que se refina el prompt.

NOTA: el ``--autogenerate`` de este repo produce un diff destructivo (quiere
dropear ``task``, ``chat_feedback`` y ``rag_chunk``, cuyos modelos no llegan al
metadata de alembic). Esta migración se recortó a mano a las dos columnas
nuevas. Revisar SIEMPRE lo que genera antes de aplicarlo.

Revision ID: 477b49e0c6fe
Revises: a5e1c74b90f3
Create Date: 2026-08-30 05:57:58.161110
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "477b49e0c6fe"
down_revision: Union[str, Sequence[str], None] = "a5e1c74b90f3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("novedad", sa.Column("estado_llm", sa.Text(), nullable=True))
    op.add_column(
        "novedad",
        sa.Column(
            "moderado_manual",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
    )
    # Backfill, en este orden: primero las 25 que se despublicaron a mano el
    # 2026-08-30 (ahi el LLM habia dicho 'publicada' y nosotros lo corregimos),
    # y recien despues el resto, donde el estado actual ES el del clasificador.
    op.execute(
        "UPDATE novedad SET estado_llm = 'publicada', moderado_manual = true "
        "WHERE motivo_descarte LIKE '%repaso manual 2026-08-30%'"
    )
    op.execute("UPDATE novedad SET estado_llm = estado WHERE estado_llm IS NULL")


def downgrade() -> None:
    op.drop_column("novedad", "moderado_manual")
    op.drop_column("novedad", "estado_llm")
