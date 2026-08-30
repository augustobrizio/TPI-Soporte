"""Schemas Pydantic de novedades."""
from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

CategoriaNovedadLiteral = Literal["evento", "aviso", "noticia", "general"]
EstadoNovedadLiteral = Literal["publicada", "pendiente", "descartada"]


class ClasificacionNovedad(BaseModel):
    """Salida estructurada del clasificador IA (los ``description`` guían al LLM)."""

    es_novedad: bool = Field(
        description=(
            "True solo si el contenido es información institucional/académica "
            "útil para estudiantes (paros, mesas, fechas, trámites, eventos, "
            "avisos). False para memes, saludos, promos de merch o contenido "
            "no informativo."
        )
    )
    categoria: CategoriaNovedadLiteral = Field(description="Categoría de la novedad.")
    titulo: str = Field(description="Título corto y claro (máx ~90 caracteres).")
    descripcion: str = Field(
        description="Resumen objetivo del contenido, sin inventar datos."
    )
    contenido: str | None = Field(
        default=None,
        description=(
            "Cuerpo mas largo (2-4 oraciones) para el detalle de la novedad, "
            "combinando lo que se VE en la imagen (si es un flyer/story) con "
            "el texto de la publicación. Sin inventar datos que no estén en "
            "la imagen o el texto. null si 'descripcion' ya cubre todo lo "
            "relevante (ej. una nota de texto plano, sin flyer)."
        ),
    )
    fecha_evento: date | None = Field(
        default=None,
        description=(
            "Fecha del evento/mesa/trámite si el contenido la menciona "
            "explícitamente; null si no hay una fecha clara."
        ),
    )
    confianza: float = Field(
        ge=0.0,
        le=1.0,
        description="Confianza de que la clasificación es correcta (0 a 1).",
    )
    motivo: str | None = Field(
        default=None,
        description="Si es_novedad=False, breve motivo del descarte.",
    )
    imagen_sugerida: str | None = Field(
        default=None,
        description=(
            "Nombre EXACTO de archivo, de la lista de imágenes genéricas "
            "provista, que mejor representa esta novedad. null si ninguna "
            "encaja. Se usa solo si la novedad no tiene imagen propia."
        ),
    )
    duplicado_de: int | None = Field(
        default=None,
        description=(
            "Si esta publicación se refiere al MISMO hecho/evento que una de "
            "las 'novedades recientes ya registradas' provistas, su id. null "
            "si es un hecho nuevo. Dos eventos distintos aunque parecidos NO "
            "son duplicados."
        ),
    )


class CentroOut(BaseModel):
    handle: str
    nombre: str
    tipo: str
    url_perfil: str | None = None
    logo_url: str | None = None

    model_config = ConfigDict(from_attributes=True)


class FuenteOut(BaseModel):
    centro: CentroOut
    url: str | None = None

    model_config = ConfigDict(from_attributes=True)


class NovedadOut(BaseModel):
    id: int
    titulo: str | None = None
    descripcion: str | None = None
    contenido: str | None = None
    imagen_url: str | None = None
    categoria: str | None = None
    estado: str
    #: Estado que decidio el clasificador, para poder auditar sus errores.
    estado_llm: str | None = None
    moderado_manual: bool = False
    confianza: float | None = None
    fecha_publicacion: datetime | None = None
    created_at: datetime | None = None
    fuentes: list[FuenteOut] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class ModerarNovedadIn(BaseModel):
    estado: Literal["publicada", "descartada"]


class ResultadoFuente(BaseModel):
    fuente: str
    items_vistos: int = 0
    items_nuevos: int = 0
    items_novedad: int = 0
    items_descartados: int = 0
    items_duplicados: int = 0
    #: Items salteados por viejos, sin llegar al LLM (ver
    #: ``NOVEDADES_ANTIGUEDAD_MAX_DIAS``).
    items_viejos: int = 0
    estado: str = "ok"
    errores: list[str] = Field(default_factory=list)


class ResultadoIngesta(BaseModel):
    fuentes: list[ResultadoFuente] = Field(default_factory=list)

    @property
    def items_creados(self) -> int:
        return sum(f.items_novedad for f in self.fuentes)
