"""Tests del buscador global (Frente 7 · T7.3)."""
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

from app.api import busqueda as busqueda_api  # noqa: E402
from app.db.models.academico import Comision, Materia  # noqa: E402
from app.db.models.novedad import Novedad  # noqa: E402
from app.db.models.profesor import Profesor  # noqa: E402
from app.db.session import get_db  # noqa: E402
from app.services import busqueda_service  # noqa: E402


def _session() -> Session:
    engine = create_engine(
        "sqlite://",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Materia.__table__.create(engine)
    Profesor.__table__.create(engine)
    Comision.__table__.create(engine)
    Novedad.__table__.create(engine)
    SessionLocal = sessionmaker(bind=engine, class_=Session, expire_on_commit=False)
    return SessionLocal()


def _materia(db: Session, codigo: str, nombre: str, anio: int | None = 1) -> Materia:
    m = Materia(codigo=codigo, nombre=nombre, anio_carrera=anio, tipo="troncal")
    db.add(m)
    return m


def _profesor(db: Session, nombre: str, email: str | None = None) -> Profesor:
    p = Profesor(nombre=nombre, email=email, nombre_key=nombre.lower())
    db.add(p)
    db.flush()
    return p


def _comision(db: Session, nombre: str, anio: int = 2026) -> Comision:
    c = Comision(nombre=nombre, anio=anio)
    db.add(c)
    db.flush()
    return c


def _novedad(db: Session, titulo: str, descripcion: str | None = None) -> Novedad:
    n = Novedad(
        titulo=titulo,
        descripcion=descripcion,
        estado="publicada",
        fecha_publicacion=datetime(2026, 8, 1, 12, 0),
    )
    db.add(n)
    db.flush()
    return n


# ---------------------------------------------------------------------------
# Matching
# ---------------------------------------------------------------------------
def test_ignora_acentos_y_mayusculas() -> None:
    """El caso que motiva filtrar en Python: nadie escribe los tildes."""
    db = _session()
    _materia(db, "082001", "Análisis Matemático I")
    db.commit()

    res = busqueda_service.buscar(db, "ANALISIS matematico")

    assert [m.titulo for m in res.materias] == ["Análisis Matemático I"]


def test_todos_los_tokens_tienen_que_matchear() -> None:
    """Buscar dos palabras acota; no puede comportarse como un OR."""
    db = _session()
    _materia(db, "082001", "Análisis Matemático I")
    _materia(db, "082010", "Química General")
    db.commit()

    assert busqueda_service.buscar(db, "analisis quimica").materias == []
    assert len(busqueda_service.buscar(db, "analisis matematico").materias) == 1


def test_prioriza_lo_que_empieza_con_la_consulta() -> None:
    """"mate" tiene que traer "Matemática Discreta" antes que "Análisis
    Matemático": el que arranca con lo escrito es el que se estaba buscando."""
    db = _session()
    _materia(db, "082001", "Análisis Matemático I")
    _materia(db, "082005", "Matemática Discreta")
    db.commit()

    res = busqueda_service.buscar(db, "matematica")

    assert [m.titulo for m in res.materias] == [
        "Matemática Discreta",
        "Análisis Matemático I",
    ]


def test_materia_tambien_se_encuentra_por_codigo() -> None:
    db = _session()
    _materia(db, "082042", "Diseño de Sistemas")
    db.commit()

    res = busqueda_service.buscar(db, "082042")

    assert [m.id for m in res.materias] == ["082042"]


def test_query_corta_no_devuelve_nada() -> None:
    """Con una sola letra matchea medio padrón: eso no es una respuesta."""
    db = _session()
    _materia(db, "082001", "Análisis Matemático I")
    db.commit()

    res = busqueda_service.buscar(db, "a")

    assert res.total == 0
    assert res.materias == []


def test_query_vacia_no_explota() -> None:
    """El frontend busca mientras se escribe: el string vacío es normal."""
    db = _session()
    _materia(db, "082001", "Análisis Matemático I")
    db.commit()

    assert busqueda_service.buscar(db, "   ").total == 0


# ---------------------------------------------------------------------------
# Agrupado y límites
# ---------------------------------------------------------------------------
def test_busca_en_los_cuatro_dominios() -> None:
    db = _session()
    _materia(db, "082042", "Sistemas Operativos")
    _profesor(db, "Sistemas, Juan", email="juan@frro.utn.edu.ar")
    _comision(db, "SISTEMAS-K01")
    _novedad(db, "Inscripción a Sistemas Operativos")
    db.commit()

    res = busqueda_service.buscar(db, "sistemas")

    assert len(res.materias) == 1
    assert len(res.profesores) == 1
    assert len(res.comisiones) == 1
    assert len(res.novedades) == 1
    assert res.total == 4


def test_limite_se_aplica_por_tipo() -> None:
    """Un dominio con muchos matches no puede desplazar a los otros."""
    db = _session()
    for i in range(10):
        _materia(db, f"08200{i}", f"Sistemas {i}")
    _profesor(db, "Sistemas, Juan")
    db.commit()

    res = busqueda_service.buscar(db, "sistemas", limite_por_tipo=3)

    assert len(res.materias) == 3
    assert len(res.profesores) == 1


def test_profesor_sin_nombre_no_rompe_la_busqueda() -> None:
    """El padrón tiene ``nombre`` nullable; una fila así no puede tirar todo."""
    db = _session()
    p = Profesor(nombre=None, email=None, nombre_key="vacio")
    db.add(p)
    _profesor(db, "Perez, Ana")
    db.commit()

    res = busqueda_service.buscar(db, "perez")

    assert [p.titulo for p in res.profesores] == ["Perez, Ana"]


def test_novedad_no_publicada_no_aparece() -> None:
    """Lo que la ingesta descartó no se busca: nunca fue público."""
    db = _session()
    n = Novedad(titulo="Borrador de paro", estado="pendiente")
    db.add(n)
    db.commit()

    assert busqueda_service.buscar(db, "paro").novedades == []


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------
def _client(db: Session) -> TestClient:
    app = FastAPI()
    app.include_router(busqueda_api.router)

    def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    return TestClient(app)


def test_endpoint_no_pide_sesion() -> None:
    """El buscador de la barra también existe para el visitante sin cuenta.

    Si pidiera token, el control volvería a ser decorativo justo para quien
    más lo necesita — que es lo que el frente vino a arreglar.
    """
    db = _session()
    _materia(db, "082042", "Diseño de Sistemas")
    db.commit()

    res = _client(db).get("/buscar?q=diseno")

    assert res.status_code == 200
    assert [m["titulo"] for m in res.json()["materias"]] == ["Diseño de Sistemas"]


def test_endpoint_sin_q_devuelve_vacio() -> None:
    db = _session()
    res = _client(db).get("/buscar")

    assert res.status_code == 200
    assert res.json()["total"] == 0


# ---------------------------------------------------------------------------
# Match aproximado (género y número)
# ---------------------------------------------------------------------------
def test_encuentra_pese_a_la_variacion_de_genero() -> None:
    """"matematica" tiene que encontrar "Matemático": es lo que uno escribe."""
    db = _session()
    _materia(db, "082001", "Análisis Matemático I")
    db.commit()

    assert [m.id for m in busqueda_service.buscar(db, "matematica").materias] == [
        "082001"
    ]


def test_el_match_exacto_le_gana_al_aproximado() -> None:
    """El aproximado es red de contención, no puede reordenar lo exacto."""
    db = _session()
    _materia(db, "082001", "Análisis Matemático I")
    _materia(db, "082005", "Matemática Discreta")
    db.commit()

    res = busqueda_service.buscar(db, "matematica")

    assert [m.titulo for m in res.materias] == [
        "Matemática Discreta",
        "Análisis Matemático I",
    ]


def test_el_aproximado_no_empareja_palabras_distintas() -> None:
    """El umbral tiene que cortar antes de que el buscador invente parecidos."""
    db = _session()
    _materia(db, "082001", "Análisis Matemático I")
    _materia(db, "082020", "Economía")
    db.commit()

    assert busqueda_service.buscar(db, "quimica").materias == []
    assert busqueda_service.buscar(db, "ingenieria").materias == []


def test_tokens_cortos_no_van_por_aproximado() -> None:
    """Con cuatro letras el parecido es ruido: ahí sólo vale el match exacto."""
    db = _session()
    _materia(db, "082020", "Economía")
    db.commit()

    # "econo" es prefijo real y entra; "eleco" sólo se le parece y no.
    assert len(busqueda_service.buscar(db, "econo").materias) == 1
    assert busqueda_service.buscar(db, "eleco").materias == []


def test_la_materia_informa_su_tipo_para_armar_el_link() -> None:
    """El grafo del frontend se abre por tipo: una electiva no está en el de
    troncales, así que el link tiene que saber a cuál de los dos ir."""
    db = _session()
    db.add(Materia(codigo="E03", nombre="Robótica", anio_carrera=2, tipo="electiva"))
    _materia(db, "082042", "Diseño de Sistemas")
    db.commit()

    electiva = busqueda_service.buscar(db, "robotica").materias[0]
    troncal = busqueda_service.buscar(db, "diseno").materias[0]

    assert electiva.tipo_materia == "electiva"
    assert troncal.tipo_materia == "troncal"


def test_tipo_desconocido_no_rompe_el_schema() -> None:
    """``Materia.tipo`` es texto libre en la DB; un valor raro no puede tirar
    un 500 en el buscador."""
    db = _session()
    db.add(Materia(codigo="X01", nombre="Rara", anio_carrera=1, tipo="otra-cosa"))
    db.commit()

    assert busqueda_service.buscar(db, "rara").materias[0].tipo_materia is None


def test_comisiones_homonimas_se_distinguen_por_id() -> None:
    """"1K01" existe una vez por año académico: si el resultado se
    identificara por nombre, el frontend no podría saber a cuál abrir."""
    db = _session()
    _comision(db, "1K01", anio=2025)
    _comision(db, "1K01", anio=2026)
    db.commit()

    res = busqueda_service.buscar(db, "1k01")

    assert len(res.comisiones) == 2
    assert len({c.id for c in res.comisiones}) == 2
    assert {c.detalle for c in res.comisiones} == {"Comisión 2025", "Comisión 2026"}
