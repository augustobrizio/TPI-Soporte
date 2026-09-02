"""Tests del login con Google (RF-01).

Cubren las tres capas: verificación del id_token (`services/google_oauth`),
la regla de alta/vinculación (`services/auth_service`) y el endpoint
(`api/auth`). Nada de esto pega contra Google: el id_token se firma con una
clave RSA generada en el test y las JWKS se inyectan por monkeypatch.
"""
from __future__ import annotations

import os
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import FastAPI
from fastapi.testclient import TestClient
from jose import jwk, jwt
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api import auth as auth_api  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.core.exceptions import (  # noqa: E402
    DominioGoogleNoPermitido,
    EmailGoogleNoVerificado,
    GoogleOAuthError,
    GoogleOAuthNoConfigurado,
)
from app.db.models.usuario import Usuario  # noqa: E402
from app.db.session import get_db  # noqa: E402
from app.services import auth_service, google_oauth  # noqa: E402
from app.services.google_oauth import PerfilGoogle  # noqa: E402

CLIENT_ID = "1234567890-utnhub.apps.googleusercontent.com"
# 43 caracteres: el minimo que fija el RFC 7636 para el code_verifier.
VERIFIER = "a" * 43
CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
CLIENT_SECRET = "secreto-de-prueba"
KID = "clave-de-prueba"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------
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
    return TestClient(app)


@pytest.fixture
def credenciales(monkeypatch: pytest.MonkeyPatch):
    """Deja el backend como si tuviera cargadas las credenciales de Google."""
    ajustes = get_settings()
    monkeypatch.setattr(ajustes, "google_client_id", CLIENT_ID)
    monkeypatch.setattr(ajustes, "google_client_secret", CLIENT_SECRET)
    return ajustes


@pytest.fixture(scope="module")
def par_de_claves() -> tuple[str, dict]:
    """Clave RSA para firmar id_tokens de prueba, y su JWKS pública."""
    privada = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem_privada = privada.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()
    pem_publica = (
        privada.public_key()
        .public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        .decode()
    )
    publica = jwk.construct(pem_publica, algorithm="RS256").to_dict()
    publica = {k: (v.decode() if isinstance(v, bytes) else v) for k, v in publica.items()}
    publica["kid"] = KID
    publica["use"] = "sig"
    publica["alg"] = "RS256"
    return pem_privada, {"keys": [publica]}


@pytest.fixture
def firmar(par_de_claves, monkeypatch: pytest.MonkeyPatch):
    """Devuelve una función que firma un id_token con claims a medida."""
    pem_privada, jwks = par_de_claves
    monkeypatch.setattr(google_oauth, "_obtener_jwks", lambda **_: jwks)

    def _firmar(**overrides) -> str:
        ahora = datetime.now(UTC)
        claims = {
            "iss": "https://accounts.google.com",
            "aud": CLIENT_ID,
            "sub": "108888888888888888888",
            "email": "juan@frro.utn.edu.ar",
            "email_verified": True,
            "given_name": "Juan",
            "family_name": "Pérez",
            "picture": "https://lh3.googleusercontent.com/foto",
            "iat": ahora,
            "exp": ahora + timedelta(minutes=10),
        }
        claims.update(overrides)
        return jwt.encode(
            claims, pem_privada, algorithm="RS256", headers={"kid": KID}
        )

    return _firmar


PERFIL = PerfilGoogle(
    sub="108888888888888888888",
    email="juan@frro.utn.edu.ar",
    email_verificado=True,
    nombre="Juan",
    apellido="Pérez",
    avatar_url="https://lh3.googleusercontent.com/foto",
)


# ---------------------------------------------------------------------------
# Verificación del id_token
# ---------------------------------------------------------------------------
def test_id_token_valido_devuelve_el_perfil(credenciales, firmar) -> None:
    perfil = google_oauth.verificar_id_token(firmar())
    assert perfil.sub == "108888888888888888888"
    assert perfil.email == "juan@frro.utn.edu.ar"
    assert perfil.email_verificado is True
    assert perfil.nombre == "Juan"
    assert perfil.avatar_url.startswith("https://")


def test_id_token_de_otra_app_se_rechaza(credenciales, firmar) -> None:
    """`aud` distinto = token emitido para otro cliente OAuth.

    Sin este chequeo, cualquiera con una app propia de Google podría tomar el
    id_token que le emitieron a él y usarlo para entrar como ese usuario acá.
    """
    with pytest.raises(GoogleOAuthError):
        google_oauth.verificar_id_token(firmar(aud="otra-app.apps.googleusercontent.com"))


def test_id_token_de_otro_emisor_se_rechaza(credenciales, firmar) -> None:
    with pytest.raises(GoogleOAuthError):
        google_oauth.verificar_id_token(firmar(iss="https://accounts.evil.com"))


def test_id_token_vencido_se_rechaza(credenciales, firmar) -> None:
    ayer = datetime.now(UTC) - timedelta(days=1)
    with pytest.raises(GoogleOAuthError):
        google_oauth.verificar_id_token(
            firmar(iat=ayer, exp=ayer + timedelta(minutes=10))
        )


def test_id_token_con_firma_ajena_se_rechaza(credenciales, firmar) -> None:
    """Un token bien formado pero firmado con otra clave no pasa."""
    otra = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = otra.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()
    ahora = datetime.now(UTC)
    token = jwt.encode(
        {
            "iss": "https://accounts.google.com",
            "aud": CLIENT_ID,
            "sub": "1",
            "email": "x@y.com",
            "iat": ahora,
            "exp": ahora + timedelta(minutes=10),
        },
        pem,
        algorithm="RS256",
        headers={"kid": KID},
    )
    with pytest.raises(GoogleOAuthError):
        google_oauth.verificar_id_token(token)


def test_sin_credenciales_no_se_puede_verificar() -> None:
    with pytest.raises(GoogleOAuthNoConfigurado):
        google_oauth.verificar_id_token("lo-que-sea")


def test_url_de_autorizacion_lleva_client_id_state_y_redirect(credenciales) -> None:
    url = google_oauth.construir_url_autorizacion(
        redirect_uri="http://localhost:3000/api/auth/google/callback",
        state="abc123",
        code_challenge=CHALLENGE,
    )
    assert url.startswith(google_oauth.AUTORIZAR_URL)
    assert f"client_id={CLIENT_ID}" in url
    assert "state=abc123" in url
    assert "response_type=code" in url
    # PKCE: viaja el challenge (hash), nunca el verifier.
    assert f"code_challenge={CHALLENGE}" in url
    assert "code_challenge_method=S256" in url
    # El secret nunca viaja al browser: solo se usa en el intercambio del code.
    assert CLIENT_SECRET not in url


# ---------------------------------------------------------------------------
# Regla de negocio: alta y vinculación
# ---------------------------------------------------------------------------
def test_primer_ingreso_crea_la_cuenta_sin_password() -> None:
    db = _session()
    usuario = auth_service.autenticar_con_google(db, PERFIL)

    assert usuario.id is not None
    assert usuario.email == "juan@frro.utn.edu.ar"
    assert usuario.google_sub == PERFIL.sub
    assert usuario.nombre == "Juan"
    assert usuario.rol == auth_service.ROL_POR_DEFECTO
    # Cuenta sin contraseña local: no se puede entrar por /auth/login.
    assert usuario.password is None


def test_segundo_ingreso_reusa_la_misma_cuenta() -> None:
    db = _session()
    primero = auth_service.autenticar_con_google(db, PERFIL)
    segundo = auth_service.autenticar_con_google(db, PERFIL)
    assert primero.id == segundo.id


def test_vincula_una_cuenta_preexistente_por_email() -> None:
    """Quien ya tenía cuenta con password entra con Google y sigue siendo el mismo."""
    db = _session()
    previo = auth_service.registrar(
        db, email="Juan@frro.utn.edu.ar", password="utnhub2026", legajo="12345"
    )

    usuario = auth_service.autenticar_con_google(db, PERFIL)

    assert usuario.id == previo.id
    assert usuario.google_sub == PERFIL.sub
    assert usuario.legajo == "12345"
    # La contraseña sigue sirviendo: vincular Google no la borra.
    assert auth_service.autenticar(
        db, email="juan@frro.utn.edu.ar", password="utnhub2026"
    ).id == previo.id


def test_reconoce_al_usuario_aunque_cambie_el_email_en_google() -> None:
    """El vínculo real es el `sub`, no el email."""
    db = _session()
    original = auth_service.autenticar_con_google(db, PERFIL)

    from dataclasses import replace

    usuario = auth_service.autenticar_con_google(
        db, replace(PERFIL, email="juan.perez@gmail.com")
    )

    assert usuario.id == original.id
    # El email de UTNHub no se pisa: es la identidad dentro de la app.
    assert usuario.email == "juan@frro.utn.edu.ar"


def test_email_no_verificado_se_rechaza() -> None:
    """Sin `email_verified` no se puede vincular por email (toma de cuenta)."""
    db = _session()
    from dataclasses import replace

    with pytest.raises(EmailGoogleNoVerificado):
        auth_service.autenticar_con_google(db, replace(PERFIL, email_verificado=False))


def test_no_pisa_los_datos_que_el_usuario_cargo_a_mano() -> None:
    db = _session()
    previo = auth_service.registrar(
        db,
        email="juan@frro.utn.edu.ar",
        password="utnhub2026",
        nombre="Juancito",
        apellido="P.",
    )

    usuario = auth_service.autenticar_con_google(db, PERFIL)

    assert usuario.id == previo.id
    assert usuario.nombre == "Juancito"
    assert usuario.apellido == "P."
    # El avatar sí se toma de Google: no hay otra fuente.
    assert usuario.avatar_url == PERFIL.avatar_url


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
def test_config_refleja_si_hay_credenciales(credenciales) -> None:
    db = _session()
    assert _client(db).get("/auth/google/config").json() == {"habilitado": True}


def test_config_sin_credenciales_deshabilita_el_boton() -> None:
    db = _session()
    assert _client(db).get("/auth/google/config").json() == {"habilitado": False}


def test_autorizar_devuelve_la_url_de_google(credenciales) -> None:
    db = _session()
    res = _client(db).get(
        "/auth/google/autorizar",
        params={
            "redirect_uri": "http://localhost:3000/api/auth/google/callback",
            "state": "s1",
            "code_challenge": CHALLENGE,
        },
    )
    assert res.status_code == 200
    assert res.json()["url"].startswith(google_oauth.AUTORIZAR_URL)


def test_autorizar_sin_credenciales_da_503() -> None:
    db = _session()
    res = _client(db).get(
        "/auth/google/autorizar",
        params={
            "redirect_uri": "http://x/cb",
            "state": "s",
            "code_challenge": CHALLENGE,
        },
    )
    assert res.status_code == 503


def test_login_google_devuelve_token_y_usuario(
    credenciales, monkeypatch: pytest.MonkeyPatch
) -> None:
    db = _session()
    monkeypatch.setattr(
        google_oauth, "intercambiar_codigo", lambda **_: PERFIL
    )

    res = _client(db).post(
        "/auth/google",
        json={"code": "4/code-de-google", "redirect_uri": "http://x/cb", "code_verifier": VERIFIER},
    )

    assert res.status_code == 200
    datos = res.json()
    assert datos["token_type"] == "bearer"
    assert datos["usuario"]["email"] == "juan@frro.utn.edu.ar"
    assert "password" not in datos["usuario"]

    # El token emitido sirve para /auth/me, igual que el del login normal.
    me = _client(db).get(
        "/auth/me", headers={"Authorization": f"Bearer {datos['access_token']}"}
    )
    assert me.status_code == 200
    assert me.json()["id"] == datos["usuario"]["id"]


def test_login_google_con_code_invalido_da_401(
    credenciales, monkeypatch: pytest.MonkeyPatch
) -> None:
    db = _session()

    def _explota(**_):
        raise GoogleOAuthError("invalid_grant")

    monkeypatch.setattr(google_oauth, "intercambiar_codigo", _explota)

    res = _client(db).post(
        "/auth/google", json={"code": "vencido", "redirect_uri": "http://x/cb", "code_verifier": VERIFIER}
    )
    assert res.status_code == 401
    # El detalle técnico no se filtra al cliente.
    assert "invalid_grant" not in res.json()["detail"]


def test_login_google_con_email_no_verificado_da_403(
    credenciales, monkeypatch: pytest.MonkeyPatch
) -> None:
    db = _session()
    from dataclasses import replace

    monkeypatch.setattr(
        google_oauth,
        "intercambiar_codigo",
        lambda **_: replace(PERFIL, email_verificado=False),
    )

    res = _client(db).post(
        "/auth/google", json={"code": "x", "redirect_uri": "http://x/cb", "code_verifier": VERIFIER}
    )
    assert res.status_code == 403


def test_login_google_sin_credenciales_da_503() -> None:
    db = _session()
    res = _client(db).post(
        "/auth/google", json={"code": "x", "redirect_uri": "http://x/cb", "code_verifier": VERIFIER}
    )
    assert res.status_code == 503


# ---------------------------------------------------------------------------
# Restricción de dominio (RNF-04)
# ---------------------------------------------------------------------------
@pytest.fixture
def solo_institucional(monkeypatch: pytest.MonkeyPatch):
    """Prende la restricción de dominio, que por default está apagada."""
    monkeypatch.setattr(
        get_settings(), "google_dominios_permitidos", "frro.utn.edu.ar"
    )


def test_por_defecto_entra_cualquier_cuenta_de_google() -> None:
    """Se decidió NO restringir por dominio: un Gmail personal entra igual."""
    db = _session()
    from dataclasses import replace

    usuario = auth_service.autenticar_con_google(
        db, replace(PERFIL, email="juan@gmail.com", sub="sub-gmail")
    )
    assert usuario.email == "juan@gmail.com"


def test_cuenta_de_otro_dominio_se_rechaza(solo_institucional) -> None:
    """Con la restricción prendida, solo entran las cuentas institucionales."""
    db = _session()
    from dataclasses import replace

    with pytest.raises(DominioGoogleNoPermitido) as exc:
        auth_service.autenticar_con_google(
            db, replace(PERFIL, email="juan@gmail.com", sub="otro-sub")
        )

    # El motivo tiene que ser explícito: acá no hay nada que enumerar y sin el
    # dominio el usuario reintenta con la misma cuenta para siempre.
    assert "frro.utn.edu.ar" in str(exc.value)


def test_un_subdominio_parecido_no_alcanza(solo_institucional) -> None:
    """'frro.utn.edu.ar.evil.com' no puede colarse por terminar parecido."""
    db = _session()
    from dataclasses import replace

    with pytest.raises(DominioGoogleNoPermitido):
        auth_service.autenticar_con_google(
            db, replace(PERFIL, email="juan@frro.utn.edu.ar.evil.com", sub="x")
        )


def test_se_pueden_configurar_varios_dominios(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    db = _session()
    monkeypatch.setattr(
        get_settings(), "google_dominios_permitidos", "frro.utn.edu.ar, alumnos.utn.edu.ar"
    )
    from dataclasses import replace

    usuario = auth_service.autenticar_con_google(
        db, replace(PERFIL, email="juan@alumnos.utn.edu.ar", sub="sub-2")
    )
    assert usuario.id is not None


def test_login_google_con_dominio_ajeno_da_403(
    credenciales, solo_institucional, monkeypatch: pytest.MonkeyPatch
) -> None:
    db = _session()
    from dataclasses import replace

    monkeypatch.setattr(
        google_oauth,
        "intercambiar_codigo",
        lambda **_: replace(PERFIL, email="juan@gmail.com", sub="ajeno"),
    )

    res = _client(db).post(
        "/auth/google", json={"code": "x", "redirect_uri": "http://x/cb", "code_verifier": VERIFIER}
    )
    assert res.status_code == 403
    assert "frro.utn.edu.ar" in res.json()["detail"]


def test_login_google_sin_code_verifier_da_422(credenciales) -> None:
    """PKCE no es opcional: sin verifier el schema rechaza el request.

    Importa que sea 422 y no un login exitoso: si el campo fuera opcional,
    bastaria con omitirlo para degradar el flow a uno sin PKCE.
    """
    db = _session()
    res = _client(db).post(
        "/auth/google", json={"code": "x", "redirect_uri": "http://x/cb"}
    )
    assert res.status_code == 422
