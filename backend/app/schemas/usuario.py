"""Schemas Pydantic de usuario y autenticación."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

# Mínimo del NIST SP 800-63B: 8 caracteres. El tope alto existe solo para que
# nadie mande un payload gigante; bcrypt ya normaliza la longitud (ver
# `core.security`), así que no trunca nada.
PASSWORD_MIN = 8
PASSWORD_MAX = 128


class RegistroIn(BaseModel):
    """Alta de una cuenta nueva."""

    email: EmailStr
    password: str = Field(min_length=PASSWORD_MIN, max_length=PASSWORD_MAX)
    nombre: str | None = Field(default=None, max_length=120)
    apellido: str | None = Field(default=None, max_length=120)
    legajo: str | None = Field(default=None, max_length=40)

    @field_validator("password")
    @classmethod
    def _password_no_trivial(cls, v: str) -> str:
        """Rechaza contraseñas que cumplen el largo pero no aportan nada.

        No se pide mayúscula/símbolo a propósito: el NIST desaconseja las
        reglas de composición porque empujan a patrones predecibles tipo
        "Password1!". Lo que sí se corta es un único carácter repetido.
        """
        if len(set(v)) < 4:
            raise ValueError(
                "La contraseña es demasiado simple: usá al menos 4 caracteres distintos."
            )
        return v

    @field_validator("nombre", "apellido", "legajo")
    @classmethod
    def _vacio_es_none(cls, v: str | None) -> str | None:
        if v is None:
            return None
        limpio = v.strip()
        return limpio or None


class LoginIn(BaseModel):
    """Credenciales de inicio de sesión.

    ``password`` no valida largo: las reglas se aplican al registrar. Pedirlas
    de nuevo acá solo le contaría al atacante qué forma tiene una contraseña
    válida antes de siquiera consultar la DB.
    """

    email: EmailStr
    password: str = Field(max_length=PASSWORD_MAX)


class GoogleAutorizacionOut(BaseModel):
    """URL de Google a la que hay que mandar al usuario para que autorice."""

    url: str


class GoogleConfigOut(BaseModel):
    """Si el login con Google está disponible en este servidor.

    No expone el client id ni el secret: al frontend solo le sirve saber si
    tiene que renderizar el botón.
    """

    habilitado: bool


class GoogleCallbackIn(BaseModel):
    """Code de un solo uso que Google devolvió al ``redirect_uri``."""

    code: str = Field(min_length=1, max_length=2048)
    # Debe ser byte a byte el mismo que se usó al pedir la autorización; Google
    # lo compara. Lo manda el frontend porque es él quien lo construyó.
    redirect_uri: str = Field(min_length=1, max_length=2048)
    # PKCE (RFC 7636): el original del `code_challenge` que se mandó al pedir la
    # autorización. El rango 43-128 lo fija el RFC.
    code_verifier: str = Field(min_length=43, max_length=128)


class UsuarioOut(BaseModel):
    """Vista pública de un usuario. Nunca incluye ``password``."""

    id: int
    email: str
    nombre: str | None = None
    apellido: str | None = None
    legajo: str | None = None
    rol: str | None = None
    avatar_url: str | None = None
    created_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class TokenOut(BaseModel):
    """Respuesta de login/registro: el JWT y el usuario que lo posee."""

    access_token: str
    token_type: str = "bearer"
    # Segundos hasta el vencimiento; el front lo usa para saber cuánto dura
    # la cookie sin tener que leer el token.
    expires_in: int
    usuario: UsuarioOut
