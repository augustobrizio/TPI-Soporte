"""Reglas de inscripcion / registro de estado (T3.2 del Frente 3).

``inscripcion_service`` es la unica puerta por la que el alumno escribe su
libreta, y la regla que aplica no es "validar siempre": valida **solo** cuando
lo que se declara implica estar cursando ahora (``cursando`` y ``regular``).
Marcar algo como ``aprobado`` o ``libre`` entra sin chequear correlativas, a
proposito, porque el caso de uso real es alguien volcando anios de historia
—o el import de SYSACAD— y ahi las correlativas ya se cumplieron en su momento,
aunque la libreta todavia este a medio cargar.

Esa asimetria es facil de "arreglar" de mas (validar todo) o de menos (no
validar nada). Los tests de aca la fijan de los dos lados.
"""
from __future__ import annotations

import pytest
from sqlalchemy.orm import Session

from app.core.exceptions import CorrelativasNoCumplidas, MateriaInexistente
from app.db.models.academico import CondicionMateria
from app.db.models.usuario import Usuario
from app.services import inscripcion_service

from conftest import ALGEBRA, AM1, AM2, ELECTIVA  # noqa: E402


# ---------------------------------------------------------------------------
# registrar_estado: el camino feliz
# ---------------------------------------------------------------------------
def test_registrar_una_materia_sin_correlativas(
    db: Session, usuario: Usuario
) -> None:
    um = inscripcion_service.registrar_estado(
        db,
        usuario_id=usuario.id,
        materia_codigo=AM1,
        condicion=CondicionMateria.CURSANDO,
    )
    db.commit()

    assert um.materia_codigo == AM1
    assert um.condicion == CondicionMateria.CURSANDO
    assert inscripcion_service.listar_estado_usuario(db, usuario.id)[0].materia_codigo == AM1


def test_registrar_es_un_upsert_no_un_insert(db: Session, usuario: Usuario) -> None:
    """Volver a registrar la misma materia pisa la fila, no crea una segunda.

    ``usuario_materia`` tiene un unique (usuario, materia): si esto insertara,
    reventaria contra la constraint en vez de reflejar el avance del alumno.
    """
    inscripcion_service.registrar_estado(
        db,
        usuario_id=usuario.id,
        materia_codigo=AM1,
        condicion=CondicionMateria.CURSANDO,
    )
    db.commit()
    inscripcion_service.registrar_estado(
        db,
        usuario_id=usuario.id,
        materia_codigo=AM1,
        condicion=CondicionMateria.APROBADO,
        nota=8,
    )
    db.commit()

    registros = inscripcion_service.listar_estado_usuario(db, usuario.id)
    assert len(registros) == 1
    assert registros[0].condicion == CondicionMateria.APROBADO
    assert registros[0].nota == 8


# ---------------------------------------------------------------------------
# registrar_estado: cuando SI valida correlativas
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    "condicion", [CondicionMateria.CURSANDO, CondicionMateria.REGULAR]
)
def test_cursando_y_regular_exigen_correlativas(
    db: Session, usuario: Usuario, condicion: CondicionMateria
) -> None:
    """Las dos condiciones que implican cursar ahora se validan igual."""
    with pytest.raises(CorrelativasNoCumplidas) as exc:
        inscripcion_service.registrar_estado(
            db,
            usuario_id=usuario.id,
            materia_codigo=AM2,
            condicion=condicion,
        )

    assert exc.value.materia_codigo == AM2
    assert exc.value.accion == "cursar"
    # El detalle nombra las dos que faltan, para que el front pueda mostrarlo.
    assert len(exc.value.faltantes) == 2


def test_el_rechazo_no_deja_la_fila_a_medias(db: Session, usuario: Usuario) -> None:
    """Si la validacion corta, no se escribio nada."""
    with pytest.raises(CorrelativasNoCumplidas):
        inscripcion_service.registrar_estado(
            db,
            usuario_id=usuario.id,
            materia_codigo=AM2,
            condicion=CondicionMateria.CURSANDO,
        )

    assert inscripcion_service.listar_estado_usuario(db, usuario.id) == []


def test_con_las_correlativas_cumplidas_entra(db: Session, usuario: Usuario) -> None:
    inscripcion_service.registrar_estado(
        db, usuario_id=usuario.id, materia_codigo=AM1, condicion=CondicionMateria.APROBADO
    )
    inscripcion_service.registrar_estado(
        db,
        usuario_id=usuario.id,
        materia_codigo=ALGEBRA,
        condicion=CondicionMateria.APROBADO,
    )
    db.commit()

    um = inscripcion_service.registrar_estado(
        db, usuario_id=usuario.id, materia_codigo=AM2, condicion=CondicionMateria.CURSANDO
    )
    db.commit()
    assert um.condicion == CondicionMateria.CURSANDO


# ---------------------------------------------------------------------------
# registrar_estado: cuando NO valida correlativas
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    "condicion", [CondicionMateria.APROBADO, CondicionMateria.LIBRE]
)
def test_aprobado_y_libre_entran_sin_validar(
    db: Session, usuario: Usuario, condicion: CondicionMateria
) -> None:
    """Cargar historial viejo no exige reconstruir la carrera en orden.

    AM II tiene las dos correlativas sin cumplir y aun asi se puede declarar
    aprobada: es alguien cargando su libreta, no anotandose a cursar.
    """
    um = inscripcion_service.registrar_estado(
        db, usuario_id=usuario.id, materia_codigo=AM2, condicion=condicion
    )
    db.commit()
    assert um.condicion == condicion


def test_forzar_saltea_la_validacion(db: Session, usuario: Usuario) -> None:
    """El escape hatch del import masivo (lo usa el pegado de SYSACAD)."""
    um = inscripcion_service.registrar_estado(
        db,
        usuario_id=usuario.id,
        materia_codigo=AM2,
        condicion=CondicionMateria.CURSANDO,
        forzar=True,
    )
    db.commit()
    assert um.condicion == CondicionMateria.CURSANDO


# ---------------------------------------------------------------------------
# registrar_estado: nota y materia inexistente
# ---------------------------------------------------------------------------
def test_una_materia_fuera_del_plan_es_un_error(
    db: Session, usuario: Usuario
) -> None:
    with pytest.raises(MateriaInexistente) as exc:
        inscripcion_service.registrar_estado(
            db,
            usuario_id=usuario.id,
            materia_codigo="NO-EXISTE",
            condicion=CondicionMateria.APROBADO,
        )
    assert exc.value.codigo == "NO-EXISTE"


def test_la_materia_se_valida_incluso_forzando(
    db: Session, usuario: Usuario
) -> None:
    """``forzar`` saltea las correlativas, no la existencia de la materia.

    Es la diferencia entre "confia en el alumno" y "escribi cualquier cosa":
    una FK a un codigo que no existe reventaria en Postgres igual.
    """
    with pytest.raises(MateriaInexistente):
        inscripcion_service.registrar_estado(
            db,
            usuario_id=usuario.id,
            materia_codigo="NO-EXISTE",
            condicion=CondicionMateria.CURSANDO,
            forzar=True,
        )


def test_la_nota_solo_se_guarda_si_esta_aprobada(
    db: Session, usuario: Usuario
) -> None:
    """Una nota con condicion ``cursando`` se descarta, no se persiste.

    Sin esto, el promedio general —que suma las notas de las aprobadas—
    quedaria expuesto a notas de materias que todavia no terminaron.
    """
    um = inscripcion_service.registrar_estado(
        db,
        usuario_id=usuario.id,
        materia_codigo=AM1,
        condicion=CondicionMateria.CURSANDO,
        nota=9,
    )
    db.commit()
    assert um.nota is None


def test_la_nota_se_guarda_cuando_esta_aprobada(
    db: Session, usuario: Usuario
) -> None:
    um = inscripcion_service.registrar_estado(
        db,
        usuario_id=usuario.id,
        materia_codigo=AM1,
        condicion=CondicionMateria.APROBADO,
        nota=7.5,
        anio_cursada=2024,
    )
    db.commit()
    assert um.nota == 7.5
    assert um.anio_cursada == 2024


def test_pasar_de_aprobada_a_cursando_limpia_la_nota(
    db: Session, usuario: Usuario
) -> None:
    """Corregir un error de carga no deja la nota vieja colgada."""
    inscripcion_service.registrar_estado(
        db,
        usuario_id=usuario.id,
        materia_codigo=AM1,
        condicion=CondicionMateria.APROBADO,
        nota=10,
    )
    db.commit()
    um = inscripcion_service.registrar_estado(
        db, usuario_id=usuario.id, materia_codigo=AM1, condicion=CondicionMateria.CURSANDO
    )
    db.commit()
    assert um.nota is None


# ---------------------------------------------------------------------------
# eliminar_estado y listar_estado_usuario
# ---------------------------------------------------------------------------
def test_eliminar_devuelve_true_y_borra(db: Session, usuario: Usuario) -> None:
    inscripcion_service.registrar_estado(
        db, usuario_id=usuario.id, materia_codigo=AM1, condicion=CondicionMateria.APROBADO
    )
    db.commit()

    assert inscripcion_service.eliminar_estado(db, usuario.id, AM1) is True
    db.commit()
    assert inscripcion_service.listar_estado_usuario(db, usuario.id) == []


def test_eliminar_algo_que_no_estaba_devuelve_false(
    db: Session, usuario: Usuario
) -> None:
    """False y no una excepcion: el endpoint lo traduce a 404."""
    assert inscripcion_service.eliminar_estado(db, usuario.id, AM1) is False


def test_eliminar_no_toca_la_libreta_de_otro(db: Session, usuario: Usuario) -> None:
    """El aislamiento entre alumnos, a nivel service.

    ``test_autorizacion.py`` ya lo cubre por HTTP; esto lo fija una capa mas
    abajo, donde el ``usuario_id`` es un argumento y no sale del token.
    """
    otro = Usuario(email="beto@frro.utn.edu.ar")
    db.add(otro)
    db.commit()

    inscripcion_service.registrar_estado(
        db, usuario_id=usuario.id, materia_codigo=AM1, condicion=CondicionMateria.APROBADO
    )
    db.commit()

    assert inscripcion_service.eliminar_estado(db, otro.id, AM1) is False
    assert len(inscripcion_service.listar_estado_usuario(db, usuario.id)) == 1


def test_listar_devuelve_solo_lo_del_usuario(db: Session, usuario: Usuario) -> None:
    otro = Usuario(email="beto@frro.utn.edu.ar")
    db.add(otro)
    db.commit()

    inscripcion_service.registrar_estado(
        db, usuario_id=usuario.id, materia_codigo=AM1, condicion=CondicionMateria.APROBADO
    )
    inscripcion_service.registrar_estado(
        db, usuario_id=otro.id, materia_codigo=ELECTIVA, condicion=CondicionMateria.APROBADO
    )
    db.commit()

    assert [r.materia_codigo for r in inscripcion_service.listar_estado_usuario(db, usuario.id)] == [AM1]
    assert [r.materia_codigo for r in inscripcion_service.listar_estado_usuario(db, otro.id)] == [ELECTIVA]


def test_una_libreta_vacia_lista_vacio(db: Session, usuario: Usuario) -> None:
    assert inscripcion_service.listar_estado_usuario(db, usuario.id) == []
