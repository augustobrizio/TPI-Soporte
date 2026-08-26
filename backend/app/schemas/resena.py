"""Schemas de reseñas de alumnos (feature 004)."""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class ResenaAlumnoIn(BaseModel):
    """Alta/edición de una reseña de alumno sobre una cátedra."""

    materia_codigo: str
    profesor_id: int
    nivel: int = Field(
        ...,
        ge=1,
        le=5,
        description="1 = súper evitaría … 5 = súper recomiendo (escala de UTNTAC).",
    )
    comentario: str | None = Field(default=None, max_length=1000)


class ResenaAlumnoOut(BaseModel):
    id: int
    materia_codigo: str
    profesor_id: int
    nivel: int
    comentario: str | None

    model_config = ConfigDict(from_attributes=True)
