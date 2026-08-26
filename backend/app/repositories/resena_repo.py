"""Acceso a datos de ``resena_alumno``."""
from __future__ import annotations

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.db.models.resena_alumno import ResenaAlumno


def get_resena(
    db: Session, *, usuario_id: int, profesor_id: int, materia_codigo: str
) -> ResenaAlumno | None:
    stmt = select(ResenaAlumno).where(
        ResenaAlumno.usuario_id == usuario_id,
        ResenaAlumno.profesor_id == profesor_id,
        ResenaAlumno.materia_codigo == materia_codigo,
    )
    return db.execute(stmt).scalar_one_or_none()


def listar_del_usuario(db: Session, usuario_id: int) -> list[ResenaAlumno]:
    stmt = select(ResenaAlumno).where(ResenaAlumno.usuario_id == usuario_id)
    return list(db.execute(stmt).scalars().all())


def upsert_resena(
    db: Session,
    *,
    usuario_id: int,
    profesor_id: int,
    materia_codigo: str,
    nivel: int,
    comentario: str | None,
) -> tuple[ResenaAlumno, bool]:
    """Crea o actualiza la reseña del usuario para esa cátedra.

    Devuelve ``(resena, creada)``.
    """
    resena = get_resena(
        db, usuario_id=usuario_id, profesor_id=profesor_id, materia_codigo=materia_codigo
    )
    creada = resena is None
    if resena is None:
        resena = ResenaAlumno(
            usuario_id=usuario_id, profesor_id=profesor_id, materia_codigo=materia_codigo
        )
        db.add(resena)
    resena.nivel = nivel
    resena.comentario = comentario
    return resena, creada


def eliminar_resena(
    db: Session, *, usuario_id: int, profesor_id: int, materia_codigo: str
) -> bool:
    """Borra la reseña del usuario para esa cátedra. True si borró algo."""
    stmt = delete(ResenaAlumno).where(
        ResenaAlumno.usuario_id == usuario_id,
        ResenaAlumno.profesor_id == profesor_id,
        ResenaAlumno.materia_codigo == materia_codigo,
    )
    return db.execute(stmt).rowcount > 0


def tallies_por_par(db: Session) -> dict[tuple[str, int], dict[int, int]]:
    """Conteo de votos de alumnos por (materia_codigo, profesor_id) y nivel.

    ``{(materia, profesor): {nivel: cantidad}}`` — para combinar con los votos
    de UTNTAC al calcular la nota.
    """
    stmt = select(
        ResenaAlumno.materia_codigo,
        ResenaAlumno.profesor_id,
        ResenaAlumno.nivel,
        func.count().label("n"),
    ).group_by(
        ResenaAlumno.materia_codigo, ResenaAlumno.profesor_id, ResenaAlumno.nivel
    )
    out: dict[tuple[str, int], dict[int, int]] = {}
    for materia_codigo, profesor_id, nivel, n in db.execute(stmt).all():
        out.setdefault((materia_codigo, profesor_id), {})[nivel] = n
    return out
