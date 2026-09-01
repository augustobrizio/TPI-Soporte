"""Tool: ficha académica estructurada de una materia (§19).

Además de devolverle al agente un resumen en texto, registra la ficha
estructurada en un ``recolector`` para que el frontend la pinte como TARJETA
(año, cuatrimestre, tipo, correlativas). Es lo que convierte al chatbot en una
herramienta académica y no sólo un chat.
"""
from __future__ import annotations

from langchain_core.tools import tool
from sqlalchemy.orm import Session

from app.agent.tools._comun import buscar_materia
from app.repositories import materia_repo

CARRERA = "Ingeniería en Sistemas de Información"


def crear_ficha_materia(db: Session, recolector: list[dict]):
    """Devuelve la tool `ficha_materia` atada a esta sesión y su recolector."""

    @tool
    def ficha_materia(materia: str) -> str:
        """Devuelve la ficha completa de una materia del plan de ISI.

        Incluye año, cuatrimestre, tipo (troncal/electiva) y correlativas. Usar
        cuando el estudiante pide información general sobre una materia, la ficha
        de una materia, o menciona una materia para conocerla.

        Args:
            materia: nombre o código de la materia (ej. "Diseño de Sistemas").
        """
        m = buscar_materia(db, materia)
        if m is None:
            return f"No encontré ninguna materia parecida a '{materia}' en el plan."

        correlativas = materia_repo.correlativas_de_materia(db, m.codigo)
        corr = [
            {
                "nombre": (c.requerida.nombre if c.requerida else c.materia_requerida),
                "tipo": c.tipo or "regular",
            }
            for c in correlativas
        ]

        recolector.append(
            {
                "codigo": m.codigo,
                "nombre": m.nombre,
                "carrera": CARRERA,
                "anio": m.anio_carrera,
                "cuatrimestre": m.cuatrimestre,
                "tipo": m.tipo,
                "correlativas": corr,
            }
        )

        # Resumen en texto para que el agente redacte su respuesta.
        partes = [f"Ficha de {m.nombre} (código {m.codigo}):"]
        if m.anio_carrera:
            partes.append(f"- Año: {m.anio_carrera}º")
        if m.cuatrimestre:
            partes.append(f"- Cuatrimestre: {m.cuatrimestre}")
        if m.tipo:
            partes.append(f"- Tipo: {m.tipo}")
        if corr:
            reqs = ", ".join(f"{c['nombre']} ({c['tipo']})" for c in corr)
            partes.append(f"- Correlativas: {reqs}")
        else:
            partes.append("- No tiene correlativas.")
        return "\n".join(partes)

    return ficha_materia
