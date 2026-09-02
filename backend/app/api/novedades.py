"""Endpoints REST de novedades."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import requerir_admin
from app.db.session import get_db
from app.schemas.novedad import (
    CategoriaNovedadLiteral,
    CentroOut,
    EstadoNovedadLiteral,
    ModerarNovedadIn,
    NovedadOut,
    ResultadoIngesta,
)
from app.services import novedad_service

router = APIRouter(prefix="/novedades", tags=["novedades"])


@router.get("", response_model=list[NovedadOut])
def listar_novedades(
    db: Annotated[Session, Depends(get_db)],
    categoria: CategoriaNovedadLiteral | None = Query(None),
    estado: EstadoNovedadLiteral | None = Query(
        "publicada", description="Filtra por estado; None trae todos (admin)"
    ),
    centro: str | None = Query(None, description="Handle del centro (ej. gradienteutn)"),
    limite: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> list[NovedadOut]:
    """Feed de novedades. Por defecto solo las publicadas."""
    novedades = novedad_service.listar(
        db,
        categoria=categoria,
        estado=estado,
        centro=centro,
        limite=limite,
        offset=offset,
    )
    # Resolvemos la imagen de portada (dedup de placeholders dentro del set).
    imagenes = novedad_service.resolver_imagenes_portada(novedades)
    salida: list[NovedadOut] = []
    for n, imagen_url in zip(novedades, imagenes):
        dto = NovedadOut.model_validate(n)
        dto.imagen_url = imagen_url
        salida.append(dto)
    return salida


@router.get("/centros", response_model=list[CentroOut])
def listar_centros(
    db: Annotated[Session, Depends(get_db)],
) -> list[CentroOut]:
    """Centros con al menos una novedad publicada (insumo del filtro por fuente)."""
    return [CentroOut.model_validate(c) for c in novedad_service.listar_centros(db)]


@router.get("/{novedad_id}", response_model=NovedadOut)
def get_novedad(
    novedad_id: int,
    db: Annotated[Session, Depends(get_db)],
) -> NovedadOut:
    """Detalle de una novedad por ID."""
    novedad = novedad_service.get(db, novedad_id)
    if novedad is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Novedad {novedad_id} no encontrada.",
        )
    return NovedadOut.model_validate(novedad)


@router.patch(
    "/{novedad_id}/moderar",
    response_model=NovedadOut,
    dependencies=[Depends(requerir_admin)],
)
def moderar_novedad(
    novedad_id: int,
    body: ModerarNovedadIn,
    db: Annotated[Session, Depends(get_db)],
) -> NovedadOut:
    """Corrige a mano el estado de una novedad (rol admin, RNF-06).

    Sirve tanto para aprobar una pendiente como para revertir al clasificador:
    republicar algo que descarto mal, o bajar algo que publico de mas. Queda
    marcada como ``moderado_manual`` y se conserva ``estado_llm``.
    """
    novedad = novedad_service.moderar(db, novedad_id, body.estado)
    if novedad is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Novedad {novedad_id} no encontrada.",
        )
    return NovedadOut.model_validate(novedad)


@router.post(
    "/sincronizar",
    response_model=ResultadoIngesta,
    summary="Dispara la ingesta de novedades desde las fuentes configuradas",
    dependencies=[Depends(requerir_admin)],
)
def sincronizar_novedades(
    db: Annotated[Session, Depends(get_db)],
) -> ResultadoIngesta:
    """Ejecuta el pipeline de ingesta on-demand (mismo callable que el scheduler).

    Restringido a rol admin (RNF-06). Es el mas caro de los cinco de
    sincronizacion: cada corrida scrapea las fuentes y pasa cada post por el
    clasificador LLM, o sea que abierto era una factura de API que cualquiera
    podia disparar en loop desde afuera.
    """
    return novedad_service.run_ingesta_novedades(db)
