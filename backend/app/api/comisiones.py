"""Endpoints REST para el builder de horarios."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import UsuarioActual
from app.db.session import get_db
from app.schemas.comision import (
    ComisionOut,
    MateriaCursableOut,
    OptimizacionOut,
    OptimizarHorarioIn,
    SeleccionarCursadaIn,
)
from app.schemas.materia import UsuarioMateriaOut
from app.services import comision_service

router = APIRouter(tags=["comisiones"])


@router.post(
    "/comisiones/optimizar",
    response_model=OptimizacionOut,
    summary="Optimizar la selección de comisiones según un criterio",
)
def optimizar_horario(
    payload: OptimizarHorarioIn,
    db: Annotated[Session, Depends(get_db)],
) -> OptimizacionOut:
    """Dado un conjunto de materias, prueba combinaciones de comisiones y
    devuelve la mejor sin superposiciones según el criterio elegido
    ('huecos', 'dias' o 'equilibrado').
    """
    return comision_service.optimizar_horario(
        db,
        materias=payload.materias,
        anio=payload.anio,
        cuatrimestre=payload.cuatrimestre,
        criterio=payload.criterio,
        dia_libre=payload.dia_libre,
        turno=payload.turno,
    )


@router.get(
    "/comisiones/con-profesores",
    response_model=list[ComisionOut],
    summary="Comisiones (por año) con materias, profesor resuelto y horarios",
)
def comisiones_con_profesores(
    db: Annotated[Session, Depends(get_db)],
    anio: int | None = Query(None, description="Filtra por año de comisión; None = todas"),
) -> list[ComisionOut]:
    """Comisiones con sus materias, el profesor real resuelto (o None → la UI usa
    el apellido ``docente``) y los horarios. Alimenta la vista `/comisiones`.
    """
    return comision_service.comisiones_con_profesores(db, anio=anio)


@router.get(
    "/comisiones/cursables",
    response_model=list[MateriaCursableOut],
    summary="Materias cursables con sus comisiones y horarios",
)
def materias_cursables(
    usuario: UsuarioActual,
    db: Annotated[Session, Depends(get_db)],
    anio: int = Query(2025, description="Año académico"),
    cuatrimestre: int = Query(..., ge=1, le=2, description="1 o 2"),
) -> list[MateriaCursableOut]:
    """Devuelve las materias que el usuario puede cursar junto con todas sus
    comisiones disponibles (con horarios) para el año y cuatrimestre indicados.

    Incluye materias en estado 'cursable' y 'cursando'.
    """
    return comision_service.materias_cursables_con_comisiones(
        db,
        usuario_id=usuario.id,
        anio=anio,
        cuatrimestre=cuatrimestre,
    )


@router.put(
    "/mi/materias/{codigo}/cursada",
    response_model=UsuarioMateriaOut,
    summary="Seleccionar comisión para una materia",
)
def seleccionar_cursada(
    usuario: UsuarioActual,
    codigo: str,
    payload: SeleccionarCursadaIn,
    db: Annotated[Session, Depends(get_db)],
) -> UsuarioMateriaOut:
    """Asigna la cursada elegida al registro del usuario para esa materia.

    Si no existe el registro, lo crea con condicion='cursando'.
    Devuelve 400 si la cursada no corresponde a la materia indicada.
    """
    try:
        registro = comision_service.seleccionar_cursada(
            db,
            usuario_id=usuario.id,
            materia_codigo=codigo,
            cursada_id=payload.cursada_id,
        )
        db.commit()
        db.refresh(registro)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    return UsuarioMateriaOut(
        materia_codigo=registro.materia_codigo,
        nombre=registro.materia.nombre if registro.materia else None,
        condicion=registro.condicion,
        nota=registro.nota,
        anio_cursada=registro.anio_cursada,
    )


@router.delete(
    "/mi/materias/{codigo}/cursada",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Quitar comisión seleccionada",
)
def deseleccionar_cursada(
    usuario: UsuarioActual,
    codigo: str,
    db: Annotated[Session, Depends(get_db)],
) -> None:
    """Quita la cursada seleccionada sin eliminar el registro usuario_materia.

    Devuelve 404 si el usuario no tiene cursada seleccionada para esa materia.
    """
    ok = comision_service.deseleccionar_cursada(db, usuario.id, codigo)
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No tenés cursada seleccionada para la materia '{codigo}'.",
        )
    db.commit()
