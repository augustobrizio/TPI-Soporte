"""Schemas del chat del asistente (contrato de la API con el frontend)."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ChatIn(BaseModel):
    """Pregunta del usuario, opcionalmente dentro de una conversación existente."""

    pregunta: str = Field(min_length=1, max_length=1000)
    conversacion_id: int | None = None
    # Si es True, se rehace la última respuesta: el backend descarta el último
    # turno (pregunta + respuesta) antes de volver a responder, para no
    # duplicarlo en el historial. Sólo aplica con conversacion_id.
    regenerar: bool = False


class ConversacionUpdate(BaseModel):
    """Renombrar una conversación."""

    titulo: str = Field(min_length=1, max_length=120)


class FuenteOut(BaseModel):
    """Fragmento usado para responder (para mostrar las fuentes en la UI)."""

    model_config = ConfigDict(from_attributes=True)

    titulo: str | None = None
    fuente: str
    url: str | None = None
    fecha: str | None = None


class CorrelativaFichaOut(BaseModel):
    nombre: str
    tipo: str


class FichaMateriaOut(BaseModel):
    """Ficha académica de una materia, para renderizar como tarjeta (§19)."""

    model_config = ConfigDict(from_attributes=True)

    codigo: str
    nombre: str
    carrera: str | None = None
    anio: int | None = None
    cuatrimestre: str | None = None
    tipo: str | None = None
    correlativas: list[CorrelativaFichaOut] = Field(default_factory=list)


class ChatOut(BaseModel):
    """Respuesta del asistente + las fuentes en las que se basó (RNF-12)."""

    model_config = ConfigDict(from_attributes=True)

    respuesta: str
    fuentes: list[FuenteOut] = Field(default_factory=list)
    conversacion_id: int | None = None
    mensaje_id: int | None = None
    fichas: list[FichaMateriaOut] = Field(default_factory=list)


class FeedbackIn(BaseModel):
    """Feedback sobre una respuesta del asistente."""

    mensaje_id: int
    util: bool
    motivo: str | None = Field(default=None, max_length=200)


class MensajeOut(BaseModel):
    """Un turno guardado de la conversación."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    role: str | None = None
    contenido: str | None = None
    created_at: datetime | None = None
    fuentes: list[FuenteOut] = Field(default_factory=list)


class ConversacionOut(BaseModel):
    """Cabecera de una conversación, para la lista del historial."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    titulo: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class ConversacionDetalleOut(ConversacionOut):
    """Conversación con todos sus mensajes."""

    mensajes: list[MensajeOut] = Field(default_factory=list)
