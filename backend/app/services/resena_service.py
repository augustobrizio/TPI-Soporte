"""Reglas de negocio de las reseñas de alumnos (feature 004).

Valida que la cátedra exista (materia en el plan + profesor en el padrón) y
delega el upsert/borrado idempotente al repo. El endpoint hace el ``commit``.
"""
from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.core.exceptions import MateriaInexistente, ProfesorInexistente
from app.db.models.academico import CondicionMateria, Materia
from app.db.models.profesor import Profesor
from app.db.models.resena_alumno import ResenaAlumno
from app.repositories import profesor_repo, resena_repo
from app.services import inscripcion_service

# Materias que el alumno cursó o está cursando (donde tuvo profesores a calificar).
_CONDICIONES_CURSADAS = {
    CondicionMateria.APROBADO,
    CondicionMateria.REGULAR,
    CondicionMateria.CURSANDO,
}


def _validar_catedra(db: Session, *, materia_codigo: str, profesor_id: int) -> None:
    """La reseña se ancla a (materia, profesor): ambos deben existir."""
    if db.get(Materia, materia_codigo) is None:
        raise MateriaInexistente(materia_codigo)
    if db.get(Profesor, profesor_id) is None:
        raise ProfesorInexistente(profesor_id)


def upsert_resena(
    db: Session,
    *,
    usuario_id: int,
    materia_codigo: str,
    profesor_id: int,
    nivel: int,
    comentario: str | None,
) -> ResenaAlumno:
    """Crea o actualiza la reseña del alumno para esa cátedra (una por par)."""
    _validar_catedra(db, materia_codigo=materia_codigo, profesor_id=profesor_id)
    resena, _ = resena_repo.upsert_resena(
        db,
        usuario_id=usuario_id,
        profesor_id=profesor_id,
        materia_codigo=materia_codigo,
        nivel=nivel,
        comentario=comentario,
    )
    return resena


def eliminar_resena(
    db: Session, *, usuario_id: int, materia_codigo: str, profesor_id: int
) -> bool:
    """Borra la reseña del alumno para esa cátedra. True si borró algo."""
    return resena_repo.eliminar_resena(
        db, usuario_id=usuario_id, profesor_id=profesor_id, materia_codigo=materia_codigo
    )


def listar_mias(db: Session, usuario_id: int) -> list[ResenaAlumno]:
    return resena_repo.listar_del_usuario(db, usuario_id)


@dataclass(frozen=True, slots=True)
class CatedraParaCalificar:
    materia_codigo: str
    materia_nombre: str | None
    profesores: list[Profesor]


def catedras_para_calificar(db: Session, usuario_id: int) -> list[CatedraParaCalificar]:
    """Cátedras que el alumno cursó/cursa (aprobado, regular o cursando), con sus
    profesores, para ofrecerle calificarlas desde su historial.

    Omite las materias sin profesores vinculados (no hay a quién calificar).
    """
    filas = inscripcion_service.listar_estado_usuario(db, usuario_id)
    relevantes = [f for f in filas if f.condicion in _CONDICIONES_CURSADAS]
    profes = profesor_repo.profesores_por_materias(
        db, [f.materia_codigo for f in relevantes]
    )
    salida: list[CatedraParaCalificar] = []
    for f in relevantes:
        ps = profes.get(f.materia_codigo, [])
        if not ps:
            continue
        salida.append(
            CatedraParaCalificar(
                materia_codigo=f.materia_codigo,
                materia_nombre=f.materia.nombre if f.materia else None,
                profesores=ps,
            )
        )
    return salida
