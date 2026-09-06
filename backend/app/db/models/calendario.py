"""Modelos del calendario academico.

La tabla ``evento_calendario`` guarda eventos normalizados desde fuentes FRRO
para que el frontend y el futuro agente no dependan del formato original
(HTML/PDF/Drive).
"""
from __future__ import annotations

import enum
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Text,
    UniqueConstraint,
    func,
)
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


class EstadoDia(Base):
    """Override manual del estado de cursada de un día.

    El estado de un día sale del calendario (una mesa o un feriado lo dejan sin
    cursada). Esta tabla es la excepción: lo que la facultad no publica como
    evento y sin embargo suspende la actividad —un paro, una asamblea, una
    jornada— o al revés, un día que el calendario da por caído y en realidad se
    cursa.

    Un registro por fecha: el override manda sobre lo derivado, y borrar la
    fila devuelve el día a lo que diga el calendario.

    ``origen`` distingue quién lo puso. Hoy sólo escribe ``admin``; queda
    preparado para que el clasificador de novedades proponga ``agente`` cuando
    detecte un paro en una publicación, sin pisar lo que cargó una persona.
    """

    __tablename__ = "estado_dia"
    __table_args__ = (UniqueConstraint("fecha", name="uq_estado_dia_fecha"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    fecha: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    se_cursa: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    #: Qué pasa ese día, en dos palabras: "Paro", "Asamblea". Es lo que se lee
    #: en el bloque del panel.
    motivo: Mapped[str | None] = mapped_column(Text, nullable=True)
    #: Texto largo opcional, para cuando hace falta explicar.
    detalle: Mapped[str | None] = mapped_column(Text, nullable=True)
    origen: Mapped[str] = mapped_column(
        Text, nullable=False, server_default="admin", index=True
    )
    #: Quién lo cargó. Se conserva aunque la cuenta se borre (SET NULL): el
    #: dato de que el día está intervenido no depende de que el admin siga.
    usuario_id: Mapped[int | None] = mapped_column(
        ForeignKey("usuario.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime | None] = mapped_column(
        DateTime, server_default=func.now()
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<EstadoDia fecha={self.fecha} se_cursa={self.se_cursa}>"
