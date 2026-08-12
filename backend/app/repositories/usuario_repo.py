"""Repository de usuarios."""
from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models.usuario import Usuario


def get_by_id(db: Session, usuario_id: int) -> Usuario | None:
    return db.get(Usuario, usuario_id)


def get_by_email(db: Session, email: str) -> Usuario | None:
    """Busca por email sin distinguir mayúsculas.

    Los emails se guardan normalizados en minúscula (ver ``auth_service``),
    pero la comparación va con ``lower()`` de los dos lados para que las filas
    cargadas antes de esta feature (por el seed o a mano) sigan encontrándose.
    """
    stmt = select(Usuario).where(func.lower(Usuario.email) == email.strip().lower())
    return db.execute(stmt).scalars().first()


def crear(
    db: Session,
    *,
    email: str,
    password_hash: str,
    nombre: str | None = None,
    apellido: str | None = None,
    legajo: str | None = None,
    rol: str | None = None,
) -> Usuario:
    """Inserta un usuario. No hace commit: lo decide el service."""
    usuario = Usuario(
        email=email,
        password=password_hash,
        nombre=nombre,
        apellido=apellido,
        legajo=legajo,
        rol=rol,
    )
    db.add(usuario)
    db.flush()
    return usuario
