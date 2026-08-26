"""Endpoints del panel de notificaciones.

Requieren sesión: lo nuevo se calcula contra la última visita de *este*
usuario, así que sin saber quién pregunta no hay respuesta posible. El
visitante anónimo directamente no ve la campana en la barra.
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import UsuarioActual
from app.db.session import get_db
from app.schemas.notificacion import NotificacionesOut
from app.services import notificacion_service

router = APIRouter(prefix="/notificaciones", tags=["notificaciones"])


@router.get(
    "",
    response_model=NotificacionesOut,
    summary="Novedades nuevas y mesas próximas del usuario",
)
def listar_notificaciones(
    usuario: UsuarioActual,
    db: Annotated[Session, Depends(get_db)],
) -> NotificacionesOut:
    """Contenido del panel, con el contador de lo que todavía no vio."""
    return notificacion_service.resumen(db, usuario)


@router.post(
    "/visto",
    response_model=NotificacionesOut,
    summary="Marcar las notificaciones como vistas",
)
def marcar_visto(
    usuario: UsuarioActual,
    db: Annotated[Session, Depends(get_db)],
) -> NotificacionesOut:
    """Corre la línea de corte a ahora y devuelve el panel ya actualizado.

    Devuelve el resumen —y no un 204— para que el frontend apague el puntito
    con la respuesta que ya tiene, sin un segundo GET.
    """
    notificacion_service.marcar_vistas(db, usuario)
    db.commit()
    db.refresh(usuario)
    return notificacion_service.resumen(db, usuario)
