"""Fuente de novedades: Instagram (instagrapi) — posts + stories de los centros.

Reusa la sesión persistida en disco y descarga la imagen de cada item para
visión. Tolerante a fallos por handle/item.
"""
from __future__ import annotations

import logging
import time
from collections.abc import Sequence
from pathlib import Path

import httpx

from app.config import get_settings
from app.core import storage
from app.db.models.novedad import FuenteNovedad as FuenteNovedadEnum
from app.scrapers.novedades.base import NovedadCruda

SESSION_S3_KEY = "secrets/instagram_session.json"

logger = logging.getLogger(__name__)

HTTP_TIMEOUT_SECONDS = 30
POSTS_POR_HANDLE = 12

_WEB_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)
_WEB_APP_ID = "936619743392459"


class InstagramFuente:
    nombre = FuenteNovedadEnum.INSTAGRAM.value

    def fetch_recientes(self) -> Sequence[NovedadCruda]:
        settings = get_settings()
        handles = settings.instagram_handles_list
        if not handles:
            return []

        client = self._login()
        items: list[NovedadCruda] = []
        fallados: list[str] = []
        for handle in handles:
            try:
                items.extend(self._fetch_handle(client, handle))
            except Exception:  # noqa: BLE001 — un handle no tumba al resto
                logger.exception("Fallo trayendo contenido de @%s", handle)
                fallados.append(handle)

        # Si fallan TODOS es un problema de la fuente (sesión muerta, IP
        # bloqueada), no "no habia nada nuevo": propagamos para que quede
        # como error en ingesta_log en vez de una corrida sana con 0 items.
        if fallados and len(fallados) == len(handles):
            raise RuntimeError(
                f"Fallaron todos los handles de Instagram: {', '.join(fallados)}"
            )
        return items

    def _login(self):
        from instagrapi import Client

        settings = get_settings()
        client = Client()
        client.delay_range = [1, 3]
        session_path = Path(settings.instagram_session_path)

        # Bootstrap desde S3 si no hay sesión local (cold start de Lambda).
        if not session_path.exists():
            session_bytes = storage.bajar(SESSION_S3_KEY)
            if session_bytes is not None:
                session_path.parent.mkdir(parents=True, exist_ok=True)
                session_path.write_bytes(session_bytes)

        # Sesión guardada: se reusa solo si sigue viva. Sin este chequeo una
        # sesión muerta gana para siempre sobre el sessionid fresco y la
        # ingesta no se recupera nunca (nos paso: 7 semanas en cero).
        if session_path.exists():
            client.load_settings(session_path)
            if _sesion_viva(client):
                return client
            logger.warning("Sesión de Instagram vencida; re-autenticando.")
            # Conservamos la identidad del dispositivo. Re-loguear con el
            # mismo fingerprint le parece a Instagram el mismo telefono de
            # siempre; arrancar de cero es un "device nuevo" y es lo que
            # dispara los challenges.
            previo = client.get_settings()
            client = Client()
            client.delay_range = [1, 3]
            if previo.get("uuids"):
                client.set_uuids(previo["uuids"])
            if previo.get("device_settings"):
                client.set_device(previo["device_settings"])

        _autenticar(client, settings)

        session_path.parent.mkdir(parents=True, exist_ok=True)
        client.dump_settings(session_path)
        # Persistimos en S3 para que la próxima invocación reuse la sesión.
        storage.subir(
            session_path.read_bytes(), SESSION_S3_KEY, content_type="application/json"
        )
        return client

    def _user_id(self, client, handle: str) -> str:
        # El lookup público (web_profile_info) es el que más rate-limita;
        # probamos primero la API privada (misma sesión autenticada).
        try:
            return str(client.user_info_by_username_v1(handle).pk)
        except Exception as e:  # noqa: BLE001
            # Logueado: este except tragandose un 403 fue lo que escondio
            # que la sesion estaba muerta.
            logger.warning(
                "API privada falló para @%s (%s); voy al lookup público",
                handle,
                type(e).__name__,
            )
            return client.user_id_from_username(handle)

    def _fetch_handle(self, client, handle: str) -> list[NovedadCruda]:
        user_id = self._user_id(client, handle)
        items: list[NovedadCruda] = []

        for media in client.user_medias(user_id, POSTS_POR_HANDLE):
            try:
                items.append(self._from_post(handle, media))
            except Exception:  # noqa: BLE001
                logger.warning("Fallo parseando post de @%s", handle)

        try:
            stories = client.user_stories(user_id)
        except Exception:  # noqa: BLE001
            stories = []
        for story in stories:
            try:
                items.append(self._from_story(handle, story))
            except Exception:  # noqa: BLE001
                logger.warning("Fallo parseando story de @%s", handle)

        return items

    def _from_post(self, handle: str, media) -> NovedadCruda:
        url = f"https://www.instagram.com/p/{media.code}/"
        img_url = str(media.thumbnail_url) if media.thumbnail_url else None
        return NovedadCruda(
            external_id=f"instagram_post:{media.code}",
            fuente=self.nombre,
            origen=f"@{handle}",
            url=url,
            texto=media.caption_text or None,
            imagen_bytes=_descargar(img_url),
            imagen_url=img_url,
            imagen_mime="image/jpeg",
            fecha_publicacion=media.taken_at,
            usar_vision=True,
        )

    def _from_story(self, handle: str, story) -> NovedadCruda:
        img_url = str(story.thumbnail_url) if story.thumbnail_url else None
        return NovedadCruda(
            external_id=f"instagram_story:{story.pk}",
            fuente=self.nombre,
            origen=f"@{handle}",
            # La story no tiene URL permanente (expira en 24h): linkeamos al
            # perfil del centro en su lugar.
            url=f"https://www.instagram.com/{handle}/",
            texto=getattr(story, "caption_text", None) or None,
            imagen_bytes=_descargar(img_url),
            imagen_url=img_url,
            imagen_mime="image/jpeg",
            fecha_publicacion=story.taken_at,
            usar_vision=True,
        )


def sessionid_por_login_web(usuario: str, password: str) -> str | None:
    """Obtiene un sessionid fresco por el login *web* de Instagram.

    Es un contexto de login distinto al de la API mobile que usa instagrapi:
    devuelve errores precisos (``UserInvalidCredentials`` vs bloqueo) y no
    exige sacar la cookie del browser a mano. Devuelve None si falla.
    """
    import requests

    s = requests.Session()
    s.headers.update({"User-Agent": _WEB_UA, "Accept-Language": "en-US,en;q=0.9"})
    try:
        s.get("https://www.instagram.com/accounts/login/", timeout=HTTP_TIMEOUT_SECONDS)
        csrf = s.cookies.get("csrftoken")
        if not csrf:
            logger.warning("Login web: no se obtuvo csrftoken")
            return None
        ts = int(time.time())
        resp = s.post(
            "https://www.instagram.com/api/v1/web/accounts/login/ajax/",
            data={
                "username": usuario,
                "enc_password": f"#PWD_INSTAGRAM_BROWSER:0:{ts}:{password}",
                "queryParams": "{}",
                "optIntoOneTap": "false",
            },
            headers={
                "x-csrftoken": csrf,
                "x-requested-with": "XMLHttpRequest",
                "Referer": "https://www.instagram.com/accounts/login/",
                "x-ig-app-id": _WEB_APP_ID,
            },
            timeout=HTTP_TIMEOUT_SECONDS,
        )
        datos = resp.json()
        if datos.get("authenticated") and s.cookies.get("sessionid"):
            return s.cookies.get("sessionid")
        logger.warning(
            "Login web rechazado: usuario_existe=%s error=%s",
            datos.get("user"),
            datos.get("error_type"),
        )
    except Exception:  # noqa: BLE001
        logger.exception("Login web falló")
    return None


def _autenticar(client, settings) -> None:
    """Escalera de credenciales, de más barata a más costosa. El sessionid
    del env vence; el login web con usuario/password es el único camino
    que renueva la sesión sin intervención humana.
    """
    if settings.instagram_sessionid:
        try:
            client.login_by_sessionid(settings.instagram_sessionid)
            return
        except Exception as e:  # noqa: BLE001
            logger.warning(
                "INSTAGRAM_SESSIONID vencido (%s); voy a usuario/password",
                type(e).__name__,
            )

    if settings.instagram_usuario and settings.instagram_password:
        sid = sessionid_por_login_web(
            settings.instagram_usuario, settings.instagram_password
        )
        if sid:
            client.login_by_sessionid(sid)
            return
        # La API mobile suele dar "bad_password" aun con credenciales
        # correctas (rechaza IP/device/contexto), pero la dejamos como
        # último recurso por si el login web cambia.
        client.login(settings.instagram_usuario, settings.instagram_password)
        return

    raise RuntimeError(
        "Sin credenciales de Instagram usables: configurá INSTAGRAM_USUARIO "
        "e INSTAGRAM_PASSWORD (renovables) o un INSTAGRAM_SESSIONID fresco."
    )


def _sesion_viva(client) -> bool:
    """Chequea la sesión con una llamada autenticada barata (API privada)."""
    try:
        client.account_info()
        return True
    except Exception:  # noqa: BLE001
        return False


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
