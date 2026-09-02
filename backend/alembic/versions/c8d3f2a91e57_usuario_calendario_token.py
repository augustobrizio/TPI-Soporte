"""usuario: calendario_token para la URL de suscripcion al .ics

Revision ID: c8d3f2a91e57
Revises: 477b49e0c6fe
Create Date: 2026-09-02

Token opaco por alumno que autentica la URL de suscripcion al calendario
(``/calendario/suscripcion/<token>.ics``).

Por que una credencial nueva y no el JWT: Google Calendar refresca las
suscripciones por su cuenta, sin headers y sin sesion. La URL tiene que
autenticar por si sola. Meter el JWT ahi seria peor por dos motivos — vence en
12 h y la suscripcion se romperia sola, y sobre todo quedaria pegado en la
configuracion del calendario de Google, donde no lo podemos caducar.

Nullable: NULL = el alumno nunca genero su URL, que es el estado de todas las
cuentas existentes. El token se crea la primera vez que lo pide, no al
registrarse: una credencial que nadie uso es una credencial que no hace falta
tener.

Unique + index: es la credencial con la que se busca al usuario en cada
refresco de Google, y dos cuentas no pueden compartirla.
"""
from alembic import op
import sqlalchemy as sa

revision = "c8d3f2a91e57"
down_revision = "477b49e0c6fe"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "usuario",
        sa.Column("calendario_token", sa.Text(), nullable=True),
    )
    op.create_index(
        "ix_usuario_calendario_token",
        "usuario",
        ["calendario_token"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_usuario_calendario_token", table_name="usuario")
    op.drop_column("usuario", "calendario_token")
