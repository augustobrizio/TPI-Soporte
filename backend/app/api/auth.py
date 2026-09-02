"""Endpoints de autenticación: registro, login, Google y sesión actual (RF-01).

El token se devuelve en el body y **no** se setea como cookie desde acá: la
cookie httpOnly la escribe el route handler de Next (`/api/auth/*`), que
corre en el mismo origen que el browser. Así el JWT nunca queda expuesto a
JavaScript y de paso se evita el lío de cookies cross-site entre los dos
servicios de Cloud Run.

El login con Google sigue la misma regla: Google redirige al **frontend**, y
el frontend le pasa el `code` a `POST /auth/google`, que responde el mismo
`TokenOut` que `/auth/login`. Así el backend concentra todo lo de OAuth
(client id, secret, scopes, validación del id_token) y el frontend sigue
siendo el único que toca la cookie.
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.api.deps import UsuarioActual
from app.config import get_settings
from app.core.exceptions import (
    CredencialesInvalidas,
    DominioGoogleNoPermitido,
    EmailGoogleNoVerificado,
    EmailYaRegistrado,
    GoogleOAuthError,
    GoogleOAuthNoConfigurado,
)
from app.core.rate_limit import limitador_login
from app.core.security import crear_token_acceso
from app.db.models.usuario import Usuario
from app.db.session import get_db
from app.schemas.usuario import (
    GoogleAutorizacionOut,
    GoogleCallbackIn,
    GoogleConfigOut,
    LoginIn,
    RegistroIn,
    TokenOut,
    UsuarioOut,
)
from app.services import auth_service, google_oauth

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


# ---------------------------------------------------------------------------
# Google (OAuth 2.0 / OpenID Connect)
# ---------------------------------------------------------------------------
_GOOGLE_APAGADO = HTTPException(
    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
    detail="El ingreso con Google no está disponible en este momento.",
)


@router.get(
    "/google/config",
    response_model=GoogleConfigOut,
    summary="¿Está habilitado el login con Google?",
)
def google_config() -> GoogleConfigOut:
    """Le dice al frontend si tiene que mostrar el botón de Google.

    Es un GET público y sin datos sensibles a propósito: sin credenciales
    cargadas el botón simplemente no aparece, en vez de aparecer y fallar.
    """
    return GoogleConfigOut(habilitado=google_oauth.esta_configurado())


@router.get(
    "/google/autorizar",
    response_model=GoogleAutorizacionOut,
    summary="URL de autorización de Google",
)
def google_autorizar(
    redirect_uri: str, state: str, code_challenge: str
) -> GoogleAutorizacionOut:
    """Arma la URL a la que el frontend tiene que redirigir al usuario.

    La construye el backend y no el frontend para que el client id y los
    scopes vivan en un solo lugar: si estuvieran duplicados, un client id
    distinto entre servicios daría un `invalid_client` de Google bastante
    difícil de rastrear.
    """
    try:
        url = google_oauth.construir_url_autorizacion(
            redirect_uri=redirect_uri, state=state, code_challenge=code_challenge
        )
    except GoogleOAuthNoConfigurado as exc:
        raise _GOOGLE_APAGADO from exc

    return GoogleAutorizacionOut(url=url)


@router.post("/google", response_model=TokenOut, summary="Ingresar con Google")
def login_google(
    datos: GoogleCallbackIn,
    db: Annotated[Session, Depends(get_db)],
) -> TokenOut:
    """Canjea el ``code`` de Google y emite el JWT de sesión.

    Crea la cuenta si es el primer ingreso, o la vincula si ya existía una con
    ese email (ver ``auth_service.autenticar_con_google``).
    """
    try:
        perfil = google_oauth.intercambiar_codigo(
            code=datos.code,
            redirect_uri=datos.redirect_uri,
            code_verifier=datos.code_verifier,
        )
    except GoogleOAuthNoConfigurado as exc:
        raise _GOOGLE_APAGADO from exc
    except GoogleOAuthError as exc:
        # 401 y no 400: el code no sirve (vencido, ya usado, de otra app). El
        # detalle técnico quedó en el log del service, no viaja al cliente.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)
        ) from exc

    try:
        usuario = auth_service.autenticar_con_google(db, perfil)
    except (DominioGoogleNoPermitido, EmailGoogleNoVerificado) as exc:
        # 403 y no 401: la identidad quedó probada, lo que falla es el permiso.
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)
        ) from exc

    return _token_para(usuario)


@router.get("/me", response_model=UsuarioOut, summary="Usuario de la sesión")
def usuario_actual(usuario: UsuarioActual) -> UsuarioOut:
    """Devuelve el usuario dueño del token. 401 si el token no sirve."""
    return UsuarioOut.model_validate(usuario)
