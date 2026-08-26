"""Cliente de Google OAuth 2.0 / OpenID Connect (RF-01).

Implementa el lado servidor del *authorization code flow*:

1. El frontend manda al usuario a la URL que arma ``construir_url_autorizacion``.
2. Google lo devuelve al ``redirect_uri`` con un ``code`` de un solo uso.
3. ``intercambiar_codigo`` canjea ese code por un ``id_token``, lo valida y
   devuelve un ``PerfilGoogle``.

Este módulo no conoce la DB: el alta o la vinculación del usuario las hace
``auth_service.autenticar_con_google``.

Decisiones:
- **Todo lo de Google vive acá, en el backend.** El frontend no conoce ni el
  client id ni los scopes: pide la URL de autorización y reenvía el ``code``.
  Así el ``client_secret`` no sale nunca del backend y no hay riesgo de que la
  app quede con dos client id distintos entre servicios.
- **PKCE (RFC 7636) aunque seamos un cliente confidencial.** El canje lo hace
  el backend con su ``client_secret``, asi que estrictamente PKCE es opcional;
  se usa igual porque OAuth 2.1 lo recomienda para todos los clientes y ata el
  ``code`` a quien inicio el flow: un code robado en el redirect no sirve sin
  el ``code_verifier``, que nunca sale del servidor.
- **El id_token se verifica igual.** Llega por un canal TLS que abrimos
  nosotros contra Google, así que en teoría alcanzaría con leerlo; se valida
  firma (JWKS), ``iss``, ``aud`` y ``exp`` de todas formas, porque es barato y
  deja el módulo listo por si mañana el token llega por otra vía (One Tap).
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlencode

import httpx
from jose import JWTError, jwt

from app.config import get_settings
from app.core.exceptions import GoogleOAuthError, GoogleOAuthNoConfigurado

logger = logging.getLogger(__name__)

AUTORIZAR_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs"

# Google firma el id_token con RS256. Se pasa explícito para que un token con
# ``alg: none`` no pueda saltearse la verificación de firma.
ALGORITMOS = ["RS256"]

# Los dos valores que Google usa históricamente en el claim ``iss``.
EMISORES = ("https://accounts.google.com", "accounts.google.com")

# Solo identidad: nombre, foto y email. No se piden permisos sobre Drive,
# Calendar ni nada que la app no use (principio de mínimo privilegio).
SCOPES = "openid email profile"

TIMEOUT = httpx.Timeout(10.0)

# Cache de las claves públicas de Google. Rotan cada pocos días; una hora de
# TTL evita pegarle a Google en cada login sin quedar pegado a claves viejas.
_JWKS_TTL_SEGUNDOS = 3600
_jwks_cache: tuple[float, dict[str, Any]] | None = None


@dataclass(frozen=True)
class PerfilGoogle:
    """Identidad que devuelve Google, ya validada."""

    sub: str
    email: str
    email_verificado: bool
    nombre: str | None = None
    apellido: str | None = None
    avatar_url: str | None = None


def _credenciales() -> tuple[str, str]:
    """Client id y secret, o ``GoogleOAuthNoConfigurado`` si faltan."""
    ajustes = get_settings()
    if not ajustes.google_oauth_configurado:
        raise GoogleOAuthNoConfigurado
    # El property ya garantizó que ninguno es None.
    return ajustes.google_client_id, ajustes.google_client_secret  # type: ignore[return-value]


def esta_configurado() -> bool:
    """¿Hay credenciales cargadas? Lo usa el frontend para mostrar el botón."""
    return get_settings().google_oauth_configurado


def construir_url_autorizacion(
    *, redirect_uri: str, state: str, code_challenge: str
) -> str:
    """URL de Google a la que hay que mandar al usuario para que autorice.

    ``state`` viaja de ida y vuelta sin que Google lo toque: el frontend lo
    compara contra el que guardó en una cookie para cortar el CSRF de login
    (que un tercero complete el flow con *su* cuenta en el browser de la
    víctima).

    ``code_challenge`` es el SHA-256 del ``code_verifier`` que el frontend se
    guarda: Google solo canjea el code contra quien pueda mostrar el verifier
    original (PKCE, RFC 7636).
    """
    client_id, _ = _credenciales()
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": SCOPES,
        "state": state,
        "code_challenge": code_challenge,
        # S256 y no "plain": con plain el challenge *es* el verifier, y quien
        # vea la URL de autorizacion se queda con los dos.
        "code_challenge_method": "S256",
        # Sin refresh token: la sesión de UTNHub es su propio JWT y no
        # necesitamos llamar a las APIs de Google después del login.
        "access_type": "online",
        # Deja elegir cuenta en vez de reusar en silencio la última usada.
        "prompt": "select_account",
    }
    return f"{AUTORIZAR_URL}?{urlencode(params)}"


def _obtener_jwks(*, forzar: bool = False) -> dict[str, Any]:
    """Claves públicas de Google, cacheadas por ``_JWKS_TTL_SEGUNDOS``."""
    global _jwks_cache

    ahora = time.monotonic()
    if not forzar and _jwks_cache is not None:
        guardado_en, jwks = _jwks_cache
        if ahora - guardado_en < _JWKS_TTL_SEGUNDOS:
            return jwks

    try:
        with httpx.Client(timeout=TIMEOUT) as cliente:
            respuesta = cliente.get(JWKS_URL)
            respuesta.raise_for_status()
            jwks = respuesta.json()
    except httpx.HTTPError as exc:
        # Si hay algo cacheado (aunque esté vencido) sirve más que fallar: las
        # claves siguen siendo válidas un rato después del TTL.
        if _jwks_cache is not None:
            logger.warning("No se pudieron refrescar las JWKS de Google: %s", exc)
            return _jwks_cache[1]
        raise GoogleOAuthError(f"No se pudieron obtener las JWKS: {exc}") from exc

    _jwks_cache = (ahora, jwks)
    return jwks


def verificar_id_token(id_token: str) -> PerfilGoogle:
    """Valida el id_token y devuelve el perfil.

    Chequea firma contra las JWKS de Google, ``iss``, ``aud`` (que sea *nuestro*
    client id, no el de otra app) y ``exp``. Lanza ``GoogleOAuthError`` si algo
    no cierra.
    """
    client_id, _ = _credenciales()

    def _decodificar(jwks: dict[str, Any]) -> dict[str, Any]:
        return jwt.decode(
            id_token,
            jwks,
            algorithms=ALGORITMOS,
            audience=client_id,
            issuer=EMISORES,
            # Google no manda ``at_hash`` en todos los flows y no le pasamos el
            # access_token, así que ese claim no se valida.
            options={"verify_at_hash": False},
        )

    try:
        claims = _decodificar(_obtener_jwks())
    except JWTError:
        # Puede ser una rotación de claves: reintentar una vez con las JWKS
        # frescas antes de dar el token por inválido.
        try:
            claims = _decodificar(_obtener_jwks(forzar=True))
        except JWTError as exc:
            raise GoogleOAuthError(f"id_token inválido: {exc}") from exc

    sub = claims.get("sub")
    email = claims.get("email")
    if not sub or not email:
        raise GoogleOAuthError("El id_token no trae 'sub' o 'email'.")

    return PerfilGoogle(
        sub=str(sub),
        email=str(email),
        # Google manda el claim como bool, pero algunos flows lo mandan como
        # el string "true"; se normalizan los dos.
        email_verificado=str(claims.get("email_verified", "")).lower() == "true",
        nombre=claims.get("given_name") or None,
        apellido=claims.get("family_name") or None,
        avatar_url=claims.get("picture") or None,
    )


def intercambiar_codigo(
    *, code: str, redirect_uri: str, code_verifier: str
) -> PerfilGoogle:
    """Canjea el ``code`` de Google por el perfil del usuario.

    ``redirect_uri`` tiene que ser byte a byte el mismo que se usó al pedir la
    autorización: Google lo compara para asegurarse de que el code se está
    canjeando desde donde se pidió. ``code_verifier`` es el original del
    ``code_challenge`` que se mandó en ese momento (PKCE).
    """
    client_id, client_secret = _credenciales()

    try:
        with httpx.Client(timeout=TIMEOUT) as cliente:
            respuesta = cliente.post(
                TOKEN_URL,
                data={
                    "code": code,
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "redirect_uri": redirect_uri,
                    "code_verifier": code_verifier,
                    "grant_type": "authorization_code",
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
    except httpx.HTTPError as exc:
        raise GoogleOAuthError(f"No se pudo contactar a Google: {exc}") from exc

    if respuesta.status_code != 200:
        # Google devuelve {"error": "invalid_grant", "error_description": ...}.
        # El detalle va al log y no a la respuesta HTTP (ver GoogleOAuthError).
        detalle = respuesta.text[:500]
        logger.warning(
            "Google rechazó el intercambio del code (%s): %s",
            respuesta.status_code,
            detalle,
        )
        raise GoogleOAuthError(f"Google respondió {respuesta.status_code}: {detalle}")

    datos = respuesta.json()
    id_token = datos.get("id_token")
    if not id_token:
        raise GoogleOAuthError("La respuesta de Google no trae id_token.")

    return verificar_id_token(id_token)
