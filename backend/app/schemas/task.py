"""Schemas Pydantic para el módulo de tareas."""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

PrioridadLiteral = Literal["alta", "media", "baja"]
TipoLiteral = Literal["examen", "tp", "entrega", "lectura", "estudio", "personal"]


class TaskOut(BaseModel):
    id: int
    usuario_id: int
    titulo: str
    descripcion: str | None = None
    completada: bool
    fecha_vencimiento: datetime | None = None
    prioridad: PrioridadLiteral | None = None
    tipo: TipoLiteral | None = None
    estimado_horas: float | None = None
    materia_codigo: str | None = None
    orden: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TaskCreate(BaseModel):
    titulo: str = Field(min_length=1, max_length=500)
    descripcion: str | None = None
    fecha_vencimiento: datetime | None = None
    prioridad: PrioridadLiteral | None = None
    tipo: TipoLiteral | None = None
    estimado_horas: float | None = Field(default=None, ge=0, le=1000)
    materia_codigo: str | None = None
    orden: int = 0


class TaskUpdate(BaseModel):
    titulo: str | None = Field(default=None, min_length=1, max_length=500)
    descripcion: str | None = None
    completada: bool | None = None
    fecha_vencimiento: datetime | None = None
    prioridad: PrioridadLiteral | None = None
    tipo: TipoLiteral | None = None
    estimado_horas: float | None = Field(default=None, ge=0, le=1000)
    materia_codigo: str | None = None
    orden: int | None = None
