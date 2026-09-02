"""URL de suscripcion al calendario (T11.2 del Frente 11).

La suscripcion es lo que separa "exportar" de "sincronizar": el cliente relee
la URL cada varias horas, asi que cuando la facultad mueve una mesa el alumno
la ve movida sin reimportar nada.

El precio de eso es que **la URL es la credencial**. Google Calendar refresca
sin headers, sin cookies y sin sesion, asi que no hay forma de pedirle un JWT.
Eso convierte a estos tests en tests de seguridad, no de formato:

- el token tiene que ser largo e impredecible;
- tiene que resolver **solo** al calendario de su dueno;
- tiene que poder revocarse, y la URL vieja tiene que morir en el acto;
- un token invalido tiene que dar 404 y no 401, para que un token revocado no
  se distinga de uno que nunca existio.
"""
from __future__ import annotations

import os
import sys
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import app.db.models  # noqa: E402,F401
from app.api import auth as auth_api  # noqa: E402
from app.api import calendario as calendario_api  # noqa: E402
from app.core.rate_limit import limitador_login  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.db.models.calendario import EventoCalendario  # noqa: E402
from app.db.models.usuario import Usuario  # noqa: E402
from app.db.session import get_db  # noqa: E402
from app.services import calendario_service  # noqa: E402

PASSWORD = "utnhub2026"


def _entorno() -> tuple[TestClient, Session]:
    engine = create_engine(
        "sqlite://",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine, class_=Session, expire_on_commit=False)()

    app = FastAPI()
    app.include_router(auth_api.router)
    app.include_router(calendario_api.router)
    app.dependency_overrides[get_db] = lambda: db
    limitador_login._intentos.clear()
    return TestClient(app), db


def _registrar(client: TestClient, email: str) -> dict[str, str]:
    r = client.post("/auth/register", json={"email": email, "password": PASSWORD})
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _evento_personal(db: Session, usuario_email: str, titulo: str) -> None:
    usuario = db.query(Usuario).filter(Usuario.email == usuario_email).one()
    db.add(
        EventoCalendario(
            titulo=titulo,
            fecha_inicio=datetime(2026, 9, 1),
            tipo="trabajo_practico",
            carrera="ISI",
            content_hash=f"hash-{titulo}",
            origen="usuario",
            usuario_id=usuario.id,
        )
    )
    db.commit()


def _token_de(url: str) -> str:
    """`.../calendario/suscripcion/<token>.ics` -> `<token>`."""
    return url.rsplit("/", 1)[-1].removesuffix(".ics")


# ---------------------------------------------------------------------------
# Obtener la URL
# ---------------------------------------------------------------------------
def test_la_url_exige_sesion() -> None:
    client, _ = _entorno()
    assert client.get("/calendario/suscripcion").status_code == 401


def test_devuelve_una_url_completa() -> None:
    """El alumno la copia y pega tal cual: tiene que ser absoluta y .ics."""
    client, _ = _entorno()
    ana = _registrar(client, "ana@frro.utn.edu.ar")

    url = client.get("/calendario/suscripcion", headers=ana).json()["url"]

    assert url.startswith("http")
    assert "/calendario/suscripcion/" in url
    assert url.endswith(".ics")


def test_la_url_es_estable_entre_llamadas() -> None:
    """Si cambiara sola, la suscripcion que el alumno ya cargo se romperia."""
    client, _ = _entorno()
    ana = _registrar(client, "ana@frro.utn.edu.ar")

    primera = client.get("/calendario/suscripcion", headers=ana).json()["url"]
    segunda = client.get("/calendario/suscripcion", headers=ana).json()["url"]

    assert primera == segunda


def test_dos_alumnos_tienen_urls_distintas() -> None:
    client, _ = _entorno()
    ana = _registrar(client, "ana@frro.utn.edu.ar")
    beto = _registrar(client, "beto@frro.utn.edu.ar")

    url_ana = client.get("/calendario/suscripcion", headers=ana).json()["url"]
    url_beto = client.get("/calendario/suscripcion", headers=beto).json()["url"]

    assert url_ana != url_beto


def test_el_token_no_se_crea_hasta_que_se_pide() -> None:
    """Una credencial que nadie uso es una credencial de mas."""
    client, db = _entorno()
    _registrar(client, "ana@frro.utn.edu.ar")

    ana = db.query(Usuario).filter(Usuario.email == "ana@frro.utn.edu.ar").one()
    assert ana.calendario_token is None


def test_el_token_es_largo_e_impredecible() -> None:
    """Es la unica credencial de la URL: tiene que resistir fuerza bruta.

    32 bytes de urandom en base64 url-safe dan 43 caracteres. Se chequea el
    piso de largo y que no sea algo derivable del usuario (como su id).
    """
    client, _ = _entorno()
    ana = _registrar(client, "ana@frro.utn.edu.ar")

    token = _token_de(client.get("/calendario/suscripcion", headers=ana).json()["url"])

    assert len(token) >= 40
    assert token not in ("1", "ana@frro.utn.edu.ar")


# ---------------------------------------------------------------------------
# Descargar por la URL de suscripcion
# ---------------------------------------------------------------------------
def test_la_url_sirve_el_ics_sin_sesion() -> None:
    """El punto entero de T11.2: Google la lee sin poder autenticarse."""
    client, _ = _entorno()
    ana = _registrar(client, "ana@frro.utn.edu.ar")
    url = client.get("/calendario/suscripcion", headers=ana).json()["url"]

    # Sin ningun header de Authorization.
    r = client.get(f"/calendario/suscripcion/{_token_de(url)}.ics")

    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/calendar")
    assert r.text.startswith("BEGIN:VCALENDAR")


def test_la_url_trae_los_eventos_personales_de_su_dueno() -> None:
    client, db = _entorno()
    ana = _registrar(client, "ana@frro.utn.edu.ar")
    _evento_personal(db, "ana@frro.utn.edu.ar", "TP de Ana")
    url = client.get("/calendario/suscripcion", headers=ana).json()["url"]

    texto = client.get(f"/calendario/suscripcion/{_token_de(url)}.ics").text
    assert "TP de Ana" in texto


def test_la_url_de_uno_no_muestra_los_eventos_del_otro() -> None:
    """El test que importa: el token resuelve a UN usuario, no a cualquiera."""
    client, db = _entorno()
    ana = _registrar(client, "ana@frro.utn.edu.ar")
    beto = _registrar(client, "beto@frro.utn.edu.ar")
    _evento_personal(db, "ana@frro.utn.edu.ar", "TP de Ana")
    _evento_personal(db, "beto@frro.utn.edu.ar", "TP de Beto")

    url_beto = client.get("/calendario/suscripcion", headers=beto).json()["url"]
    texto = client.get(f"/calendario/suscripcion/{_token_de(url_beto)}.ics").text

    assert "TP de Beto" in texto
    assert "TP de Ana" not in texto


def test_un_token_inventado_da_404() -> None:
    client, _ = _entorno()
    r = client.get("/calendario/suscripcion/no-existe-este-token.ics")
    assert r.status_code == 404


def test_la_respuesta_pide_no_cachear() -> None:
    """Un proxy que la cachee deja al alumno viendo un calendario viejo."""
    client, _ = _entorno()
    ana = _registrar(client, "ana@frro.utn.edu.ar")
    url = client.get("/calendario/suscripcion", headers=ana).json()["url"]

    r = client.get(f"/calendario/suscripcion/{_token_de(url)}.ics")
    assert "no-cache" in r.headers.get("cache-control", "")


# ---------------------------------------------------------------------------
# Revocacion
# ---------------------------------------------------------------------------
def test_regenerar_cambia_la_url() -> None:
    client, _ = _entorno()
    ana = _registrar(client, "ana@frro.utn.edu.ar")

    vieja = client.get("/calendario/suscripcion", headers=ana).json()["url"]
    nueva = client.post("/calendario/suscripcion/regenerar", headers=ana).json()["url"]

    assert vieja != nueva


def test_la_url_vieja_muere_al_regenerar() -> None:
    """Es el boton de "compartí el link sin querer": tiene que cortar de una."""
    client, _ = _entorno()
    ana = _registrar(client, "ana@frro.utn.edu.ar")
    vieja = client.get("/calendario/suscripcion", headers=ana).json()["url"]
    assert client.get(f"/calendario/suscripcion/{_token_de(vieja)}.ics").status_code == 200

    nueva = client.post("/calendario/suscripcion/regenerar", headers=ana).json()["url"]

    assert client.get(f"/calendario/suscripcion/{_token_de(vieja)}.ics").status_code == 404
    assert client.get(f"/calendario/suscripcion/{_token_de(nueva)}.ics").status_code == 200


def test_regenerar_exige_sesion() -> None:
    client, _ = _entorno()
    assert client.post("/calendario/suscripcion/regenerar").status_code == 401


def test_regenerar_no_toca_el_token_de_otro() -> None:
    client, _ = _entorno()
    ana = _registrar(client, "ana@frro.utn.edu.ar")
    beto = _registrar(client, "beto@frro.utn.edu.ar")

    url_ana = client.get("/calendario/suscripcion", headers=ana).json()["url"]
    client.post("/calendario/suscripcion/regenerar", headers=beto)

    assert client.get("/calendario/suscripcion", headers=ana).json()["url"] == url_ana


# ---------------------------------------------------------------------------
# export.ics (T11.1) por HTTP
# ---------------------------------------------------------------------------
def test_export_ics_anda_sin_sesion() -> None:
    """El calendario de la facultad es publico, igual que el resto de la seccion."""
    client, _ = _entorno()
    r = client.get("/calendario/export.ics")

    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/calendar")
    assert "attachment" in r.headers.get("content-disposition", "")


def test_export_ics_sin_sesion_no_trae_lo_personal() -> None:
    client, db = _entorno()
    _registrar(client, "ana@frro.utn.edu.ar")
    _evento_personal(db, "ana@frro.utn.edu.ar", "TP de Ana")

    assert "TP de Ana" not in client.get("/calendario/export.ics").text


def test_export_ics_con_sesion_trae_lo_personal() -> None:
    client, db = _entorno()
    ana = _registrar(client, "ana@frro.utn.edu.ar")
    _evento_personal(db, "ana@frro.utn.edu.ar", "TP de Ana")

    assert "TP de Ana" in client.get("/calendario/export.ics", headers=ana).text


def test_export_ics_no_lo_come_la_ruta_de_evento_por_id() -> None:
    """`/{evento_id}` esta declarada despues, pero el orden es fragil.

    Si alguien mueve la ruta de export mas abajo, FastAPI intentaria castear
    "export.ics" a int y devolveria 422. Este test lo detecta.
    """
    client, _ = _entorno()
    assert client.get("/calendario/export.ics").status_code == 200


# ---------------------------------------------------------------------------
# Service directo
# ---------------------------------------------------------------------------
def test_usuario_por_token_ignora_el_token_vacio() -> None:
    """Con NULLs en la columna, un "" no puede matchear a nadie por accidente."""
    client, db = _entorno()
    _registrar(client, "ana@frro.utn.edu.ar")

    assert calendario_service.usuario_por_token(db, "") is None
