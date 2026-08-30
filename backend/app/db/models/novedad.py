"""Modelos de novedades: centros, novedades multi-fuente, FAQ y log de ingesta."""
from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class CategoriaContenido(str, enum.Enum):
    EVENTO = "evento"
    AVISO = "aviso"
    NOTICIA = "noticia"
    GENERAL = "general"


class FuenteContenido(str, enum.Enum):
    INSTAGRAM = "Instagram"
    FORO = "Foro"
    DIFUSION_DE_WSP = "Difusion de Wsp"


class FuenteNovedad(str, enum.Enum):
    INSTAGRAM = "instagram"
    UTN_WEB = "utn_web"


class CategoriaNovedad(str, enum.Enum):
    EVENTO = "evento"
    AVISO = "aviso"
    NOTICIA = "noticia"
    GENERAL = "general"


class EstadoNovedad(str, enum.Enum):
    PUBLICADA = "publicada"
    PENDIENTE = "pendiente"
    DESCARTADA = "descartada"


class EstadoIngesta(str, enum.Enum):
    OK = "ok"
    PARCIAL = "parcial"
    ERROR = "error"


categoria_enum = SAEnum(
    CategoriaContenido,
    name="categoria_enum",
    create_type=False,
    values_callable=lambda enum_cls: [m.value for m in enum_cls],
)

fuente_enum = SAEnum(
    FuenteContenido,
    name="fuente_enum",
    create_type=False,
    values_callable=lambda enum_cls: [m.value for m in enum_cls],
)


class Centro(Base):
    """Centro de estudiantes o fuente institucional, con logo y perfil."""

    __tablename__ = "centro"
    __table_args__ = (UniqueConstraint("handle", name="uq_centro_handle"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    handle: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    nombre: Mapped[str] = mapped_column(Text, nullable=False)
    tipo: Mapped[str] = mapped_column(Text, nullable=False)
    url_perfil: Mapped[str | None] = mapped_column(Text, nullable=True)
    logo_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime | None] = mapped_column(
        DateTime, server_default=func.now()
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Centro handle={self.handle} nombre={self.nombre!r}>"


class Novedad(Base):
    """Evento canónico. Sus apariciones (1 -> N) viven en ``NovedadFuente``."""

    __tablename__ = "novedad"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    titulo: Mapped[str | None] = mapped_column(Text, nullable=True)
    descripcion: Mapped[str | None] = mapped_column(Text, nullable=True)
    contenido: Mapped[str | None] = mapped_column(Text, nullable=True)
    categoria: Mapped[str | None] = mapped_column(Text, nullable=True)
    imagen_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    imagen_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    estado: Mapped[str] = mapped_column(
        Text, nullable=False, server_default=EstadoNovedad.PENDIENTE.value, index=True
    )
    confianza: Mapped[float | None] = mapped_column(Float, nullable=True)
    motivo_descarte: Mapped[str | None] = mapped_column(Text, nullable=True)
    #: Estado que decidió el clasificador. No lo pisa la moderación manual:
    #: comparado con ``estado`` da la lista de errores del LLM, que es la
    #: materia prima para refinar el prompt.
    estado_llm: Mapped[str | None] = mapped_column(Text, nullable=True)
    #: True si un humano corrigió el estado. Distingue "el LLM acertó" de
    #: "lo arreglamos a mano".
    moderado_manual: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )
    fecha_publicacion: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True
    )
    created_at: Mapped[datetime | None] = mapped_column(
        DateTime, server_default=func.now()
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    fuentes: Mapped[list[NovedadFuente]] = relationship(
        back_populates="novedad",
        cascade="all, delete-orphan",
        order_by="NovedadFuente.id",
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Novedad id={self.id} titulo={self.titulo!r}>"


class NovedadFuente(Base):
    """Aparición de una novedad en un centro. ``external_id`` es la clave de dedup exacta."""

    __tablename__ = "novedad_fuente"
    __table_args__ = (
        UniqueConstraint("external_id", name="uq_novedad_fuente_external_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    novedad_id: Mapped[int] = mapped_column(
        ForeignKey("novedad.id", ondelete="CASCADE"), nullable=False, index=True
    )
    centro_id: Mapped[int] = mapped_column(
        ForeignKey("centro.id"), nullable=False, index=True
    )
    external_id: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    url: Mapped[str | None] = mapped_column(Text, nullable=True)
    imagen_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    imagen_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    fecha_publicacion: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True
    )
    created_at: Mapped[datetime | None] = mapped_column(
        DateTime, server_default=func.now()
    )

    novedad: Mapped[Novedad] = relationship(back_populates="fuentes")
    centro: Mapped[Centro] = relationship()

    def __repr__(self) -> str:  # pragma: no cover
        return f"<NovedadFuente external_id={self.external_id}>"


class FaqQuestion(Base):
    __tablename__ = "faqquestion"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    fuente_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    pregunta: Mapped[str | None] = mapped_column(Text, nullable=True)
    respuesta: Mapped[str | None] = mapped_column(Text, nullable=True)
    keywords: Mapped[str | None] = mapped_column(Text, nullable=True)
    categoria: Mapped[CategoriaContenido | None] = mapped_column(
        categoria_enum, nullable=True
    )
    fecha_publicacion: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True
    )
    created_at: Mapped[datetime | None] = mapped_column(
        DateTime, server_default=func.now()
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<FaqQuestion id={self.id} pregunta={self.pregunta!r}>"


class IngestaLog(Base):
    """Auditoría de cada corrida del pipeline de ingesta (RNF-08)."""

    __tablename__ = "ingesta_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    fuente: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    iniciado_en: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    finalizado_en: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    items_vistos: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    items_nuevos: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    items_novedad: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    items_descartados: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0
    )
    tokens_usados: Mapped[int | None] = mapped_column(Integer, nullable=True)

    estado: Mapped[str] = mapped_column(Text, nullable=False)
    errores: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime | None] = mapped_column(
        DateTime, server_default=func.now()
    )

    def __repr__(self) -> str:  # pragma: no cover
        return (
            f"<IngestaLog id={self.id} fuente={self.fuente} "
            f"estado={self.estado}>"
        )
