"""usuario: google_sub y avatar_url para el login con Google

Revision ID: f2c9a7d1e480
Revises: d7a4b3c8e921
Create Date: 2026-08-26

``google_sub`` es el claim ``sub`` del id_token: el identificador estable de
la cuenta de Google. Va unique para que dos usuarios no puedan reclamar la
misma identidad; nullable porque las cuentas de email + password no lo tienen.
"""
from alembic import op
import sqlalchemy as sa

revision = "f2c9a7d1e480"
down_revision = "d7a4b3c8e921"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("usuario", sa.Column("google_sub", sa.Text(), nullable=True))
    op.add_column("usuario", sa.Column("avatar_url", sa.Text(), nullable=True))
    # Índice unique (no constraint) para que coincida con el `index=True,
    # unique=True` del modelo. Postgres no considera iguales dos NULL, así que
    # las cuentas sin Google conviven sin chocar entre sí.
    op.create_index(
        "ix_usuario_google_sub", "usuario", ["google_sub"], unique=True
    )


def downgrade() -> None:
    op.drop_index("ix_usuario_google_sub", table_name="usuario")
    op.drop_column("usuario", "avatar_url")
    op.drop_column("usuario", "google_sub")
