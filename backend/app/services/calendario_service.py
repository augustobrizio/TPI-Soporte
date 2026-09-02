"""Service del calendario academico."""
from __future__ import annotations

import secrets
from datetime import date, datetime, time

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import ics
from app.db.models.calendario import EventoCalendario
from app.db.models.usuario import Usuario
from app.repositories import calendario_repo
from app.schemas.calendario import ResultadoSincCalendario
from app.scrapers import calendario as calendario_scraper


FUENTES_V1: tuple[calendario_scraper.FuenteCalendario, ...] = (
    calendario_scraper.FuenteCalendario(
        url=calendario_scraper.URL_CALENDARIO_ISI,
        carrera="ISI",
        tipo_preferido=None,
    ),
    calendario_scraper.FuenteCalendario(
        url=calendario_scraper.URL_MESAS_ISI,
        carrera="ISI",
        tipo_preferido="mesa",
    ),
)


def listar_eventos(
    db: Session,
    *,
    desde: date | None = None,
    hasta: date | None = None,
    tipo: str | None = None,
    carrera: str | None = None,
    usuario_id: int | None = None,
):
    """Lista eventos con filtros simples para la API (compartidos + del usuario)."""
    desde_dt = datetime.combine(desde, time.min) if desde else None
    hasta_dt = datetime.combine(hasta, time.max) if hasta else None
    return calendario_repo.listar_eventos(
        db,
        desde=desde_dt,
        hasta=hasta_dt,
        tipo=tipo,
        carrera=carrera,
        usuario_id=usuario_id,
    )


def proximos_eventos(
    db: Session,
    *,
    limite: int = 5,
    carrera: str | None = "ISI",
    usuario_id: int | None = None,
):
    """Eventos desde ahora en adelante, ordenados por cercania."""
    return calendario_repo.listar_eventos(
        db,
        desde=datetime.now(),
        carrera=carrera,
        usuario_id=usuario_id,
        limite=limite,
    )


def eventos_hoy(
    db: Session, *, carrera: str | None = "ISI", usuario_id: int | None = None
):
    """Eventos del dia actual."""
    return calendario_repo.listar_eventos_del_dia(
        db,
        dia=date.today(),
        carrera=carrera,
        usuario_id=usuario_id,
    )


def get_evento(db: Session, evento_id: int):
    """Obtiene un evento por ID."""
    return calendario_repo.get_evento(db, evento_id)


# ---------------------------------------------------------------------------
# Eventos creados por el alumno (CRUD)
# ---------------------------------------------------------------------------


def crear_evento_usuario(
    db: Session,
    *,
    usuario_id: int,
    titulo: str,
    descripcion: str | None,
    fecha_inicio: datetime,
    fecha_fin: datetime | None,
    tipo: str,
):
    """Crea un evento propio del alumno, con su dueño."""
    return calendario_repo.crear_evento_usuario(
        db,
        usuario_id=usuario_id,
        titulo=titulo,
        descripcion=descripcion,
        fecha_inicio=fecha_inicio,
        fecha_fin=fecha_fin,
        tipo=tipo,
    )


def actualizar_evento_usuario(
    db: Session, evento_id: int, cambios: dict, *, usuario_id: int
):
    """Actualiza un evento del alumno. ValueError si no existe o no es suyo."""
    evento = calendario_repo.get_evento(db, evento_id)
    if evento is None:
        raise ValueError("no_encontrado")
    # Sólo el dueño puede editar su evento personal (nunca los compartidos ni
    # los de otro usuario).
    if evento.origen != "usuario" or evento.usuario_id != usuario_id:
        raise ValueError("no_editable")
    for campo, valor in cambios.items():
        if valor is not None:
            setattr(evento, campo, valor)
    db.flush()
    return evento


def eliminar_evento_usuario(db: Session, evento_id: int, *, usuario_id: int) -> bool:
    """Elimina un evento del alumno. False si no existe o no es suyo."""
    evento = calendario_repo.get_evento(db, evento_id)
    if evento is None or evento.origen != "usuario" or evento.usuario_id != usuario_id:
        return False
    calendario_repo.eliminar_evento(db, evento)
    return True


def sincronizar_calendario(db: Session) -> ResultadoSincCalendario:
    """Ingesta idempotente de las fuentes FRRO configuradas para v1."""
    resultado = ResultadoSincCalendario()

    for fuente in FUENTES_V1:
        resultado.fuentes_procesadas += 1
        try:
            html = calendario_scraper.fetch_text(fuente.url)
            eventos = calendario_scraper.parsear_fuente_html(
                html,
                fuente_url=fuente.url,
                carrera=fuente.carrera,
            )

            links = calendario_scraper.extraer_links_fuente(html, fuente.url)
            for link in links:
                try:
                    pdf_url = calendario_scraper.url_drive_a_descarga(link)
                    contenido = calendario_scraper.fetch_bytes(pdf_url)
                    eventos.extend(
                        calendario_scraper.parsear_pdf(
                            contenido,
                            fuente_url=link,
                            carrera=fuente.carrera,
                            tipo_preferido=fuente.tipo_preferido,
                        )
                    )
                except httpx.HTTPError as e:
                    resultado.advertencias.append(
                        f"No se pudo descargar fuente secundaria {link}: {e}"
                    )
                except Exception as e:  # noqa: BLE001
                    resultado.advertencias.append(
                        f"No se pudo parsear fuente secundaria {link}: {e}"
                    )

            if not eventos:
                resultado.advertencias.append(
                    f"No se detectaron eventos en la fuente {fuente.url}"
                )

            for evento in eventos:
                _fila, estado = calendario_repo.upsert_evento(
                    db,
                    titulo=evento.titulo,
                    descripcion=evento.descripcion,
                    fecha_inicio=evento.fecha_inicio,
                    fecha_fin=evento.fecha_fin,
                    tipo=evento.tipo,
                    carrera=evento.carrera,
                    fuente_url=evento.fuente_url,
                    content_hash=evento.content_hash,
                )
                resultado.eventos_detectados += 1
                if estado == "creado":
                    resultado.eventos_creados += 1
                elif estado == "actualizado":
                    resultado.eventos_actualizados += 1
                else:
                    resultado.eventos_sin_cambios += 1
        except httpx.HTTPError as e:
            resultado.errores.append(f"No se pudo obtener {fuente.url}: {e}")
        except Exception as e:  # noqa: BLE001
            resultado.errores.append(f"Error procesando {fuente.url}: {e}")

    return resultado


# ---------------------------------------------------------------------------
# Exportacion a iCalendar (.ics)
# ---------------------------------------------------------------------------
#
# Cubre "exportar el calendario a Google" sin pedirle credenciales a nadie: un
# .ics lo comen Google Calendar, Apple Calendar y Outlook por igual. La otra
# mitad —traer los eventos propios del alumno *desde* Google— si necesita OAuth
# con scope de Calendar y es otro trabajo (T11.4).

PRODID_UTNHUB = "-//UTNHub//Calendario academico FRRO//ES"

#: Prefijo por tipo. Google Calendar no muestra las CATEGORIES en ningun lado
#: visible, asi que el unico lugar donde el alumno ve de que tipo es cada
#: evento es el titulo.
_PREFIJO_TIPO: dict[str, str] = {
    "mesa": "Mesa",
    "examen": "Examen",
    "trabajo_practico": "TP",
    "feriado": "Feriado",
    "evento": "Evento",
}


def _es_dia_completo(evento: EventoCalendario) -> bool:
    """¿El evento es una fecha o un horario?

    El calendario academico de la FRRO publica *fechas*: "mesa de Analisis
    Matematico I, 15 de julio", sin hora. El scraper las guarda a medianoche,
    asi que la unica forma de distinguirlas de un evento real de las 00:00 es
    mirar la hora — y un TP a medianoche no existe, mientras que un feriado
    metido como cita de medianoche le aparece al alumno como un turno a la
    hora de dormir.

    Los eventos personales que el alumno crea con hora (un TP a las 18:30) si
    salen como evento con horario.
    """
    if evento.fecha_inicio.time() != time.min:
        return False
    return evento.fecha_fin is None or evento.fecha_fin.time() == time.min


def _titulo_para_calendario(evento: EventoCalendario) -> str:
    """"Mesa · Analisis Matematico I".

    En Google el evento se ve suelto entre los del alumno, sin el contexto de
    la pantalla de UTNHub: sin el prefijo, "Analisis Matematico I" no dice si
    es una mesa, un final o una clase.
    """
    prefijo = _PREFIJO_TIPO.get(evento.tipo)
    if not prefijo or evento.titulo.lower().startswith(prefijo.lower()):
        return evento.titulo
    return f"{prefijo} · {evento.titulo}"


def _descripcion_para_calendario(evento: EventoCalendario) -> str:
    partes = [evento.descripcion or ""]
    if evento.fuente_url:
        partes.append(f"Fuente: {evento.fuente_url}")
    partes.append("Vía UTNHub")
    return "\n".join(p for p in partes if p)


def _escribir_evento(cal: ics.Calendario, evento: EventoCalendario) -> None:
    cal.abrir_evento()

    # UID estable: es lo que le permite al cliente reconocer que un evento
    # editado es el MISMO y no uno nuevo. `content_hash` ya es unico por fila
    # (constraint en la tabla) y los personales llevan un uuid.
    cal.crudo("UID", f"{evento.content_hash}@utnhub")

    # DTSTAMP sale de updated_at y no de now(): asi el .ics de un calendario
    # que no cambio es byte a byte identico entre dos descargas, que es lo que
    # hace testeable la salida y lo que le permite a un cliente detectar que
    # no hay nada nuevo.
    marca = evento.updated_at or evento.created_at or evento.fecha_inicio
    cal.crudo("DTSTAMP", ics.instante_utc(marca))

    if _es_dia_completo(evento):
        inicio = evento.fecha_inicio.date()
        # DTEND es exclusivo: si no hay fecha_fin, el evento dura ese solo dia.
        fin = evento.fecha_fin.date() if evento.fecha_fin else inicio
        cal.parametro("DTSTART", "VALUE=DATE", ics.dia(inicio))
        cal.parametro("DTEND", "VALUE=DATE", ics.dia_siguiente(fin))
    else:
        cal.crudo("DTSTART", ics.instante_utc(evento.fecha_inicio))
        if evento.fecha_fin:
            cal.crudo("DTEND", ics.instante_utc(evento.fecha_fin))

    cal.texto("SUMMARY", _titulo_para_calendario(evento))
    cal.texto("DESCRIPTION", _descripcion_para_calendario(evento))
    cal.texto("CATEGORIES", evento.tipo.replace("_", " ").upper())
    if evento.fuente_url:
        cal.crudo("URL", evento.fuente_url)
    # TRANSPARENT = no marca al alumno como ocupado. Un feriado o una mesa a la
    # que no se anoto no deberian bloquearle la agenda a nadie.
    cal.crudo("TRANSP", "TRANSPARENT" if evento.usuario_id is None else "OPAQUE")

    cal.cerrar_evento()


def generar_ics(
    db: Session,
    *,
    usuario_id: int | None = None,
    carrera: str | None = None,
) -> str:
    """Arma el ``.ics`` con los eventos que ese usuario puede ver.

    Reusa ``calendario_repo.listar_eventos``, que ya resuelve el aislamiento:
    los institucionales (``usuario_id`` NULL) los ve cualquiera, los personales
    sólo su dueño. Sin ``usuario_id`` sale el calendario público, que es
    exactamente lo que queremos para una URL de suscripción anónima.
    """
    eventos = calendario_repo.listar_eventos(
        db, usuario_id=usuario_id, carrera=carrera
    )

    nombre = "UTN FRRO — Calendario académico"
    if usuario_id is not None:
        nombre = "UTN FRRO — Mi calendario"

    cal = ics.Calendario(
        nombre=nombre,
        descripcion=(
            "Mesas, finales, feriados y eventos de la UTN FRRO. "
            "Generado por UTNHub."
        ),
        prodid=PRODID_UTNHUB,
    )
    for evento in eventos:
        _escribir_evento(cal, evento)
    return cal.cerrar()


# ---------------------------------------------------------------------------
# URL de suscripcion (T11.2)
# ---------------------------------------------------------------------------
#
# La diferencia con `export.ics` es lo que la hace valer la pena: descargar el
# .ics es una foto, suscribirse es una conexion. Google relee la URL cada
# varias horas por su cuenta, asi que cuando la facultad mueve una mesa el
# alumno la ve movida sin volver a importar nada.
#
# El precio es que la URL **es** la credencial: Google no manda headers al
# refrescar. Quien tenga el link ve el calendario de esa persona. Por eso el
# token es largo, opaco y revocable, y por eso vive en su propia columna en vez
# de derivarse del id del usuario.

#: 32 bytes de urandom -> 43 caracteres url-safe. Con ese espacio, adivinar un
#: token a fuerza bruta no es un ataque que exista.
_BYTES_DE_TOKEN = 32


def _nuevo_token() -> str:
    return secrets.token_urlsafe(_BYTES_DE_TOKEN)


def token_de_suscripcion(db: Session, usuario: Usuario) -> str:
    """Devuelve el token del alumno, creandolo la primera vez.

    No se genera al registrarse a proposito: una credencial que nadie pidio es
    una credencial de mas que igual habria que rotar si se filtra.
    """
    if not usuario.calendario_token:
        usuario.calendario_token = _nuevo_token()
        db.flush()
    return usuario.calendario_token


def regenerar_token_de_suscripcion(db: Session, usuario: Usuario) -> str:
    """Rota el token: la URL vieja deja de servir en el acto.

    Es el boton de "compartí el link sin querer". Las suscripciones que ya
    existan en Google contra la URL anterior van a empezar a recibir 404, que
    es exactamente lo que se busca.
    """
    usuario.calendario_token = _nuevo_token()
    db.flush()
    return usuario.calendario_token


def usuario_por_token(db: Session, token: str) -> Usuario | None:
    """Resuelve el dueño de una URL de suscripcion.

    Compara contra la columna unique. Un token vacio nunca matchea aunque haya
    filas con NULL: la query es por igualdad y NULL no es igual a nada, pero
    igual se corta antes para no salir a la DB por un string vacio.
    """
    if not token:
        return None
    return db.execute(
        select(Usuario).where(Usuario.calendario_token == token)
    ).scalar_one_or_none()
