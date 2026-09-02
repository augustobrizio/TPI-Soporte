"""Tests del panel de notificaciones (Frente 7 · T7.4).

Lo que se prueba acá es la definición de "nuevo", que es lo único que la
campana tiene para decir. La versión anterior del control tenía el puntito
pintado en el markup: avisaba siempre, de nada. Estos tests fijan cuándo
avisa y cuándo se calla.
"""
from __future__ import annotations

import os
import sys
from datetime import datetime, timedelta
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api import notificaciones as notificaciones_api  # noqa: E402
from app.api.deps import get_current_user  # noqa: E402
from app.db.models.calendario import EventoCalendario  # noqa: E402
from app.db.models.novedad import Novedad  # noqa: E402
from app.db.models.usuario import Usuario  # noqa: E402
from app.db.session import get_db  # noqa: E402
from app.services import notificacion_service  # noqa: E402

AHORA = datetime.now()


def _session() -> Session:
    engine = create_engine(
        "sqlite://",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Usuario.__table__.create(engine)
    Novedad.__table__.create(engine)
    EventoCalendario.__table__.create(engine)
    SessionLocal = sessionmaker(bind=engine, class_=Session, expire_on_commit=False)
    return SessionLocal()


def _usuario(
    db: Session,
    *,
    vistas_at: datetime | None = None,
    created_at: datetime | None = None,
) -> Usuario:
    u = Usuario(
        email="alumno@frro.utn.edu.ar",
        notificaciones_vistas_at=vistas_at,
        created_at=created_at or (AHORA - timedelta(days=365)),
    )
    db.add(u)
    db.flush()
    return u


def _novedad(
    db: Session,
    titulo: str,
    fecha: datetime,
    *,
    ingestada: datetime | None = None,
) -> Novedad:
    """``fecha`` es la de publicación; ``ingestada`` cuándo la trajo el pipeline.

    Por default se ingesta hace una hora: el caso normal es que la novedad
    entre poco después de publicarse, y ahí la que manda es ``fecha``.
    """
    n = Novedad(
        titulo=titulo,
        estado="publicada",
        fecha_publicacion=fecha,
        created_at=ingestada or (AHORA - timedelta(hours=1)),
    )
    db.add(n)
    db.flush()
    return n


def _evento(
    db: Session, titulo: str, cuando: datetime, tipo: str = "mesa"
) -> EventoCalendario:
    e = EventoCalendario(
        titulo=titulo,
        fecha_inicio=cuando,
        tipo=tipo,
        carrera="ISI",
        content_hash=f"hash-{titulo}",
    )
    db.add(e)
    db.flush()
    return e


# ---------------------------------------------------------------------------
# Novedades: semántica de "no leído"
# ---------------------------------------------------------------------------
def test_novedad_posterior_a_la_ultima_visita_es_nueva() -> None:
    db = _session()
    usuario = _usuario(db, vistas_at=AHORA - timedelta(days=2))
    _novedad(db, "Paro de mañana", AHORA - timedelta(hours=3))
    db.commit()

    res = notificacion_service.resumen(db, usuario)

    assert res.nuevas == 1
    assert [n.titulo for n in res.novedades if n.nueva] == ["Paro de mañana"]


def test_novedad_anterior_a_la_ultima_visita_no_es_nueva() -> None:
    """Se sigue mostrando en el panel, pero no enciende la campana."""
    db = _session()
    usuario = _usuario(db, vistas_at=AHORA - timedelta(days=2))
    _novedad(db, "Aviso viejo", AHORA - timedelta(days=5))
    db.commit()

    res = notificacion_service.resumen(db, usuario)

    assert res.nuevas == 0
    assert [n.titulo for n in res.novedades] == ["Aviso viejo"]
    assert res.novedades[0].nueva is False


def test_sin_visita_previa_la_linea_de_corte_es_la_creacion_de_la_cuenta() -> None:
    """Una cuenta recién hecha no estrena la campana con el histórico."""
    db = _session()
    usuario = _usuario(db, vistas_at=None, created_at=AHORA - timedelta(days=1))
    _novedad(db, "De antes de registrarse", AHORA - timedelta(days=10))
    _novedad(db, "De después de registrarse", AHORA - timedelta(hours=2))
    db.commit()

    res = notificacion_service.resumen(db, usuario)

    assert res.nuevas == 1
    assert [n.titulo for n in res.novedades if n.nueva] == ["De después de registrarse"]


def test_novedad_no_publicada_no_notifica() -> None:
    db = _session()
    usuario = _usuario(db, vistas_at=AHORA - timedelta(days=2))
    db.add(Novedad(titulo="Descartada", estado="descartada", fecha_publicacion=AHORA))
    db.commit()

    assert notificacion_service.resumen(db, usuario).novedades == []


# ---------------------------------------------------------------------------
# Mesas: semántica de "se acerca"
# ---------------------------------------------------------------------------
def test_mesa_dentro_de_la_ventana_aparece_con_los_dias_que_faltan() -> None:
    db = _session()
    usuario = _usuario(db, vistas_at=AHORA - timedelta(days=1))
    _evento(db, "Mesa de Análisis", AHORA + timedelta(days=3))
    db.commit()

    res = notificacion_service.resumen(db, usuario)

    assert [m.titulo for m in res.mesas] == ["Mesa de Análisis"]
    assert res.mesas[0].dias_restantes == 3


def test_mesa_fuera_de_la_ventana_no_aparece() -> None:
    """Avisar con un mes de anticipación es tener la campana prendida siempre."""
    db = _session()
    usuario = _usuario(db, vistas_at=AHORA - timedelta(days=1))
    _evento(db, "Mesa lejana", AHORA + timedelta(days=30))
    db.commit()

    assert notificacion_service.resumen(db, usuario).mesas == []


def test_mesa_que_recien_entro_en_la_ventana_cuenta_como_nueva() -> None:
    """La última vez que miró faltaban 10 días; ahora faltan 5: es nuevo."""
    db = _session()
    usuario = _usuario(db, vistas_at=AHORA - timedelta(days=5))
    _evento(db, "Mesa de Física", AHORA + timedelta(days=5))
    db.commit()

    res = notificacion_service.resumen(db, usuario)

    assert res.mesas[0].nueva is True
    assert res.nuevas == 1


def test_mesa_que_ya_estaba_en_la_ventana_no_vuelve_a_avisar() -> None:
    """Miró hace una hora con la mesa ya dentro de la ventana: no hay nada nuevo."""
    db = _session()
    usuario = _usuario(db, vistas_at=AHORA - timedelta(hours=1))
    _evento(db, "Mesa de Física", AHORA + timedelta(days=5))
    db.commit()

    res = notificacion_service.resumen(db, usuario)

    assert res.mesas[0].nueva is False
    assert res.nuevas == 0


def test_solo_notifican_mesas_y_examenes() -> None:
    """Feriados, TPs y eventos están en el calendario; no ameritan interrumpir."""
    db = _session()
    usuario = _usuario(db, vistas_at=AHORA - timedelta(days=5))
    _evento(db, "Feriado", AHORA + timedelta(days=2), tipo="feriado")
    _evento(db, "Charla", AHORA + timedelta(days=2), tipo="evento")
    _evento(db, "Final de Química", AHORA + timedelta(days=2), tipo="examen")
    db.commit()

    res = notificacion_service.resumen(db, usuario)

    assert [m.titulo for m in res.mesas] == ["Final de Química"]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
def _client(db: Session, usuario: Usuario | None) -> TestClient:
    app = FastAPI()
    app.include_router(notificaciones_api.router)

    def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    if usuario is not None:
        app.dependency_overrides[get_current_user] = lambda: usuario
    return TestClient(app)


def test_endpoint_requiere_sesion() -> None:
    """Sin saber quién pregunta no hay "nuevo" que calcular."""
    db = _session()
    res = _client(db, None).get("/notificaciones")

    assert res.status_code == 401


def test_marcar_visto_apaga_el_contador() -> None:
    db = _session()
    usuario = _usuario(db, vistas_at=AHORA - timedelta(days=2))
    _novedad(db, "Paro de mañana", AHORA - timedelta(hours=3))
    db.commit()
    client = _client(db, usuario)

    assert client.get("/notificaciones").json()["nuevas"] == 1

    res = client.post("/notificaciones/visto")

    assert res.status_code == 200
    # La respuesta del POST ya viene apagada: el frontend no necesita un GET más.
    assert res.json()["nuevas"] == 0
    assert client.get("/notificaciones").json()["nuevas"] == 0


def test_marcar_visto_persiste_la_marca() -> None:
    db = _session()
    usuario = _usuario(db, vistas_at=None)
    db.commit()

    _client(db, usuario).post("/notificaciones/visto")

    assert usuario.notificaciones_vistas_at is not None


def test_novedad_fechada_en_el_futuro_deja_de_avisar_una_vez_vista() -> None:
    """La ingesta fecha los avisos con la fecha del evento anunciado, así que
    hay novedades con `fecha_publicacion` futura. Comparando la fecha cruda,
    esas seguían contando como nuevas en cada apertura hasta que llegara el
    día: la campana volvía a avisar siempre."""
    db = _session()
    usuario = _usuario(db, vistas_at=AHORA - timedelta(days=2))
    # Ingestada hace tres horas, anunciando algo de dentro de dos semanas.
    _novedad(
        db,
        "Curso que arranca el mes que viene",
        AHORA + timedelta(days=13),
        ingestada=AHORA - timedelta(hours=3),
    )
    db.commit()

    # Antes de mirarla: es nueva, como cualquier novedad reciente.
    assert notificacion_service.resumen(db, usuario).nuevas == 1

    # Después de mirarla, deja de avisar — aunque su fecha siga en el futuro.
    notificacion_service.marcar_vistas(db, usuario)
    res = notificacion_service.resumen(db, usuario)

    assert res.nuevas == 0
    # Pero se sigue mostrando con su fecha real, que es la información útil.
    assert res.novedades[0].fecha is not None
    assert res.novedades[0].fecha > AHORA


def test_backfill_de_contenido_viejo_no_inunda_la_campana() -> None:
    """Un posteo de hace dos años ingestado hoy no es novedad de hoy: la
    fecha que vale es la del contenido, no la de cuándo lo scrapeamos."""
    db = _session()
    usuario = _usuario(db, vistas_at=AHORA - timedelta(days=2))
    _novedad(
        db,
        "Posteo de 2024",
        AHORA - timedelta(days=700),
        ingestada=AHORA - timedelta(minutes=5),
    )
    db.commit()

    assert notificacion_service.resumen(db, usuario).nuevas == 0
