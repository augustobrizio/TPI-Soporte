"""Repository para comisiones, cursadas y horarios."""
from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session, contains_eager, joinedload, selectinload

from app.db.models.academico import Comision, Cursada, Horario, UsuarioMateria


def listar_comisiones(
    db: Session, *, anio: int, cuatrimestre: int
) -> list[Comision]:
    """Lista comisiones con sus cursadas y horarios para un año/cuatrimestre."""
    stmt = (
        select(Comision)
        .join(Comision.cursadas)
        .where(Cursada.cuatrimestre == cuatrimestre)
        .options(
            selectinload(Comision.cursadas.and_(Cursada.cuatrimestre == cuatrimestre))
            .selectinload(Cursada.horarios),
            selectinload(Comision.cursadas.and_(Cursada.cuatrimestre == cuatrimestre))
            .selectinload(Cursada.materia),
        )
        .where(Comision.anio == anio)
        .order_by(Comision.nombre)
        .distinct()
    )
    return list(db.execute(stmt).scalars().all())


def listar_comisiones_con_profesor(
    db: Session, *, anio: int | None = None
) -> list[Comision]:
    """Comisiones con sus cursadas (todos los cuatrimestres) para la vista.

    Eager-load de materia, horarios y el profesor resuelto de cada cursada.
    Si ``anio`` es None, devuelve todas las comisiones.
    """
    stmt = (
        select(Comision)
        .options(
            selectinload(Comision.cursadas).selectinload(Cursada.materia),
            selectinload(Comision.cursadas).selectinload(Cursada.horarios),
            selectinload(Comision.cursadas).selectinload(Cursada.profesor),
        )
        .order_by(Comision.anio, Comision.nombre)
    )
    if anio is not None:
        stmt = stmt.where(Comision.anio == anio)
    return list(db.execute(stmt).scalars().all())


def cursadas_para_materias(
    db: Session,
    *,
    codigos: list[str],
    anio: int,
    cuatrimestre: int,
) -> list[Cursada]:
    """Cursadas de un conjunto de materias para un año/cuatrimestre dado."""
    stmt = (
        select(Cursada)
        .join(Cursada.comision)
        .where(
            Cursada.materia_codigo.in_(codigos),
            Cursada.cuatrimestre == cuatrimestre,
            Comision.anio == anio,
        )
        .options(
            # comision y materia son many-to-one: se pliegan al query principal
            # sin multiplicar filas. `contains_eager` ademas reutiliza el JOIN
            # que ya hace el WHERE de arriba, asi que sale gratis. horarios es
            # one-to-many y sigue por selectinload (un JOIN duplicaria cursadas).
            contains_eager(Cursada.comision),
            joinedload(Cursada.materia),
            selectinload(Cursada.horarios),
        )
        .order_by(Comision.nombre)
    )
    return list(db.execute(stmt).scalars().all())


def cursadas_por_nombre_comision(
    db: Session,
    *,
    materia_codigo: str,
    comision_nombre: str,
) -> list[Cursada]:
    """Cursadas de una materia en la comision con ese nombre ('4K02').

    Ordenadas por año descendente y cuatrimestre ascendente: quien llame se
    queda con la primera que le sirva (la mas reciente). El nombre se compara
    normalizado —``upper()`` + sin espacios— porque llega de texto pegado por
    el alumno, no de un desplegable.
    """
    objetivo = comision_nombre.strip().upper()
    if not objetivo:
        return []
    stmt = (
        select(Cursada)
        .join(Cursada.comision)
        .where(
            Cursada.materia_codigo == materia_codigo,
            func.upper(func.trim(Comision.nombre)) == objetivo,
        )
        .options(contains_eager(Cursada.comision))
        .order_by(Comision.anio.desc(), Cursada.cuatrimestre)
    )
    return list(db.execute(stmt).scalars().all())


def get_cursada(db: Session, cursada_id: int) -> Cursada | None:
    return db.get(Cursada, cursada_id)


def get_cursada_usuario(
    db: Session, usuario_id: int, materia_codigo: str
) -> UsuarioMateria | None:
    stmt = select(UsuarioMateria).where(
        UsuarioMateria.usuario_id == usuario_id,
        UsuarioMateria.materia_codigo == materia_codigo,
    )
    return db.execute(stmt).scalar_one_or_none()


def listar_livianas(db: Session) -> list[Comision]:
    """Comisiones sin eager-loads: sólo ``id``, ``nombre`` y ``anio``.

    Para el buscador global, que matchea contra el nombre y nada más. Las
    otras dos funciones de listado precargan cursadas, materias, horarios y
    profesores — traer todo eso para descartarlo enseguida son varios
    round-trips a Neon por cada tecla que se aprieta en el command palette.
    """
    stmt = select(Comision).order_by(
        Comision.anio.desc().nullslast(), Comision.nombre
    )
    return list(db.execute(stmt).scalars().all())
