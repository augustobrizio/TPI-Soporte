"""Acceso a datos de conversaciones y mensajes del chat."""
from __future__ import annotations

from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.db.models.chat import ChatFeedback, Conversacion, Mensaje


def get_conversacion(
    db: Session, conversacion_id: int, usuario_id: int
) -> Conversacion | None:
    """Conversación por id, sólo si pertenece a ese usuario (aislamiento)."""
    return db.scalars(
        select(Conversacion)
        .where(
            Conversacion.id == conversacion_id,
            Conversacion.usuario_id == usuario_id,
        )
        .options(selectinload(Conversacion.mensajes))
    ).first()


def listar_conversaciones(
    db: Session, usuario_id: int, *, limite: int = 30
) -> Sequence[Conversacion]:
    """Conversaciones del usuario, de la más reciente a la más vieja."""
    return db.scalars(
        select(Conversacion)
        .where(Conversacion.usuario_id == usuario_id)
        .order_by(Conversacion.updated_at.desc(), Conversacion.id.desc())
        .limit(limite)
    ).all()


def crear_conversacion(
    db: Session, usuario_id: int, titulo: str | None = None
) -> Conversacion:
    conversacion = Conversacion(usuario_id=usuario_id, titulo=titulo)
    db.add(conversacion)
    db.flush()  # necesitamos el id para colgarle los mensajes
    return conversacion


def agregar_mensaje(
    db: Session,
    conversacion_id: int,
    *,
    role: str,
    contenido: str,
    fuentes_json: str | None = None,
    tools_json: str | None = None,
) -> Mensaje:
    mensaje = Mensaje(
        conversacion_id=conversacion_id,
        role=role,
        contenido=contenido,
        fuentes_json=fuentes_json,
        tools_json=tools_json,
    )
    db.add(mensaje)
    return mensaje


def eliminar_ultimo_turno(db: Session, conversacion_id: int) -> None:
    """Borra los últimos dos mensajes de la conversación (el turno más reciente).

    Se usa al *regenerar*: el frontend vuelve a mandar la última pregunta, así
    que primero descartamos ese turno (pregunta del usuario + respuesta del
    asistente) para no dejarlo duplicado en el historial.
    """
    ultimos = db.scalars(
        select(Mensaje)
        .where(Mensaje.conversacion_id == conversacion_id)
        .order_by(Mensaje.created_at.desc(), Mensaje.id.desc())
        .limit(2)
    ).all()
    for m in ultimos:
        db.delete(m)
    db.flush()


def listar_mensajes(db: Session, conversacion_id: int) -> Sequence[Mensaje]:
    return db.scalars(
        select(Mensaje)
        .where(Mensaje.conversacion_id == conversacion_id)
        .order_by(Mensaje.created_at, Mensaje.id)
    ).all()


def renombrar(
    db: Session, conversacion_id: int, usuario_id: int, titulo: str
) -> Conversacion | None:
    """Cambia el título, sólo si la conversación es del usuario."""
    conversacion = db.scalars(
        select(Conversacion).where(
            Conversacion.id == conversacion_id,
            Conversacion.usuario_id == usuario_id,
        )
    ).first()
    if conversacion is None:
        return None
    conversacion.titulo = titulo
    db.flush()
    return conversacion


def registrar_feedback(
    db: Session,
    *,
    mensaje_id: int,
    usuario_id: int,
    util: bool,
    motivo: str | None,
) -> ChatFeedback | None:
    """Upsert de feedback, sólo si el mensaje es de una conversación del usuario."""
    mensaje = db.scalars(
        select(Mensaje)
        .join(Conversacion)
        .where(Mensaje.id == mensaje_id, Conversacion.usuario_id == usuario_id)
    ).first()
    if mensaje is None:
        return None

    fb = db.scalars(
        select(ChatFeedback).where(
            ChatFeedback.mensaje_id == mensaje_id,
            ChatFeedback.usuario_id == usuario_id,
        )
    ).first()
    if fb is None:
        fb = ChatFeedback(
            mensaje_id=mensaje_id, usuario_id=usuario_id, util=util, motivo=motivo
        )
        db.add(fb)
    else:
        fb.util = util
        fb.motivo = motivo
    db.flush()
    return fb


def eliminar(db: Session, conversacion_id: int, usuario_id: int) -> bool:
    """Borra la conversación (y sus mensajes por cascade), si es del usuario."""
    conversacion = db.scalars(
        select(Conversacion).where(
            Conversacion.id == conversacion_id,
            Conversacion.usuario_id == usuario_id,
        )
    ).first()
    if conversacion is None:
        return False
    db.delete(conversacion)
    db.flush()
    return True
