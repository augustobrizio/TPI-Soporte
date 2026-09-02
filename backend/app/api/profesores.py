"""Endpoints del dominio profesor.

Expone:
- ``GET  /profesores`` — listado completo.
- ``POST /profesores/sincronizar-horarios`` — scrapea la pagina del Dpto. ISI
  y hace full refresh de ``horario_consulta`` + ``materia_profesor``.
- ``POST /profesores/sincronizar-mails`` — enriquece emails desde la sheet
  publica de UTNTAC.
- ``POST /profesores/sincronizar-catedras-utntac`` — crea catedras desde la
  sheet de recomendaciones de UTNTAC.

Las lecturas son publicas —el directorio se navega sin cuenta— y las tres
sincronizaciones piden **rol admin** (RNF-06): reescriben tablas compartidas.
"""
from __future__ import annotations

from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from sqlalchemy import func, select
from app.api.deps import requerir_admin
from app.db.models.academico import Materia
from app.db.models.profesor import HorarioConsulta, MateriaProfesor, Profesor
from app.db.session import get_db
from app.repositories import profesor_repo
from app.schemas.profesor import (
    HorarioConsultaOut,
    MateriaProfesorOut,
    ProfesorDetalleOut,
    ProfesorListItem,
    ResultadoSincCatedras,
    ResultadoSincHorarios,
    ResultadoSincMails,
)
from app.services import profesor_consulta_service, profesor_utntac_service

router = APIRouter(prefix="/profesores", tags=["profesores"])


@router.get("", response_model=list[ProfesorListItem])
def listar_profesores(
    db: Annotated[Session, Depends(get_db)],
) -> list[ProfesorListItem]:
    """Lista todos los profesores con contadores de materias y horarios.

    Una sola query con LEFT JOINs y agregaciones — eficiente incluso con
    cientos de profesores. Para ver el detalle de uno, usar GET /profesores/{id}.
    """
    stmt = (
        select(
            Profesor.id,
            Profesor.nombre,
            Profesor.email,
            func.count(func.distinct(MateriaProfesor.materia_codigo)).label("n_mat"),
            func.count(func.distinct(HorarioConsulta.id)).label("n_hor"),
        )
        .outerjoin(MateriaProfesor, MateriaProfesor.profesor_id == Profesor.id)
        .outerjoin(HorarioConsulta, HorarioConsulta.profesor_id == Profesor.id)
        .group_by(Profesor.id)
        .order_by(Profesor.nombre)
    )
    return [
        ProfesorListItem(
            id=row.id,
            nombre=row.nombre,
            email=row.email,
            cantidad_materias=row.n_mat,
            cantidad_horarios=row.n_hor,
        )
        for row in db.execute(stmt).all()
    ]


@router.get("/{profesor_id}", response_model=ProfesorDetalleOut)
def get_profesor(
    profesor_id: int,
    db: Annotated[Session, Depends(get_db)],
) -> ProfesorDetalleOut:
    """Profesor con sus materias asociadas y horarios de consulta.

    - 404 si no existe el profesor.
    """
    prof = profesor_repo.get_profesor_detalle(db, profesor_id)
    if prof is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Profesor {profesor_id} no existe.",
        )

    # Cargar nombres de materias en una sola query
    codigos = [c.materia_codigo for c in prof.cargos]
    nombres_por_codigo: dict[str, str] = {}
    if codigos:
        for cod, nom in db.execute(
            select(Materia.codigo, Materia.nombre).where(Materia.codigo.in_(codigos))
        ).all():
            nombres_por_codigo[cod] = nom

    return ProfesorDetalleOut(
        id=prof.id,
        nombre=prof.nombre,
        email=prof.email,
        materias=[
            MateriaProfesorOut(
                materia_codigo=c.materia_codigo,
                materia_nombre=nombres_por_codigo.get(c.materia_codigo),
                cargo=c.cargo,
                anio=c.anio,
            )
            for c in prof.cargos
        ],
        horarios_consulta=[
            HorarioConsultaOut.model_validate(h) for h in prof.horarios_consulta
        ],
    )


@router.post(
    "/sincronizar-horarios",
    response_model=ResultadoSincHorarios,
    summary="Scrapea horarios de consulta desde FRRO y reemplaza los actuales",
    dependencies=[Depends(requerir_admin)],
)
def sincronizar_horarios(
    db: Annotated[Session, Depends(get_db)],
) -> ResultadoSincHorarios:
    """Full refresh de ``horario_consulta`` y ``materia_profesor`` desde el
    sitio del Dpto. ISI. Los profesores se upsertean para preservar IDs.

    Restringido a rol admin (RNF-06): es destructivo —borra las filas actuales
    antes de reescribirlas— y sale a scrapear un sitio de terceros, asi que
    abierto servia igual como boton de borrado y como ariete contra FRRO.

    - 401/403 si no hay sesion de admin.
    - 422 si el scraper no devuelve filas (cambio la pagina o el formato).
    - 502 si falla la descarga del sitio externo.
    """
    try:
        resultado = profesor_consulta_service.sincronizar_horarios_consulta(db)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e)
        )
    except httpx.HTTPError as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"No se pudo obtener la pagina de FRRO: {e}",
        )

    db.commit()
    return resultado


@router.post(
    "/sincronizar-mails",
    response_model=ResultadoSincMails,
    summary="Enriquece emails de profesores desde la sheet UTNTAC",
    dependencies=[Depends(requerir_admin)],
)
def sincronizar_mails(
    db: Annotated[Session, Depends(get_db)],
) -> ResultadoSincMails:
    """Lee la sheet publica de UTNTAC con mails de docentes.

    Para cada fila con email valido: si el profesor existe en el padron y no
    tiene email, se lo seteamos; si no existe lo creamos. Nunca sobreescribe
    un email previo.

    Restringido a rol admin (RNF-06): crea profesores en el padron.

    - 401/403 si no hay sesion de admin.
    - 502 si falla la descarga del Google Sheet.
    """
    try:
        resultado = profesor_utntac_service.sincronizar_mails(db)
    except httpx.HTTPError as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"No se pudo obtener la sheet de mails: {e}",
        )

    db.commit()
    return resultado


@router.post(
    "/sincronizar-catedras-utntac",
    response_model=ResultadoSincCatedras,
    summary="Crea catedras (profesor<->materia) desde la sheet de recomendaciones UTNTAC",
    dependencies=[Depends(requerir_admin)],
)
def sincronizar_catedras_utntac(
    db: Annotated[Session, Depends(get_db)],
) -> ResultadoSincCatedras:
    """Lee la sheet publica de recomendaciones de UTNTAC.

    Crea profesores nuevos (los que aparecen en la sheet y no estaban) y los
    asocia a la materia correspondiente del plan ISI via ``materia_profesor``.
    Asignaturas que no pertenecen al plan ISI (FISICA, INGLES, ECONOMIA, etc.)
    quedan reportadas pero el profesor igualmente se crea.

    Los puntajes/popularidad/recomendaciones de la sheet NO se capturan por
    ahora (requieren un modelo nuevo).

    Restringido a rol admin (RNF-06): crea profesores y reescribe catedras.

    - 401/403 si no hay sesion de admin.
    - 502 si falla la descarga del Google Sheet.
    """
    try:
        resultado = profesor_utntac_service.sincronizar_catedras(db)
    except httpx.HTTPError as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"No se pudo obtener la sheet de catedras: {e}",
        )

    db.commit()
    return resultado
