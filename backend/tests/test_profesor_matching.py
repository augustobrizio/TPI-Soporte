"""Tests de la regla de negocio: identidad de profesores en los syncs.

Corre sobre SQLite in-memory (no toca la DB compartida).

Los casos positivos y negativos salen del padron real de FRRO: son las grafias
que efectivamente generaron duplicados cuando el matching era por string exacto.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db.models.profesor import Profesor  # noqa: E402
from app.services import profesor_matching as matching  # noqa: E402


def _session() -> Session:
    engine = create_engine(
        "sqlite://",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Profesor.__table__.create(engine)
    maker = sessionmaker(bind=engine, class_=Session, expire_on_commit=False)
    return maker()


def _alta(db: Session, nombre: str, email: str | None = None) -> Profesor:
    prof = Profesor(nombre=nombre, nombre_key=matching.clave_nombre(nombre), email=email)
    db.add(prof)
    db.flush()
    return prof


# ---------------------------------------------------------------------------
# clave_nombre: el unique index de la DB
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    "a, b",
    [
        # Mayusculas, acentos y espaciado alrededor de la coma.
        ("RUGGIERO, Franco", "RUGGIERO,Franco"),
        ("HERNANDEZ , Franco", "Hernandez, Franco"),
        ("BARÓ, Germán Bernardo", "BARO, German Bernardo"),
        # El apostrofe no separa: 'D ARRIGO' y 'D’Arrigo' son el mismo apellido.
        ("D ARRIGO, Florencia", "D’Arrigo, Florencia"),
        ("DE SANCTIS, Mariana", "DeSanctis, Mariana"),
        # La abreviatura con punto colapsa al mismo token.
        ("Camperchioli, M. Norma", "CAMPERCHIOLI, M Norma"),
    ],
)
def test_clave_nombre_colapsa_variantes_de_grafia(a: str, b: str) -> None:
    assert matching.clave_nombre(a) == matching.clave_nombre(b)


def test_clave_nombre_distingue_profesores_distintos() -> None:
    assert matching.clave_nombre("PEREZ, Juan") != matching.clave_nombre("PEREZ, Ana")
    assert matching.clave_nombre("Alvarez, Maria Belen") != matching.clave_nombre(
        "Alvarez, Maria Evangelina"
    )


# ---------------------------------------------------------------------------
# son_la_misma_persona: las variantes que el unique no puede frenar
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    "padron, fuente",
    [
        # La sheet de mails recorta el segundo nombre.
        ("RIPANI, Luciano Ernesto", "Ripani, Luciano"),
        ("TABACMAN, Ricardo David", "Tabacman, Ricardo"),
        # Segundo nombre abreviado a inicial.
        ("CUCCHIARA, Ariana Erica", "Cucchiara, Ariana E"),
        # Primer nombre abreviado a inicial.
        ("CAMPERCHIOLI, Maria Norma", "Camperchioli, M. Norma"),
        ("Zanchetta, Ma Alejandra", "Zanchetta, M Alejandra"),
        # Compuesto con 'Maria' que una fuente omite.
        ("NALLI, María Yanina", "NALLI, Yanina"),
        ("Bologna, María Noel", "BOLOGNA, NOEL"),
        # Typo de un caracter.
        ("FONT, Gabriela Mariel", "FONT, Gabriela Marie"),
    ],
)
def test_son_la_misma_persona_acepta_variantes_reales(padron: str, fuente: str) -> None:
    assert matching.son_la_misma_persona(padron, fuente)


@pytest.mark.parametrize(
    "a, b",
    [
        # Mismo apellido y primer nombre, segundo nombre distinto: dos personas.
        ("Alvarez, Maria Evangelina", "Alvarez, Maria Belen"),
        ("PEREZ, Juan Carlos", "PEREZ, Juan Manuel"),
        # Nombres de pila distintos.
        ("PEREZ, Juan", "PEREZ, Ana"),
        # 'Ana' no es abreviatura de 'Analia': el umbral de typo no la acepta.
        ("GOMEZ, Ana", "GOMEZ, Analia"),
        # Apellidos distintos.
        ("RIPANI, Luciano", "RIPARI, Luciano"),
    ],
)
def test_son_la_misma_persona_no_fusiona_personas_distintas(a: str, b: str) -> None:
    assert not matching.son_la_misma_persona(a, b)


def test_es_mas_completo_prefiere_la_grafia_con_mas_informacion() -> None:
    assert matching.es_mas_completo("RIPANI, Luciano Ernesto", "Ripani, Luciano")
    assert not matching.es_mas_completo("Ripani, Luciano", "RIPANI, Luciano Ernesto")
    # A igual cantidad de nombres, gana el que no abrevia.
    assert matching.es_mas_completo("CAMPERCHIOLI, Maria Norma", "Camperchioli, M. Norma")
    # Empate: se conserva el actual, para que re-correr un sync no mueva el padron.
    assert not matching.es_mas_completo("Ripani, Luciano", "RIPANI, Luciano")


# ---------------------------------------------------------------------------
# IndicePadron / obtener_o_crear: el camino que recorren los tres syncs
# ---------------------------------------------------------------------------
def test_resolver_matchea_por_email_aunque_el_apellido_este_recortado() -> None:
    """'OLIVEROS VEGA, Miguel' y 'Oliveros, Miguel' no comparten apellido canonico."""
    db = _session()
    prof = _alta(db, "OLIVEROS VEGA, Miguel", "moliveros.utn@gmail.com")
    indice = matching.IndicePadron.cargar(db)

    assert not matching.son_la_misma_persona("OLIVEROS VEGA, Miguel", "Oliveros, Miguel")
    assert indice.resolver("Oliveros, Miguel", "moliveros.utn@gmail.com") is prof


def test_resolver_devuelve_none_si_hay_mas_de_un_candidato() -> None:
    """Ante ambiguedad preferimos un duplicado visible antes que una fusion errada."""
    db = _session()
    _alta(db, "PEREZ, Juan Carlos")
    _alta(db, "PEREZ, Juan Manuel")
    indice = matching.IndicePadron.cargar(db)

    assert indice.resolver("Perez, Juan") is None


def test_obtener_o_crear_no_duplica_al_recortar_el_nombre() -> None:
    """El caso que rompia: padron FRRO primero, sheet de mails despues."""
    db = _session()
    padron = _alta(db, "RIPANI, Luciano Ernesto")
    indice = matching.IndicePadron.cargar(db)

    prof, creado = matching.obtener_o_crear(
        db, indice, nombre="Ripani, Luciano", email="lripani@yahoo.com"
    )

    assert not creado
    assert prof.id == padron.id
    # La sheet aporta el email que el padron no tenia; el nombre largo se conserva.
    assert prof.email == "lripani@yahoo.com"
    assert prof.nombre == "RIPANI, Luciano Ernesto"
    assert db.query(Profesor).count() == 1


def test_obtener_o_crear_mejora_el_nombre_si_la_fuente_trae_uno_mas_completo() -> None:
    """El orden inverso: mails primero, padron despues. Mismo resultado final."""
    db = _session()
    corto = _alta(db, "Ripani, Luciano", "lripani@yahoo.com")
    indice = matching.IndicePadron.cargar(db)

    prof, creado = matching.obtener_o_crear(
        db, indice, nombre="RIPANI, Luciano Ernesto", email=None
    )

    assert not creado
    assert prof.id == corto.id
    assert prof.nombre == "RIPANI, Luciano Ernesto"
    assert prof.nombre_key == matching.clave_nombre("RIPANI, Luciano Ernesto")
    assert prof.email == "lripani@yahoo.com"
    assert db.query(Profesor).count() == 1


def test_obtener_o_crear_no_pisa_un_email_ya_cargado() -> None:
    db = _session()
    _alta(db, "AQUILI, Laura Marcela", "laquili@frro.utn.edu.ar")
    indice = matching.IndicePadron.cargar(db)

    prof, _ = matching.obtener_o_crear(
        db, indice, nombre="Aquili, Laura", email="otro@gmail.com"
    )

    assert prof.email == "laquili@frro.utn.edu.ar"


def test_obtener_o_crear_es_idempotente_en_la_misma_corrida() -> None:
    """Una sheet que repite al profesor con dos grafias no puede crear dos filas."""
    db = _session()
    indice = matching.IndicePadron.cargar(db)

    primero, creado_1 = matching.obtener_o_crear(
        db, indice, nombre="RUGGIERO, Franco", email=None
    )
    segundo, creado_2 = matching.obtener_o_crear(
        db, indice, nombre="RUGGIERO,Franco", email=None
    )
    tercero, creado_3 = matching.obtener_o_crear(
        db, indice, nombre="Ruggiero, Franco Nicolas", email=None
    )

    assert creado_1 and not creado_2 and not creado_3
    assert primero.id == segundo.id == tercero.id
    assert db.query(Profesor).count() == 1


def test_obtener_o_crear_da_de_alta_a_un_profesor_nuevo() -> None:
    db = _session()
    indice = matching.IndicePadron.cargar(db)

    prof, creado = matching.obtener_o_crear(
        db, indice, nombre="MECA, Adrian Ezequiel", email="adrianmeca@gmail.com"
    )

    assert creado
    assert prof.nombre_key == matching.clave_nombre("MECA, Adrian Ezequiel")
    # Y queda en el indice: la fila siguiente de la misma sheet ya lo encuentra.
    assert indice.resolver("Meca, Adrian") is prof
