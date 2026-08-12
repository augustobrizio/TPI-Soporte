"""Tests de autenticación: hashing, tokens y los endpoints de auth (RF-01)."""
from __future__ import annotations

import os
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient
from jose import jwt
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api import auth as auth_api  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.core import security  # noqa: E402
from app.core.exceptions import CredencialesInvalidas, EmailYaRegistrado  # noqa: E402
from app.core.rate_limit import limitador_login  # noqa: E402
from app.db.models.usuario import Usuario  # noqa: E402
from app.db.session import get_db  # noqa: E402
from app.services import auth_service  # noqa: E402

PASSWORD_OK = "utnhub2026"


def _session() -> Session:
    engine = create_engine(
        "sqlite://",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Usuario.__table__.create(engine)
    return sessionmaker(bind=engine, class_=Session, expire_on_commit=False)()


def _client(db: Session) -> TestClient:
    app = FastAPI()
    app.include_router(auth_api.router)
    app.dependency_overrides[get_db] = lambda: db
    # El limitador es un singleton de proceso: sin esto, los tests que
    # provocan fallos de login se contaminan entre sí.
    limitador_login._intentos.clear()
    return TestClient(app)


# ---------------------------------------------------------------------------
# Hashing
# ---------------------------------------------------------------------------
def test_hash_password_no_guarda_el_texto_plano() -> None:
    hash_ = security.hash_password(PASSWORD_OK)
    assert PASSWORD_OK not in hash_
    assert hash_.startswith("$2b$")


def test_verify_password_acepta_la_correcta_y_rechaza_la_incorrecta() -> None:
    hash_ = security.hash_password(PASSWORD_OK)
    assert security.verify_password(PASSWORD_OK, hash_) is True
    assert security.verify_password("otra-cosa", hash_) is False


def test_dos_hashes_de_la_misma_password_son_distintos() -> None:
    """El salt aleatorio evita que dos usuarios con la misma clave se delaten."""
    assert security.hash_password(PASSWORD_OK) != security.hash_password(PASSWORD_OK)


def test_password_larga_no_se_trunca_a_72_bytes() -> None:
    """bcrypt corta en 72 bytes; el pre-hash SHA-256 evita que dos claves
    largas con el mismo prefijo terminen siendo equivalentes."""
    base = "a" * 80
    hash_ = security.hash_password(base + "MARIANO")
    assert security.verify_password(base + "OTRA-COSA", hash_) is False


def test_verify_password_con_hash_nulo_devuelve_false() -> None:
    assert security.verify_password(PASSWORD_OK, None) is False


# ---------------------------------------------------------------------------
# Tokens
# ---------------------------------------------------------------------------
def test_token_ida_y_vuelta() -> None:
    token = security.crear_token_acceso(7, email="a@b.com", rol="alumno")
    payload = security.decodificar_token(token)
    assert payload is not None
    assert payload["sub"] == "7"  # string por RFC 7519
    assert payload["email"] == "a@b.com"


def test_token_con_firma_adulterada_se_rechaza() -> None:
    token = security.crear_token_acceso(1, email="a@b.com", rol=None)
    cuerpo, _, _ = token.rpartition(".")
    assert security.decodificar_token(f"{cuerpo}.firmafalsa") is None


def test_token_vencido_se_rechaza() -> None:
    """Se firma a mano con un ``exp`` pasado: emitirlo por
    ``crear_token_acceso`` daria uno valido por las 12 h de la config."""
    ajustes = get_settings()
    ayer = datetime.now(UTC) - timedelta(days=1)
    token = jwt.encode(
        {"sub": "1", "email": "a@b.com", "rol": None, "iat": ayer, "exp": ayer},
        ajustes.jwt_secret,
        algorithm=ajustes.jwt_algorithm,
    )
    assert security.decodificar_token(token) is None


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------
def test_registrar_crea_el_usuario_con_email_normalizado() -> None:
    db = _session()
    usuario = auth_service.registrar(
        db, email="  Bruno@UTN.edu.ar ", password=PASSWORD_OK, nombre="Bruno"
    )
    assert usuario.email == "bruno@utn.edu.ar"
    assert usuario.rol == "alumno"
    assert usuario.password != PASSWORD_OK


def test_registrar_rechaza_email_repetido_aunque_cambie_el_case() -> None:
    db = _session()
    auth_service.registrar(db, email="a@b.com", password=PASSWORD_OK)
    try:
        auth_service.registrar(db, email="A@B.COM", password=PASSWORD_OK)
    except EmailYaRegistrado:
        pass
    else:
        raise AssertionError("Debio rechazar el email duplicado")


def test_autenticar_ok_y_con_password_incorrecta() -> None:
    db = _session()
    auth_service.registrar(db, email="a@b.com", password=PASSWORD_OK)

    assert auth_service.autenticar(db, email="a@b.com", password=PASSWORD_OK).id

    try:
        auth_service.autenticar(db, email="a@b.com", password="incorrecta")
    except CredencialesInvalidas:
        pass
    else:
        raise AssertionError("Debio rechazar la password incorrecta")


def test_autenticar_email_inexistente_da_el_mismo_error() -> None:
    """No debe distinguirse de una contraseña incorrecta (evita enumerar)."""
    db = _session()
    try:
        auth_service.autenticar(db, email="nadie@b.com", password=PASSWORD_OK)
    except CredencialesInvalidas:
        pass
    else:
        raise AssertionError("Debio rechazar el email inexistente")


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
def test_register_devuelve_token_y_no_filtra_la_password() -> None:
    client = _client(_session())
    r = client.post(
        "/auth/register", json={"email": "a@b.com", "password": PASSWORD_OK}
    )
    assert r.status_code == 201
    body = r.json()
    assert body["access_token"]
    assert body["usuario"]["email"] == "a@b.com"
    assert "password" not in body["usuario"]


def test_register_con_password_corta_da_422() -> None:
    client = _client(_session())
    r = client.post("/auth/register", json={"email": "a@b.com", "password": "corta"})
    assert r.status_code == 422


def test_register_con_password_trivial_da_422() -> None:
    client = _client(_session())
    r = client.post(
        "/auth/register", json={"email": "a@b.com", "password": "aaaaaaaaaa"}
    )
    assert r.status_code == 422


def test_register_con_email_invalido_da_422() -> None:
    client = _client(_session())
    r = client.post("/auth/register", json={"email": "no-es-mail", "password": PASSWORD_OK})
    assert r.status_code == 422


def test_register_duplicado_da_409() -> None:
    client = _client(_session())
    payload = {"email": "a@b.com", "password": PASSWORD_OK}
    assert client.post("/auth/register", json=payload).status_code == 201
    assert client.post("/auth/register", json=payload).status_code == 409


def test_login_ok_y_credenciales_malas() -> None:
    client = _client(_session())
    client.post("/auth/register", json={"email": "a@b.com", "password": PASSWORD_OK})

    ok = client.post("/auth/login", json={"email": "a@b.com", "password": PASSWORD_OK})
    assert ok.status_code == 200
    assert ok.json()["access_token"]

    mal = client.post("/auth/login", json={"email": "a@b.com", "password": "nope"})
    assert mal.status_code == 401


def test_login_no_revela_si_el_email_existe() -> None:
    client = _client(_session())
    client.post("/auth/register", json={"email": "a@b.com", "password": PASSWORD_OK})

    existe = client.post("/auth/login", json={"email": "a@b.com", "password": "nope"})
    no_existe = client.post(
        "/auth/login", json={"email": "z@b.com", "password": "nope"}
    )
    assert existe.status_code == no_existe.status_code == 401
    assert existe.json()["detail"] == no_existe.json()["detail"]


def test_login_bloquea_tras_demasiados_fallos() -> None:
    client = _client(_session())
    client.post("/auth/register", json={"email": "a@b.com", "password": PASSWORD_OK})

    codigos = [
        client.post("/auth/login", json={"email": "a@b.com", "password": "x"}).status_code
        for _ in range(12)
    ]
    assert 429 in codigos, "Deberia cortar por rate limit"


def test_me_requiere_token() -> None:
    client = _client(_session())
    assert client.get("/auth/me").status_code == 401
    assert client.get(
        "/auth/me", headers={"Authorization": "Bearer basura"}
    ).status_code == 401


def test_me_devuelve_el_usuario_del_token() -> None:
    client = _client(_session())
    token = client.post(
        "/auth/register", json={"email": "a@b.com", "password": PASSWORD_OK}
    ).json()["access_token"]

    r = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.json()["email"] == "a@b.com"
