"""Orquesta la construcción de respuestas del dominio académico.

Esto incluye armar el grafo (nodos + edges + contadores) que consume el
frontend para pintar el árbol de materias. La validación de
correlatividades concretas vive en ``correlatividad_service``.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.core.plan import HORAS_ELECTIVAS_REQUERIDAS, MATERIAS_OPCIONALES
from app.db.models.academico import (
    CondicionMateria,
    Materia,
    TipoMateria,
)
from app.repositories import materia_repo
from app.schemas.materia import (
    ContadoresGrafo,
    CorrelativaEdge,
    GrafoResponse,
    MateriaNodo,
    TipoCorrelativaLiteral,
    TipoMateriaLiteral,
)
from app.services.correlatividad_service import calcular_estado


def listar_materias(db: Session, *, tipo: str | None = None):
    """Lista plana de materias (para listados sin grafo)."""
    return materia_repo.list_materias(db, tipo=tipo)


def get_materia(db: Session, codigo: str) -> Materia | None:
    return materia_repo.get_by_codigo(db, codigo)


def construir_grafo(
    db: Session,
    *,
    tipo: TipoMateriaLiteral,
    usuario_id: int | None = None,
) -> GrafoResponse:
    """Construye la respuesta del grafo para una pestaña (troncal o electiva).

    Si ``usuario_id`` es None, todos los nodos quedan en estado "libre" y
    los contadores reflejan al usuario anónimo. La firma soporta usuario
    opcional para mostrar la grilla pública sin login.
    """
    materias = materia_repo.list_materias(db, tipo=tipo)
    codigos = [m.codigo for m in materias]

    correlativas = materia_repo.correlativas_de(db, codigos)

    condiciones = (
        materia_repo.condiciones_usuario(db, usuario_id)
        if usuario_id is not None
        else {}
    )

    # Metricas globales cross-tab (una sola query extra con todas las materias).
    todas_las_materias = materia_repo.list_materias(db) if usuario_id is not None else []
    carga_horaria_cursando = sum(
        m.horas or 0
        for m in todas_las_materias
        if condiciones.get(m.codigo, CondicionMateria.NONE) == CondicionMateria.CURSANDO
    )
    creditos_electivas = sum(
        m.horas or 0
        for m in todas_las_materias
        if m.tipo == "electiva"
        and condiciones.get(m.codigo, CondicionMateria.NONE) == CondicionMateria.APROBADO
    )
    notas = (
        materia_repo.notas_usuario(db, usuario_id)
        if usuario_id is not None
        else {}
    )

    # Promedio general cross-tab: todas las aprobadas con nota (troncales + electivas).
    notas_aprobadas = [
        nota
        for codigo, nota in notas.items()
        if nota is not None
        and condiciones.get(codigo, CondicionMateria.NONE) == CondicionMateria.APROBADO
    ]
    promedio_general = (
        round(sum(notas_aprobadas) / len(notas_aprobadas), 2)
        if notas_aprobadas
        else None
    )

    # Indexar correlativas por materia destino para no recalcular en el loop.
    correlativas_por_materia: dict[str, list] = {}
    for corr in correlativas:
        correlativas_por_materia.setdefault(corr.materia_codigo, []).append(corr)

    nodos: list[MateriaNodo] = []
    contadores = {"aprobado": 0, "regular": 0, "cursando": 0, "cursable": 0, "libre": 0}

    for materia in materias:
        actual = condiciones.get(materia.codigo, CondicionMateria.NONE)
        estado = calcular_estado(
            materia=materia,
            condicion_actual=actual,
            correlativas=correlativas_por_materia.get(materia.codigo, []),
            condiciones_por_codigo=condiciones,
        )
        contadores[estado] += 1
        nodos.append(
            MateriaNodo(
                codigo=materia.codigo,
                nombre=materia.nombre,
                anio_carrera=materia.anio_carrera,
                cuatrimestre=materia.cuatrimestre,
                horas=materia.horas,
                tipo=materia.tipo,  # type: ignore[arg-type]
                estado=estado,
                nota=notas.get(materia.codigo),
            )
        )

    edges = [
        CorrelativaEdge(
            desde=corr.materia_requerida,
            hacia=corr.materia_codigo,
            tipo=_normalizar_tipo_correlativa(corr.tipo),
        )
        for corr in correlativas
        if _normalizar_tipo_correlativa(corr.tipo) is not None
    ]

    # ADUSI (Seminario Integrador) no es obligatoria para graduarse:
    # se excluye del total y del porcentaje, pero sigue apareciendo en el grafo.
    total = len(materias)
    total_obligatorias = sum(1 for m in materias if m.codigo not in MATERIAS_OPCIONALES)
    aprobadas_obligatorias = sum(
        1 for n in nodos
        if n.codigo not in MATERIAS_OPCIONALES and n.estado == "aprobado"
    )
    porcentaje = (
        round(aprobadas_obligatorias / total_obligatorias * 100, 1)
        if total_obligatorias else 0.0
    )
    contadores_grafo = ContadoresGrafo(
        aprobadas=aprobadas_obligatorias,
        regulares=contadores["regular"],
        cursando=contadores["cursando"],
        cursables=contadores["cursable"],
        libres=contadores["libre"],
        total=total_obligatorias,
        porcentaje_aprobadas=porcentaje,
        carga_horaria_cursando=carga_horaria_cursando,
        creditos_electivas=creditos_electivas,
        meta_creditos_electivas=HORAS_ELECTIVAS_REQUERIDAS,
        promedio_general=promedio_general,
    )

    registros_usuario = {
        codigo: condicion.value
        for codigo, condicion in condiciones.items()
        if condicion != CondicionMateria.NONE
    }

    # Nodos de otras pestanas referenciados en edges (ej: troncales en grafos de electivas).
    codigos_set = set(codigos)
    externos_codigos = {
        corr.materia_requerida
        for corr in correlativas
        if corr.materia_requerida not in codigos_set
    }
    nodos_externos: list[MateriaNodo] = []
    if externos_codigos:
        ext_materias = materia_repo.get_by_codigos(db, externos_codigos)
        for m in ext_materias:
            condicion_ext = condiciones.get(m.codigo, CondicionMateria.NONE)
            estado_ext = calcular_estado(
                materia=m,
                condicion_actual=condicion_ext,
                correlativas=[],
                condiciones_por_codigo=condiciones,
            )
            nodos_externos.append(
                MateriaNodo(
                    codigo=m.codigo,
                    nombre=m.nombre,
                    anio_carrera=m.anio_carrera,
                    cuatrimestre=m.cuatrimestre,
                    horas=m.horas,
                    tipo=m.tipo,  # type: ignore[arg-type]
                    estado=estado_ext,
                    nota=notas.get(m.codigo),
                )
            )

    return GrafoResponse(
        tipo=tipo,
        nodos=nodos,
        edges=edges,
        contadores=contadores_grafo,
        registros_usuario=registros_usuario,
        nodos_externos=nodos_externos,
    )


def _normalizar_tipo_correlativa(tipo: str | None) -> TipoCorrelativaLiteral | None:
    """Filtra valores no esperados para no romper el schema de la edge."""
    if tipo in ("regular", "aprobada"):
        return tipo  # type: ignore[return-value]
    return None


__all__ = [
    "TipoMateria",
    "construir_grafo",
    "get_materia",
    "listar_materias",
]
