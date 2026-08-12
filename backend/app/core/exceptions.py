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


class MateriaInexistente(DomainError):
    """Se intento operar sobre una materia que no esta en el plan."""

    def __init__(self, codigo: str):
        self.codigo = codigo
        super().__init__(f"La materia '{codigo}' no existe en el plan.")


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
