"""Endpoints REST del calendario academico."""
from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import UsuarioActual, UsuarioOpcional
from app.db.session import get_db
from app.schemas.calendario import (
    EventoCalendarioCreate,
    EventoCalendarioOut,
    EventoCalendarioUpdate,
    ResultadoSincCalendario,
    TipoEventoLiteral,
)
from app.services import calendario_service

router = APIRouter(prefix="/calendario", tags=["calendario"])


@router.post(
    "/eventos",
    response_model=EventoCalendarioOut,
    status_code=status.HTTP_201_CREATED,
    summary="Crear un evento propio del alumno",
)
def crear_evento(
    payload: EventoCalendarioCreate,
    db: Annotated[Session, Depends(get_db)],
    usuario: UsuarioActual,
) -> EventoCalendarioOut:
    evento = calendario_service.crear_evento_usuario(
        db,
        usuario_id=usuario.id,
        titulo=payload.titulo,
        descripcion=payload.descripcion,
        fecha_inicio=payload.fecha_inicio,
        fecha_fin=payload.fecha_fin,
        tipo=payload.tipo,
    )
    db.commit()
    db.refresh(evento)
    return EventoCalendarioOut.model_validate(evento)


@router.put(
    "/eventos/{evento_id}",
    response_model=EventoCalendarioOut,
    summary="Editar un evento propio del alumno",
)
def actualizar_evento(
    evento_id: int,
    payload: EventoCalendarioUpdate,
    db: Annotated[Session, Depends(get_db)],
    usuario: UsuarioActual,
) -> EventoCalendarioOut:
    try:
        evento = calendario_service.actualizar_evento_usuario(
            db,
            evento_id,
            payload.model_dump(exclude_unset=True),
            usuario_id=usuario.id,
        )
        db.commit()
        db.refresh(evento)
    except ValueError as e:
        if str(e) == "no_encontrado":
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evento no encontrado.")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Ese evento no se puede editar.")
    return EventoCalendarioOut.model_validate(evento)


@router.delete(
    "/eventos/{evento_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Borrar un evento propio del alumno",
)
def eliminar_evento(
    evento_id: int,
    db: Annotated[Session, Depends(get_db)],
    usuario: UsuarioActual,
) -> None:
    ok = calendario_service.eliminar_evento_usuario(
        db, evento_id, usuario_id=usuario.id
    )
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Evento no encontrado o no editable.",
        )
    db.commit()


@router.get("", response_model=list[EventoCalendarioOut])
def listar_eventos(
    db: Annotated[Session, Depends(get_db)],
    usuario: UsuarioOpcional,
    desde: date | None = Query(None, description="Fecha inicial inclusive"),
    hasta: date | None = Query(None, description="Fecha final inclusive"),
    tipo: TipoEventoLiteral | None = Query(None),
    carrera: str | None = Query("ISI", description="ISI o null para todas"),
) -> list[EventoCalendarioOut]:
    """Lista eventos del calendario (compartidos + personales del usuario).

    Público: sin sesión devuelve el calendario de la facultad. Con sesión suma
    los eventos propios del alumno.
    """
    eventos = calendario_service.listar_eventos(
        db,
        desde=desde,
        hasta=hasta,
        tipo=tipo,
        carrera=carrera,
        usuario_id=usuario.id if usuario else None,
    )
    return [EventoCalendarioOut.model_validate(e) for e in eventos]


@router.get("/proximos", response_model=list[EventoCalendarioOut])
def proximos_eventos(
    db: Annotated[Session, Depends(get_db)],
    usuario: UsuarioOpcional,
    limite: int = Query(5, ge=1, le=50),
    carrera: str | None = Query("ISI"),
) -> list[EventoCalendarioOut]:
    """Eventos futuros mas cercanos (compartidos + personales del usuario)."""
    eventos = calendario_service.proximos_eventos(
        db,
        limite=limite,
        carrera=carrera,
        usuario_id=usuario.id if usuario else None,
    )
    return [EventoCalendarioOut.model_validate(e) for e in eventos]


@router.get("/hoy", response_model=list[EventoCalendarioOut])
def eventos_hoy(
    db: Annotated[Session, Depends(get_db)],
    usuario: UsuarioOpcional,
    carrera: str | None = Query("ISI"),
) -> list[EventoCalendarioOut]:
    """Eventos de hoy (compartidos + personales del usuario)."""
    eventos = calendario_service.eventos_hoy(
        db, carrera=carrera, usuario_id=usuario.id if usuario else None
    )
    return [EventoCalendarioOut.model_validate(e) for e in eventos]


@router.get("/{evento_id}", response_model=EventoCalendarioOut)
def get_evento(
    evento_id: int,
    db: Annotated[Session, Depends(get_db)],
    usuario: UsuarioOpcional,
) -> EventoCalendarioOut:
    """Detalle de un evento por ID (propio o compartido)."""
    evento = calendario_service.get_evento(db, evento_id)
    # 404 también si el evento es personal de OTRO usuario, o de cualquiera
    # cuando no hay sesión (no filtramos su existencia).
    if (
        evento is None
        or evento.usuario_id is not None
        and (usuario is None or evento.usuario_id != usuario.id)
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Evento {evento_id} no encontrado.",
        )
    return EventoCalendarioOut.model_validate(evento)


@router.post(
    "/sincronizar",
    response_model=ResultadoSincCalendario,
    summary="Ingesta eventos desde fuentes FRRO configuradas",
)
def sincronizar_calendario(
    db: Annotated[Session, Depends(get_db)],
) -> ResultadoSincCalendario:
    """Scrapea FRRO y persiste eventos de forma idempotente."""
    resultado = calendario_service.sincronizar_calendario(db)
    if resultado.errores and resultado.eventos_detectados == 0:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=resultado.model_dump(),
        )
    db.commit()
    return resultado
