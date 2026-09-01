"""Tests del parseo del feed público de Instagram.

No pegan contra Instagram: fijan la forma real de la respuesta (capturada de
``/api/v1/feed/user/<handle>/username/``) y verifican que el mapeo a
``NovedadCruda`` no se rompa si cambia el scraper.
"""
from __future__ import annotations

import os
import sys
from datetime import UTC, datetime
from pathlib import Path

import pytest

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.scrapers.novedades import instagram as ig  # noqa: E402


def _candidatos(*anchos: int) -> dict:
    return {
        "image_versions2": {
            "candidates": [
                {"width": a, "height": a, "url": f"https://cdn/{a}.jpg"} for a in anchos
            ]
        }
    }


def _post(**extra) -> dict:
    base = {
        "code": "DcOXo80u76H",
        "pk": "3967212290918039175",
        "media_type": 1,
        "taken_at": 1787157600,
        "caption": {"text": "19 de agosto | Día de la UTN"},
        "user": {"pk": "8485628486", "username": "sauutnrosario"},
        **_candidatos(1440, 1080, 640),
    }
    base.update(extra)
    return base


# --- selección de imagen ---------------------------------------------------


def test_mejor_imagen_toma_la_mayor_dentro_del_limite():
    assert ig._mejor_imagen(_post()) == "https://cdn/1080.jpg"


def test_mejor_imagen_cae_a_la_mas_chica_si_todas_exceden_el_limite():
    assert ig._mejor_imagen(_post(**_candidatos(2000, 1600))) == "https://cdn/1600.jpg"


def test_mejor_imagen_de_carrusel_usa_la_portada_del_primer_hijo():
    carrusel = _post(image_versions2={}, carousel_media=[_candidatos(1080, 640)])
    assert ig._mejor_imagen(carrusel) == "https://cdn/1080.jpg"


def test_mejor_imagen_sin_candidatos_devuelve_none():
    assert ig._mejor_imagen({"image_versions2": {}}) is None


# --- mapeo a NovedadCruda --------------------------------------------------


def test_from_post_mapea_los_campos_del_feed(monkeypatch):
    monkeypatch.setattr(ig, "_descargar", lambda url: b"jpg")
    cruda = ig.InstagramFuente()._from_post("sauutnrosario", _post())

    assert cruda.external_id == "instagram_post:DcOXo80u76H"
    assert cruda.url == "https://www.instagram.com/p/DcOXo80u76H/"
    assert cruda.origen == "@sauutnrosario"
    assert cruda.texto == "19 de agosto | Día de la UTN"
    assert cruda.imagen_bytes == b"jpg"
    assert cruda.usar_vision is True
    assert cruda.fecha_publicacion == datetime.fromtimestamp(1787157600, UTC)


def test_from_post_sin_caption_deja_texto_en_none(monkeypatch):
    monkeypatch.setattr(ig, "_descargar", lambda url: None)
    cruda = ig.InstagramFuente()._from_post("x", _post(caption=None))
    assert cruda.texto is None


def test_from_story_linkea_al_perfil_porque_la_story_expira(monkeypatch):
    monkeypatch.setattr(ig, "_descargar", lambda url: None)
    cruda = ig.InstagramFuente()._from_story("gradienteutn", _post(pk="999"))
    assert cruda.external_id == "instagram_story:999"
    assert cruda.url == "https://www.instagram.com/gradienteutn/"


# --- tolerancia a fallos ---------------------------------------------------


class _SesionFake:
    """Devuelve una respuesta por handle según ``por_handle``."""

    def __init__(self, por_handle):
        self.por_handle = por_handle
        self.pedidos = []

    def get(self, url, **kwargs):
        handle = next((h for h in self.por_handle if f"/{h}/" in url), None)
        self.pedidos.append(url)
        return self.por_handle[handle]


class _Resp:
    def __init__(self, payload, status_code=200):
        self._payload = payload
        self.status_code = status_code
        self.text = str(payload)

    def json(self):
        return self._payload


def _fuente(monkeypatch, sesion, handles, sessionid=None):
    monkeypatch.setattr(ig, "_sesion", lambda: sesion)
    monkeypatch.setattr(ig, "_descargar", lambda url: None)

    class _S:
        instagram_handles_list = handles
        instagram_sessionid = sessionid

    monkeypatch.setattr(ig, "get_settings", lambda: _S())
    return ig.InstagramFuente()


def test_un_handle_caido_no_tumba_a_los_demas(monkeypatch):
    sesion = _SesionFake(
        {
            "bueno": _Resp({"items": [_post()]}),
            "roto": _Resp({"message": "fail"}, status_code=400),
        }
    )
    items = _fuente(monkeypatch, sesion, ["bueno", "roto"]).fetch_recientes()
    assert [i.external_id for i in items] == ["instagram_post:DcOXo80u76H"]


def test_si_fallan_todos_los_handles_propaga_para_marcar_error_en_ingesta_log(
    monkeypatch,
):
    sesion = _SesionFake({"a": _Resp({}, status_code=401), "b": _Resp({}, 401)})
    fuente = _fuente(monkeypatch, sesion, ["a", "b"])
    with pytest.raises(RuntimeError, match="Fallaron todos los handles"):
        fuente.fetch_recientes()


def test_sin_sessionid_no_pide_stories(monkeypatch):
    sesion = _SesionFake({"a": _Resp({"items": [_post()]})})
    _fuente(monkeypatch, sesion, ["a"]).fetch_recientes()
    assert not any("reels_media" in u for u in sesion.pedidos)


def test_stories_caidas_no_tumban_los_posts(monkeypatch):
    class _SesionStoriesRotas(_SesionFake):
        def get(self, url, **kwargs):
            self.pedidos.append(url)
            if "reels_media" in url:
                return _Resp({}, status_code=403)
            return _Resp({"items": [_post()]})

    sesion = _SesionStoriesRotas({"a": None})
    items = _fuente(monkeypatch, sesion, ["a"], sessionid="s3ss").fetch_recientes()
    assert [i.external_id for i in items] == ["instagram_post:DcOXo80u76H"]
    assert any("reels_media" in u for u in sesion.pedidos)


def test_sin_handles_no_toca_la_red(monkeypatch):
    def _explota():
        raise AssertionError("no debería abrir sesión")

    monkeypatch.setattr(ig, "_sesion", _explota)

    class _S:
        instagram_handles_list = []
        instagram_sessionid = None

    monkeypatch.setattr(ig, "get_settings", lambda: _S())
    assert ig.InstagramFuente().fetch_recientes() == []
