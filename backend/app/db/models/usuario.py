"""Modelo de Usuario.

Refleja la tabla ``usuario`` del schema de Neon. La columna ``password``
está pensada para guardar un hash (no texto plano) — RNF-02, y es nullable
porque una cuenta creada con Google nunca define una contraseña local.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Integer, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Usuario(Base):
    """Usuario del sistema (estudiante o admin)."""

    __tablename__ = "usuario"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    nombre: Mapped[str | None] = mapped_column(Text, nullable=True)
    apellido: Mapped[str | None] = mapped_column(Text, nullable=True)
    legajo: Mapped[str | None] = mapped_column(Text, nullable=True)
    password: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Identificador estable de la cuenta de Google (claim ``sub`` del
    # id_token). Es la clave real del vínculo: el email de una cuenta de
    # Google puede cambiar, el ``sub`` no. Unique para que dos filas no puedan
    # reclamar la misma identidad de Google.
    google_sub: Mapped[str | None] = mapped_column(
        Text, unique=True, index=True, nullable=True
    )
    # Foto de perfil que devuelve Google. Se guarda la URL, no la imagen.
    avatar_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Última vez que el usuario abrió el panel de notificaciones. Es la línea
    # de corte de "lo nuevo": todo lo publicado después de este instante
    # cuenta como no visto. NULL = nunca lo abrió, y ahí la línea pasa a ser
    # ``created_at`` (ver ``notificacion_service``).
    notificaciones_vistas_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True
    )
    anio_ingresado: Mapped[int | None] = mapped_column(Integer, nullable=True)
    rol: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime | None] = mapped_column(
        DateTime, server_default=func.now()
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Usuario id={self.id} email={self.email!r}>"
