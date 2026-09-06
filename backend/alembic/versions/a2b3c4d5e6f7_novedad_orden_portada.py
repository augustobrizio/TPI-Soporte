"""novedad.orden_portada: orden editable de "Ultimas novedades"

Revision ID: a2b3c4d5e6f7
Revises: f1a2b3c4d5e6
Create Date: 2026-09-06

La portada mostraba las tres mas recientes por fecha. Con esta columna el
admin puede decidir el orden, y una novedad nueva entra primera y desplaza a
la ultima. NULL = no esta en la portada.

Se siembra con las tres publicadas mas recientes para que el estado inicial
sea el que ya se veia, en vez de una portada vacia hasta que alguien la ordene.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a2b3c4d5e6f7"
down_revision: Union[str, Sequence[str], None] = "f1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TOPE = 3


def upgrade() -> None:
    op.add_column("novedad", sa.Column("orden_portada", sa.Integer(), nullable=True))
    op.create_index(
        op.f("ix_novedad_orden_portada"), "novedad", ["orden_portada"]
    )

    # Siembra: las tres publicadas mas recientes, en el mismo orden que ya
    # mostraba la portada (fecha_publicacion, y como desempate el id).
    op.execute(
        sa.text(
            """
            WITH top AS (
                SELECT id, ROW_NUMBER() OVER (
                    ORDER BY COALESCE(fecha_publicacion, created_at) DESC, id DESC
                ) - 1 AS pos
                FROM novedad
                WHERE estado = 'publicada'
                LIMIT :tope
            )
            UPDATE novedad
            SET orden_portada = top.pos
            FROM top
            WHERE novedad.id = top.id
            """
        ).bindparams(tope=TOPE)
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_novedad_orden_portada"), table_name="novedad")
    op.drop_column("novedad", "orden_portada")
