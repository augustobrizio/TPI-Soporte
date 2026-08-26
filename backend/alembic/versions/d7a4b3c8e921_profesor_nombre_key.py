"""profesor nombre_key unico (reemplaza unique nombre+email)

Revision ID: d7a4b3c8e921
Revises: c5d6e7f8a9b0
Create Date: 2026-08-26

``uq_profesor_nombre_email`` no alcanzaba para frenar los duplicados del padron:
al ser sobre ``(nombre, email)``, el mismo profesor entraba dos veces si una
fuente traia su mail y la otra no, o si escribia el nombre distinto
('RUGGIERO, Franco' vs 'RUGGIERO,Franco').

Este cambio mueve el unique a ``nombre_key``, la clave canonica que calcula
``services/profesor_matching.clave_nombre`` (minusculas, sin acentos, sin
puntuacion, espaciado colapsado). Las variantes mas sueltas —inicial abreviada,
segundo nombre faltante— las resuelve el matcher en el service; el unique es la
red de contencion de ultimo nivel.

El backfill usa la misma funcion que la app, para que la clave de la DB y la que
calcula el codigo no puedan divergir.
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

from app.services.profesor_matching import clave_nombre

revision: str = "d7a4b3c8e921"
down_revision: str | None = "c5d6e7f8a9b0"
branch_labels: str | tuple[str, ...] | None = None
depends_on: str | tuple[str, ...] | None = None


def upgrade() -> None:
    op.add_column("profesor", sa.Column("nombre_key", sa.Text(), nullable=True))

    conn = op.get_bind()
    filas = conn.execute(sa.text("SELECT id, nombre FROM profesor")).all()

    claves: dict[str, list[int]] = {}
    for pid, nombre in filas:
        clave = clave_nombre(nombre or f"sin-nombre-{pid}")
        claves.setdefault(clave, []).append(pid)

    colisiones = {c: ids for c, ids in claves.items() if len(ids) > 1}
    if colisiones:
        detalle = ", ".join(f"{c!r} -> ids {ids}" for c, ids in sorted(colisiones.items()))
        raise RuntimeError(
            "Hay profesores duplicados que comparten nombre canonico y el unique "
            f"index no se puede crear: {detalle}. Corre primero "
            "`uv run python scripts/dedupe_profesores.py --apply`, que fusiona los "
            "duplicados repuntando cargos, horarios, cursadas y reseñas."
        )

    for clave, (pid,) in claves.items():
        conn.execute(
            sa.text("UPDATE profesor SET nombre_key = :clave WHERE id = :pid"),
            {"clave": clave, "pid": pid},
        )

    op.alter_column("profesor", "nombre_key", nullable=False)
    op.create_index("ix_profesor_nombre_key", "profesor", ["nombre_key"], unique=True)
    op.drop_constraint("uq_profesor_nombre_email", "profesor", type_="unique")


def downgrade() -> None:
    op.create_unique_constraint(
        "uq_profesor_nombre_email",
        "profesor",
        ["nombre", "email"],
        postgresql_nulls_not_distinct=True,
    )
    op.drop_index("ix_profesor_nombre_key", table_name="profesor")
    op.drop_column("profesor", "nombre_key")
