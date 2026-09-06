"""Service de novedades: pipeline de ingesta + lectura/moderación."""
from __future__ import annotations

import logging
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from pathlib import Path

from sqlalchemy.orm import Session

from app.ai import clasificador_novedades, placeholders
from app.config import get_settings
from app.core import storage
from app.db.models.novedad import EstadoIngesta, EstadoNovedad
from app.db.models.novedad import FuenteNovedad as FuenteNovedadEnum
from app.repositories import novedad_repo
from app.schemas.novedad import ResultadoFuente, ResultadoIngesta
from app.scrapers.novedades.base import FuenteNovedad, NovedadCruda

logger = logging.getLogger(__name__)

# Centros con nombre + logo. Los que no estén acá se crean con defaults del handle.
CENTROS_CONOCIDOS: dict[str, dict] = {
    "frro_web": {
        "nombre": "UTN FRRO",
        "tipo": "utn_web",
        "url_perfil": "https://www.frro.utn.edu.ar/",
        "logo_url": "/utn-isotipo-white.png",
    },
    "utnalumnosfrro": {
        "nombre": "UTN Alumnos FRRO",
        "tipo": "instagram",
        "url_perfil": "https://www.instagram.com/utnalumnosfrro/",
        "logo_url": "/novedades/fuentes/utnalumnosfrro.jpg",
    },
    "puebloyreforma": {
        "nombre": "Pueblo y Reforma",
        "tipo": "instagram",
        "url_perfil": "https://www.instagram.com/puebloyreforma/",
        "logo_url": "/novedades/fuentes/puebloyreforma.jpg",
    },
    "gradienteutn": {
        "nombre": "Gradiente UTN",
        "tipo": "instagram",
        "url_perfil": "https://www.instagram.com/gradienteutn/",
        "logo_url": "/novedades/fuentes/gradienteutn.jpg",
    },
    "sauutnrosario": {
        "nombre": "SAU UTN Rosario",
        "tipo": "instagram",
        "url_perfil": "https://www.instagram.com/sauutnrosario/",
        "logo_url": "/novedades/fuentes/sauutnrosario.jpg",
    },
    "utnros.sistemas": {
        "nombre": "Ing. en Sistemas FRRO",
        "tipo": "instagram",
        "url_perfil": "https://www.instagram.com/utnros.sistemas/",
        "logo_url": "/novedades/fuentes/utnros.sistemas.jpg",
    },
}


def construir_fuentes() -> list[FuenteNovedad]:
    """Fuentes habilitadas según config (import local: deps pesadas aparte)."""
    settings = get_settings()
    fuentes: list[FuenteNovedad] = []

    # Instagram ya no pide credenciales: alcanza con los handles a mirar.
    if settings.instagram_handles_list:
        from app.scrapers.novedades.instagram import InstagramFuente

        fuentes.append(InstagramFuente())

    if settings.utn_novedades_url:
        from app.scrapers.novedades.utn_web import UtnWebFuente

        fuentes.append(UtnWebFuente())

    return fuentes


def run_ingesta_novedades(
    db: Session, fuentes: Sequence[FuenteNovedad] | None = None
) -> ResultadoIngesta:
    """Callable host-agnóstico del pipeline (lo invoca el scheduler o el endpoint).

    Commit por fuente: si una falla, lo persistido por las otras se conserva.
    """
    if fuentes is None:
        fuentes = construir_fuentes()

    resultado = ResultadoIngesta()
    for fuente in fuentes:
        resultado.fuentes.append(_procesar_fuente(db, fuente))
    return resultado


def _partir_por_antiguedad(
    crudos: list[NovedadCruda], max_dias: int
) -> tuple[list[NovedadCruda], list[NovedadCruda]]:
    """Separa ``(vigentes, viejos)`` por ``fecha_publicacion``.

    Los items SIN fecha pasan siempre: preferimos gastar una clasificación
    antes que esconder algo por no saber cuándo se publicó (le pasa a varias
    notas de ``utn_web``). ``max_dias <= 0`` desactiva el corte.
    """
    if max_dias <= 0:
        return crudos, []
    corte = datetime.now(UTC) - timedelta(days=max_dias)
    vigentes: list[NovedadCruda] = []
    viejos: list[NovedadCruda] = []
    for crudo in crudos:
        fecha = crudo.fecha_publicacion
        if fecha is not None and fecha.tzinfo is None:
            fecha = fecha.replace(tzinfo=UTC)
        (viejos if fecha is not None and fecha < corte else vigentes).append(crudo)
    return vigentes, viejos


def _procesar_fuente(db: Session, fuente: FuenteNovedad) -> ResultadoFuente:
    settings = get_settings()
    res = ResultadoFuente(fuente=fuente.nombre)
    iniciado_en = datetime.now()
    tokens_total = 0

    try:
        crudos = list(fuente.fetch_recientes())
    except Exception as e:  # noqa: BLE001
        logger.exception("Fallo trayendo items de %s", fuente.nombre)
        res.estado = EstadoIngesta.ERROR.value
        res.errores.append(f"fetch: {e}")
        _registrar_log(db, res, iniciado_en, tokens=None)
        return res

    res.items_vistos = len(crudos)

    # Dedup exacto antes del LLM: solo los external_id no vistos se clasifican.
    existentes = novedad_repo.external_ids_existentes(
        db, [c.external_id for c in crudos]
    )
    nuevos = [c for c in crudos if c.external_id not in existentes]
    res.items_nuevos = len(nuevos)

    # Corte por antigüedad ANTES del LLM: clasificar con visión cuesta ~28k
    # tokens por item, así que un saludo navideño de 2024 que igual íbamos a
    # descartar no vale la llamada (ni el 429 de TPM que provoca).
    nuevos, viejos = _partir_por_antiguedad(
        nuevos, settings.novedades_antiguedad_max_dias
    )
    res.items_viejos = len(viejos)
    if viejos:
        logger.info(
            "%s: %d items salteados por antigüedad (>%d días)",
            fuente.nombre,
            len(viejos),
            settings.novedades_antiguedad_max_dias,
        )

    # Tope por corrida (control de costos, RNF-11).
    nuevos = nuevos[: settings.novedades_max_items_por_corrida]

    for crudo in nuevos:
        try:
            tokens_total += _clasificar_y_persistir(db, crudo, res)
        except Exception as e:  # noqa: BLE001
            logger.exception("Fallo clasificando item %s", crudo.external_id)
            res.errores.append(f"{crudo.external_id}: {e}")

    if res.errores and res.estado == EstadoIngesta.OK.value:
        res.estado = EstadoIngesta.PARCIAL.value

    _registrar_log(db, res, iniciado_en, tokens=tokens_total)
    return res


def _clasificar_y_persistir(
    db: Session, crudo: NovedadCruda, res: ResultadoFuente
) -> int:
    settings = get_settings()
    recientes = novedad_repo.recientes_para_dedup(db, limite=30)
    recientes_ctx = [(n.id, n.titulo or "") for n in recientes]
    salida = clasificador_novedades.clasificar(crudo, recientes=recientes_ctx)
    clf = salida.clasificacion

    # Dedup semántico: si es el mismo hecho que una existente, se le suma la
    # fuente en vez de crear una novedad nueva.
    if clf.es_novedad and clf.duplicado_de is not None:
        existente = next((n for n in recientes if n.id == clf.duplicado_de), None)
        if existente is not None:
            imagen_path = _guardar_evidencia(crudo)
            novedad_repo.agregar_fuente(
                db,
                novedad=existente,
                centro=_resolver_centro(db, crudo),
                external_id=crudo.external_id,
                url=crudo.url,
                imagen_url=imagen_path or crudo.imagen_url,
                imagen_path=imagen_path,
                fecha_publicacion=crudo.fecha_publicacion,
            )
            res.items_duplicados += 1
            return salida.tokens

    if not clf.es_novedad:
        estado = EstadoNovedad.DESCARTADA.value
        res.items_descartados += 1
    elif clf.confianza >= settings.novedades_umbral_publicar:
        estado = EstadoNovedad.PUBLICADA.value
        res.items_novedad += 1
    else:
        estado = EstadoNovedad.PENDIENTE.value
        res.items_novedad += 1

    imagen_path = _guardar_evidencia(crudo)
    # Portada: nuestra copia (S3/disco) si se pudo subir, si no la de origen
    # (puede expirar), si no hay ninguna el placeholder del LLM.
    imagen_url = imagen_path or crudo.imagen_url
    if not imagen_url and clf.imagen_sugerida:
        imagen_url = placeholders.path_de(clf.imagen_sugerida)

    novedad = novedad_repo.crear_novedad(
        db,
        centro=_resolver_centro(db, crudo),
        external_id=crudo.external_id,
        fuente_url=crudo.url,
        fuente_imagen_url=imagen_path or crudo.imagen_url,
        fuente_imagen_path=imagen_path,
        titulo=clf.titulo,
        descripcion=clf.descripcion,
        contenido=clf.contenido,
        categoria=clf.categoria,
        imagen_url=imagen_url,
        imagen_path=imagen_path,
        estado=estado,
        confianza=clf.confianza,
        motivo_descarte=clf.motivo if not clf.es_novedad else None,
        fecha_publicacion=crudo.fecha_publicacion,
    )
    # Lo nuevo se ve primero: entra al frente de la portada y corre al resto,
    # con lo que la tercera sale. Sólo lo publicado — lo pendiente y lo
    # descartado no llega a la portada.
    if estado == EstadoNovedad.PUBLICADA.value and novedad is not None:
        novedad_repo.promover_a_portada(db, novedad.id)
    return salida.tokens


def _resolver_centro(db: Session, crudo: NovedadCruda):
    if crudo.fuente == FuenteNovedadEnum.INSTAGRAM.value:
        handle = (crudo.origen or "").lstrip("@") or "instagram"
    else:
        handle = "frro_web"
    info = CENTROS_CONOCIDOS.get(handle, {})
    return novedad_repo.get_or_create_centro(
        db,
        handle=handle,
        nombre=info.get("nombre", f"@{handle}"),
        tipo=info.get("tipo", crudo.fuente),
        url_perfil=info.get("url_perfil"),
        logo_url=info.get("logo_url"),
    )


def _guardar_evidencia(crudo: NovedadCruda) -> str | None:
    """Guarda la imagen descargada como evidencia (cita de stories, RF-06) y
    copia propia para mostrar (las URLs de origen, ej. CDN de Instagram,
    expiran). Sube a S3 si está configurado; si no, cae a disco local (dev).
    """
    if not crudo.imagen_bytes:
        return None
    nombre = crudo.external_id.replace(":", "_").replace("/", "_")
    ext = "jpg"
    if crudo.imagen_mime and "/" in crudo.imagen_mime:
        ext = crudo.imagen_mime.split("/")[-1]

    url_s3 = storage.subir(
        crudo.imagen_bytes,
        f"novedades/{nombre}.{ext}",
        content_type=crudo.imagen_mime or "image/jpeg",
    )
    if url_s3 is not None:
        return url_s3

    settings = get_settings()
    media_dir = Path(settings.novedades_media_dir)
    media_dir.mkdir(parents=True, exist_ok=True)
    destino = media_dir / f"{nombre}.{ext}"
    try:
        destino.write_bytes(crudo.imagen_bytes)
    except OSError:
        logger.warning("No se pudo guardar evidencia para %s", crudo.external_id)
        return None
    return str(destino)


def _registrar_log(
    db: Session, res: ResultadoFuente, iniciado_en: datetime, *, tokens: int | None
) -> None:
    novedad_repo.crear_ingesta_log(
        db,
        fuente=res.fuente,
        iniciado_en=iniciado_en,
        finalizado_en=datetime.now(),
        items_vistos=res.items_vistos,
        items_nuevos=res.items_nuevos,
        items_novedad=res.items_novedad,
        items_descartados=res.items_descartados,
        tokens_usados=tokens,
        estado=res.estado,
        errores=res.errores or None,
    )
    db.commit()


def listar(
    db: Session,
    *,
    categoria: str | None = None,
    estado: str | None = "publicada",
    centro: str | None = None,
    limite: int = 20,
    offset: int = 0,
):
    return novedad_repo.listar(
        db,
        categoria=categoria,
        estado=estado,
        centro=centro,
        limite=limite,
        offset=offset,
    )


def listar_centros(db: Session):
    return novedad_repo.listar_centros(db)


def resolver_imagenes_portada(novedades: Sequence) -> list[str | None]:
    """Imagen final de cada novedad, deduplicando placeholders dentro de la portada.

    Respeta imágenes propias; si un placeholder ya está en uso, rota al siguiente
    libre (desde su índice, para caer en uno parecido).
    """
    cat = placeholders.NOMBRES
    usados: set[str] = set()
    resueltas: list[str | None] = []
    for n in novedades:
        url = getattr(n, "imagen_url", None)
        if url and not placeholders.es_placeholder(url):
            resueltas.append(url)
            continue
        anchor = placeholders.nombre_de(url)
        inicio = cat.index(anchor) if anchor in cat else placeholders.INDICE_GENERICA
        elegido: str | None = None
        for k in range(len(cat)):
            cand = cat[(inicio + k) % len(cat)]
            if cand not in usados:
                elegido = cand
                break
        if elegido is None:
            elegido = cat[inicio % len(cat)]
        usados.add(elegido)
        resueltas.append(placeholders.path_de(elegido))
    return resueltas


def get(db: Session, novedad_id: int):
    return novedad_repo.get(db, novedad_id)


def moderar(db: Session, novedad_id: int, estado: str):
    """Corrige a mano el estado que decidio el clasificador.

    Marca ``moderado_manual`` y deja intacto ``estado_llm``, de modo que
    ``WHERE moderado_manual AND estado <> estado_llm`` devuelva exactamente los
    errores del LLM: es la lista con la que se refina el prompt.
    """
    novedad = novedad_repo.actualizar_estado(db, novedad_id, estado, manual=True)
    if novedad is not None:
        # La portada tiene que seguir al estado: lo que se despublica sale, y
        # lo que se publica a mano entra al frente como cualquier novedad nueva.
        if estado == EstadoNovedad.PUBLICADA.value:
            if novedad.orden_portada is None:
                novedad_repo.promover_a_portada(db, novedad.id)
        else:
            novedad_repo.sacar_de_portada(db, novedad.id)
        db.commit()
    return novedad


# ---------------------------------------------------------------------------
# Portada (admin)
# ---------------------------------------------------------------------------


def listar_portada(db: Session, *, limite: int = novedad_repo.TOPE_PORTADA):
    """Las de "Últimas novedades", en el orden fijado."""
    return novedad_repo.listar_portada(db, limite=limite)


def fijar_orden_portada(db: Session, ids: list[int]):
    """Deja en la portada exactamente esas novedades, en ese orden."""
    portada = novedad_repo.fijar_orden_portada(db, ids)
    db.commit()
    return portada
