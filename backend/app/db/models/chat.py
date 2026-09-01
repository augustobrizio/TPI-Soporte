"""Modelos del chat conversacional con el agente.

Tablas: ``conversacion`` (sesiones de chat por usuario) y ``mensaje``
(turnos individuales: usuario, asistente, herramienta).
"""
from __future__ import annotations

import json
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Conversacion(Base):
    """Una sesión de chat de un usuario con el agente."""

    __tablename__ = "conversacion"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    usuario_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("usuario.id"), nullable=False, index=True
    )
    titulo: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime | None] = mapped_column(
        DateTime, server_default=func.now()
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime, server_default=func.now()
    )

    mensajes: Mapped[list["Mensaje"]] = relationship(
        back_populates="conversacion",
        cascade="all, delete-orphan",
        order_by="Mensaje.created_at",
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Conversacion id={self.id} usuario={self.usuario_id}>"


class Mensaje(Base):
    """Un turno de chat dentro de una conversación."""

    __tablename__ = "mensaje"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    conversacion_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("conversacion.id"), nullable=False, index=True
    )
    role: Mapped[str | None] = mapped_column(Text, nullable=True)
    contenido: Mapped[str | None] = mapped_column(Text, nullable=True)
    tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Fuentes citadas por el asistente, serializadas como JSON (lista de
    # {titulo, fuente, url, fecha}). Se guardan por mensaje para poder mostrarlas
    # al retomar la conversación, no sólo en vivo.
    fuentes_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime | None] = mapped_column(
        DateTime, server_default=func.now()
    )

    conversacion: Mapped[Conversacion] = relationship(back_populates="mensajes")
    feedback: Mapped[list["ChatFeedback"]] = relationship(
        back_populates="mensaje", cascade="all, delete-orphan"
    )

    @property
    def fuentes(self) -> list[dict]:
        """Fuentes citadas, parseadas desde ``fuentes_json`` (lista de dicts)."""
        if not self.fuentes_json:
            return []
        try:
            data = json.loads(self.fuentes_json)
            return data if isinstance(data, list) else []
        except ValueError:
            return []

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Mensaje id={self.id} role={self.role}>"


class ChatFeedback(Base):
    """Feedback del usuario sobre una respuesta del asistente (👍/👎 + motivo).

    Un feedback por (mensaje, usuario): volver a votar actualiza el anterior.
    """

    __tablename__ = "chat_feedback"
    __table_args__ = (
        UniqueConstraint(
            "mensaje_id", "usuario_id", name="uq_chat_feedback_mensaje_usuario"
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    mensaje_id: Mapped[int] = mapped_column(
        ForeignKey("mensaje.id", ondelete="CASCADE"), nullable=False, index=True
    )
    usuario_id: Mapped[int] = mapped_column(
        ForeignKey("usuario.id"), nullable=False, index=True
    )
    # True = útil (👍), False = no útil (👎).
    util: Mapped[bool] = mapped_column(Boolean, nullable=False)
    # Motivo cuando es 👎 (info incorrecta, desactualizada, no respondió, falta info).
    motivo: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime | None] = mapped_column(
        DateTime, server_default=func.now()
    )

    mensaje: Mapped[Mensaje] = relationship(back_populates="feedback")

    def __repr__(self) -> str:  # pragma: no cover
        return f"<ChatFeedback mensaje={self.mensaje_id} util={self.util}>"
