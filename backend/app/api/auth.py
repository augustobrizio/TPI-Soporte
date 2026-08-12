"""Endpoints de autenticación: registro, login y sesión actual (RF-01).

El token se devuelve en el body y **no** se setea como cookie desde acá: la
cookie httpOnly la escribe el route handler de Next (`/api/auth/*`), que
corre en el mismo origen que el browser. Así el JWT nunca queda expuesto a
JavaScript y de paso se evita el lío de cookies cross-site entre los dos
servicios de Cloud Run.
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.api.deps import UsuarioActual
from app.config import get_settings
from app.core.exceptions import CredencialesInvalidas, EmailYaRegistrado
from app.core.rate_limit import limitador_login
from app.core.security import crear_token_acceso
from app.db.models.usuario import Usuario
from app.db.session import get_db
from app.schemas.usuario import LoginIn, RegistroIn, TokenOut, UsuarioOut
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


def _token_para(usuario: Usuario) -> TokenOut:
    ajustes = get_settings()
    return TokenOut(
        access_token=crear_token_acceso(
            usuario.id, email=usuario.email, rol=usuario.rol
        ),
        expires_in=ajustes.jwt_expire_minutes * 60,
        usuario=UsuarioOut.model_validate(usuario),
    )


def _clave_limite(request: Request, email: str) -> str:
    """Clave del rate limit: IP + email, para no castigar a toda una red."""
    ip = request.client.host if request.client else "desconocida"
    return f"{ip}|{auth_service.normalizar_email(email)}"


@router.post(
    "/register",
    response_model=TokenOut,
    status_code=status.HTTP_201_CREATED,
    summary="Crear una cuenta",
)
def registrar(
    datos: RegistroIn,
    db: Annotated[Session, Depends(get_db)],
) -> TokenOut:
    """Da de alta un usuario y lo deja logueado."""
    try:
        usuario = auth_service.registrar(
            db,
            email=datos.email,
            password=datos.password,
            nombre=datos.nombre,
            apellido=datos.apellido,
            legajo=datos.legajo,
        )
    except EmailYaRegistrado as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=str(exc)
        ) from exc

    return _token_para(usuario)


@router.post("/login", response_model=TokenOut, summary="Iniciar sesión")
def login(
    datos: LoginIn,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> TokenOut:
    """Valida credenciales y emite el JWT de sesión."""
    clave = _clave_limite(request, datos.email)

    if not limitador_login.permitido(clave):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Demasiados intentos fallidos. Probá de nuevo en unos minutos.",
        )

    try:
        usuario = auth_service.autenticar(
            db, email=datos.email, password=datos.password
        )
    except CredencialesInvalidas as exc:
        limitador_login.registrar_fallo(clave)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)
        ) from exc

    limitador_login.limpiar(clave)
    return _token_para(usuario)


@router.get("/me", response_model=UsuarioOut, summary="Usuario de la sesión")
def usuario_actual(usuario: UsuarioActual) -> UsuarioOut:
    """Devuelve el usuario dueño del token. 401 si el token no sirve."""
    return UsuarioOut.model_validate(usuario)
