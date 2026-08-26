"""Repository del dominio profesor / materia_profesor / horario_consulta.

Unico punto de acceso a la DB para profesores y sus horarios de consulta.
Mantenido pegado al modelo: nada de logica de negocio aca.
"""
from __future__ import annotations

from collections.abc import Sequence
from datetime import time

from sqlalchemy import and_, delete, select
from sqlalchemy.orm import Session

from app.db.models.profesor import HorarioConsulta, MateriaProfesor, Profesor


# ---------------------------------------------------------------------------
# Profesor
# ---------------------------------------------------------------------------
def get_por_nombre_key(db: Session, nombre_key: str) -> Profesor | None:
    """Profesor por su nombre canonico, o ``None``.

    La ``nombre_key`` la calcula ``services/profesor_matching.clave_nombre``:
    quien decide si dos grafias son la misma persona es el service, no este repo.
    """
    stmt = select(Profesor).where(Profesor.nombre_key == nombre_key)
    return db.execute(stmt).scalar_one_or_none()


def crear_profesor(
    db: Session, *, nombre: str, nombre_key: str, email: str | None
) -> Profesor:
    """Inserta un profesor nuevo. El unique de ``nombre_key`` garantiza idempotencia."""
    prof = Profesor(nombre=nombre, nombre_key=nombre_key, email=email)
    db.add(prof)
    db.flush()
    return prof


def actualizar_nombre(
    db: Session, profesor_id: int, *, nombre: str, nombre_key: str
) -> None:
    """Reemplaza el nombre de un profesor y su clave canonica."""
    prof = db.get(Profesor, profesor_id)
    if prof is None:
        return
    prof.nombre = nombre
    prof.nombre_key = nombre_key
    db.flush()


def list_profesores(db: Session) -> Sequence[Profesor]:
    """Lista todos los profesores ordenados por nombre."""
    stmt = select(Profesor).order_by(Profesor.nombre)
    return db.execute(stmt).scalars().all()


def get_profesor_detalle(db: Session, profesor_id: int) -> Profesor | None:
    """Profesor con sus materias y horarios precargados (1 query + selectinload)."""
    from sqlalchemy.orm import selectinload
    stmt = (
        select(Profesor)
        .where(Profesor.id == profesor_id)
        .options(
            selectinload(Profesor.cargos),
            selectinload(Profesor.horarios_consulta),
        )
    )
    return db.execute(stmt).scalar_one_or_none()


def update_email(db: Session, profesor_id: int, email: str) -> None:
    """Actualiza el email de un profesor."""
    prof = db.get(Profesor, profesor_id)
    if prof is None:
        return
    prof.email = email
    db.flush()


def existe_materia_profesor(
    db: Session, *, materia_codigo: str, profesor_id: int
) -> bool:
    """True si ya existe la asociación (materia, profesor) en la DB."""
    stmt = select(MateriaProfesor.id).where(
        and_(
            MateriaProfesor.materia_codigo == materia_codigo,
            MateriaProfesor.profesor_id == profesor_id,
        )
    ).limit(1)
    return db.execute(stmt).scalar_one_or_none() is not None


# ---------------------------------------------------------------------------
# HorarioConsulta
# ---------------------------------------------------------------------------
def delete_all_horarios(db: Session) -> int:
    """Borra todos los horarios de consulta. Devuelve cantidad eliminada."""
    result = db.execute(delete(HorarioConsulta))
    db.flush()
    return result.rowcount or 0


def add_horario(
    db: Session,
    *,
    profesor_id: int,
    dia: str | None,
    hora_inicio: time | None,
    hora_fin: time | None,
    modalidad: str | None,
    aula: str | None,
) -> HorarioConsulta:
    """Inserta un horario nuevo. No deduplica — usar full refresh para idempotencia."""
    hc = HorarioConsulta(
        profesor_id=profesor_id,
        dia=dia,
        hora_inicio=hora_inicio,
        hora_fin=hora_fin,
        modalidad=modalidad,
        aula=aula,
    )
    db.add(hc)
    return hc


# ---------------------------------------------------------------------------
# MateriaProfesor
# ---------------------------------------------------------------------------
def delete_all_materia_profesor(db: Session) -> int:
    """Borra todas las asociaciones materia-profesor. Devuelve cantidad eliminada."""
    result = db.execute(delete(MateriaProfesor))
    db.flush()
    return result.rowcount or 0


def add_materia_profesor(
    db: Session,
    *,
    materia_codigo: str,
    profesor_id: int,
    cargo: str | None = None,
    anio: int | None = None,
) -> MateriaProfesor:
    """Inserta una asociacion materia-profesor."""
    mp = MateriaProfesor(
        materia_codigo=materia_codigo,
        profesor_id=profesor_id,
        cargo=cargo,
        anio=anio,
    )
    db.add(mp)
    return mp


def profesores_por_materias(
    db: Session, codigos: list[str]
) -> dict[str, list[Profesor]]:
    """Profesores vinculados a cada materia (deduplicados por profesor)."""
    if not codigos:
        return {}
    stmt = (
        select(MateriaProfesor.materia_codigo, Profesor)
        .join(Profesor, Profesor.id == MateriaProfesor.profesor_id)
        .where(MateriaProfesor.materia_codigo.in_(codigos))
    )
    out: dict[str, list[Profesor]] = {}
    vistos: set[tuple[str, int]] = set()
    for materia_codigo, prof in db.execute(stmt).all():
        clave = (materia_codigo, prof.id)
        if clave in vistos:
            continue
        vistos.add(clave)
        out.setdefault(materia_codigo, []).append(prof)
    return out
