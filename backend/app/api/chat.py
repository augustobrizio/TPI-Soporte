"""Endpoints REST del chat del asistente (agente + RAG)."""
from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator, Iterator
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.deps import UsuarioActual, requerir_admin
from app.db.models.usuario import Usuario
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

# Cada cuántos segundos de silencio mandamos un heartbeat SSE.
_HEARTBEAT_SEGUNDOS = 10.0


async def _con_heartbeat(
    sync_gen: Iterator[str], intervalo: float = _HEARTBEAT_SEGUNDOS
) -> AsyncIterator[str]:
    """Intercala heartbeats en un generador SSE síncrono para que un proxy no
    corte la conexión por inactividad.

    El generador del servicio bloquea durante las llamadas al modelo (segundos
    sin emitir nada). En producción, detrás del proxy de Railway, ese silencio
    hacía que se cortara el stream a mitad. Acá lo corremos en un thread y, si
    pasan ``intervalo`` segundos sin un evento, mandamos un comentario SSE
    (``: ping``) —que el cliente ignora— para mantener viva la conexión.
    """
    loop = asyncio.get_running_loop()
    cola: asyncio.Queue[str | object] = asyncio.Queue()
    fin = object()

    def producir() -> None:
        try:
            for item in sync_gen:
                loop.call_soon_threadsafe(cola.put_nowait, item)
        finally:
            loop.call_soon_threadsafe(cola.put_nowait, fin)

    loop.run_in_executor(None, producir)

    while True:
        try:
            item = await asyncio.wait_for(cola.get(), timeout=intervalo)
        except asyncio.TimeoutError:
            yield ": ping\n\n"
            continue
        if item is fin:
            break
        yield item  # type: ignore[misc]


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
async def preguntar_stream(
    payload: ChatIn,
    db: Annotated[Session, Depends(get_db)],
    usuario: UsuarioActual,
) -> StreamingResponse:
    """Igual que ``POST /chat`` pero devuelve la respuesta como eventos SSE.

    El generador del servicio va emitiendo pasos del agente y tokens a medida
    que se producen, y persiste el turno al final (hace el commit él mismo). Se
    envuelve con ``_con_heartbeat`` para que un proxy no corte la conexión
    mientras el agente piensa.
    """
    stream = chat_service.responder_stream(
        db,
        payload.pregunta,
        usuario_id=usuario.id,
        conversacion_id=payload.conversacion_id,
        regenerar=payload.regenerar,
    )
    return StreamingResponse(
        _con_heartbeat(stream),
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
    "/admin/huecos",
    summary="Reporte de huecos del chatbot (sólo admin)",
)
def reporte_huecos(
    db: Annotated[Session, Depends(get_db)],
    _admin: Annotated[Usuario, Depends(requerir_admin)],
    dias: int = 7,
) -> dict:
    """Preguntas que el chatbot no pudo responder con datos (sin tool o con 👎).

    Cross-usuario: por eso está restringido a cuentas admin.
    """
    return chat_service.reporte_huecos(db, dias=dias)


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
