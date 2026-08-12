"""Lógica de negocio de autenticación (RF-01, RNF-02).

Reglas:
- El email es la identidad y es único; se guarda normalizado en minúscula
  para que "Juan@…" y "juan@…" no puedan convivir como dos cuentas.
- La contraseña nunca se persiste ni se loguea en claro: solo su hash bcrypt.
- Login y registro devuelven el mismo tipo de error ante credenciales malas,
  sin distinguir "no existe" de "contraseña incorrecta".
"""
from __future__ import annotations

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.exceptions import CredencialesInvalidas, EmailYaRegistrado
from app.core.security import hash_password, verify_password
from app.db.models.usuario import Usuario
from app.repositories import usuario_repo

# Rol por defecto de una cuenta creada desde el registro público. Un alta con
# rol "admin" solo puede hacerse por fuera (seed o consola): si el rol viniera
# del request, cualquiera se registraría como admin.
ROL_POR_DEFECTO = "alumno"


def normalizar_email(email: str) -> str:
    return email.strip().lower()


def registrar(
    db: Session,
    *,
    email: str,
    password: str,
    nombre: str | None = None,
    apellido: str | None = None,
    legajo: str | None = None,
) -> Usuario:
    """Crea una cuenta nueva y devuelve el usuario.

    Lanza ``EmailYaRegistrado`` si el email ya está tomado.
    """
    email_norm = normalizar_email(email)

    if usuario_repo.get_by_email(db, email_norm) is not None:
        raise EmailYaRegistrado(email_norm)

    try:
        usuario = usuario_repo.crear(
            db,
            email=email_norm,
            password_hash=hash_password(password),
            nombre=nombre,
            apellido=apellido,
            legajo=legajo,
            rol=ROL_POR_DEFECTO,
        )
        db.commit()
    except IntegrityError:
        # Dos altas simultáneas del mismo email: el chequeo de arriba pasó en
        # ambas y la unique constraint de la DB frenó a la segunda.
        db.rollback()
        raise EmailYaRegistrado(email_norm) from None

    db.refresh(usuario)
    return usuario


def autenticar(db: Session, *, email: str, password: str) -> Usuario:
    """Valida credenciales y devuelve el usuario.

    Lanza ``CredencialesInvalidas`` tanto si el email no existe como si la
    contraseña no coincide. Cuando no existe igual se corre la verificación
    contra un hash falso (ver ``core.security.verify_password``) para que las
    dos ramas tarden lo mismo.
    """
    usuario = usuario_repo.get_by_email(db, normalizar_email(email))

    if usuario is None:
        verify_password(password, None)
        raise CredencialesInvalidas

    if not verify_password(password, usuario.password):
        raise CredencialesInvalidas

    return usuario
