"""Endpoints REST del módulo de tareas."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.task import TaskCreate, TaskOut, TaskUpdate
from app.services import task_service

router = APIRouter(prefix="/tareas", tags=["tareas"])

# TODO: reemplazar con usuario real cuando se implemente auth
_USUARIO_DEFAULT = 1


@router.get("", response_model=list[TaskOut])
def listar_tareas(
    db: Annotated[Session, Depends(get_db)],
    usuario_id: int = Query(_USUARIO_DEFAULT),
) -> list[TaskOut]:
    return task_service.listar_tareas(db, usuario_id)


@router.post("", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
def crear_tarea(
    payload: TaskCreate,
    db: Annotated[Session, Depends(get_db)],
    usuario_id: int = Query(_USUARIO_DEFAULT),
) -> TaskOut:
    tarea = task_service.crear_tarea(db, usuario_id, payload)
    db.commit()
    db.refresh(tarea)
    return TaskOut.model_validate(tarea)


@router.put("/{tarea_id}", response_model=TaskOut)
def actualizar_tarea(
    tarea_id: int,
    payload: TaskUpdate,
    db: Annotated[Session, Depends(get_db)],
) -> TaskOut:
    try:
        tarea = task_service.actualizar_tarea(db, tarea_id, payload)
        db.commit()
        db.refresh(tarea)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tarea no encontrada.")
    return TaskOut.model_validate(tarea)


@router.delete("/{tarea_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_tarea(
    tarea_id: int,
    db: Annotated[Session, Depends(get_db)],
) -> None:
    ok = task_service.eliminar_tarea(db, tarea_id)
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tarea no encontrada.")
    db.commit()
