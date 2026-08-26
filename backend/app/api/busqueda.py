"""Endpoint del buscador global.

Es **público a propósito**: materias, profesores, comisiones y novedades ya
se navegan sin cuenta (la app es pública por defecto y sólo lo personal pide
sesión), así que pedir token acá dejaría el buscador de la barra superior
muerto justo para el visitante que todavía no se registró — que es a quien
más le sirve para encontrar algo.
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.busqueda import RespuestaBusqueda
from app.services import busqueda_service

router = APIRouter(tags=["busqueda"])


@router.get(
    "/buscar",
    response_model=RespuestaBusqueda,
    summary="Búsqueda global por materias, profesores, comisiones y novedades",
)
def buscar(
    db: Annotated[Session, Depends(get_db)],
    q: Annotated[
        str,
        Query(
            max_length=100,
            description="Texto a buscar. Ignora acentos y mayúsculas.",
        ),
    ] = "",
    limite: Annotated[
        int,
        Query(ge=1, le=20, description="Máximo de resultados por tipo."),
    ] = busqueda_service.LIMITE_POR_TIPO,
) -> RespuestaBusqueda:
    """Resultados agrupados por tipo, como los pinta el command palette.

    ``q`` acepta el string vacío y no es obligatorio: el frontend dispara la
    búsqueda mientras se escribe, y una consulta corta tiene que devolver
    "nada por ahora", no un 422 que hay que distinguir de un error real.
    """
    return busqueda_service.buscar(db, q, limite_por_tipo=limite)
