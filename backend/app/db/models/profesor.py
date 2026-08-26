"""Modelos de Profesor.

Tablas: ``profesor``, ``materia_profesor`` (cargos por año/materia),
``horario_consulta``.
"""
from __future__ import annotations

from datetime import time

from sqlalchemy import ForeignKey, Integer, Text, Time
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Profesor(Base):
    """Un profesor del padrón."""

    __tablename__ = "profesor"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    nombre: Mapped[str | None] = mapped_column(Text, nullable=True)
    email: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Nombre canonico (minusculas, sin acentos ni puntuacion) — lo calcula
    # ``services/profesor_matching.clave_nombre``. Unico: la DB rechaza el mismo
    # nombre dos veces aunque cambie el email, que era por donde se colaban los
    # duplicados del padron.
    nombre_key: Mapped[str] = mapped_column(Text, nullable=False, unique=True, index=True)

    cargos: Mapped[list["MateriaProfesor"]] = relationship(
        back_populates="profesor", cascade="all, delete-orphan"
    )
    horarios_consulta: Mapped[list["HorarioConsulta"]] = relationship(
        back_populates="profesor", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Profesor id={self.id} nombre={self.nombre!r}>"


class MateriaProfesor(Base):
    """Asociación N:M entre profesor y materia, con cargo y año."""

    __tablename__ = "materia_profesor"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    materia_codigo: Mapped[str] = mapped_column(
        Text, ForeignKey("materia.codigo"), nullable=False, index=True
    )
    profesor_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("profesor.id"), nullable=False, index=True
    )
    cargo: Mapped[str | None] = mapped_column(Text, nullable=True)
    anio: Mapped[int | None] = mapped_column(Integer, nullable=True)

    profesor: Mapped[Profesor] = relationship(back_populates="cargos")

    def __repr__(self) -> str:  # pragma: no cover
        return (
            f"<MateriaProfesor materia={self.materia_codigo} "
            f"profesor={self.profesor_id} {self.cargo}>"
        )


class HorarioConsulta(Base):
    """Horario de consulta de un profesor."""

    __tablename__ = "horario_consulta"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    profesor_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("profesor.id"), nullable=False, index=True
    )
    dia: Mapped[str | None] = mapped_column(Text, nullable=True)
    hora_inicio: Mapped[time | None] = mapped_column(Time, nullable=True)
    hora_fin: Mapped[time | None] = mapped_column(Time, nullable=True)
    modalidad: Mapped[str | None] = mapped_column(Text, nullable=True)
    aula: Mapped[str | None] = mapped_column(Text, nullable=True)

    profesor: Mapped[Profesor] = relationship(back_populates="horarios_consulta")

    def __repr__(self) -> str:  # pragma: no cover
        return (
            f"<HorarioConsulta profesor={self.profesor_id} "
            f"{self.dia} {self.hora_inicio}-{self.hora_fin}>"
        )
