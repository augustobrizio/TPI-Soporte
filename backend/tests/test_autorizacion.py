"""Los datos academicos son del usuario del token, de nadie mas (RNF-06).

Antes el ``usuario_id`` viajaba en la URL (``/usuarios/{id}/materias``,
``?usuario_id=``), asi que cambiando el numero se leia y escribia el historial
de cualquier alumno. Estos tests fijan que eso ya no sea posible.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api import auth as auth_api  # noqa: E402
from app.api import materias as materias_api  # noqa: E402
from app.api import usuario_materia as um_api  # noqa: E402
from app.core.rate_limit import limitador_login  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.db.models.academico import Materia  # noqa: E402
from app.db.session import get_db  # noqa: E402

PASSWORD = "utnhub2026"
CODIGO = "11"


def _entorno() -> tuple[TestClient, Session]:
    engine = create_engine(
        "sqlite://",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine, class_=Session, expire_on_commit=False)()

    db.add(
        Materia(
            codigo=CODIGO,
            nombre="Ingeniería y Sociedad",
            anio_carrera=1,
            cuatrimestre="1",
            horas=3,
            tipo="troncal",
        )
    )
    db.commit()

    app = FastAPI()
    app.include_router(auth_api.router)
    app.include_router(um_api.router)
    app.include_router(materias_api.router)
    app.dependency_overrides[get_db] = lambda: db
    limitador_login._intentos.clear()
    return TestClient(app), db


def _registrar(client: TestClient, email: str) -> dict[str, str]:
    """Crea una cuenta y devuelve el header Authorization listo para usar."""
    r = client.post("/auth/register", json={"email": email, "password": PASSWORD})
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


# ---------------------------------------------------------------------------
# Sin sesion no se entra
# ---------------------------------------------------------------------------
def test_endpoints_de_usuario_exigen_token() -> None:
    client, _ = _entorno()
    assert client.get("/mi/materias").status_code == 401
    assert client.get("/materias/grafo?tipo=troncal").status_code == 401
    assert client.put(
        f"/mi/materias/{CODIGO}", json={"condicion": "aprobado"}
    ).status_code == 401


def test_token_invalido_no_pasa() -> None:
    client, _ = _entorno()
    r = client.get("/mi/materias", headers={"Authorization": "Bearer no-es-un-jwt"})
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# Aislamiento entre usuarios
# ---------------------------------------------------------------------------
def test_un_usuario_no_ve_las_materias_de_otro() -> None:
    client, _ = _entorno()
    ana = _registrar(client, "ana@frro.utn.edu.ar")
    beto = _registrar(client, "beto@frro.utn.edu.ar")

    alta = client.put(
        f"/mi/materias/{CODIGO}",
        json={"condicion": "aprobado", "forzar": True},
        headers=ana,
    )
    assert alta.status_code == 200, alta.text

    assert len(client.get("/mi/materias", headers=ana).json()) == 1
    # Beto recien se registro: su historial arranca vacio.
    assert client.get("/mi/materias", headers=beto).json() == []


def test_cuenta_nueva_arranca_con_el_grafo_en_cero() -> None:
    client, _ = _entorno()
    ana = _registrar(client, "ana@frro.utn.edu.ar")
    beto = _registrar(client, "beto@frro.utn.edu.ar")

    client.put(
        f"/mi/materias/{CODIGO}",
        json={"condicion": "aprobado", "forzar": True},
        headers=ana,
    )

    de_ana = client.get("/materias/grafo?tipo=troncal", headers=ana).json()
    de_beto = client.get("/materias/grafo?tipo=troncal", headers=beto).json()

    assert de_ana["contadores"]["aprobadas"] == 1
    assert de_beto["contadores"]["aprobadas"] == 0


def test_borrar_no_alcanza_al_registro_de_otro() -> None:
    client, _ = _entorno()
    ana = _registrar(client, "ana@frro.utn.edu.ar")
    beto = _registrar(client, "beto@frro.utn.edu.ar")

    client.put(
        f"/mi/materias/{CODIGO}",
        json={"condicion": "aprobado", "forzar": True},
        headers=ana,
    )

    # Beto pide borrar el mismo codigo: no existe *para el*, y el de Ana queda.
    assert client.delete(f"/mi/materias/{CODIGO}", headers=beto).status_code == 404
    assert len(client.get("/mi/materias", headers=ana).json()) == 1
