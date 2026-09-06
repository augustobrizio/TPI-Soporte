"""Repository de novedades: centros, fuentes e ingesta_log."""
from __future__ import annotations

from collections.abc import Iterable, Sequence
from datetime import datetime

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session, joinedload, selectinload

from app.db.models.novedad import Centro, IngestaLog, Novedad, NovedadFuente


def get_or_create_centro(
    db: Session,
    *,
    handle: str,
    nombre: str,
    tipo: str,
    url_perfil: str | None = None,
    logo_url: str | None = None,
) -> Centro:
    centro = db.execute(
        select(Centro).where(Centro.handle == handle)
    ).scalar_one_or_none()
    if centro is not None:
        return centro
    centro = Centro(
        handle=handle,
        nombre=nombre,
        tipo=tipo,
        url_perfil=url_perfil,
        logo_url=logo_url,
    )
    db.add(centro)
    db.flush()
    return centro


def external_ids_existentes(
    db: Session, external_ids: Iterable[str]
) -> set[str]:
    """De los ``external_ids`` dados, cuáles ya están registrados (dedup exacto)."""
    ids = [eid for eid in external_ids if eid]
    if not ids:
        return set()
    stmt = select(NovedadFuente.external_id).where(
        NovedadFuente.external_id.in_(ids)
    )
    return {row[0] for row in db.execute(stmt).all()}


def crear_novedad(
    db: Session,
    *,
    centro: Centro,
    external_id: str,
    fuente_url: str | None,
    fuente_imagen_url: str | None,
    fuente_imagen_path: str | None,
    titulo: str | None,
    descripcion: str | None,
    contenido: str | None = None,
    categoria: str | None,
    imagen_url: str | None,
    imagen_path: str | None,
    estado: str,
    confianza: float | None,
    motivo_descarte: str | None,
    fecha_publicacion: datetime | None,
) -> Novedad:
    """Crea una novedad canónica + su primera fuente. Hace flush (no commit)."""
    novedad = Novedad(
        titulo=titulo,
        descripcion=descripcion,
        contenido=contenido,
        categoria=categoria,
        imagen_url=imagen_url,
        imagen_path=imagen_path,
        estado=estado,
        # Se congela lo que decidio el clasificador: la moderacion manual pisa
        # 'estado' pero no esto, asi queda el registro del error del LLM.
        estado_llm=estado,
        confianza=confianza,
        motivo_descarte=motivo_descarte,
        fecha_publicacion=fecha_publicacion,
    )
    db.add(novedad)
    db.flush()
    agregar_fuente(
        db,
        novedad=novedad,
        centro=centro,
        external_id=external_id,
        url=fuente_url,
        imagen_url=fuente_imagen_url,
        imagen_path=fuente_imagen_path,
        fecha_publicacion=fecha_publicacion,
    )
    return novedad


def agregar_fuente(
    db: Session,
    *,
    novedad: Novedad,
    centro: Centro,
    external_id: str,
    url: str | None,
    imagen_url: str | None,
    imagen_path: str | None,
    fecha_publicacion: datetime | None,
) -> NovedadFuente:
    """Suma una fuente a una novedad existente (dedup Fase 2). Hace flush."""
    fuente = NovedadFuente(
        novedad_id=novedad.id,
        centro_id=centro.id,
        external_id=external_id,
        url=url,
        imagen_url=imagen_url,
        imagen_path=imagen_path,
        fecha_publicacion=fecha_publicacion,
    )
    db.add(fuente)
    db.flush()
    return fuente


def listar(
    db: Session,
    *,
    categoria: str | None = None,
    estado: str | None = "publicada",
    centro: str | None = None,
    limite: int = 20,
    offset: int = 0,
) -> Sequence[Novedad]:
    """Novedades (con fuentes y centros) ordenadas por fecha del evento/posteo desc.

    Usa ``fecha_publicacion`` (fecha real del contenido) y no ``created_at``
    (fecha de ingesta): sin esto, contenido viejo recién ingestado (ej. un
    backfill de posts de IG de 2023) se mezclaba con lo genuinamente nuevo.
    Cae a ``created_at`` cuando la fuente no expone fecha (ej. notas web).
    """
    orden = func.coalesce(Novedad.fecha_publicacion, Novedad.created_at)
    stmt = select(Novedad)
    if categoria is not None:
        stmt = stmt.where(Novedad.categoria == categoria)
    if estado is not None:
        stmt = stmt.where(Novedad.estado == estado)
    if centro is not None:
        stmt = stmt.where(
            Novedad.id.in_(
                select(NovedadFuente.novedad_id)
                .join(Centro, Centro.id == NovedadFuente.centro_id)
                .where(Centro.handle == centro)
            )
        )
    stmt = (
        stmt.options(selectinload(Novedad.fuentes).joinedload(NovedadFuente.centro))
        .order_by(orden.desc().nullslast(), Novedad.id.desc())
        .limit(limite)
        .offset(offset)
    )
    return db.execute(stmt).scalars().all()


def listar_centros(db: Session) -> Sequence[Centro]:
    """Centros con al menos una novedad publicada (insumo del filtro por fuente)."""
    stmt = (
        select(Centro)
        .join(NovedadFuente, NovedadFuente.centro_id == Centro.id)
        .join(Novedad, Novedad.id == NovedadFuente.novedad_id)
        .where(Novedad.estado == "publicada")
        .distinct()
        .order_by(Centro.nombre)
    )
    return db.execute(stmt).scalars().all()


def recientes_para_dedup(db: Session, *, limite: int = 30) -> Sequence[Novedad]:
    """Últimas novedades no descartadas, como contexto de dedup semántico."""
    stmt = (
        select(Novedad)
        .where(Novedad.estado != "descartada")
        .order_by(Novedad.created_at.desc().nullslast(), Novedad.id.desc())
        .limit(limite)
    )
    return db.execute(stmt).scalars().all()


def get(db: Session, novedad_id: int) -> Novedad | None:
    stmt = (
        select(Novedad)
        .where(Novedad.id == novedad_id)
        .options(selectinload(Novedad.fuentes).joinedload(NovedadFuente.centro))
    )
    return db.execute(stmt).scalar_one_or_none()


def actualizar_estado(
    db: Session, novedad_id: int, estado: str, *, manual: bool = False
) -> Novedad | None:
    novedad = db.get(Novedad, novedad_id)
    if novedad is None:
        return None
    novedad.estado = estado
    if manual:
        novedad.moderado_manual = True
    db.flush()
    return novedad


def crear_ingesta_log(
    db: Session,
    *,
    fuente: str,
    iniciado_en: datetime,
    finalizado_en: datetime,
    items_vistos: int,
    items_nuevos: int,
    items_novedad: int,
    items_descartados: int,
    tokens_usados: int | None,
    estado: str,
    errores: list[str] | None,
) -> IngestaLog:
    log = IngestaLog(
        fuente=fuente,
        iniciado_en=iniciado_en,
        finalizado_en=finalizado_en,
        items_vistos=items_vistos,
        items_nuevos=items_nuevos,
        items_novedad=items_novedad,
        items_descartados=items_descartados,
        tokens_usados=tokens_usados,
        estado=estado,
        errores="\n".join(errores) if errores else None,
    )
    db.add(log)
    db.flush()
    return log


def listar_recientes(db: Session, *, limite: int = 300) -> Sequence[Novedad]:
    """Novedades publicadas más recientes, sin eager-loads.

    La usan el buscador global y el panel de notificaciones: los dos necesitan
    título, descripción y fecha, y ninguno pinta las fuentes ni los centros —
    que es lo que precarga ``listar`` y lo que la vuelve cara.

    Ventana acotada a propósito. El buscador filtra en Python (hace falta para
    ignorar acentos, ver ``busqueda_service``), así que la cantidad de filas
    que se traen es el costo real de cada búsqueda. Si algún día hay miles de
    novedades esto tiene que pasar a full-text search de Postgres; con las
    decenas que maneja hoy la ingesta, escanear las últimas 300 es más barato
    que mantener un índice.
    """
    orden = func.coalesce(Novedad.fecha_publicacion, Novedad.created_at)
    stmt = (
        select(Novedad)
        .where(Novedad.estado == "publicada")
        .order_by(orden.desc().nullslast(), Novedad.id.desc())
        .limit(limite)
    )
    return db.execute(stmt).scalars().all()


# ---------------------------------------------------------------------------
# Orden de "Últimas novedades" en la portada
# ---------------------------------------------------------------------------

#: Cuántas entran en la portada. Una nueva desplaza a la última.
TOPE_PORTADA = 3


def listar_portada(db: Session, *, limite: int = TOPE_PORTADA) -> Sequence[Novedad]:
    """Las novedades de la portada, en el orden que fijó el admin.

    Si todavía no hay ninguna ordenada —base recién migrada, o el admin las
    sacó a todas— cae a las más recientes publicadas, que es lo que la portada
    mostraba antes de que el orden fuera editable.
    """
    stmt = (
        select(Novedad)
        .where(Novedad.orden_portada.is_not(None), Novedad.estado == "publicada")
        .options(selectinload(Novedad.fuentes).joinedload(NovedadFuente.centro))
        .order_by(Novedad.orden_portada.asc())
        .limit(limite)
    )
    fijadas = db.execute(stmt).scalars().all()
    if fijadas:
        return fijadas
    return listar(db, limite=limite)


def fijar_orden_portada(db: Session, ids: list[int]) -> list[Novedad]:
    """Deja en la portada exactamente esas novedades, en ese orden.

    Las que estaban y no vienen en la lista salen (``orden_portada`` a NULL).
    """
    db.execute(
        update(Novedad)
        .where(Novedad.orden_portada.is_not(None))
        .values(orden_portada=None)
    )
    for posicion, novedad_id in enumerate(ids):
        db.execute(
            update(Novedad)
            .where(Novedad.id == novedad_id)
            .values(orden_portada=posicion)
        )
    db.flush()
    return list(listar_portada(db))


def promover_a_portada(db: Session, novedad_id: int, *, tope: int = TOPE_PORTADA) -> None:
    """Mete una novedad al frente de la portada y corre al resto.

    La que se pasa del tope sale sola: es la regla de "una novedad nueva
    desplaza a la última de las tres".
    """
    # +1 a todas las que están en portada, y la nueva al frente.
    db.execute(
        update(Novedad)
        .where(Novedad.orden_portada.is_not(None), Novedad.id != novedad_id)
        .values(orden_portada=Novedad.orden_portada + 1)
    )
    db.execute(
        update(Novedad).where(Novedad.id == novedad_id).values(orden_portada=0)
    )
    # Las que quedaron fuera del tope dejan la portada.
    db.execute(
        update(Novedad)
        .where(Novedad.orden_portada >= tope)
        .values(orden_portada=None)
    )
    db.flush()


def sacar_de_portada(db: Session, novedad_id: int) -> None:
    """La saca de la portada y cierra el hueco que deja."""
    novedad = db.get(Novedad, novedad_id)
    if novedad is None or novedad.orden_portada is None:
        return
    posicion = novedad.orden_portada
    novedad.orden_portada = None
    db.execute(
        update(Novedad)
        .where(Novedad.orden_portada.is_not(None), Novedad.orden_portada > posicion)
        .values(orden_portada=Novedad.orden_portada - 1)
    )
    db.flush()
