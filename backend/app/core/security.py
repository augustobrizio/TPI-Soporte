"""Primitivas de seguridad: hashing de contraseñas y tokens JWT.

No conoce la DB ni FastAPI: son funciones puras que consumen los services
(`auth_service`) y la capa de presentación (`api/auth.py`, `api/deps.py`).

Decisiones:
- **bcrypt directo, no passlib.** passlib 1.7.4 (su última release, de 2020)
  lee ``bcrypt.__about__.__version__``, atributo que bcrypt eliminó en 4.1,
  y revienta al hashear contra el bcrypt 5.x del lock.
- **Pre-hash SHA-256.** bcrypt solo mira los primeros 72 bytes de la entrada
  y descarta el resto en silencio: sin pre-hash, dos contraseñas largas que
  compartan prefijo serían equivalentes. Hashear antes normaliza cualquier
  longitud a 44 bytes ASCII.
"""
from __future__ import annotations

import base64
import hashlib
from datetime import UTC, datetime, timedelta
from typing import Any

import bcrypt
from jose import JWTError, jwt

from app.config import get_settings

# Hash real y descartable, para gastar el mismo tiempo cuando el email no
# existe. Sin esto un login contra un usuario inexistente responde bastante
# más rápido que uno con contraseña incorrecta, y esa diferencia deja
# enumerar qué mails están registrados. No corresponde a ninguna contraseña
# usable: sale de hashear la cadena "placeholder-sin-uso".
_HASH_DUMMY = b"$2b$12$wf61b2kEFio7IRzavW6RdOAqUhZzKmqQ8Ens2wUbyqyeh8bw93jUy"


def _preparar(password: str) -> bytes:
    """Normaliza la contraseña a 44 bytes ASCII (ver el docstring del módulo)."""
    digest = hashlib.sha256(password.encode("utf-8")).digest()
    return base64.b64encode(digest)


def hash_password(password: str) -> str:
    """Devuelve el hash bcrypt de una contraseña en texto plano."""
    return bcrypt.hashpw(_preparar(password), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hash_guardado: str | None) -> bool:
    """¿La contraseña coincide con el hash?

    ``hash_guardado`` puede ser None (usuario creado sin contraseña, p. ej.
    por un alta administrativa). En ese caso igual se corre una verificación
    contra un hash falso para no delatar la diferencia por tiempo.
    """
    candidato = _preparar(password)
    if not hash_guardado:
        bcrypt.checkpw(candidato, _HASH_DUMMY)
        return False
    try:
        return bcrypt.checkpw(candidato, hash_guardado.encode("utf-8"))
    except ValueError:
        # Hash corrupto o con formato desconocido: no es una credencial válida.
        return False


def crear_token_acceso(usuario_id: int, *, email: str, rol: str | None) -> str:
    """Firma un JWT de sesión para el usuario.

    El ``sub`` va como string porque el RFC 7519 lo define así; meter un int
    hace que algunas librerías de validación lo rechacen.
    """
    ajustes = get_settings()
    ahora = datetime.now(UTC)
    payload = {
        "sub": str(usuario_id),
        "email": email,
        "rol": rol,
        "iat": ahora,
        "exp": ahora + timedelta(minutes=ajustes.jwt_expire_minutes),
    }
    return jwt.encode(payload, ajustes.jwt_secret, algorithm=ajustes.jwt_algorithm)


def decodificar_token(token: str) -> dict[str, Any] | None:
    """Valida firma y expiración. Devuelve el payload, o None si no sirve.

    El algoritmo se pasa explícito: aceptar el que venga en el header del
    token permitiría cambiarlo por ``none`` y saltarse la firma.
    """
    ajustes = get_settings()
    try:
        return jwt.decode(
            token, ajustes.jwt_secret, algorithms=[ajustes.jwt_algorithm]
        )
    except JWTError:
        return None
