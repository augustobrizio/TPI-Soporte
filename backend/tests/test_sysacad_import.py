"""Tests del import de SYSACAD: matcheo de materias y seleccion de comision.

Cubre los dos bugs del Frente 10:

  10.A  Las materias "Cursa en 4K02" se importaban como 'cursando' pero sin
        ``cursada_id``, y la grilla de Horarios —que se pinta desde ese
        campo— quedaba vacia.
  10.B  El matcher comparaba sin normalizar, asi que el nombre en mayusculas
        y sin tildes que escribe SYSACAD no llegaba al umbral de confianza.

Corre sobre SQLite in-memory: no toca la DB compartida.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db.models.academico import (  # noqa: E402
    Comision,
    CondicionMateria,
    Cursada,
    Horario,
    Materia,
    UsuarioMateria,
)
from app.db.models.usuario import Usuario  # noqa: E402
from app.schemas.materia import ConfirmarImportIn  # noqa: E402
from app.services import sysacad_paste_service as svc  # noqa: E402

# Nombre real del plan (db/seed/isi_2023.py) que motivo el bug 10.B.
SOPORTE = "Soporte a las Bases de Datos con Programación Visual"

# Pegado real que fallaba: SYSACAD escribe en mayusculas y sin tildes, y la
# fila en curso trae la comision adentro del estado. Es el fixture de T10.6.
PEGADO_REAL = "\n".join(
    [
        "Año\tMateria\tEstado\tAño cursada",  # header: se descarta
        "4\tREDES DE INFORMACION\tAprobada con 8 (96 hs.) en 2024\t2024",
        "4\tINVESTIGACION OPERATIVA\tRegular\t2024",
        "4\tSOPORTE A LAS BASES DE DATOS CON PROGRAMACION VISUAL\tCursa en 4K02 Aula 501 Zeballos 1341",
        "5\tINTELIGENCIA ARTIFICIAL\tCursa en 5K03 Aula 12 Zeballos 1341",
    ]
)


def _session() -> Session:
    engine = create_engine(
        "sqlite://",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    for model in (Usuario, Materia, Comision, Cursada, Horario, UsuarioMateria):
        model.__table__.create(engine)
    maker = sessionmaker(bind=engine, class_=Session, expire_on_commit=False)
    return maker()


def _setup(db: Session) -> None:
    """Un usuario, las 4 materias del pegado y la comision 4K02 de 2025."""
    db.add_all(
        [
            Usuario(id=1, nombre="Test", email="test@utnhub.dev"),
            Materia(codigo="E13", nombre=SOPORTE, anio_carrera=4, tipo="electiva"),
            Materia(codigo="19", nombre="Redes de Información", anio_carrera=4),
            Materia(codigo="20", nombre="Investigación Operativa", anio_carrera=4),
            Materia(codigo="31", nombre="Inteligencia Artificial", anio_carrera=5),
            Comision(id=1, nombre="4K02", anio=2025),
            Comision(id=2, nombre="4K02", anio=2024),  # edicion vieja de la misma comision
        ]
    )
    db.flush()
    db.add_all(
        [
            Cursada(id=10, comision_id=1, materia_codigo="E13", cuatrimestre=1),
            Cursada(id=11, comision_id=1, materia_codigo="E13", cuatrimestre=2),
            Cursada(id=12, comision_id=2, materia_codigo="E13", cuatrimestre=1),
        ]
    )
    db.flush()


# ---------------------------------------------------------------------------
# 10.B — matcheo con normalizacion
# ---------------------------------------------------------------------------

def test_electiva_en_mayusculas_matchea():
    """El caso que fallaba: sin normalizar daba 19.6% y elegia otra materia."""
    db = _session()
    _setup(db)

    preview = svc.parsear_texto(PEGADO_REAL, db)
    por_codigo = {i.materia_codigo: i for i in preview.items}

    soporte = por_codigo["E13"]
    assert soporte.materia_nombre == SOPORTE
    assert soporte.confianza == 1.0
    assert soporte.importar is True


def test_todas_las_filas_del_pegado_real_mapean():
    """El pegado completo no deja ninguna materia sin match ni advertencias."""
    db = _session()
    _setup(db)

    preview = svc.parsear_texto(PEGADO_REAL, db)

    assert preview.total_parseados == 4
    assert preview.total_mapeados == 4
    assert preview.advertencias == []
    assert all(i.importar for i in preview.items)


def test_variantes_abreviadas_y_sin_tildes():
    """Abreviaturas y falta de tildes siguen superando el umbral."""
    db = _session()
    _setup(db)

    for variante in (
        "Soporte a las Bases de Datos con Prog. Visual",
        "SOPORTE A LAS BASES DE DATOS CON PROG. VISUAL",
        "soporte a las bases de datos con programacion visual",
    ):
        preview = svc.parsear_texto(f"4\t{variante}\tRegular", db)
        item = preview.items[0]
        assert item.materia_codigo == "E13", f"{variante} -> {item.materia_nombre}"
        assert item.confianza >= svc.CONFIANZA_MINIMA


def test_cursillo_se_excluye_en_mayusculas():
    """La exclusion del cursillo tambien normaliza: 'FISICA' no entra al plan."""
    db = _session()
    _setup(db)

    preview = svc.parsear_texto("0\tFISICA\tAprobada con 8\n4\tREDES DE INFORMACION\tRegular", db)

    assert [i.nombre_original for i in preview.items] == ["REDES DE INFORMACION"]


# ---------------------------------------------------------------------------
# 10.A — comision detectada y cursada seleccionada
# ---------------------------------------------------------------------------

def test_extrae_la_comision_del_estado():
    """'Cursa en 4K02 Aula 501 Zeballos 1341' -> '4K02' (la direccion no confunde)."""
    assert svc._parsear_comision("Cursa en 4K02 Aula 501 Zeballos 1341") == "4K02"
    assert svc._parsear_comision("Cursa en 3EK02 Aula 12") == "3EK02"
    assert svc._parsear_comision("cursa en 5k03") == "5K03"
    assert svc._parsear_comision("Aprobada con 8 (96 hs.) en 2024") is None
    assert svc._parsear_comision("Regular") is None


def test_solo_las_materias_en_curso_traen_comision():
    """Una fila 'Aprobada' o 'Regular' no arrastra comision al preview."""
    db = _session()
    _setup(db)

    preview = svc.parsear_texto(PEGADO_REAL, db)
    por_codigo = {i.materia_codigo: i for i in preview.items}

    assert por_codigo["E13"].comision_nombre == "4K02"
    assert por_codigo["E13"].condicion == CondicionMateria.CURSANDO
    assert por_codigo["19"].comision_nombre is None  # aprobada
    assert por_codigo["20"].comision_nombre is None  # regular


def test_importar_deja_la_cursada_seleccionada():
    """El bug 10.A: la materia en curso queda con cursada_id, no en None."""
    db = _session()
    _setup(db)

    preview = svc.parsear_texto(PEGADO_REAL, db)
    resultado = svc.confirmar_importacion(
        db,
        usuario_id=1,
        payload=ConfirmarImportIn(items=preview.items),
    )

    assert resultado.importadas == 4
    assert resultado.comisiones_asignadas == 1
    assert resultado.errores == []

    fila = db.query(UsuarioMateria).filter_by(usuario_id=1, materia_codigo="E13").one()
    assert fila.condicion == CondicionMateria.CURSANDO
    # 10 y 11 son las dos cursadas de 4K02 en 2025 (materia anual): sirve
    # cualquiera. La de 2024 (id 12) no, porque gana el año mas reciente.
    assert fila.cursada_id in (10, 11)


def test_comision_desconocida_no_rompe_el_import():
    """Si la comision no esta cargada, la materia se importa igual sin ella."""
    db = _session()
    _setup(db)

    preview = svc.parsear_texto(PEGADO_REAL, db)
    resultado = svc.confirmar_importacion(
        db,
        usuario_id=1,
        payload=ConfirmarImportIn(items=preview.items),
    )

    # Inteligencia Artificial dice "Cursa en 5K03", comision inexistente.
    ia = db.query(UsuarioMateria).filter_by(usuario_id=1, materia_codigo="31").one()
    assert ia.condicion == CondicionMateria.CURSANDO
    assert ia.cursada_id is None
    assert resultado.importadas == 4  # se importo igual
    assert resultado.errores == []


def test_reimportar_no_duplica_ni_pierde_la_comision():
    """Pegar dos veces (con reemplazar) deja la seleccion igual, no la borra."""
    db = _session()
    _setup(db)

    preview = svc.parsear_texto(PEGADO_REAL, db)
    svc.confirmar_importacion(
        db, usuario_id=1, payload=ConfirmarImportIn(items=preview.items)
    )
    resultado = svc.confirmar_importacion(
        db,
        usuario_id=1,
        payload=ConfirmarImportIn(items=preview.items, reemplazar=True),
    )

    assert resultado.eliminadas == 4
    assert resultado.comisiones_asignadas == 1
    filas = db.query(UsuarioMateria).filter_by(usuario_id=1).all()
    assert len(filas) == 4
    e13 = next(f for f in filas if f.materia_codigo == "E13")
    assert e13.cursada_id in (10, 11)
