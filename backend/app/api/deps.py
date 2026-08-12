"""Dependencies compartidas de FastAPI (sesión autenticada).

``get_current_user`` es la pieza que van a usar los endpoints para dejar de
confiar en el ``usuario_id`` que hoy llega por query string (T4.2).
"""
from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.security import decodificar_token
from app.db.models.usuario import Usuario
from app.db.session import get_db
from app.repositories import usuario_repo

# auto_error=False para poder devolver siempre el mismo 401 con el header
# WWW-Authenticate, en vez del 403 que HTTPBearer tira cuando falta el header.
_bearer = HTTPBearer(auto_error=False)

_NO_AUTORIZADO = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="No autenticado.",
    headers={"WWW-Authenticate": "Bearer"},
)


def get_current_user(
    db: Annotated[Session, Depends(get_db)],
    credenciales: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> Usuario:
    """Usuario dueño del token del header ``Authorization: Bearer <jwt>``.

    Devuelve 401 —siempre el mismo— si falta el token, si no valida (firma o
    expiración) o si el usuario que declara ya no existe. El último caso
    importa: un token sigue siendo criptográficamente válido hasta que expira,
    aunque la cuenta se haya borrado.
    """
    if credenciales is None:
        raise _NO_AUTORIZADO

    payload = decodificar_token(credenciales.credentials)
    if payload is None:
        raise _NO_AUTORIZADO

    sub = payload.get("sub")
    if sub is None:
        raise _NO_AUTORIZADO

    try:
        usuario_id = int(sub)
    except (TypeError, ValueError):
        raise _NO_AUTORIZADO from None

    usuario = usuario_repo.get_by_id(db, usuario_id)
    if usuario is None:
        raise _NO_AUTORIZADO

    return usuario


UsuarioActual = Annotated[Usuario, Depends(get_current_user)]


def requerir_admin(usuario: UsuarioActual) -> Usuario:
    """Restringe el endpoint a cuentas con rol ``admin`` (RNF-06)."""
    if (usuario.rol or "").lower() != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Requiere permisos de administrador.",
        )
    return usuario
