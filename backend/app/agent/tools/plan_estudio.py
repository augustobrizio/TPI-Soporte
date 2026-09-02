"""Tool: estructura del plan de estudios de ISI.

Responde preguntas generales (no personales) sobre el plan: cuántas materias
tiene en total y cómo se reparten por año. Distingue troncales obligatorias de
electivas, porque las electivas se aprueban por créditos y no todas son
obligatorias.
"""
from __future__ import annotations

from langchain_core.tools import tool
from sqlalchemy.orm import Session

from app.core.plan import HORAS_ELECTIVAS_REQUERIDAS, MATERIAS_OPCIONALES
from app.db.models.academico import TipoMateria
from app.services import materia_service


def crear_plan_de_estudio(db: Session):
    """Devuelve la tool `plan_de_estudio` atada a esta sesión."""

    @tool
    def plan_de_estudio() -> str:
        """Estructura del plan de estudios de Ingeniería en Sistemas (ISI).

        Devuelve cuántas materias tiene el plan en total y cómo se distribuyen por
        año. Usar para preguntas GENERALES (no sobre un estudiante puntual):
        "cuántas materias tiene la carrera", "cuántas materias son en total para
        recibirse", "qué materias hay en tercer año", "cómo está organizado el
        plan".
        """
        troncales = materia_service.listar_materias(db, tipo=TipoMateria.TRONCAL)
        electivas = materia_service.listar_materias(db, tipo=TipoMateria.ELECTIVA)
        obligatorias = [m for m in troncales if m.codigo not in MATERIAS_OPCIONALES]

        por_anio: dict[int, int] = {}
        for m in obligatorias:
            if m.anio_carrera is None:
                continue
            por_anio[m.anio_carrera] = por_anio.get(m.anio_carrera, 0) + 1

        partes = [
            "Plan de estudios de Ingeniería en Sistemas de Información (Plan 2023):",
            f"- Materias troncales obligatorias: {len(obligatorias)}",
        ]
        for anio in sorted(por_anio):
            partes.append(f"  - {anio}º año: {por_anio[anio]} materias")
        partes.append(
            f"- Materias electivas disponibles: {len(electivas)} "
            f"(se cursan por créditos: hay que juntar {HORAS_ELECTIVAS_REQUERIDAS} "
            "horas, no aprobarlas todas)."
        )
        partes.append(
            "Para recibirse hay que aprobar las troncales obligatorias, juntar las "
            f"{HORAS_ELECTIVAS_REQUERIDAS} horas de electivas y hacer el proyecto "
            "final."
        )
        return "\n".join(partes)

    return plan_de_estudio
