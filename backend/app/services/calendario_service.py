"""Service del calendario academico."""
from __future__ import annotations

from datetime import date, datetime, time

import httpx
from sqlalchemy.orm import Session

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
