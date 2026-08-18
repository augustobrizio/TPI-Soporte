from __future__ import annotations

import os
import sys
from datetime import datetime, timedelta
from pathlib import Path
from types import SimpleNamespace

import fitz
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api import calendario as calendario_api  # noqa: E402
from app.api.deps import get_current_user  # noqa: E402
from app.db.models.calendario import EventoCalendario  # noqa: E402
from app.db.session import get_db  # noqa: E402
from app.repositories import calendario_repo  # noqa: E402
from app.scrapers import calendario as calendario_scraper  # noqa: E402


def _session() -> Session:
    engine = create_engine(
        "sqlite://",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    EventoCalendario.__table__.create(engine)
    SessionLocal = sessionmaker(bind=engine, class_=Session, expire_on_commit=False)
    return SessionLocal()


def test_extraer_links_fuente_detecta_pdf_y_drive() -> None:
    html = """
    <a href="/repositorio/calendario.pdf">Calendario Academico</a>
    <a href="https://drive.google.com/file/d/abc/view">Resolucion calendario</a>
    <a href="/contacto.php">Contacto</a>
    """

    links = calendario_scraper.extraer_links_fuente(
        html,
        "https://www.frro.utn.edu.ar/contenido.php?cont=350&subc=26",
    )

    assert links == [
        "https://www.frro.utn.edu.ar/repositorio/calendario.pdf",
        "https://drive.google.com/file/d/abc/view",
    ]


def test_parsear_texto_eventos_clasifica_y_deduplica() -> None:
    texto = """
    25/05/2026 Feriado nacional
    Inscripcion a finales del 01/06/2026 al 04/06/2026
    25/05/2026 Feriado nacional
    """

    eventos = calendario_scraper.parsear_texto_eventos(
        texto,
        fuente_url="https://www.frro.utn.edu.ar/calendario.pdf",
        carrera="ISI",
    )

    assert len(eventos) == 2
    assert eventos[0].tipo == "feriado"
    assert eventos[0].fecha_inicio == datetime(2026, 5, 25)
    # Las inscripciones ahora se clasifican como eventos institucionales.
    assert eventos[1].tipo == "evento"
    assert eventos[1].fecha_fin == datetime(2026, 6, 4)


def test_parsear_pdf_con_fixture_minimo() -> None:
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text(
        (72, 72),
        "Calendario Academico 2026\n01/05/2026 Feriado nacional\n",
    )
    pdf_bytes = doc.tobytes()
    doc.close()

    eventos = calendario_scraper.parsear_pdf(
        pdf_bytes,
        fuente_url="https://www.frro.utn.edu.ar/calendario.pdf",
        carrera="ISI",
    )

    assert len(eventos) == 1
    assert eventos[0].tipo == "feriado"
    assert eventos[0].titulo == "Feriado nacional"


def test_upsert_evento_deduplica_por_content_hash() -> None:
    db = _session()

    kwargs = dict(
        titulo="Feriado nacional",
        descripcion=None,
        fecha_inicio=datetime(2026, 5, 25),
        fecha_fin=None,
        tipo="feriado",
        carrera="ISI",
        fuente_url="https://www.frro.utn.edu.ar/calendario.pdf",
        content_hash="abc",
    )

    _evento, estado_1 = calendario_repo.upsert_evento(db, **kwargs)
    _evento, estado_2 = calendario_repo.upsert_evento(db, **kwargs)

    assert estado_1 == "creado"
    assert estado_2 == "sin_cambios"
    assert len(calendario_repo.listar_eventos(db, carrera="ISI")) == 1


def test_listar_eventos_incluye_eventos_que_se_solapan_con_rango() -> None:
    db = _session()
    calendario_repo.upsert_evento(
        db,
        titulo="Inscripcion por Equivalencias",
        descripcion=None,
        fecha_inicio=datetime(2026, 5, 4),
        fecha_fin=datetime(2026, 9, 11),
        tipo="evento",
        carrera="ISI",
        fuente_url=None,
        content_hash="equivalencias",
    )
    db.commit()

    eventos = calendario_repo.listar_eventos(
        db,
        desde=datetime(2026, 9, 1),
        hasta=datetime(2026, 9, 30),
        carrera="ISI",
    )

    assert [evento.titulo for evento in eventos] == ["Inscripcion por Equivalencias"]


def test_proximos_endpoint_limita_y_ordena() -> None:
    db = _session()
    ahora = datetime.now()
    for idx in range(8):
        calendario_repo.upsert_evento(
            db,
            titulo=f"Evento {idx}",
            descripcion=None,
            fecha_inicio=ahora + timedelta(days=idx + 1),
            fecha_fin=None,
            tipo="evento",
            carrera="ISI",
            fuente_url=None,
            content_hash=f"h{idx}",
        )
    db.commit()

    app = FastAPI()
    app.include_router(calendario_api.router)

    def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    # El endpoint ahora requiere usuario autenticado; simulamos uno.
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=1)
    client = TestClient(app)

    res = client.get("/calendario/proximos?limite=5&carrera=ISI")

    assert res.status_code == 200
    data = res.json()
    assert len(data) == 5
    assert [item["titulo"] for item in data] == [f"Evento {idx}" for idx in range(5)]
