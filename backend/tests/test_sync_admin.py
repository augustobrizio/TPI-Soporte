"""Los cinco endpoints de sincronizacion son de admin, no de cualquiera (RNF-06).

Hasta este test los cinco estaban **abiertos**: sin token, sin rol, sin nada.
Cualquiera con la URL podia:

- ``POST /profesores/sincronizar-horarios`` — borrar y reescribir
  ``horario_consulta`` y ``materia_profesor`` enteras (es un full refresh).
- ``POST /profesores/sincronizar-mails`` — crear profesores en el padron.
- ``POST /profesores/sincronizar-catedras-utntac`` — idem + reescribir catedras.
- ``POST /calendario/sincronizar`` — escribir los eventos **institucionales**,
  los que ve todo el mundo (``usuario_id`` NULL), no los propios de quien llama.
- ``POST /novedades/sincronizar`` — disparar el pipeline completo de ingesta,
  que pasa cada post por el clasificador LLM: una factura de API ajena que se
  podia disparar en loop desde afuera.

PENDIENTES.md registraba los tres primeros (T12.1); los de calendario y
novedades apareicieron al auditar los ``@router.post/put/patch/delete`` de todo
``api/``, y son los dos peores del grupo.

Los tres casos que fija cada test son los mismos: **anonimo** no entra (401),
**alumno logueado** tampoco (403 — ``rol`` arranca en NULL para toda cuenta
nueva), y **admin** pasa el guard. Para el tercero el servicio va mockeado: lo
que se prueba es la puerta, no el scrapeo, y sin mock cada corrida de la suite
saldria a la red contra FRRO y las sheets de UTNTAC.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api import auth as auth_api  # noqa: E402
from app.api import calendario as calendario_api  # noqa: E402
from app.api import novedades as novedades_api  # noqa: E402
from app.api import profesores as profesores_api  # noqa: E402
import app.db.models  # noqa: E402,F401  (registra todas las tablas en la metadata)
from app.core.rate_limit import limitador_login  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.db.models.usuario import Usuario  # noqa: E402
from app.db.session import get_db  # noqa: E402
from app.schemas.calendario import ResultadoSincCalendario  # noqa: E402
from app.schemas.novedad import ResultadoIngesta  # noqa: E402
from app.schemas.profesor import (  # noqa: E402
    ResultadoSincCatedras,
    ResultadoSincHorarios,
    ResultadoSincMails,
)

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
    app.include_router(profesores_api.router)
    app.include_router(calendario_api.router)
    app.include_router(novedades_api.router)
    app.dependency_overrides[get_db] = lambda: db
    limitador_login._intentos.clear()
    return TestClient(app), db


def _headers(client: TestClient, db: Session, email: str, *, admin: bool) -> dict[str, str]:
    """Registra una cuenta y devuelve su header Authorization.

    ``rol`` no se puede pedir en el registro —y esta bien que no se pueda—, asi
    que el admin se fabrica promoviendo la fila despues de crearla.
    """
    r = client.post("/auth/register", json={"email": email, "password": PASSWORD})
    assert r.status_code == 201, r.text
    if admin:
        usuario = db.query(Usuario).filter(Usuario.email == email).one()
        usuario.rol = "admin"
        db.commit()
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


# Cada fila: (ruta, modulo del servicio, funcion mockeada, resultado que devuelve).
# El modulo es el que importa el endpoint, que es donde hay que parchear.
_SYNC = [
    pytest.param(
        "/profesores/sincronizar-horarios",
        "app.services.profesor_consulta_service",
        "sincronizar_horarios_consulta",
        ResultadoSincHorarios(
            profesores_tocados=0,
            horarios_borrados=0,
            horarios_creados=0,
            materia_profesor_borrados=0,
            materia_profesor_creados=0,
        ),
        id="profesores-horarios",
    ),
    pytest.param(
        "/profesores/sincronizar-mails",
        "app.services.profesor_utntac_service",
        "sincronizar_mails",
        ResultadoSincMails(
            filas_procesadas=0,
            emails_seteados=0,
            emails_ya_existentes=0,
            profesores_creados=0,
        ),
        id="profesores-mails",
    ),
    pytest.param(
        "/profesores/sincronizar-catedras-utntac",
        "app.services.profesor_utntac_service",
        "sincronizar_catedras",
        ResultadoSincCatedras(
            filas_procesadas=0,
            profesores_creados=0,
            materia_profesor_creados=0,
            materia_profesor_ya_existentes=0,
        ),
        id="profesores-catedras",
    ),
    pytest.param(
        "/calendario/sincronizar",
        "app.services.calendario_service",
        "sincronizar_calendario",
        ResultadoSincCalendario(),
        id="calendario",
    ),
    pytest.param(
        "/novedades/sincronizar",
        "app.services.novedad_service",
        "run_ingesta_novedades",
        ResultadoIngesta(),
        id="novedades",
    ),
]


@pytest.mark.parametrize("ruta,modulo,funcion,resultado", _SYNC)
def test_sync_sin_sesion_da_401(ruta: str, modulo: str, funcion: str, resultado: object) -> None:
    client, _ = _entorno()
    assert client.post(ruta).status_code == 401


@pytest.mark.parametrize("ruta,modulo,funcion,resultado", _SYNC)
def test_sync_con_alumno_da_403(ruta: str, modulo: str, funcion: str, resultado: object) -> None:
    """Una cuenta comun no alcanza: ``rol`` es NULL para toda cuenta nueva."""
    client, db = _entorno()
    alumno = _headers(client, db, "ana@frro.utn.edu.ar", admin=False)
    assert client.post(ruta, headers=alumno).status_code == 403


@pytest.mark.parametrize("ruta,modulo,funcion,resultado", _SYNC)
def test_sync_con_admin_pasa_el_guard(
    ruta: str, modulo: str, funcion: str, resultado: object, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Y del otro lado, que el guard no haya cerrado tambien al admin."""
    client, db = _entorno()
    admin = _headers(client, db, "jefe@frro.utn.edu.ar", admin=True)

    llamadas: list[int] = []

    def _fake(*args: object, **kwargs: object) -> object:
        llamadas.append(1)
        return resultado

    monkeypatch.setattr(f"{modulo}.{funcion}", _fake)

    r = client.post(ruta, headers=admin)
    assert r.status_code == 200, r.text
    assert llamadas == [1], "el endpoint no llego a llamar al servicio"


def test_el_scrapeo_no_corre_cuando_el_guard_rechaza(monkeypatch: pytest.MonkeyPatch) -> None:
    """El guard corta **antes** del handler, no despues.

    Es la diferencia entre negar el acceso y negar la respuesta: si el servicio
    corriera igual y solo se ocultara el resultado, un anonimo seguiria pudiendo
    reescribir las tablas y gastar la cuota de LLM sin ver la salida.
    """
    client, db = _entorno()
    alumno = _headers(client, db, "ana@frro.utn.edu.ar", admin=False)

    def _explota(*args: object, **kwargs: object) -> object:
        raise AssertionError("el servicio de ingesta corrio sin permisos de admin")

    monkeypatch.setattr("app.services.novedad_service.run_ingesta_novedades", _explota)

    assert client.post("/novedades/sincronizar").status_code == 401
    assert client.post("/novedades/sincronizar", headers=alumno).status_code == 403
