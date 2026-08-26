"""Endpoints REST para las reseñas de alumnos (feature 004).

El alumno sale del token (``UsuarioActual``), nunca de la URL: no hay forma de
cargar ni borrar la reseña de otra persona. Mismo criterio que ``/mi/materias``.
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import UsuarioActual
from app.core.exceptions import MateriaInexistente, ProfesorInexistente
from app.db.session import get_db
from app.schemas.resena import (
    CatedraParaCalificarOut,
    ProfesorMiniResena,
    ResenaAlumnoIn,
    ResenaAlumnoOut,
)
from app.services import resena_service

router = APIRouter(prefix="/mi/resenas", tags=["resenas"])


@router.get("", response_model=list[ResenaAlumnoOut])
def listar_mis_resenas(
    usuario: UsuarioActual,
    db: Annotated[Session, Depends(get_db)],
) -> list[ResenaAlumnoOut]:
    """Reseñas que el alumno ya cargó (para prellenar la UI)."""
    return resena_service.listar_mias(db, usuario.id)


@router.get("/catedras", response_model=list[CatedraParaCalificarOut])
def listar_catedras_para_calificar(
    usuario: UsuarioActual,
    db: Annotated[Session, Depends(get_db)],
) -> list[CatedraParaCalificarOut]:
    """Cátedras que el alumno cursó/cursa (con sus profesores), para calificarlas
    desde su historial."""
    cats = resena_service.catedras_para_calificar(db, usuario.id)
    return [
        CatedraParaCalificarOut(
            materia_codigo=c.materia_codigo,
            materia_nombre=c.materia_nombre,
            profesores=[ProfesorMiniResena(id=p.id, nombre=p.nombre) for p in c.profesores],
        )
        for c in cats
    ]


@router.put("", response_model=ResenaAlumnoOut)
def cargar_resena(
    usuario: UsuarioActual,
    payload: ResenaAlumnoIn,
    db: Annotated[Session, Depends(get_db)],
) -> ResenaAlumnoOut:
    """Crea o actualiza la reseña del alumno sobre una cátedra (una por par).

    422 si la materia o el profesor no existen.
    """
    try:
        resena = resena_service.upsert_resena(
            db,
            usuario_id=usuario.id,
            materia_codigo=payload.materia_codigo,
            profesor_id=payload.profesor_id,
            nivel=payload.nivel,
            comentario=payload.comentario,
        )
    except (MateriaInexistente, ProfesorInexistente) as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e)
        )
    db.commit()
    db.refresh(resena)
    return resena


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def borrar_resena(
    usuario: UsuarioActual,
    materia_codigo: str,
    profesor_id: int,
    db: Annotated[Session, Depends(get_db)],
) -> None:
    """Borra la reseña del alumno para esa cátedra. 204 si borró, 404 si no había."""
    borrado = resena_service.eliminar_resena(
        db, usuario_id=usuario.id, materia_codigo=materia_codigo, profesor_id=profesor_id
    )
    if not borrado:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No tenés una reseña cargada para esa cátedra.",
        )
    db.commit()
