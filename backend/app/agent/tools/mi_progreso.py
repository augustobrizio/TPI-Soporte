"""Tool: progreso académico del estudiante que está usando el chat.

Lee el estado de materias que el alumno cargó en UTNHub (importado de SYSACAD o
registrado a mano) y arma un resumen: cuántas lleva aprobadas, cuántas le faltan
para recibirse, su promedio y qué materias puede cursar ahora.

Reusa ``materia_service.construir_grafo``, que es la misma lógica de negocio que
alimenta el grafo de materias del frontend (estados, contadores, promedio).
"""
from __future__ import annotations

from langchain_core.tools import tool
from sqlalchemy.orm import Session

from app.db.models.academico import TipoMateria
from app.services import materia_service


def crear_mi_progreso(db: Session, usuario_id: int | None):
    """Devuelve la tool `mi_progreso_academico` atada a esta sesión y usuario."""

    @tool
    def mi_progreso_academico() -> str:
        """Estado académico del estudiante que está usando el chat.

        Devuelve cuántas materias lleva aprobadas, cuántas le faltan para
        recibirse, su promedio y qué materias puede cursar ahora, según el
        historial que el estudiante cargó en UTNHub.

        Usar SIEMPRE que el estudiante pregunte por SU propia situación: "cuántas
        materias me faltan", "cuánto me falta para recibirme", "cómo voy con la
        carrera", "cuál es mi promedio", "qué puedo cursar", "qué materias tengo
        aprobadas".
        """
        if usuario_id is None:
            return (
                "No puedo identificar al estudiante en este momento, así que no "
                "puedo consultar su estado académico."
            )

        grafo = materia_service.construir_grafo(
            db, tipo=TipoMateria.TRONCAL, usuario_id=usuario_id
        )
        c = grafo.contadores

        if not grafo.registros_usuario:
            return (
                "El estudiante todavía no cargó ninguna materia en UTNHub, así que "
                "no hay historial para calcular su avance. Sugerir que importe su "
                "historial desde SYSACAD (sección Materias → Importar) o que "
                "registre las materias que ya aprobó."
            )

        faltan = c.total - c.aprobadas
        cursables = [n.nombre for n in grafo.nodos if n.estado == "cursable"]

        partes = [
            "Avance del estudiante en las materias troncales del plan de ISI "
            "(Plan 2023):",
            f"- Materias troncales obligatorias del plan: {c.total}",
            f"- Aprobadas: {c.aprobadas} ({c.porcentaje_aprobadas}%)",
            f"- Le faltan aprobar: {faltan}",
        ]
        if c.regulares:
            partes.append(f"- Regularizadas (falta rendir el final): {c.regulares}")
        if c.cursando:
            partes.append(f"- Cursando actualmente: {c.cursando}")
        if c.promedio_general is not None:
            partes.append(f"- Promedio general (materias aprobadas): {c.promedio_general}")
        if cursables:
            listado = ", ".join(cursables[:8])
            extra = "" if len(cursables) <= 8 else f" (y {len(cursables) - 8} más)"
            partes.append(
                f"- Materias que ya puede cursar ({len(cursables)}): {listado}{extra}"
            )

        partes.append(
            "IMPORTANTE: este avance cubre sólo las materias troncales. Para "
            "recibirse, el plan además exige créditos de materias electivas y el "
            "proyecto final, que no están contados acá."
        )
        return "\n".join(partes)

    return mi_progreso_academico
