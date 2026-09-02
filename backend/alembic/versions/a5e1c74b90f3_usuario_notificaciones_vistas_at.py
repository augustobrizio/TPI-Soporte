"""usuario: notificaciones_vistas_at para el panel de la campana

Revision ID: a5e1c74b90f3
Revises: f2c9a7d1e480
Create Date: 2026-08-26

Marca de tiempo de la última vez que el usuario abrió las notificaciones. Es
lo único que hace falta persistir para saber qué es "nuevo": no se guarda un
registro por notificación porque las notificaciones no son entidades — se
derivan de novedades y eventos que ya están en la DB.

Nullable sin default: NULL significa "nunca las abrió", que es distinto de
"las abrió al momento de crearse la cuenta". El servicio traduce ese NULL a
``created_at``, y así una cuenta recién hecha no arranca con meses de
novedades acumuladas en la campana.
"""
from alembic import op
import sqlalchemy as sa

revision = "a5e1c74b90f3"
down_revision = "f2c9a7d1e480"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "usuario",
        sa.Column("notificaciones_vistas_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("usuario", "notificaciones_vistas_at")
