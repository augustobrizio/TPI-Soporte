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

        faltan_troncales = c.total - c.aprobadas
        faltan_horas_elec = max(0, c.meta_creditos_electivas - c.creditos_electivas)
        cursables = [n.nombre for n in grafo.nodos if n.estado == "cursable"]

        partes = [
            "Avance del estudiante en el plan de ISI (Plan 2023):",
            "",
            "TRONCALES (obligatorias):",
            f"- Aprobadas: {c.aprobadas} de {c.total} ({c.porcentaje_aprobadas}%)",
            f"- Le faltan aprobar: {faltan_troncales}",
        ]
        if c.regulares:
            partes.append(f"- Regularizadas (falta rendir el final): {c.regulares}")
        if c.cursando:
            partes.append(f"- Cursando actualmente: {c.cursando}")

        partes += [
            "",
            "ELECTIVAS (por créditos):",
            f"- Lleva {c.creditos_electivas} de {c.meta_creditos_electivas} horas "
            "requeridas",
            f"- Le faltan {faltan_horas_elec} horas de electivas",
        ]

        if c.promedio_general is not None:
            partes += ["", f"Promedio general (aprobadas): {c.promedio_general}"]

        if cursables:
            listado = ", ".join(cursables[:8])
            extra = "" if len(cursables) <= 8 else f" (y {len(cursables) - 8} más)"
            partes.append(
                f"Materias troncales que ya puede cursar ({len(cursables)}): "
                f"{listado}{extra}"
            )

        # Resumen accionable de lo que falta para el título.
        pendientes = []
        if faltan_troncales:
            pendientes.append(f"{faltan_troncales} materias troncales")
        if faltan_horas_elec:
            pendientes.append(f"{faltan_horas_elec} horas de electivas")
        if pendientes:
            partes += [
                "",
                "PARA RECIBIRSE le falta: " + " + ".join(pendientes)
                + ", más el proyecto final.",
            ]
        else:
            partes += [
                "",
                "Ya tiene las troncales y las electivas cubiertas; le queda el "
                "proyecto final.",
            ]
        return "\n".join(partes)

    return mi_progreso_academico
