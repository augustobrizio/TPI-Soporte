"""Schemas del panel de notificaciones.

Las notificaciones **no son una entidad**: se derivan de novedades y eventos
del calendario que ya están en la DB. Lo único que se persiste es cuándo fue
la última vez que el usuario miró (``usuario.notificaciones_vistas_at``), y
de ahí sale el flag ``nueva`` de cada item.
"""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel

from app.schemas.calendario import TipoEventoLiteral


class NovedadNotificacion(BaseModel):
    """Una novedad, tal como la muestra el panel."""

    id: int
    titulo: str
    fecha: datetime | None = None
    #: Publicada después de la última vez que el usuario abrió el panel.
    nueva: bool


class MesaNotificacion(BaseModel):
    """Una mesa o examen dentro de la ventana de aviso."""

    id: int
    titulo: str
    fecha_inicio: datetime
    tipo: TipoEventoLiteral
    #: Días que faltan. 0 es hoy — el panel lo escribe como "hoy", no "en 0 días".
    dias_restantes: int
    #: Entró en la ventana de aviso después de la última visita al panel.
    nueva: bool


class NotificacionesOut(BaseModel):
    """Respuesta de ``GET /notificaciones``.

    ``nuevas`` es lo que enciende el puntito de la campana. Es un contador y
    no un booleano para poder mostrar "3" en vez de un punto mudo, y sale de
    los flags ``nueva`` de las dos listas: si da 0, la campana no avisa nada.
    """

    nuevas: int
    novedades: list[NovedadNotificacion] = []
    mesas: list[MesaNotificacion] = []
    #: Línea de corte usada para calcular lo nuevo. Expuesta para depurar.
    vistas_at: datetime | None = None
