"""Schemas Pydantic para el dominio academico.

Estos DTOs son la frontera entre la capa de presentacion (FastAPI) y la
de negocio (services). Nunca exponemos modelos SQLAlchemy directamente.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.core.plan import HORAS_ELECTIVAS_REQUERIDAS
from app.db.models.academico import CondicionMateria

TipoMateriaLiteral = Literal["troncal", "electiva"]
TipoCorrelativaLiteral = Literal["regular", "aprobada"]
EstadoMateriaLiteral = Literal["aprobado", "regular", "cursando", "cursable", "libre"]


# ---------------------------------------------------------------------------
# Recursos basicos
# ---------------------------------------------------------------------------
class MateriaOut(BaseModel):
    """Vista publica de una materia."""

    codigo: str
    nombre: str
    anio_carrera: int | None = None
    cuatrimestre: str | None = None
    horas: int | None = None
    creditos: int | None = None
    tipo: TipoMateriaLiteral | None = None

    model_config = ConfigDict(from_attributes=True)


class CorrelativaOut(BaseModel):
    """Una arista de correlatividad: ``materia`` requiere ``requerida``."""

    materia_codigo: str
    materia_requerida: str
    tipo: TipoCorrelativaLiteral

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Grafo (lo que consume el frontend para pintar el arbol)
# ---------------------------------------------------------------------------
class MateriaNodo(BaseModel):
    """Nodo del grafo: una materia con su estado para el usuario."""

    codigo: str
    nombre: str
    anio_carrera: int | None = None
    cuatrimestre: str | None = None
    horas: int | None = None
    tipo: TipoMateriaLiteral | None = None
    estado: EstadoMateriaLiteral = Field(
        ...,
        description=(
            "Estado calculado para el usuario: aprobado, regular, cursando, "
            "cursable (cumple correlativas para anotarse) o libre (todavia no)."
        ),
    )
    nota: float | None = None


class CorrelativaEdge(BaseModel):
    """Arista del grafo: una correlativa entre dos materias."""

    desde: str = Field(..., description="codigo de la materia requerida (origen)")
    hacia: str = Field(..., description="codigo de la materia que la requiere")
    tipo: TipoCorrelativaLiteral


class ContadoresGrafo(BaseModel):
    """Contadores que muestra la barra superior (4/36, 11.1%, etc.)."""

    aprobadas: int
    regulares: int
    cursando: int
    cursables: int
    libres: int
    total: int
    porcentaje_aprobadas: float
    carga_horaria_cursando: int = 0
    creditos_electivas: int = 0
    meta_creditos_electivas: int = HORAS_ELECTIVAS_REQUERIDAS
    # Promedio sobre TODAS las materias aprobadas con nota (troncales + electivas).
    # Es el mismo valor en ambas pestañas: refleja el promedio general de la carrera.
    promedio_general: float | None = None


class GrafoResponse(BaseModel):
    """Respuesta del endpoint del grafo (una pestana: troncales o electivas)."""

    tipo: TipoMateriaLiteral
    nodos: list[MateriaNodo]
    edges: list[CorrelativaEdge]
    contadores: ContadoresGrafo
    registros_usuario: dict[str, str] = Field(
        default_factory=dict,
        description=(
            "Mapa codigo->condicion de TODAS las materias del usuario "
            "(troncales + electivas). Permite al frontend calcular cascadas cross-tab."
        ),
    )
    nodos_externos: list[MateriaNodo] = Field(
        default_factory=list,
        description=(
            "Nodos de otras pestanas referenciados como prereqs en los edges. "
            "No se renderizan en el grafo pero permiten mostrar sus nombres y estados "
            "en el panel de detalle."
        ),
    )


# ---------------------------------------------------------------------------
# Inscripcion / validacion
# ---------------------------------------------------------------------------
class FaltanteCorrelativa(BaseModel):
    """Una correlativa que el usuario aun no cumple."""

    materia_requerida: str
    nombre: str
    requiere: TipoCorrelativaLiteral = Field(
        ..., description="Condicion minima requerida"
    )
    tiene: CondicionMateria = Field(
        ..., description="Condicion actual del usuario sobre esa correlativa"
    )


class ValidacionCorrelativas(BaseModel):
    """Resultado de validar si un usuario puede cursar/rendir una materia."""

    materia_codigo: str
    accion: Literal["cursar", "rendir"]
    permitido: bool
    faltantes: list[FaltanteCorrelativa] = Field(default_factory=list)
    motivo: str | None = None


# ---------------------------------------------------------------------------
# Estado de cursada de un usuario
# ---------------------------------------------------------------------------
class UsuarioMateriaIn(BaseModel):
    """Payload para registrar/actualizar el estado de una materia."""

    condicion: CondicionMateria
    nota: float | None = Field(
        None,
        ge=0,
        le=10,
        description="Nota numerica (0-10). Solo aplica si condicion='aprobado'.",
    )
    anio_cursada: int | None = Field(
        None, ge=1900, description="Anio en que se curso la materia."
    )
    forzar: bool = Field(
        False,
        description=(
            "Si es True, salta la validacion de correlativas. Util para "
            "cargar historial pasado o casos especiales."
        ),
    )


class UsuarioMateriaOut(BaseModel):
    """Estado de cursada de una materia para un usuario."""

    materia_codigo: str
    nombre: str | None = None
    condicion: CondicionMateria
    nota: float | None = None
    anio_cursada: int | None = None

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Importacion masiva desde texto pegado de SYSACAD
# ---------------------------------------------------------------------------
class PegadoSysacadIn(BaseModel):
    """Payload del paso 1: el texto copiado del Estado Academico de SYSACAD."""

    texto: str = Field(
        ...,
        description=(
            "Texto pegado directamente de la tabla 'Estado Academico' de SYSACAD. "
            "Separado por tabs y newlines, como lo copia el browser."
        ),
    )


class ItemImportMapeado(BaseModel):
    """Un item con su match en la DB y la condicion parseada."""

    nombre_original: str
    estado_texto: str
    materia_codigo: str | None = Field(None, description="None si no se encontro match")
    materia_nombre: str | None = None
    confianza: float = Field(..., ge=0.0, le=1.0, description="Score de matching 0-1")
    condicion: CondicionMateria
    nota: float | None = None
    anio_cursada: int | None = None
    comision_nombre: str | None = Field(
        None,
        description=(
            "Comision detectada en el texto de estado ('Cursa en 4K02' -> '4K02'). "
            "Solo para condicion='cursando'; al confirmar se usa para seleccionar "
            "la cursada y que la materia aparezca en la grilla de Horarios."
        ),
    )
    importar: bool = Field(True, description="El alumno puede deseleccionar individualmente")


class PreviewImportSysacad(BaseModel):
    """Respuesta del primer paso: parseo + matching (sin tocar DB)."""

    items: list[ItemImportMapeado]
    total_parseados: int
    total_mapeados: int = Field(..., description="Items con confianza >= 0.75")
    advertencias: list[str] = Field(default_factory=list)


class ConfirmarImportIn(BaseModel):
    """Payload del segundo paso: el alumno confirma que items importar."""

    items: list[ItemImportMapeado]
    forzar: bool = Field(
        True,
        description="Salta validacion de correlativas (historial pasado).",
    )
    reemplazar: bool = Field(
        False,
        description=(
            "Si es True, borra TODO el historial previo del usuario antes de "
            "importar. Evita que se acumulen materias (ej: electivas) de "
            "importaciones anteriores."
        ),
    )


class ResultadoImportSysacad(BaseModel):
    """Resultado final de la importacion confirmada."""

    importadas: int
    omitidas: int
    eliminadas: int = 0
    comisiones_asignadas: int = Field(
        0,
        description="Materias 'cursando' a las que ademas se les selecciono la comision.",
    )
    errores: list[str] = Field(default_factory=list)
