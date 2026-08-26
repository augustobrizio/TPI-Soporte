"""Tests de la regla de negocio: resolucion docente -> profesor de una cursada.

Corre sobre SQLite in-memory (no toca la DB compartida). El modelo ``Cursada``
incluye ``profesor_id``, asi que ``create_all`` genera la columna aunque la
migracion todavia no este aplicada en Neon.
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

from app.api import comisiones as comisiones_api  # noqa: E402
from app.db.models.academico import Comision, Cursada, Horario, Materia  # noqa: E402
from app.db.models.profesor import MateriaProfesor, Profesor  # noqa: E402
from app.db.models.resena_alumno import ResenaAlumno  # noqa: E402
from app.db.models.review import ReviewCatedra  # noqa: E402
from app.db.session import get_db  # noqa: E402
from app.services import cursada_profesor_service as svc  # noqa: E402


def _session() -> Session:
    engine = create_engine(
        "sqlite://",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    for model in (Materia, Profesor, Comision, MateriaProfesor, Cursada, Horario, ReviewCatedra, ResenaAlumno):
        model.__table__.create(engine)
    maker = sessionmaker(bind=engine, class_=Session, expire_on_commit=False)
    return maker()


def _setup(db: Session) -> None:
    db.add_all(
        [
            Materia(codigo="M1", nombre="Analisis"),
            Materia(codigo="M2", nombre="Fisica"),
            Materia(codigo="M3", nombre="Quimica"),
            Profesor(id=1, nombre="ASCOLANI, Federico", nombre_key="ascolani|federico"),
            Profesor(id=2, nombre="PEREZ, Juan", nombre_key="perez|juan"),
            Profesor(id=3, nombre="PEREZ, Ana", nombre_key="perez|ana"),
            # Catedras: quien dicta cada materia
            MateriaProfesor(materia_codigo="M1", profesor_id=1),  # Ascolani -> M1
            MateriaProfesor(materia_codigo="M2", profesor_id=2),  # Perez Juan -> M2
            MateriaProfesor(materia_codigo="M2", profesor_id=3),  # Perez Ana  -> M2 (homonimo)
            Comision(id=1, nombre="1K01", anio=1),
        ]
    )
    db.flush()
    db.add_all(
        [
            # unico candidato (M1 + 'ascolani') -> vincula profesor 1
            Cursada(id=10, comision_id=1, materia_codigo="M1", cuatrimestre=1, docente="Ascolani"),
            # dos 'perez' dictan M2 -> ambiguo -> NULL
            Cursada(id=11, comision_id=1, materia_codigo="M2", cuatrimestre=1, docente="Perez"),
            # nadie 'nadie' dicta M3 -> sin match -> NULL
            Cursada(id=12, comision_id=1, materia_codigo="M3", cuatrimestre=1, docente="Nadie"),
            # acentos + mayusculas -> igual resuelve a profesor 1
            Cursada(id=13, comision_id=1, materia_codigo="M1", cuatrimestre=2, docente="ÁSCOLANI"),
            # ya resuelto (a un id distinto del que elegiria) -> NO se pisa
            Cursada(id=14, comision_id=1, materia_codigo="M1", cuatrimestre=1, docente="Ascolani", profesor_id=3),
        ]
    )
    db.commit()


def test_resuelve_match_unico_por_materia_y_apellido() -> None:
    db = _session()
    _setup(db)
    svc.resolver_cursadas(db)
    assert db.get(Cursada, 10).profesor_id == 1


def test_ambiguo_queda_sin_vinculo() -> None:
    db = _session()
    _setup(db)
    svc.resolver_cursadas(db)
    assert db.get(Cursada, 11).profesor_id is None


def test_sin_match_queda_sin_vinculo() -> None:
    db = _session()
    _setup(db)
    svc.resolver_cursadas(db)
    assert db.get(Cursada, 12).profesor_id is None


def test_insensible_a_acentos_y_mayusculas() -> None:
    db = _session()
    _setup(db)
    svc.resolver_cursadas(db)
    assert db.get(Cursada, 13).profesor_id == 1


def test_no_pisa_vinculo_existente() -> None:
    db = _session()
    _setup(db)
    res = svc.resolver_cursadas(db)
    assert db.get(Cursada, 14).profesor_id == 3  # intacto, no se recalcula
    assert res.ya_resueltas == 1


def test_resumen_cuenta_categorias() -> None:
    db = _session()
    _setup(db)
    res = svc.resolver_cursadas(db)
    assert res.total == 4       # 10, 11, 12, 13 (14 ya estaba resuelta)
    assert res.vinculadas == 2  # 10, 13
    assert res.ambiguas == 1    # 11
    assert res.sin_match == 1   # 12
    assert res.ya_resueltas == 1


def test_endpoint_con_profesores_expone_vinculo_y_fallback() -> None:
    """Integración: GET /comisiones/con-profesores tras resolver el matcher."""
    db = _session()
    _setup(db)
    svc.resolver_cursadas(db)

    app = FastAPI()
    app.include_router(comisiones_api.router)

    def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    client = TestClient(app)

    res = client.get("/comisiones/con-profesores?anio=1")
    assert res.status_code == 200
    data = res.json()
    assert len(data) == 1  # una comisión

    cursadas = {c["id"]: c for c in data[0]["cursadas"]}
    # cursada 10: profesor resuelto
    assert cursadas[10]["profesor"] == {"id": 1, "nombre": "ASCOLANI, Federico"}
    assert cursadas[10]["materia_nombre"] == "Analisis"
    # cursada 11: ambigua → profesor None, cae al docente
    assert cursadas[11]["profesor"] is None
    assert cursadas[11]["docente"] == "Perez"
