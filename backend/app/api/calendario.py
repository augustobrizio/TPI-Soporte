"""Endpoints REST del calendario academico."""
from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy.orm import Session

from app.api.deps import UsuarioActual, UsuarioOpcional, requerir_admin
from app.config import get_settings
from app.db.session import get_db
from app.schemas.calendario import (
    EventoCalendarioCreate,
    EventoCalendarioOut,
    EventoCalendarioUpdate,
    ResultadoSincCalendario,
    SuscripcionCalendarioOut,
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


# OJO con el orden: esta ruta va **antes** de `/{evento_id}`. FastAPI matchea
# en orden de declaracion, asi que declarada despues, `/calendario/export.ics`
# entraria por el path param, fallaria al castear "export.ics" a int y
# devolveria 422 en vez del archivo.
@router.get(
    "/export.ics",
    summary="Descarga el calendario en formato iCalendar (.ics)",
    response_class=Response,
    responses={200: {"content": {"text/calendar": {}}}},
)
def exportar_ics(
    db: Annotated[Session, Depends(get_db)],
    usuario: UsuarioOpcional,
    carrera: Annotated[str | None, Query(description="Filtra por carrera")] = None,
) -> Response:
    """El calendario académico como ``.ics``, para Google/Apple/Outlook.

    Sesión **opcional**, igual que el resto del calendario: sin token salen los
    eventos institucionales (mesas, finales, feriados) y con token salen además
    los personales del alumno.

    Esto es una **descarga puntual**: una foto del calendario al momento de
    pedirlo. Para que Google lo relea solo y los cambios se propaguen sin
    reimportar hace falta la URL de suscripción por usuario (T11.2) — Google no
    manda headers de autenticación al refrescar, así que la suscripción no
    puede ir con el JWT.
    """
    contenido = calendario_service.generar_ics(
        db,
        usuario_id=usuario.id if usuario else None,
        carrera=carrera,
    )
    return Response(
        content=contenido,
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="utnhub.ics"'},
    )


def _url_suscripcion(token: str, request: Request) -> str:
    """URL absoluta de la suscripción, que tiene que resolver desde afuera.

    `PUBLIC_API_URL` manda si está seteada; si no, se deduce del request. El
    fallback alcanza en desarrollo, pero detrás de un proxy el request trae el
    host interno y la URL que se le copia al alumno no resolvería desde los
    servidores de Google — por eso en producción el env var no es opcional.
    """
    base = (get_settings().public_api_url or str(request.base_url)).rstrip("/")
    return f"{base}/calendario/suscripcion/{token}.ics"


@router.get(
    "/suscripcion",
    response_model=SuscripcionCalendarioOut,
    summary="URL de suscripción al calendario del alumno",
)
def get_suscripcion(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    usuario: UsuarioActual,
) -> SuscripcionCalendarioOut:
    """Devuelve la URL para pegar en Google/Apple/Outlook, creándola si no existe.

    A diferencia de descargar el `.ics`, suscribirse es una conexión: el
    cliente relee la URL cada varias horas, así que cuando la facultad mueve
    una mesa el alumno la ve movida sin reimportar nada.
    """
    token = calendario_service.token_de_suscripcion(db, usuario)
    db.commit()
    return SuscripcionCalendarioOut(url=_url_suscripcion(token, request))


@router.post(
    "/suscripcion/regenerar",
    response_model=SuscripcionCalendarioOut,
    summary="Rota el token: la URL anterior deja de funcionar",
)
def regenerar_suscripcion(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    usuario: UsuarioActual,
) -> SuscripcionCalendarioOut:
    """Para cuando el link se compartió sin querer.

    Las suscripciones que ya existan contra la URL vieja empiezan a recibir
    404, que es justamente lo que se busca.
    """
    token = calendario_service.regenerar_token_de_suscripcion(db, usuario)
    db.commit()
    return SuscripcionCalendarioOut(url=_url_suscripcion(token, request))


@router.get(
    "/suscripcion/{token}.ics",
    summary="El .ics de un alumno, autenticado por el token de la URL",
    response_class=Response,
    responses={200: {"content": {"text/calendar": {}}}, 404: {}},
)
def suscripcion_ics(
    token: str,
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    """El calendario personal del alumno, sin sesión: **el token es la credencial**.

    Google Calendar refresca las suscripciones por su cuenta, sin headers y
    sin cookies, así que la URL tiene que autenticar sola. Quien tenga el link
    ve este calendario: por eso el token es de 32 bytes de urandom y se puede
    rotar desde `/calendario/suscripcion/regenerar`.

    404 —y no 401— si el token no existe: un token revocado no tiene que poder
    distinguirse de uno que nunca existió.
    """
    usuario = calendario_service.usuario_por_token(db, token)
    if usuario is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Suscripción no encontrada."
        )

    contenido = calendario_service.generar_ics(db, usuario_id=usuario.id)
    return Response(
        content=contenido,
        media_type="text/calendar; charset=utf-8",
        headers={
            # Que no se cachee: si un proxy guarda la respuesta, el alumno
            # deja de ver los cambios que es justo lo que vino a buscar.
            "Cache-Control": "no-cache, must-revalidate",
        },
    )


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
    dependencies=[Depends(requerir_admin)],
)
def sincronizar_calendario(
    db: Annotated[Session, Depends(get_db)],
) -> ResultadoSincCalendario:
    """Scrapea FRRO y persiste eventos de forma idempotente.

    Restringido a rol admin (RNF-06): escribe los eventos institucionales
    —los que ve *todo* el mundo, con ``usuario_id`` NULL—, no los personales
    de quien llama. La idempotencia evita duplicados, no evita que un tercero
    dispare scrapeos en loop contra FRRO.
    """
    resultado = calendario_service.sincronizar_calendario(db)
    if resultado.errores and resultado.eventos_detectados == 0:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=resultado.model_dump(),
        )
    db.commit()
    return resultado
