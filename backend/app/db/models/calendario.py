"""Modelos del calendario academico.

La tabla ``evento_calendario`` guarda eventos normalizados desde fuentes FRRO
para que el frontend y el futuro agente no dependan del formato original
(HTML/PDF/Drive).
"""
from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class TipoEventoCalendario(str, enum.Enum):
    """Tipos publicos del calendario v1."""

    EXAMEN = "examen"
    MESA = "mesa"
    TRABAJO_PRACTICO = "trabajo_practico"
    FERIADO = "feriado"
    EVENTO = "evento"


class EventoCalendario(Base):
    """Evento academico o institucional mostrado en el calendario."""

    __tablename__ = "evento_calendario"
    __table_args__ = (
        UniqueConstraint("content_hash", name="uq_evento_calendario_content_hash"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    titulo: Mapped[str] = mapped_column(Text, nullable=False)
    descripcion: Mapped[str | None] = mapped_column(Text, nullable=True)
    fecha_inicio: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    fecha_fin: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    tipo: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    carrera: Mapped[str | None] = mapped_column(Text, nullable=True, index=True)
    fuente_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    content_hash: Mapped[str] = mapped_column(Text, nullable=False)
    # "sistema" (scrapeado de FRRO) o "usuario" (creado por el alumno).
    origen: Mapped[str] = mapped_column(
        Text, nullable=False, server_default="sistema", index=True
    )
    # Dueño del evento. NULL = evento compartido (scrapeado de FRRO, visible para
    # todos). Con valor = evento personal del alumno, visible SÓLO para él. Sin
    # esto, los eventos personales (TPs, exámenes) se filtraban entre usuarios.
    usuario_id: Mapped[int | None] = mapped_column(
        ForeignKey("usuario.id", ondelete="CASCADE"), nullable=True, index=True
    )
    created_at: Mapped[datetime | None] = mapped_column(
        DateTime, server_default=func.now()
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<EventoCalendario id={self.id} tipo={self.tipo} titulo={self.titulo!r}>"
