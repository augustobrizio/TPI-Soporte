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


def get_by_google_sub(db: Session, google_sub: str) -> Usuario | None:
    """Busca por el ``sub`` de la cuenta de Google que tenga vinculada."""
    stmt = select(Usuario).where(Usuario.google_sub == google_sub)
    return db.execute(stmt).scalars().first()


def crear(
    db: Session,
    *,
    email: str,
    password_hash: str | None,
    nombre: str | None = None,
    apellido: str | None = None,
    legajo: str | None = None,
    rol: str | None = None,
    google_sub: str | None = None,
    avatar_url: str | None = None,
) -> Usuario:
    """Inserta un usuario. No hace commit: lo decide el service.

    ``password_hash`` puede ser None: las cuentas creadas con Google no tienen
    contraseña local (``verify_password`` ya contempla el hash nulo).
    """
    usuario = Usuario(
        email=email,
        password=password_hash,
        nombre=nombre,
        apellido=apellido,
        legajo=legajo,
        rol=rol,
        google_sub=google_sub,
        avatar_url=avatar_url,
    )
    db.add(usuario)
    db.flush()
    return usuario
