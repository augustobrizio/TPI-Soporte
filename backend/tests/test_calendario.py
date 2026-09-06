from __future__ import annotations

import os
import sys
from datetime import date, datetime, timedelta
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
from app.api.deps import get_current_user_opcional  # noqa: E402
from app.db.models.calendario import EstadoDia, EventoCalendario  # noqa: E402
from app.db.session import get_db  # noqa: E402
from app.repositories import calendario_repo  # noqa: E402
from app.services import calendario_service  # noqa: E402
from app.scrapers import calendario as calendario_scraper  # noqa: E402


def _session() -> Session:
    """Sesión con las dos tablas del calendario.

    `estado_dia` va siempre, aunque el test no la use: `estado_semana` la
    consulta para aplicar los overrides, y sin la tabla falla toda la lectura.
    """
    engine = create_engine(
        "sqlite://",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    EventoCalendario.__table__.create(engine)
    EstadoDia.__table__.create(engine)
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
    # La lectura es publica, pero suma los eventos propios si hay sesion.
    app.dependency_overrides[get_current_user_opcional] = lambda: SimpleNamespace(id=1)
    client = TestClient(app)

    res = client.get("/calendario/proximos?limite=5&carrera=ISI")

    assert res.status_code == 200
    data = res.json()
    assert len(data) == 5
    assert [item["titulo"] for item in data] == [f"Evento {idx}" for idx in range(5)]


def _app_calendario(db: Session, usuario_id: int | None) -> TestClient:
    """App minima con el router del calendario y la sesion que se le indique."""
    app = FastAPI()
    app.include_router(calendario_api.router)

    def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user_opcional] = (
        lambda: SimpleNamespace(id=usuario_id) if usuario_id is not None else None
    )
    return TestClient(app)


def test_listar_eventos_es_publico_y_esconde_los_personales() -> None:
    """Sin sesion: 200 con el calendario de la facultad, sin lo de nadie mas.

    El middleware del frontend declara el calendario como seccion publica; si
    el backend pide token, el visitante se come un 401 y ve la pantalla vacia.
    """
    db = _session()
    calendario_repo.upsert_evento(
        db,
        titulo="Inicio de clases",
        descripcion=None,
        fecha_inicio=datetime.now() + timedelta(days=3),
        fecha_fin=None,
        tipo="evento",
        carrera="ISI",
        fuente_url=None,
        content_hash="compartido-1",
    )
    calendario_repo.crear_evento_usuario(
        db,
        usuario_id=7,
        titulo="Parcial de Analisis",
        descripcion=None,
        fecha_inicio=datetime.now() + timedelta(days=4),
        fecha_fin=None,
        tipo="examen",
    )
    db.commit()

    anonimo = _app_calendario(db, usuario_id=None).get("/calendario")

    assert anonimo.status_code == 200
    assert [e["titulo"] for e in anonimo.json()] == ["Inicio de clases"]


def test_listar_eventos_con_sesion_suma_los_propios() -> None:
    db = _session()
    calendario_repo.upsert_evento(
        db,
        titulo="Inicio de clases",
        descripcion=None,
        fecha_inicio=datetime.now() + timedelta(days=3),
        fecha_fin=None,
        tipo="evento",
        carrera="ISI",
        fuente_url=None,
        content_hash="compartido-1",
    )
    calendario_repo.crear_evento_usuario(
        db,
        usuario_id=7,
        titulo="Parcial de Analisis",
        descripcion=None,
        fecha_inicio=datetime.now() + timedelta(days=4),
        fecha_fin=None,
        tipo="examen",
    )
    db.commit()

    propios = _app_calendario(db, usuario_id=7).get("/calendario").json()
    ajenos = _app_calendario(db, usuario_id=8).get("/calendario").json()

    assert [e["titulo"] for e in propios] == ["Inicio de clases", "Parcial de Analisis"]
    assert [e["titulo"] for e in ajenos] == ["Inicio de clases"]


def test_crear_evento_sigue_exigiendo_sesion() -> None:
    """Lo publico es leer. Agendar algo propio necesita cuenta (401, no 200)."""
    db = _session()
    app = FastAPI()
    app.include_router(calendario_api.router)

    def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    res = TestClient(app).post(
        "/calendario/eventos",
        json={
            "titulo": "Parcial",
            "fecha_inicio": datetime.now().isoformat(),
            "tipo": "examen",
        },
    )

    assert res.status_code == 401


# ---------------------------------------------------------------------------
# Estado de cursada de la semana
# ---------------------------------------------------------------------------
#
# La regla del negocio: en FRRO una mesa de examen y un feriado suspenden la
# cursada; el inicio de cuatrimestre es simbólico y no la toca.

#: Lunes fijo, para que los tests no dependan de qué día se corran.
_LUNES = date(2026, 9, 7)


def _evento_sistema(db, *, titulo, dia, tipo, hasta=None, hash_):
    calendario_repo.upsert_evento(
        db,
        titulo=titulo,
        descripcion=None,
        fecha_inicio=datetime.combine(dia, datetime.min.time()),
        fecha_fin=datetime.combine(hasta, datetime.min.time()) if hasta else None,
        tipo=tipo,
        carrera="ISI",
        fuente_url=None,
        content_hash=hash_,
    )


def test_semana_devuelve_lunes_a_viernes() -> None:
    db = _session()
    semana = calendario_service.estado_semana(db, lunes=_LUNES)

    assert semana.lunes == _LUNES
    assert [d.fecha for d in semana.dias] == [
        date(2026, 9, 7), date(2026, 9, 8), date(2026, 9, 9),
        date(2026, 9, 10), date(2026, 9, 11),
    ]
    # Semana sin nada publicado: se cursa toda.
    assert all(d.se_cursa for d in semana.dias)
    assert all(d.motivo is None for d in semana.dias)


def test_mesa_y_feriado_suspenden_la_cursada() -> None:
    db = _session()
    _evento_sistema(db, titulo="Mesa de Examen", dia=date(2026, 9, 7), tipo="mesa", hash_="m1")
    _evento_sistema(db, titulo="Dia del Estudiante", dia=date(2026, 9, 11), tipo="feriado", hash_="f1")
    db.commit()

    dias = calendario_service.estado_semana(db, lunes=_LUNES).dias

    assert [d.se_cursa for d in dias] == [False, True, True, True, False]
    assert dias[0].motivo == "Mesa de Examen"
    assert dias[4].motivo == "Dia del Estudiante"


def test_inicio_de_cuatrimestre_no_suspende_la_cursada() -> None:
    """Es simbólico: ese día se cursa igual."""
    db = _session()
    _evento_sistema(
        db, titulo="Inicio del 2do Cuatrimestre", dia=date(2026, 9, 9), tipo="evento", hash_="e1"
    )
    db.commit()

    dia = calendario_service.estado_semana(db, lunes=_LUNES).dias[2]

    assert dia.se_cursa is True
    assert dia.motivo is None
    assert [e.titulo for e in dia.eventos] == ["Inicio del 2do Cuatrimestre"]


def test_receso_publicado_como_evento_igual_suspende() -> None:
    """El scraper solo tipa `feriado` por feriado/asueto/sin actividad."""
    db = _session()
    _evento_sistema(
        db, titulo="Receso invernal", dia=date(2026, 9, 8), tipo="evento", hash_="r1"
    )
    db.commit()

    dia = calendario_service.estado_semana(db, lunes=_LUNES).dias[1]

    assert dia.se_cursa is False
    assert dia.motivo == "Receso invernal"


def test_feriado_de_varios_dias_cubre_todo_el_rango() -> None:
    db = _session()
    _evento_sistema(
        db,
        titulo="Semana de mesas",
        dia=date(2026, 9, 8),
        hasta=date(2026, 9, 10),
        tipo="feriado",
        hash_="f2",
    )
    db.commit()

    dias = calendario_service.estado_semana(db, lunes=_LUNES).dias

    assert [d.se_cursa for d in dias] == [True, False, False, False, True]


def test_el_feriado_le_gana_a_la_mesa_como_motivo() -> None:
    """Si el día es feriado, eso explica también por qué no hay mesa."""
    db = _session()
    _evento_sistema(db, titulo="Mesa de Examen", dia=date(2026, 9, 7), tipo="mesa", hash_="m2")
    _evento_sistema(db, titulo="Feriado nacional", dia=date(2026, 9, 7), tipo="feriado", hash_="f3")
    db.commit()

    dia = calendario_service.estado_semana(db, lunes=_LUNES).dias[0]

    assert dia.se_cursa is False
    assert dia.motivo == "Feriado nacional"


def test_el_examen_propio_del_alumno_no_suspende_la_cursada() -> None:
    """Que vos rindas no cancela las clases: el día se cursa igual."""
    db = _session()
    calendario_repo.crear_evento_usuario(
        db,
        usuario_id=3,
        titulo="Parcial de Analisis",
        descripcion=None,
        fecha_inicio=datetime(2026, 9, 9, 18, 0),
        fecha_fin=None,
        tipo="examen",
    )
    db.commit()

    dia = calendario_service.estado_semana(db, lunes=_LUNES, usuario_id=3).dias[2]

    assert dia.se_cursa is True
    assert dia.motivo is None
    assert [e.titulo for e in dia.eventos] == ["Parcial de Analisis"]


def test_la_semana_no_filtra_los_eventos_de_otro_alumno() -> None:
    db = _session()
    calendario_repo.crear_evento_usuario(
        db,
        usuario_id=3,
        titulo="Parcial de Analisis",
        descripcion=None,
        fecha_inicio=datetime(2026, 9, 9, 18, 0),
        fecha_fin=None,
        tipo="examen",
    )
    db.commit()

    anonimo = calendario_service.estado_semana(db, lunes=_LUNES).dias[2]
    ajeno = calendario_service.estado_semana(db, lunes=_LUNES, usuario_id=99).dias[2]

    assert anonimo.eventos == []
    assert ajeno.eventos == []


def test_sin_lunes_toma_la_semana_que_corresponde_hoy() -> None:
    db = _session()
    semana = calendario_service.estado_semana(db)

    esperado = calendario_service.semana_a_mostrar(calendario_service.hoy_en_frro())
    assert semana.lunes == esperado
    assert semana.lunes.weekday() == 0
    assert len(semana.dias) == 5


def test_entre_semana_se_muestra_la_semana_en_curso() -> None:
    # Miércoles 9 de septiembre de 2026.
    assert calendario_service.semana_a_mostrar(date(2026, 9, 9)) == date(2026, 9, 7)


def test_el_fin_de_semana_se_muestra_la_semana_que_arranca() -> None:
    """El sábado, la semana que termina ya no le sirve a nadie."""
    sabado = date(2026, 9, 5)
    domingo = date(2026, 9, 6)
    viernes = date(2026, 9, 4)

    # El viernes todavía se muestra su propia semana...
    assert calendario_service.semana_a_mostrar(viernes) == date(2026, 8, 31)
    # ...y desde el sábado, la siguiente.
    assert calendario_service.semana_a_mostrar(sabado) == date(2026, 9, 7)
    assert calendario_service.semana_a_mostrar(domingo) == date(2026, 9, 7)


def test_un_lunes_explicito_se_respeta_tal_cual() -> None:
    """Navegar a una semana pasada no la corrige a la de hoy."""
    db = _session()
    semana = calendario_service.estado_semana(db, lunes=date(2026, 8, 31))

    assert semana.lunes == date(2026, 8, 31)


def test_cualquier_dia_de_la_semana_ancla_en_su_lunes() -> None:
    db = _session()
    # Un jueves: el panel igual arranca el lunes de esa semana.
    semana = calendario_service.estado_semana(db, lunes=date(2026, 9, 10))

    assert semana.lunes == date(2026, 9, 7)


# ---------------------------------------------------------------------------
# Override manual del estado de un día (admin)
# ---------------------------------------------------------------------------
#
# Lo que la facultad no publica como evento —un paro, una asamblea— igual
# suspende la cursada, y el calendario no se entera.


def test_el_override_suspende_un_dia_que_el_calendario_da_por_normal() -> None:
    db = _session()
    calendario_service.definir_estado_dia(
        db,
        fecha=date(2026, 9, 9),
        se_cursa=False,
        motivo="Paro",
        detalle="Paro de 24 h de la federación docente.",
        usuario_id=1,
    )
    db.commit()

    dia = calendario_service.estado_semana(db, lunes=_LUNES).dias[2]

    assert dia.se_cursa is False
    assert dia.motivo == "Paro"
    assert dia.detalle == "Paro de 24 h de la federación docente."
    assert dia.intervenido_por == "admin"


def test_el_override_puede_devolverle_la_cursada_a_un_dia() -> None:
    """Al revés: un feriado mal detectado se corrige sin tocar la ingesta."""
    db = _session()
    _evento_sistema(
        db, titulo="Feriado dudoso", dia=date(2026, 9, 8), tipo="feriado", hash_="fd"
    )
    calendario_service.definir_estado_dia(
        db,
        fecha=date(2026, 9, 8),
        se_cursa=True,
        motivo=None,
        detalle=None,
        usuario_id=1,
    )
    db.commit()

    dia = calendario_service.estado_semana(db, lunes=_LUNES).dias[1]

    assert dia.se_cursa is True
    assert dia.intervenido_por == "admin"


def test_borrar_el_override_devuelve_el_dia_al_calendario() -> None:
    db = _session()
    _evento_sistema(
        db, titulo="Mesa de Examen", dia=date(2026, 9, 7), tipo="mesa", hash_="mm"
    )
    calendario_service.definir_estado_dia(
        db, fecha=date(2026, 9, 7), se_cursa=True, motivo=None, detalle=None, usuario_id=1
    )
    db.commit()
    assert calendario_service.estado_semana(db, lunes=_LUNES).dias[0].se_cursa is True

    assert calendario_service.borrar_estado_dia(db, date(2026, 9, 7)) is True
    db.commit()

    dia = calendario_service.estado_semana(db, lunes=_LUNES).dias[0]
    assert dia.se_cursa is False
    assert dia.motivo == "Mesa de Examen"
    assert dia.intervenido_por is None


def test_definir_el_mismo_dia_dos_veces_pisa_en_vez_de_duplicar() -> None:
    db = _session()
    calendario_service.definir_estado_dia(
        db, fecha=date(2026, 9, 10), se_cursa=False, motivo="Paro", detalle=None, usuario_id=1
    )
    calendario_service.definir_estado_dia(
        db, fecha=date(2026, 9, 10), se_cursa=False, motivo="Asamblea", detalle=None, usuario_id=2
    )
    db.commit()

    estados = calendario_service.listar_estados_dia(
        db, desde=date(2026, 9, 7), hasta=date(2026, 9, 11)
    )
    assert len(estados) == 1
    assert estados[0].motivo == "Asamblea"


def test_el_dia_sin_override_no_dice_estar_intervenido() -> None:
    db = _session()
    dia = calendario_service.estado_semana(db, lunes=_LUNES).dias[0]

    assert dia.intervenido_por is None
    assert dia.detalle is None
