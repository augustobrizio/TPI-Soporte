"""Reseña de un alumno sobre una cátedra (profesor × materia).

Fuente propia de UTNHub (distinta de ``ReviewCatedra``, que es el agregado
importado de UTNTAC). Cada alumno tiene **una** reseña por (profesor, materia),
editable. El ``nivel`` (1–5) es un voto en la misma escala que UTNTAC, así que
se suma al tally de esa cátedra para el score combinado.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class ResenaAlumno(Base):
    """Reseña individual de un alumno a un (profesor, materia)."""

    __tablename__ = "resena_alumno"
    __table_args__ = (
        UniqueConstraint(
            "usuario_id", "profesor_id", "materia_codigo", name="uq_resena_usuario_catedra"
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    usuario_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("usuario.id", ondelete="CASCADE"), nullable=False, index=True
    )
    profesor_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("profesor.id", ondelete="CASCADE"), nullable=False, index=True
    )
    materia_codigo: Mapped[str] = mapped_column(
        Text, ForeignKey("materia.codigo", ondelete="CASCADE"), nullable=False, index=True
    )

    # Nivel de recomendación 1–5 (1 = súper evitaría … 5 = súper recomiendo),
    # misma escala que los votos de UTNTAC.
    nivel: Mapped[int] = mapped_column(Integer, nullable=False)
    comentario: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime | None] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    profesor: Mapped["Profesor"] = relationship()  # noqa: F821

    def __repr__(self) -> str:  # pragma: no cover
        return (
            f"<ResenaAlumno u={self.usuario_id} prof={self.profesor_id} "
            f"materia={self.materia_codigo} nivel={self.nivel}>"
        )
