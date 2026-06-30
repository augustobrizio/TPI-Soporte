"""Modelo de Task (to-do personal del alumno)."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Task(Base):
    """Tarea personal del alumno (to-do list estilo Notion)."""

    __tablename__ = "task"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    usuario_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("usuario.id"), nullable=False, index=True
    )
    titulo: Mapped[str] = mapped_column(Text, nullable=False)
    descripcion: Mapped[str | None] = mapped_column(Text, nullable=True)
    completada: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False
    )
    fecha_vencimiento: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    prioridad: Mapped[str | None] = mapped_column(Text, nullable=True)
    # categoria de la tarea: examen | tp | entrega | lectura | estudio | personal
    tipo: Mapped[str | None] = mapped_column(Text, nullable=True)
    # esfuerzo estimado en horas (para planificar la carga semanal)
    estimado_horas: Mapped[float | None] = mapped_column(Float, nullable=True)
    materia_codigo: Mapped[str | None] = mapped_column(
        Text, ForeignKey("materia.codigo", ondelete="SET NULL"), nullable=True
    )
    orden: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Task id={self.id} titulo={self.titulo!r} completada={self.completada}>"
