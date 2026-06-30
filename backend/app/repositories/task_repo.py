"""Repositorio de tareas — acceso a datos puro, sin reglas de negocio."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models.task import Task


def list_tasks(db: Session, usuario_id: int) -> list[Task]:
    stmt = (
        select(Task)
        .where(Task.usuario_id == usuario_id)
        .order_by(Task.completada, Task.orden, Task.created_at)
    )
    return list(db.scalars(stmt))


def get_by_id(db: Session, task_id: int) -> Task | None:
    return db.get(Task, task_id)


def create_task(db: Session, *, usuario_id: int, **kwargs) -> Task:
    task = Task(usuario_id=usuario_id, **kwargs)
    db.add(task)
    return task


def update_task(db: Session, task: Task, updates: dict) -> Task:
    for k, v in updates.items():
        setattr(task, k, v)
    return task


def delete_task(db: Session, task: Task) -> None:
    db.delete(task)
