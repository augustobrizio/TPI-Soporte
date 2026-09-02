"""Promedio general y porcentaje de avance (T3.3 del Frente 3, RF-03).

Las dos metricas viven dentro de ``materia_service.construir_grafo`` y no en un
``promedio_service`` —ese archivo esta en 0 lineas (T5.1)—, asi que se prueban
por donde se calculan: pidiendo el grafo y mirando ``contadores``.

Las dos son **cross-tab**: se piden sobre la pestania de troncales o la de
electivas, pero suman lo que el alumno tiene en las dos. Es la parte mas facil
de romper sin que se note, porque mirando una sola pestania el numero igual
"parece" bien.

Reglas que se fijan aca:

- El promedio sale de las aprobadas **con nota**; una aprobada sin nota no
  arrastra el promedio a cero, simplemente no participa.
- El porcentaje ignora a ADUSI en el numerador *y* en el denominador
  (``_MATERIAS_OPCIONALES``), porque no es obligatoria para graduarse.
- ``creditos_electivas`` suma horas de electivas aprobadas; la carga horaria
  suma horas de lo que este ``cursando``, de cualquier tipo.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.db.models.academico import CondicionMateria, UsuarioMateria
from app.db.models.usuario import Usuario
from app.services import materia_service

from conftest import (  # noqa: E402
    ALGEBRA,
    AM1,
    AM2,
    ELECTIVA,
    PROYECTO_FINAL,
    SEMINARIO,
)


def _cargar(
    db: Session,
    usuario: Usuario,
    codigo: str,
    condicion: CondicionMateria,
    nota: float | None = None,
) -> None:
    db.add(
        UsuarioMateria(
            usuario_id=usuario.id,
            materia_codigo=codigo,
            condicion=condicion,
            nota=nota,
        )
    )
    db.commit()


def _contadores(db: Session, usuario: Usuario, tipo: str = "troncal"):
    return materia_service.construir_grafo(db, tipo=tipo, usuario_id=usuario.id).contadores


# ---------------------------------------------------------------------------
# Promedio general
# ---------------------------------------------------------------------------
def test_sin_notas_el_promedio_es_none(db: Session, usuario: Usuario) -> None:
    """None y no 0.0: "todavia no rendi nada" no es "me saco un cero"."""
    assert _contadores(db, usuario).promedio_general is None


def test_promedio_de_una_sola_materia(db: Session, usuario: Usuario) -> None:
    _cargar(db, usuario, AM1, CondicionMateria.APROBADO, nota=8)
    assert _contadores(db, usuario).promedio_general == 8.0


def test_promedio_redondea_a_dos_decimales(db: Session, usuario: Usuario) -> None:
    """8, 9 y 10 dan 9.0; 7, 8 y 10 dan 8.33 (25/3 = 8.333…)."""
    _cargar(db, usuario, AM1, CondicionMateria.APROBADO, nota=7)
    _cargar(db, usuario, ALGEBRA, CondicionMateria.APROBADO, nota=8)
    _cargar(db, usuario, AM2, CondicionMateria.APROBADO, nota=10)

    assert _contadores(db, usuario).promedio_general == 8.33


def test_una_aprobada_sin_nota_no_entra_al_promedio(
    db: Session, usuario: Usuario
) -> None:
    """El caso que rompe el promedio si se lo trata como un cero.

    Pasa de verdad: el import de SYSACAD carga materias aprobadas sin nota.
    Con 8 y una sin nota el promedio tiene que seguir siendo 8, no 4.
    """
    _cargar(db, usuario, AM1, CondicionMateria.APROBADO, nota=8)
    _cargar(db, usuario, ALGEBRA, CondicionMateria.APROBADO, nota=None)

    assert _contadores(db, usuario).promedio_general == 8.0


def test_la_nota_de_una_no_aprobada_no_entra(db: Session, usuario: Usuario) -> None:
    """Defensa en profundidad sobre la regla de ``inscripcion_service``.

    Ese service ya limpia la nota cuando la condicion no es ``aprobado``, pero
    la fila se puede haber escrito por otro camino (un import, una migracion).
    El promedio filtra igual por condicion, no solo por "tiene nota".
    """
    _cargar(db, usuario, AM1, CondicionMateria.APROBADO, nota=10)
    _cargar(db, usuario, ALGEBRA, CondicionMateria.REGULAR, nota=2)
    _cargar(db, usuario, AM2, CondicionMateria.CURSANDO, nota=2)

    assert _contadores(db, usuario).promedio_general == 10.0


def test_el_promedio_cruza_troncales_y_electivas(
    db: Session, usuario: Usuario
) -> None:
    """Mismo numero se pida la pestania que se pida.

    Es lo que hace que la metrica sea del alumno y no de la pestania abierta:
    la electiva aprobada con 6 pesa igual mirando el grafo de troncales.
    """
    _cargar(db, usuario, AM1, CondicionMateria.APROBADO, nota=10)
    _cargar(db, usuario, ELECTIVA, CondicionMateria.APROBADO, nota=6)

    assert _contadores(db, usuario, "troncal").promedio_general == 8.0
    assert _contadores(db, usuario, "electiva").promedio_general == 8.0


# ---------------------------------------------------------------------------
# Porcentaje de avance ("% ingeniero")
# ---------------------------------------------------------------------------
def test_libreta_vacia_es_cero_por_ciento(db: Session, usuario: Usuario) -> None:
    c = _contadores(db, usuario)
    assert c.aprobadas == 0
    assert c.porcentaje_aprobadas == 0.0


def test_el_total_de_troncales_excluye_a_adusi(db: Session, usuario: Usuario) -> None:
    """El plan de juguete tiene 5 troncales; ``total`` tiene que decir 4.

    ADUSI no cuenta para graduarse, asi que sale del denominador. Si contara,
    ninguna de las cuentas de abajo daria redondo.
    """
    assert _contadores(db, usuario).total == 4


def test_una_de_cuatro_es_veinticinco_por_ciento(
    db: Session, usuario: Usuario
) -> None:
    _cargar(db, usuario, AM1, CondicionMateria.APROBADO)
    c = _contadores(db, usuario)
    assert c.aprobadas == 1
    assert c.porcentaje_aprobadas == 25.0


def test_adusi_aprobada_no_mueve_el_porcentaje(
    db: Session, usuario: Usuario
) -> None:
    """Sale del numerador tambien, no solo del denominador.

    Si saliera de uno solo, aprobar ADUSI empujaria el porcentaje por encima
    de lo que el alumno realmente avanzo.
    """
    _cargar(db, usuario, AM1, CondicionMateria.APROBADO)
    antes = _contadores(db, usuario).porcentaje_aprobadas

    _cargar(db, usuario, SEMINARIO, CondicionMateria.APROBADO)
    despues = _contadores(db, usuario)

    assert despues.porcentaje_aprobadas == antes == 25.0
    assert despues.aprobadas == 1


def test_todas_las_obligatorias_dan_cien(db: Session, usuario: Usuario) -> None:
    """Y llega a 100 **sin** ADUSI: es lo que la hace opcional de verdad."""
    for codigo in (AM1, ALGEBRA, AM2, PROYECTO_FINAL):
        _cargar(db, usuario, codigo, CondicionMateria.APROBADO)

    c = _contadores(db, usuario)
    assert c.aprobadas == 4
    assert c.porcentaje_aprobadas == 100.0


def test_regular_y_cursando_no_cuentan_como_avance(
    db: Session, usuario: Usuario
) -> None:
    _cargar(db, usuario, AM1, CondicionMateria.REGULAR)
    _cargar(db, usuario, ALGEBRA, CondicionMateria.CURSANDO)

    c = _contadores(db, usuario)
    assert c.aprobadas == 0
    assert c.porcentaje_aprobadas == 0.0
    assert c.regulares == 1
    assert c.cursando == 1


def test_el_porcentaje_de_la_pestania_electiva_es_el_de_las_electivas(
    db: Session, usuario: Usuario
) -> None:
    """A diferencia del promedio, el porcentaje **si** es por pestania.

    ``total`` y ``aprobadas`` cuentan las materias de la pestania pedida. Con
    una sola electiva en el plan de juguete, aprobarla da 100% en esa solapa
    aunque falte toda la carrera. No es un bug: son dos barras distintas en la
    UI —avance de troncales y creditos de electivas—, y este test fija que se
    lean asi y no como un unico "% de la carrera".
    """
    _cargar(db, usuario, ELECTIVA, CondicionMateria.APROBADO)

    electivas = _contadores(db, usuario, "electiva")
    assert electivas.total == 1
    assert electivas.porcentaje_aprobadas == 100.0

    # Y en troncales el mismo alumno sigue en cero.
    assert _contadores(db, usuario, "troncal").porcentaje_aprobadas == 0.0


# ---------------------------------------------------------------------------
# Carga horaria y creditos de electivas
# ---------------------------------------------------------------------------
def test_carga_horaria_suma_solo_lo_que_esta_cursando(
    db: Session, usuario: Usuario
) -> None:
    """AM I son 5 horas y la electiva 3; lo aprobado no suma."""
    _cargar(db, usuario, AM1, CondicionMateria.CURSANDO)
    _cargar(db, usuario, ELECTIVA, CondicionMateria.CURSANDO)
    _cargar(db, usuario, ALGEBRA, CondicionMateria.APROBADO)

    assert _contadores(db, usuario).carga_horaria_cursando == 8


def test_creditos_de_electivas_suma_horas_de_electivas_aprobadas(
    db: Session, usuario: Usuario
) -> None:
    """Las troncales aprobadas no cuentan como credito de electiva.

    AM I (troncal, 5 h) esta aprobada y aun asi el credito es 3: solo la
    electiva. Confundirlos es el error clasico de esta metrica.
    """
    _cargar(db, usuario, AM1, CondicionMateria.APROBADO)
    _cargar(db, usuario, ELECTIVA, CondicionMateria.APROBADO)

    assert _contadores(db, usuario).creditos_electivas == 3


def test_una_electiva_cursando_no_da_creditos(db: Session, usuario: Usuario) -> None:
    _cargar(db, usuario, ELECTIVA, CondicionMateria.CURSANDO)
    assert _contadores(db, usuario).creditos_electivas == 0


# ---------------------------------------------------------------------------
# Usuario anonimo
# ---------------------------------------------------------------------------
def test_sin_usuario_las_metricas_quedan_en_cero(db: Session) -> None:
    """El grafo publico se puede pedir sin sesion y no rompe."""
    c = materia_service.construir_grafo(db, tipo="troncal", usuario_id=None).contadores

    assert c.aprobadas == 0
    assert c.promedio_general is None
    assert c.carga_horaria_cursando == 0
    assert c.creditos_electivas == 0
    # Y todo lo que no tiene correlativas se ve cursable, no libre.
    assert c.cursables >= 1
