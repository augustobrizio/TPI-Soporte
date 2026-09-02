"""Reglas de correlatividad (T3.1 del Frente 3, RF-02).

Las tres funciones publicas de ``correlatividad_service``:

- ``puede_cursar``  — cada correlativa segun su ``tipo``.
- ``puede_rendir``  — todas aprobadas, sin importar el ``tipo``; mas la regla
  especial de Proyecto Final.
- ``calcular_estado`` — el estado que se pinta en el grafo.

La distincion que mas se presta a romperse en un refactor es la del medio: para
**cursar**, una correlativa marcada ``regular`` se cumple estando regular; para
**rendir**, esa misma correlativa exige aprobada. Son dos umbrales distintos
sobre la misma fila de la tabla, y varios tests de aca abajo existen solo para
fijar que no se colapsen en uno.

El plan de juguete y los codigos (``AM1``, ``AM2``, …) salen de ``conftest.py``.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.db.models.academico import CondicionMateria, UsuarioMateria
from app.db.models.usuario import Usuario
from app.services import correlatividad_service

from conftest import (  # noqa: E402  (fixtures locales del paquete de tests)
    ALGEBRA,
    AM1,
    AM2,
    ELECTIVA,
    PROYECTO_FINAL,
    SEMINARIO,
)


def _marcar(
    db: Session, usuario: Usuario, codigo: str, condicion: CondicionMateria
) -> None:
    """Escribe la condicion directo en la tabla, salteando el service.

    A proposito: estos tests prueban ``correlatividad_service``, y pasar por
    ``inscripcion_service`` los ataria a la validacion que ese *otro* service
    aplica. Para armar el escenario "tiene AM I regular" no queremos que nadie
    opine si podia tenerla.
    """
    db.add(
        UsuarioMateria(
            usuario_id=usuario.id, materia_codigo=codigo, condicion=condicion
        )
    )
    db.commit()


# ---------------------------------------------------------------------------
# puede_cursar
# ---------------------------------------------------------------------------
def test_sin_correlativas_se_puede_cursar(db: Session, usuario: Usuario) -> None:
    """Una materia de primero se cursa con la libreta vacia."""
    r = correlatividad_service.puede_cursar(db, usuario.id, AM1)
    assert r.permitido is True
    assert r.faltantes == []
    assert r.accion == "cursar"


def test_libreta_vacia_no_habilita_una_materia_con_correlativas(
    db: Session, usuario: Usuario
) -> None:
    r = correlatividad_service.puede_cursar(db, usuario.id, AM2)
    assert r.permitido is False
    # Las dos correlativas de AM II faltan, y cada una reporta que tiene "none".
    assert {f.materia_requerida for f in r.faltantes} == {AM1, ALGEBRA}
    assert all(f.tiene == CondicionMateria.NONE for f in r.faltantes)


def test_correlativa_de_tipo_regular_se_cumple_estando_regular(
    db: Session, usuario: Usuario
) -> None:
    """AM I entra como ``regular``, asi que estar regular alcanza para cursar."""
    _marcar(db, usuario, AM1, CondicionMateria.REGULAR)
    _marcar(db, usuario, ALGEBRA, CondicionMateria.APROBADO)

    r = correlatividad_service.puede_cursar(db, usuario.id, AM2)
    assert r.permitido is True


def test_correlativa_de_tipo_regular_tambien_se_cumple_estando_aprobada(
    db: Session, usuario: Usuario
) -> None:
    """Aprobada es "mas" que regular: nunca puede quedar corta."""
    _marcar(db, usuario, AM1, CondicionMateria.APROBADO)
    _marcar(db, usuario, ALGEBRA, CondicionMateria.APROBADO)

    assert correlatividad_service.puede_cursar(db, usuario.id, AM2).permitido is True


def test_correlativa_de_tipo_aprobada_no_se_cumple_estando_regular(
    db: Session, usuario: Usuario
) -> None:
    """El caso inverso, que es el que de verdad separa los dos tipos.

    Algebra entra en AM II como ``aprobada``: tenerla regular no alcanza, y el
    faltante que se reporta tiene que ser *solo* ella.
    """
    _marcar(db, usuario, AM1, CondicionMateria.REGULAR)
    _marcar(db, usuario, ALGEBRA, CondicionMateria.REGULAR)

    r = correlatividad_service.puede_cursar(db, usuario.id, AM2)
    assert r.permitido is False
    assert [f.materia_requerida for f in r.faltantes] == [ALGEBRA]
    assert r.faltantes[0].tiene == CondicionMateria.REGULAR


def test_cursando_no_cuenta_como_correlativa_cumplida(
    db: Session, usuario: Usuario
) -> None:
    """Estar cursando AM I no habilita AM II: todavia no hay ni regularidad."""
    _marcar(db, usuario, AM1, CondicionMateria.CURSANDO)
    _marcar(db, usuario, ALGEBRA, CondicionMateria.APROBADO)

    r = correlatividad_service.puede_cursar(db, usuario.id, AM2)
    assert r.permitido is False
    assert [f.materia_requerida for f in r.faltantes] == [AM1]


def test_libre_no_cuenta_como_correlativa_cumplida(
    db: Session, usuario: Usuario
) -> None:
    _marcar(db, usuario, AM1, CondicionMateria.LIBRE)
    _marcar(db, usuario, ALGEBRA, CondicionMateria.APROBADO)

    assert correlatividad_service.puede_cursar(db, usuario.id, AM2).permitido is False


def test_una_materia_inexistente_no_explota(db: Session, usuario: Usuario) -> None:
    """Devuelve el motivo en la respuesta, no una excepcion."""
    r = correlatividad_service.puede_cursar(db, usuario.id, "NO-EXISTE")
    assert r.permitido is False
    assert r.motivo == "La materia no existe en el plan."


def test_las_correlativas_no_se_arrastran_en_cadena(
    db: Session, usuario: Usuario
) -> None:
    """La electiva pide AM II regular, y solo eso.

    Que AM II a su vez dependa de AM I y Algebra no se re-verifica: si el
    alumno ya tiene AM II regular, como la consiguio es asunto cerrado. Sin
    este test, "validar recursivamente" parece una mejora razonable y romperia
    a cualquiera que haya regularizado por equivalencia.
    """
    _marcar(db, usuario, AM2, CondicionMateria.REGULAR)

    assert correlatividad_service.puede_cursar(db, usuario.id, ELECTIVA).permitido is True


# ---------------------------------------------------------------------------
# puede_rendir
# ---------------------------------------------------------------------------
def test_para_rendir_no_alcanza_con_la_correlativa_regular(
    db: Session, usuario: Usuario
) -> None:
    """El corazon de T3.1: mismo alumno, misma materia, distinta accion.

    Con AM I regular y Algebra aprobada el alumno **puede cursar** AM II
    (test de mas arriba) pero **no puede rendirla**, porque para el final las
    dos correlativas tienen que estar aprobadas.
    """
    _marcar(db, usuario, AM1, CondicionMateria.REGULAR)
    _marcar(db, usuario, ALGEBRA, CondicionMateria.APROBADO)

    assert correlatividad_service.puede_cursar(db, usuario.id, AM2).permitido is True

    r = correlatividad_service.puede_rendir(db, usuario.id, AM2)
    assert r.permitido is False
    assert r.accion == "rendir"
    assert [f.materia_requerida for f in r.faltantes] == [AM1]


def test_con_todas_las_correlativas_aprobadas_se_rinde(
    db: Session, usuario: Usuario
) -> None:
    _marcar(db, usuario, AM1, CondicionMateria.APROBADO)
    _marcar(db, usuario, ALGEBRA, CondicionMateria.APROBADO)

    assert correlatividad_service.puede_rendir(db, usuario.id, AM2).permitido is True


def test_una_materia_sin_correlativas_se_rinde_siempre(
    db: Session, usuario: Usuario
) -> None:
    assert correlatividad_service.puede_rendir(db, usuario.id, AM1).permitido is True


def test_rendir_una_materia_inexistente_no_explota(
    db: Session, usuario: Usuario
) -> None:
    r = correlatividad_service.puede_rendir(db, usuario.id, "NO-EXISTE")
    assert r.permitido is False
    assert r.motivo == "La materia no existe en el plan."


# ---------------------------------------------------------------------------
# puede_rendir: la regla especial de Proyecto Final
# ---------------------------------------------------------------------------
def test_proyecto_final_exige_todas_las_troncales(
    db: Session, usuario: Usuario
) -> None:
    """Aunque no tenga ni una fila en ``correlatividad``.

    El alumno tiene tres de las cuatro troncales restantes: falta AM II, y el
    motivo tiene que decirlo con todas las letras.
    """
    _marcar(db, usuario, AM1, CondicionMateria.APROBADO)
    _marcar(db, usuario, ALGEBRA, CondicionMateria.APROBADO)
    _marcar(db, usuario, SEMINARIO, CondicionMateria.APROBADO)

    r = correlatividad_service.puede_rendir(db, usuario.id, PROYECTO_FINAL)
    assert r.permitido is False
    assert [f.materia_requerida for f in r.faltantes] == [AM2]
    assert "todas las troncales aprobadas" in (r.motivo or "")


def test_proyecto_final_con_todo_aprobado(db: Session, usuario: Usuario) -> None:
    for codigo in (AM1, ALGEBRA, AM2, SEMINARIO):
        _marcar(db, usuario, codigo, CondicionMateria.APROBADO)

    r = correlatividad_service.puede_rendir(db, usuario.id, PROYECTO_FINAL)
    assert r.permitido is True
    assert r.faltantes == []


def test_proyecto_final_no_se_exige_a_si_mismo(
    db: Session, usuario: Usuario
) -> None:
    """El service hace ``troncales.discard(PROYECTO_FINAL_CODIGO)``.

    Sin ese descarte, Proyecto Final figuraria entre sus propios requisitos y
    no se podria rendir jamas.
    """
    for codigo in (AM1, ALGEBRA, AM2, SEMINARIO):
        _marcar(db, usuario, codigo, CondicionMateria.APROBADO)

    r = correlatividad_service.puede_rendir(db, usuario.id, PROYECTO_FINAL)
    assert PROYECTO_FINAL not in [f.materia_requerida for f in r.faltantes]


def test_proyecto_final_ignora_las_electivas(db: Session, usuario: Usuario) -> None:
    """La regla dice troncales, y la electiva no lo es: sin aprobarla se rinde igual."""
    for codigo in (AM1, ALGEBRA, AM2, SEMINARIO):
        _marcar(db, usuario, codigo, CondicionMateria.APROBADO)

    assert correlatividad_service.puede_rendir(db, usuario.id, PROYECTO_FINAL).permitido is True
    assert ELECTIVA not in [
        f.materia_requerida
        for f in correlatividad_service.puede_rendir(
            db, usuario.id, PROYECTO_FINAL
        ).faltantes
    ]


def test_proyecto_final_hoy_exige_adusi(db: Session, usuario: Usuario) -> None:
    """⚠️ Documenta una **inconsistencia viva entre dos services**, no un acuerdo.

    ``materia_service._MATERIAS_OPCIONALES`` excluye a ADUSI del porcentaje de
    avance porque "no es obligatoria para graduarse en ISI". Pero ADUSI esta
    cargada con ``tipo="troncal"`` en el seed, y la regla de Proyecto Final
    barre *todas* las troncales, asi que aca si la exige.

    O sea: un alumno con todo menos ADUSI ve **100% de avance** y al mismo
    tiempo **no puede rendir Proyecto Final**. Las dos cosas no pueden ser
    ciertas a la vez.

    Este test fija el comportamiento actual para que el cambio sea deliberado.
    Cuando el equipo decida de que lado esta la verdad, el que se rompa es el
    que hay que corregir.
    """
    for codigo in (AM1, ALGEBRA, AM2):
        _marcar(db, usuario, codigo, CondicionMateria.APROBADO)

    r = correlatividad_service.puede_rendir(db, usuario.id, PROYECTO_FINAL)
    assert r.permitido is False
    assert [f.materia_requerida for f in r.faltantes] == [SEMINARIO]


# ---------------------------------------------------------------------------
# calcular_estado (el color del nodo en el grafo)
# ---------------------------------------------------------------------------
def _estado(
    db: Session, codigo: str, condiciones: dict[str, CondicionMateria]
) -> str:
    """Llama a ``calcular_estado`` armando los argumentos desde la DB."""
    from app.repositories import materia_repo

    materia = materia_repo.get_by_codigo(db, codigo)
    assert materia is not None
    return correlatividad_service.calcular_estado(
        materia=materia,
        condicion_actual=condiciones.get(codigo, CondicionMateria.NONE),
        correlativas=materia_repo.correlativas_de_materia(db, codigo),
        condiciones_por_codigo=condiciones,
    )


def test_estado_refleja_la_condicion_cargada(db: Session) -> None:
    """Aprobado, regular y cursando ganan sobre cualquier calculo de correlativas."""
    assert _estado(db, AM2, {AM2: CondicionMateria.APROBADO}) == "aprobado"
    assert _estado(db, AM2, {AM2: CondicionMateria.REGULAR}) == "regular"
    assert _estado(db, AM2, {AM2: CondicionMateria.CURSANDO}) == "cursando"


def test_estado_cursable_cuando_las_correlativas_dan(db: Session) -> None:
    condiciones = {AM1: CondicionMateria.REGULAR, ALGEBRA: CondicionMateria.APROBADO}
    assert _estado(db, AM2, condiciones) == "cursable"


def test_estado_libre_cuando_falta_una_correlativa(db: Session) -> None:
    condiciones = {AM1: CondicionMateria.REGULAR, ALGEBRA: CondicionMateria.REGULAR}
    assert _estado(db, AM2, condiciones) == "libre"


def test_una_materia_sin_correlativas_arranca_cursable(db: Session) -> None:
    """Con la libreta vacia, las de primero ya se ven cursables."""
    assert _estado(db, AM1, {}) == "cursable"


def test_condicion_libre_no_pinta_libre(db: Session) -> None:
    """Choque de nombres que vale la pena fijar.

    ``CondicionMateria.LIBRE`` (el alumno la perdio) y el estado visible
    ``"libre"`` (todavia no la puede cursar) se escriben igual y significan
    cosas distintas. Una materia sin correlativas que el alumno tiene en
    condicion ``libre`` se sigue pintando **cursable**: la puede volver a
    cursar.
    """
    assert _estado(db, AM1, {AM1: CondicionMateria.LIBRE}) == "cursable"
