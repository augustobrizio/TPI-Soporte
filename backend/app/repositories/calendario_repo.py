"""Repository del calendario academico."""
from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import date, datetime, time

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from app.db.models.calendario import EventoCalendario


def listar_eventos(
    db: Session,
    *,
    desde: datetime | None = None,
    hasta: datetime | None = None,
    tipo: str | None = None,
    carrera: str | None = None,
    usuario_id: int | None = None,
    limite: int | None = None,
) -> Sequence[EventoCalendario]:
    """Lista eventos ordenados por fecha, con filtros opcionales.

    Aislamiento: se devuelven los eventos compartidos (``usuario_id`` NULL) y,
    si ``usuario_id`` viene dado, además los personales de ESE usuario. Nunca
    los personales de otros.
    """
    stmt = select(EventoCalendario)
    condiciones = []
    # Filtro de propiedad: compartidos siempre; personales sólo del usuario.
    if usuario_id is not None:
        condiciones.append(
            or_(
                EventoCalendario.usuario_id.is_(None),
                EventoCalendario.usuario_id == usuario_id,
            )
        )
    else:
        condiciones.append(EventoCalendario.usuario_id.is_(None))
    if desde is not None:
        condiciones.append(
            func.coalesce(EventoCalendario.fecha_fin, EventoCalendario.fecha_inicio)
            >= desde
        )
    if hasta is not None:
        condiciones.append(EventoCalendario.fecha_inicio <= hasta)
    if tipo is not None:
        condiciones.append(EventoCalendario.tipo == tipo)
    if carrera is not None:
        condiciones.append(
            or_(
                EventoCalendario.carrera == carrera,
                EventoCalendario.carrera.is_(None),
            )
        )
    if condiciones:
        stmt = stmt.where(and_(*condiciones))
    stmt = stmt.order_by(EventoCalendario.fecha_inicio.asc(), EventoCalendario.id.asc())
    if limite is not None:
        stmt = stmt.limit(limite)
    return db.execute(stmt).scalars().all()


def listar_eventos_del_dia(
    db: Session, *, dia: date, carrera: str | None = None, usuario_id: int | None = None
) -> Sequence[EventoCalendario]:
    """Eventos cuya fecha de inicio cae dentro del dia indicado."""
    desde = datetime.combine(dia, time.min)
    hasta = datetime.combine(dia, time.max)
    return listar_eventos(
        db, desde=desde, hasta=hasta, carrera=carrera, usuario_id=usuario_id
    )


def get_evento(db: Session, evento_id: int) -> EventoCalendario | None:
    """Obtiene un evento por ID."""
    return db.get(EventoCalendario, evento_id)


def crear_evento_usuario(
    db: Session,
    *,
    usuario_id: int,
    titulo: str,
    descripcion: str | None,
    fecha_inicio: datetime,
    fecha_fin: datetime | None,
    tipo: str,
    carrera: str | None = "ISI",
) -> EventoCalendario:
    """Crea un evento personal, de origen 'usuario', con su dueño."""
    evento = EventoCalendario(
        titulo=titulo,
        descripcion=descripcion,
        fecha_inicio=fecha_inicio,
        fecha_fin=fecha_fin,
        tipo=tipo,
        carrera=carrera,
        fuente_url=None,
        content_hash=f"user-{uuid.uuid4().hex}",
        origen="usuario",
        usuario_id=usuario_id,
    )
    db.add(evento)
    db.flush()
    return evento


def eliminar_evento(db: Session, evento: EventoCalendario) -> None:
    db.delete(evento)
    db.flush()


def get_by_content_hash(db: Session, content_hash: str) -> EventoCalendario | None:
    """Busca un evento por hash de contenido."""
    stmt = select(EventoCalendario).where(
        EventoCalendario.content_hash == content_hash
    )
    return db.execute(stmt).scalar_one_or_none()


def upsert_evento(
    db: Session,
    *,
    titulo: str,
    descripcion: str | None,
    fecha_inicio: datetime,
    fecha_fin: datetime | None,
    tipo: str,
    carrera: str | None,
    fuente_url: str | None,
    content_hash: str,
) -> tuple[EventoCalendario, str]:
    """Inserta o actualiza por ``content_hash``.

    Devuelve ``(evento, estado)`` donde estado es ``creado``, ``actualizado`` o
    ``sin_cambios``.
    """
    evento = get_by_content_hash(db, content_hash)
    if evento is None:
        evento = EventoCalendario(
            titulo=titulo,
            descripcion=descripcion,
            fecha_inicio=fecha_inicio,
            fecha_fin=fecha_fin,
            tipo=tipo,
            carrera=carrera,
            fuente_url=fuente_url,
            content_hash=content_hash,
        )
        db.add(evento)
        db.flush()
        return evento, "creado"

    cambios = {
        "titulo": titulo,
        "descripcion": descripcion,
        "fecha_inicio": fecha_inicio,
        "fecha_fin": fecha_fin,
        "tipo": tipo,
        "carrera": carrera,
        "fuente_url": fuente_url,
    }
    changed = False
    for campo, valor in cambios.items():
        if getattr(evento, campo) != valor:
            setattr(evento, campo, valor)
            changed = True
    if changed:
        db.flush()
        return evento, "actualizado"
    return evento, "sin_cambios"
