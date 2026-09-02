"""Excepciones de dominio.

Estas excepciones modelan errores de negocio (no de infraestructura).
La capa de presentacion (FastAPI) las captura y las traduce a HTTPException
con el codigo apropiado.
"""
from __future__ import annotations


class DomainError(Exception):
    """Base para errores de negocio."""


class EmailYaRegistrado(DomainError):
    """Ya existe una cuenta con ese email."""

    def __init__(self, email: str):
        self.email = email
        super().__init__(f"Ya existe una cuenta con el email '{email}'.")


class CredencialesInvalidas(DomainError):
    """Email inexistente o contraseña incorrecta.

    Un único error para los dos casos, a propósito: distinguirlos le confirma
    a un atacante qué mails están registrados.
    """

    def __init__(self) -> None:
        super().__init__("Email o contraseña incorrectos.")


class GoogleOAuthNoConfigurado(DomainError):
    """Se pidio login con Google pero faltan las credenciales del cliente."""

    def __init__(self) -> None:
        super().__init__(
            "El login con Google no está configurado en este servidor."
        )


class GoogleOAuthError(DomainError):
    """Fallo el intercambio del código o el id_token no valida.

    El mensaje que se le muestra al usuario es siempre genérico: el detalle
    técnico (qué claim falló, qué devolvió Google) va al log del servidor y no
    a la respuesta, porque no le sirve a quien se está logueando y sí le
    serviría a quien está probando cómo romper el flow.
    """

    def __init__(self, detalle: str) -> None:
        self.detalle = detalle
        super().__init__("No se pudo completar el ingreso con Google.")


class EmailGoogleNoVerificado(DomainError):
    """La cuenta de Google no tiene el email verificado.

    Sin ``email_verified`` no se puede confiar en la dirección: aceptarla
    permitiría reclamar el email de otra persona (ver ``auth_service``).
    """

    def __init__(self, email: str) -> None:
        self.email = email
        super().__init__(
            "Tu cuenta de Google no tiene el email verificado, así que no "
            "podemos usarla para ingresar."
        )


class DominioGoogleNoPermitido(DomainError):
    """El email de la cuenta de Google no es de un dominio habilitado (RNF-04).

    A diferencia de las credenciales invalidas, acá **sí** conviene ser
    explícito: no hay nada que enumerar (el dominio permitido es público) y sin
    el motivo el usuario reintenta con la misma cuenta para siempre.
    """

    def __init__(self, email: str, dominios: list[str]) -> None:
        self.email = email
        self.dominios = dominios
        permitidos = " o ".join(f"@{d}" for d in dominios)
        super().__init__(
            f"Tenés que ingresar con tu cuenta institucional ({permitidos}). "
            f"La cuenta '{email}' no pertenece a ese dominio."
        )


class MateriaInexistente(DomainError):
    """Se intento operar sobre una materia que no esta en el plan."""

    def __init__(self, codigo: str):
        self.codigo = codigo
        super().__init__(f"La materia '{codigo}' no existe en el plan.")


class ProfesorInexistente(DomainError):
    """Se intento operar sobre un profesor que no esta en el padron."""

    def __init__(self, profesor_id: int):
        self.profesor_id = profesor_id
        super().__init__(f"El profesor con id {profesor_id} no existe.")


class CorrelativasNoCumplidas(DomainError):
    """El usuario no cumple las correlativas para una operacion."""

    def __init__(
        self,
        *,
        materia_codigo: str,
        accion: str,
        faltantes: list[str],
    ):
        self.materia_codigo = materia_codigo
        self.accion = accion
        self.faltantes = faltantes
        super().__init__(
            f"No se cumplen correlativas para {accion} '{materia_codigo}'. "
            f"Faltan: {', '.join(faltantes)}"
        )
