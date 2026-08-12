"""Endpoints REST para gestionar el estado de las materias de un usuario.

Estos endpoints son los que el frontend del grafo va a usar para que el
usuario marque sus materias como aprobadas, cursando, etc.

Tambien incluye el flujo de importacion masiva desde texto pegado de SYSACAD
(dos pasos: preview sin tocar DB → confirmar).
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import UsuarioActual
from app.core.exceptions import CorrelativasNoCumplidas, MateriaInexistente
from app.db.session import get_db
from app.repositories import materia_repo
from app.schemas.materia import (
    ConfirmarImportIn,
    PegadoSysacadIn,
    PreviewImportSysacad,
    ResultadoImportSysacad,
    UsuarioMateriaIn,
    UsuarioMateriaOut,
)
from app.services import inscripcion_service, sysacad_paste_service

# El usuario sale del token, no de la URL: mientras vino como `{usuario_id}`
# en el path, cualquiera podia leer y escribir el historial de otro alumno
# cambiando el numero. Ahora no hay forma de nombrar a otro usuario.
router = APIRouter(
    prefix="/mi/materias",
    tags=["usuario_materia"],
)


# ---------------------------------------------------------------------------
# CRUD de cursadas individuales
# ---------------------------------------------------------------------------

@router.get("", response_model=list[UsuarioMateriaOut])
def listar_estado(
    usuario: UsuarioActual,
    db: Annotated[Session, Depends(get_db)],
) -> list[UsuarioMateriaOut]:
    """Listado de materias con condición registrada para el usuario."""
    filas = inscripcion_service.listar_estado_usuario(db, usuario.id)
    return [
        UsuarioMateriaOut(
            materia_codigo=f.materia_codigo,
            nombre=f.materia.nombre if f.materia else None,
            condicion=f.condicion,
            nota=f.nota,
            anio_cursada=f.anio_cursada,
        )
        for f in filas
    ]


@router.put("/{codigo}", response_model=UsuarioMateriaOut)
def registrar_estado(
    usuario: UsuarioActual,
    codigo: str,
    payload: UsuarioMateriaIn,
    db: Annotated[Session, Depends(get_db)],
) -> UsuarioMateriaOut:
    """Crea o actualiza el estado del usuario sobre una materia.

    Devuelve 422 si la materia no existe, 409 si no se cumplen las
    correlativas para cursar/regular (a menos que ``forzar=true``).
    """
    try:
        fila = inscripcion_service.registrar_estado(
            db,
            usuario_id=usuario.id,
            materia_codigo=codigo,
            condicion=payload.condicion,
            nota=payload.nota,
            anio_cursada=payload.anio_cursada,
            forzar=payload.forzar,
        )
    except MateriaInexistente as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e)
        )
    except CorrelativasNoCumplidas as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "error": "correlativas_no_cumplidas",
                "mensaje": str(e),
                "materia_codigo": e.materia_codigo,
                "faltantes": e.faltantes,
            },
        )

    db.commit()
    return UsuarioMateriaOut(
        materia_codigo=fila.materia_codigo,
        nombre=fila.materia.nombre if fila.materia else None,
        condicion=fila.condicion,
        nota=fila.nota,
        anio_cursada=fila.anio_cursada,
    )


@router.delete("/{codigo}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_estado(
    usuario: UsuarioActual,
    codigo: str,
    db: Annotated[Session, Depends(get_db)],
) -> None:
    """Borra el registro de cursada del usuario sobre la materia.

    Devuelve 204 si se borró, 404 si no existía.
    """
    borrado = inscripcion_service.eliminar_estado(db, usuario.id, codigo)
    if not borrado:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No tenés registro para la materia '{codigo}'.",
        )
    db.commit()


@router.delete("", status_code=status.HTTP_200_OK)
def resetear_todos(
    usuario: UsuarioActual,
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    """Elimina TODOS los registros de cursada del usuario.

    Útil para reimportar desde SYSACAD desde cero.
    Devuelve ``{"eliminados": N}``.
    """
    eliminados = materia_repo.delete_all_usuario_materias(db, usuario.id)
    db.commit()
    return {"eliminados": eliminados}


# ---------------------------------------------------------------------------
# Importacion masiva desde texto pegado de SYSACAD
# ---------------------------------------------------------------------------

@router.post(
    "/importar-sysacad/preview",
    response_model=PreviewImportSysacad,
    summary="Paso 1: parsear texto pegado de SYSACAD y proponer el mapeo",
)
def preview_importar_sysacad(
    usuario: UsuarioActual,  # noqa: ARG001  (solo exige sesión: el preview no toca la DB)
    payload: PegadoSysacadIn,
    db: Annotated[Session, Depends(get_db)],
) -> PreviewImportSysacad:
    """Recibe el texto del Estado Academico y devuelve un preview sin tocar la DB.

    El alumno pega el texto de SYSACAD (Ctrl+C de la tabla del browser),
    el backend parsea las filas y hace fuzzy matching contra las materias
    existentes para proponer el mapeo.

    - 422 si el texto no contiene filas validas.
    """
    try:
        preview = sysacad_paste_service.parsear_texto(payload.texto, db)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e),
        )
    return preview


@router.post(
    "/importar-sysacad/confirmar",
    response_model=ResultadoImportSysacad,
    summary="Paso 2: aplicar la importacion confirmada por el alumno",
)
def confirmar_importar_sysacad(
    usuario: UsuarioActual,
    payload: ConfirmarImportIn,
    db: Annotated[Session, Depends(get_db)],
) -> ResultadoImportSysacad:
    """Aplica el batch upsert para los items donde ``importar=True``.

    Usa forzar=True para no bloquear historial pasado sin correlativas.
    """
    return sysacad_paste_service.confirmar_importacion(
        db=db,
        usuario_id=usuario.id,
        payload=payload,
    )
