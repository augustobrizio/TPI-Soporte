"""Endpoints REST del chat del asistente (agente + RAG)."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.deps import UsuarioActual
from app.db.session import get_db
from app.schemas.chat import (
    ChatIn,
    ChatOut,
    ConversacionDetalleOut,
    ConversacionOut,
    ConversacionUpdate,
    FeedbackIn,
)
from app.services import chat_service

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("", response_model=ChatOut, summary="Preguntar al asistente")
def preguntar(
    payload: ChatIn,
    db: Annotated[Session, Depends(get_db)],
    usuario: UsuarioActual,
) -> ChatOut:
    """Responde una pregunta y guarda el turno en la conversación."""
    resultado = chat_service.responder(
        db,
        payload.pregunta,
        usuario_id=usuario.id,
        conversacion_id=payload.conversacion_id,
    )
    db.commit()
    return ChatOut.model_validate(resultado)


@router.post("/stream", summary="Preguntar al asistente (respuesta en streaming)")
def preguntar_stream(
    payload: ChatIn,
    db: Annotated[Session, Depends(get_db)],
    usuario: UsuarioActual,
) -> StreamingResponse:
    """Igual que ``POST /chat`` pero devuelve la respuesta como eventos SSE.

    El generador del servicio va emitiendo pasos del agente y tokens a medida
    que se producen, y persiste el turno al final (hace el commit él mismo).
    """
    stream = chat_service.responder_stream(
        db,
        payload.pregunta,
        usuario_id=usuario.id,
        conversacion_id=payload.conversacion_id,
        regenerar=payload.regenerar,
    )
    return StreamingResponse(
        stream,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            # Evita que Nginx (u otros proxies) bufereen el stream y maten el
            # efecto de "aparece de a poco".
            "X-Accel-Buffering": "no",
        },
    )


@router.post(
    "/feedback",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Registrar feedback sobre una respuesta",
)
def registrar_feedback(
    payload: FeedbackIn,
    db: Annotated[Session, Depends(get_db)],
    usuario: UsuarioActual,
) -> None:
    ok = chat_service.registrar_feedback(
        db,
        mensaje_id=payload.mensaje_id,
        usuario_id=usuario.id,
        util=payload.util,
        motivo=payload.motivo,
    )
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Mensaje no encontrado.",
        )
    db.commit()


@router.get(
    "/conversaciones",
    response_model=list[ConversacionOut],
    summary="Historial de conversaciones del usuario",
)
def listar_conversaciones(
    db: Annotated[Session, Depends(get_db)],
    usuario: UsuarioActual,
) -> list[ConversacionOut]:
    conversaciones = chat_service.listar_conversaciones(db, usuario.id)
    return [ConversacionOut.model_validate(c) for c in conversaciones]


@router.get(
    "/conversaciones/{conversacion_id}",
    response_model=ConversacionDetalleOut,
    summary="Una conversación con sus mensajes",
)
def get_conversacion(
    conversacion_id: int,
    db: Annotated[Session, Depends(get_db)],
    usuario: UsuarioActual,
) -> ConversacionDetalleOut:
    conversacion = chat_service.get_conversacion(db, conversacion_id, usuario.id)
    if conversacion is None:
        # Mismo 404 si no existe o si es de otro usuario: no filtramos la
        # existencia de conversaciones ajenas.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversación no encontrada.",
        )
    return ConversacionDetalleOut.model_validate(conversacion)


@router.patch(
    "/conversaciones/{conversacion_id}",
    response_model=ConversacionOut,
    summary="Renombrar una conversación",
)
def renombrar_conversacion(
    conversacion_id: int,
    payload: ConversacionUpdate,
    db: Annotated[Session, Depends(get_db)],
    usuario: UsuarioActual,
) -> ConversacionOut:
    conversacion = chat_service.renombrar_conversacion(
        db, conversacion_id, usuario.id, payload.titulo
    )
    if conversacion is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversación no encontrada.",
        )
    db.commit()
    return ConversacionOut.model_validate(conversacion)


@router.delete(
    "/conversaciones/{conversacion_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Eliminar una conversación",
)
def eliminar_conversacion(
    conversacion_id: int,
    db: Annotated[Session, Depends(get_db)],
    usuario: UsuarioActual,
) -> None:
    ok = chat_service.eliminar_conversacion(db, conversacion_id, usuario.id)
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversación no encontrada.",
        )
    db.commit()
