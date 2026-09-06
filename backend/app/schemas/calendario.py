"""Schemas Pydantic del calendario academico."""
from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

TipoEventoLiteral = Literal["examen", "mesa", "trabajo_practico", "feriado", "evento"]


class EventoCalendarioOut(BaseModel):
    """Evento expuesto por la API."""

    id: int
    titulo: str
    descripcion: str | None = None
    fecha_inicio: datetime
    fecha_fin: datetime | None = None
    tipo: TipoEventoLiteral
    carrera: str | None = None
    fuente_url: str | None = None
    origen: str = "sistema"

    model_config = ConfigDict(from_attributes=True)


class EventoCalendarioCreate(BaseModel):
    """Alta de un evento creado por el alumno."""

    titulo: str = Field(min_length=1, max_length=200)
    descripcion: str | None = None
    fecha_inicio: datetime
    fecha_fin: datetime | None = None
    tipo: TipoEventoLiteral = "examen"


class EventoCalendarioUpdate(BaseModel):
    """Edición de un evento del alumno (todos los campos opcionales)."""

    titulo: str | None = Field(default=None, min_length=1, max_length=200)
    descripcion: str | None = None
    fecha_inicio: datetime | None = None
    fecha_fin: datetime | None = None
    tipo: TipoEventoLiteral | None = None


class DiaCursadaOut(BaseModel):
    """Un día de la semana con su estado de cursada.

    ``se_cursa`` es la única pregunta que el alumno le hace al calendario
    cuando mira la semana. ``motivo`` es el título del evento que la contesta
    cuando la respuesta es "no".
    """

    fecha: date
    se_cursa: bool
    motivo: str | None = None
    eventos: list[EventoCalendarioOut] = Field(default_factory=list)


class SemanaCursadaOut(BaseModel):
    """Lunes a viernes de una semana, con el estado de cada día."""

    lunes: date
    #: Hoy en Rosario. Viaja en la respuesta para que el frontend marque el día
    #: actual y titule la semana sin depender del reloj del visitante, que
    #: puede estar en otra zona (o mal puesto).
    hoy: date
    dias: list[DiaCursadaOut] = Field(default_factory=list)


class ResultadoSincCalendario(BaseModel):
    """Resultado de POST ``/calendario/sincronizar``."""

    fuentes_procesadas: int = 0
    eventos_detectados: int = 0
    eventos_creados: int = 0
    eventos_actualizados: int = 0
    eventos_sin_cambios: int = 0
    advertencias: list[str] = Field(default_factory=list)
    errores: list[str] = Field(default_factory=list)


class SuscripcionCalendarioOut(BaseModel):
    """URL de suscripcion al calendario del alumno (T11.2).

    Se devuelve la URL entera y no solo el token porque el alumno la va a
    copiar y pegar tal cual en Google Calendar: armarla en el front obligaria
    a que el front sepa el origen publico de la API, que es justo lo que el
    backend ya resuelve aca.
    """

    url: str
