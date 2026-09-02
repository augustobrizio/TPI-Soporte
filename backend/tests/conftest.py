"""Fixtures compartidas de los tests del nucleo academico (Frente 3).

Los tests que ya existian se arman cada uno su propia sesion SQLite en memoria,
porque cada uno necesita tablas distintas. Los tres del nucleo academico
—correlatividad, inscripcion y promedio— comparten en cambio el *mismo* plan de
estudios de juguete, asi que ese armado vive aca en vez de estar copiado tres
veces.

**El plan de juguete no es el plan ISI real**: son seis materias elegidas para
que cada regla del dominio quede cubierta por un caso, y nada mas. Usar el seed
real (`db/seed/isi_2023.py`, 56 materias) haria los tests ilegibles —para saber
por que falla uno habria que reconstruir medio plan de estudios mentalmente— y
ademas los ataria a que nadie corrija nunca una correlativa del PDF.

Lo que cubre cada materia:

    1   AM I           sin correlativas         el caso base
    2   Algebra        sin correlativas         el caso base
    3   AM II          req. 1 REGULAR           correlativa que acepta regular
                       req. 2 APROBADA          correlativa que exige aprobada
    E13 Electiva       req. 3 REGULAR           el tipo != troncal, para el %
    ADUSI Seminario    sin correlativas         troncal pero opcional (ver abajo)
    36  Proyecto Final sin filas de correlativa la regla especial del service

``36`` no tiene filas en ``correlatividad`` a proposito: su requisito —todas
las troncales aprobadas— no se modela en la tabla, lo aplica a mano
``correlatividad_service._validar_proyecto_final_para_rendir``. Si tuviera
filas, el test estaria probando la tabla y no la regla.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

# Antes de importar nada de ``app``: ``db.session`` lee la URL al importarse y
# sin esto intentaria abrir la conexion real a Neon durante la coleccion.
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import app.db.models  # noqa: E402,F401  (registra todas las tablas en la metadata)
from app.db.base import Base  # noqa: E402
from app.db.models.academico import Correlatividad, Materia, TipoCorrelativa  # noqa: E402
from app.db.models.usuario import Usuario  # noqa: E402

# Codigos del plan de juguete, para que los tests no repitan strings sueltos.
AM1 = "1"
ALGEBRA = "2"
AM2 = "3"
ELECTIVA = "E13"
SEMINARIO = "ADUSI"
PROYECTO_FINAL = "36"

#: Troncales que cuentan para el porcentaje de avance (ADUSI queda afuera:
#: ``materia_service._MATERIAS_OPCIONALES`` la excluye por no ser obligatoria
#: para graduarse). Son 4: AM1, Algebra, AM2 y Proyecto Final.
TRONCALES_OBLIGATORIAS = (AM1, ALGEBRA, AM2, PROYECTO_FINAL)


@pytest.fixture
def db() -> Session:
    """Sesion SQLite en memoria con el schema completo y el plan de juguete."""
    engine = create_engine(
        "sqlite://",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    sesion = sessionmaker(bind=engine, class_=Session, expire_on_commit=False)()
    _sembrar_plan(sesion)
    return sesion


@pytest.fixture
def usuario(db: Session) -> Usuario:
    """Un alumno con la libreta vacia.

    Existe de verdad en la tabla ``usuario`` en vez de ser un id inventado:
    ``usuario_materia.usuario_id`` es una FK, y aunque SQLite no la valide por
    default, un test que escribe contra un usuario fantasma esconderia el dia
    que esa escritura empiece a fallar en Postgres.
    """
    alumno = Usuario(email="ana@frro.utn.edu.ar")
    db.add(alumno)
    db.commit()
    return alumno


def _sembrar_plan(db: Session) -> None:
    db.add_all(
        [
            Materia(
                codigo=AM1,
                nombre="Análisis Matemático I",
                anio_carrera=1,
                cuatrimestre=None,
                horas=5,
                tipo="troncal",
            ),
            Materia(
                codigo=ALGEBRA,
                nombre="Álgebra y Geometría Analítica",
                anio_carrera=1,
                cuatrimestre=None,
                horas=5,
                tipo="troncal",
            ),
            Materia(
                codigo=AM2,
                nombre="Análisis Matemático II",
                anio_carrera=2,
                cuatrimestre=None,
                horas=4,
                tipo="troncal",
            ),
            Materia(
                codigo=ELECTIVA,
                nombre="Soporte a las Bases de Datos con Programación Visual",
                anio_carrera=4,
                cuatrimestre="1",
                horas=3,
                tipo="electiva",
            ),
            Materia(
                codigo=SEMINARIO,
                nombre="Seminario Integrador (ADUSI)",
                anio_carrera=3,
                cuatrimestre=None,
                horas=4,
                tipo="troncal",
            ),
            Materia(
                codigo=PROYECTO_FINAL,
                nombre="Proyecto Final",
                anio_carrera=5,
                cuatrimestre=None,
                horas=6,
                tipo="troncal",
            ),
        ]
    )
    db.flush()

    db.add_all(
        [
            # AM II pide AM I regular y Álgebra aprobada: un ejemplar de cada tipo.
            Correlatividad(
                materia_codigo=AM2,
                materia_requerida=AM1,
                tipo=TipoCorrelativa.REGULAR,
            ),
            Correlatividad(
                materia_codigo=AM2,
                materia_requerida=ALGEBRA,
                tipo=TipoCorrelativa.APROBADA,
            ),
            # La electiva cuelga de AM II para poder testear una cadena de dos saltos.
            Correlatividad(
                materia_codigo=ELECTIVA,
                materia_requerida=AM2,
                tipo=TipoCorrelativa.REGULAR,
            ),
        ]
    )
    db.commit()
