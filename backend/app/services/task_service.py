"""Lógica de negocio del módulo de tareas."""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.db.models.task import Task
from app.repositories import task_repo
from app.schemas.task import TaskCreate, TaskUpdate


def listar_tareas(db: Session, usuario_id: int) -> list[Task]:
    return task_repo.list_tasks(db, usuario_id)


def crear_tarea(db: Session, usuario_id: int, payload: TaskCreate) -> Task:
    return task_repo.create_task(
        db,
        usuario_id=usuario_id,
        **payload.model_dump(exclude_none=True),
    )


def actualizar_tarea(db: Session, task_id: int, payload: TaskUpdate) -> Task:
    task = task_repo.get_by_id(db, task_id)
    if task is None:
        raise ValueError("no_encontrado")
    updates = payload.model_dump(exclude_unset=True)
    return task_repo.update_task(db, task, updates)


def eliminar_tarea(db: Session, task_id: int) -> bool:
    task = task_repo.get_by_id(db, task_id)
    if task is None:
        return False
    task_repo.delete_task(db, task)
    return True
