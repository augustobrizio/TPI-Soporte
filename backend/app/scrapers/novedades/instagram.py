"""Fuente de novedades: Instagram — posts de los centros, sin credenciales.

Lee los endpoints web públicos de Instagram. La única condición para que
respondan es presentar un handshake TLS de browser real: Instagram clasifica
por fingerprint (JA3/HTTP2), no solo por IP, y a ``requests``/``httpx`` los
corta con 401/429 al primer request aunque salgan de una IP residencial. Con
``curl_cffi`` impersonando Chrome los mismos endpoints responden 200 desde una
Lambda. Por eso este módulo no usa ``requests`` para hablar con Instagram.

Las *stories* son el único contenido que sigue exigiendo sesión: se traen
best-effort si hay ``INSTAGRAM_SESSIONID`` y su fallo nunca tumba la ingesta.
"""
from __future__ import annotations

import logging
from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Any

import httpx

from app.config import get_settings
from app.db.models.novedad import FuenteNovedad as FuenteNovedadEnum
from app.scrapers.novedades.base import NovedadCruda

logger = logging.getLogger(__name__)

HTTP_TIMEOUT_SECONDS = 30
POSTS_POR_HANDLE = 12

#: App id del cliente web de Instagram. Es público (viaja en cada request del
#: sitio) y el endpoint devuelve 401 sin él.
_WEB_APP_ID = "936619743392459"

#: Perfil de browser que imita curl_cffi. Cualquier target moderno sirve
#: (probados chrome/chrome131/safari/firefox); lo que importa es no parecer
#: una librería HTTP de Python.
_IMPERSONATE = "chrome"

#: Feed del perfil por username. Evita el lookup previo de user_id y funciona
#: en cuentas donde ``web_profile_info`` rompe con un 400 del propio backend
#: de Instagram (le pasa a las cuentas business, ej. @sauutnrosario).
_URL_FEED = "https://www.instagram.com/api/v1/feed/user/{handle}/username/?count={count}"
_URL_STORIES = "https://www.instagram.com/api/v1/feed/reels_media/?reel_ids={pk}"

#: Ancho máximo de la imagen que bajamos: Instagram ofrece hasta 1440px, pero
#: al clasificador multimodal le sobra con 1080 y pesa la mitad.
_ANCHO_MAX = 1080


class InstagramFuente:
    nombre = FuenteNovedadEnum.INSTAGRAM.value

    def fetch_recientes(self) -> Sequence[NovedadCruda]:
        settings = get_settings()
        handles = settings.instagram_handles_list
        if not handles:
            return []

        sesion = _sesion()
        items: list[NovedadCruda] = []
        fallados: list[str] = []
        for handle in handles:
            try:
                items.extend(self._fetch_handle(sesion, handle))
            except Exception:  # noqa: BLE001 — un handle no tumba al resto
                logger.exception("Fallo trayendo contenido de @%s", handle)
                fallados.append(handle)

        # Si fallan TODOS es un problema de la fuente (endpoint cambiado, IP
        # bloqueada), no "no habia nada nuevo": propagamos para que quede como
        # error en ingesta_log en vez de una corrida sana con 0 items.
        if fallados and len(fallados) == len(handles):
            raise RuntimeError(
                f"Fallaron todos los handles de Instagram: {', '.join(fallados)}"
            )
        return items

    def _fetch_handle(self, sesion, handle: str) -> list[NovedadCruda]:
        datos = _pedir_json(
            sesion, _URL_FEED.format(handle=handle, count=POSTS_POR_HANDLE), handle
        )
        posts = datos.get("items") or []
        items: list[NovedadCruda] = []
        for post in posts:
            try:
                items.append(self._from_post(handle, post))
            except Exception:  # noqa: BLE001
                logger.warning("Fallo parseando post de @%s", handle)

        # El pk viene gratis dentro del propio feed: no hace falta un lookup
        # aparte (que era, además, el request que más rate-limit comía).
        pk = (posts[0].get("user") or {}).get("pk") if posts else None
        items.extend(self._fetch_stories(sesion, handle, pk))
        return items

    def _fetch_stories(self, sesion, handle: str, pk: Any) -> list[NovedadCruda]:
        """Stories: requieren sesión. Best-effort, nunca tumba la ingesta."""
        settings = get_settings()
        if not settings.instagram_sessionid:
            logger.info(
                "Stories de @%s omitidas: no hay INSTAGRAM_SESSIONID configurado",
                handle,
            )
            return []
        if not pk:
            return []
        try:
            datos = _pedir_json(
                sesion,
                _URL_STORIES.format(pk=pk),
                handle,
                cookies={"sessionid": settings.instagram_sessionid},
            )
            crudas = ((datos.get("reels") or {}).get(str(pk)) or {}).get("items") or []
        except Exception:  # noqa: BLE001
            logger.warning(
                "Stories de @%s no disponibles (INSTAGRAM_SESSIONID vencido o sin "
                "permisos); sigo solo con posts",
                handle,
            )
            return []

        # Sin sesión válida Instagram no da error: devuelve 200 con "reels"
        # vacío. Si nunca aparece una story en ningún handle, lo más probable
        # es que el sessionid este muerto, no que no haya stories.
        if not crudas:
            logger.info("Sin stories visibles en @%s", handle)

        items: list[NovedadCruda] = []
        for story in crudas:
            try:
                items.append(self._from_story(handle, story))
            except Exception:  # noqa: BLE001
                logger.warning("Fallo parseando story de @%s", handle)
        return items

    def _from_post(self, handle: str, post: dict) -> NovedadCruda:
        code = post["code"]
        img_url = _mejor_imagen(post)
        return NovedadCruda(
            external_id=f"instagram_post:{code}",
            fuente=self.nombre,
            origen=f"@{handle}",
            url=f"https://www.instagram.com/p/{code}/",
            texto=(post.get("caption") or {}).get("text") or None,
            imagen_bytes=_descargar(img_url),
            imagen_url=img_url,
            imagen_mime="image/jpeg",
            fecha_publicacion=_fecha(post.get("taken_at")),
            usar_vision=True,
        )

    def _from_story(self, handle: str, story: dict) -> NovedadCruda:
        img_url = _mejor_imagen(story)
        return NovedadCruda(
            external_id=f"instagram_story:{story['pk']}",
            fuente=self.nombre,
            origen=f"@{handle}",
            # La story no tiene URL permanente (expira en 24h): linkeamos al
            # perfil del centro en su lugar.
            url=f"https://www.instagram.com/{handle}/",
            texto=(story.get("caption") or {}).get("text") or None,
            imagen_bytes=_descargar(img_url),
            imagen_url=img_url,
            imagen_mime="image/jpeg",
            fecha_publicacion=_fecha(story.get("taken_at")),
            usar_vision=True,
        )


def _sesion():
    """Sesión HTTP con fingerprint TLS de browser. Sin esto Instagram corta."""
    from curl_cffi import requests as curl_requests

    sesion = curl_requests.Session(impersonate=_IMPERSONATE)
    sesion.headers.update(
        {"Accept-Language": "es-AR,es;q=0.9", "x-ig-app-id": _WEB_APP_ID}
    )
    return sesion


def _pedir_json(sesion, url: str, handle: str, *, cookies: dict | None = None) -> dict:
    resp = sesion.get(
        url,
        headers={"Referer": f"https://www.instagram.com/{handle}/"},
        cookies=cookies,
        timeout=HTTP_TIMEOUT_SECONDS,
    )
    if resp.status_code != 200:
        raise RuntimeError(
            f"Instagram respondió {resp.status_code} en {url}: {resp.text[:200]}"
        )
    return resp.json()


def _mejor_imagen(media: dict) -> str | None:
    """URL de la imagen a clasificar, acotada a ``_ANCHO_MAX``.

    En carruseles (``media_type`` 8) la portada vive en el primer hijo; en
    videos, ``image_versions2`` ya trae el frame de portada.
    """
    if not (media.get("image_versions2") or {}).get("candidates"):
        hijos = media.get("carousel_media") or []
        media = hijos[0] if hijos else media
    candidatos = (media.get("image_versions2") or {}).get("candidates") or []
    if not candidatos:
        return None
    # Vienen de mayor a menor: el primero que entra en el límite es el mejor.
    for c in candidatos:
        if c.get("width", 0) <= _ANCHO_MAX and c.get("url"):
            return c["url"]
    return candidatos[-1].get("url")


def _fecha(taken_at: Any) -> datetime | None:
    if not taken_at:
        return None
    return datetime.fromtimestamp(int(taken_at), UTC)


def _descargar(url: str | None) -> bytes | None:
    """Descarga la media; devuelve None si falla (no debe tumbar el item)."""
    if not url:
        return None
    try:
        with httpx.Client(
            timeout=HTTP_TIMEOUT_SECONDS, follow_redirects=True
        ) as client:
            resp = client.get(url)
            resp.raise_for_status()
            return resp.content
    except httpx.HTTPError:
        logger.warning("No se pudo descargar media %s", url)
        return None
