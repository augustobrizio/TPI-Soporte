"""Registro de las tools del agente.

Las tools necesitan la sesión de DB y el usuario que pregunta, pero el LLM sólo
puede pasarles los argumentos que declara su firma. Por eso cada tool se
construye con una *factory* que captura ese contexto en un closure: el modelo
elige la tool y sus argumentos, y la sesión viaja por afuera.
"""
from __future__ import annotations

from langchain_core.tools import BaseTool
from sqlalchemy.orm import Session

from app.agent.tools.buscar_correlativas import crear_buscar_correlativas
from app.agent.tools.buscar_horario_comision import crear_buscar_horario_comision
from app.agent.tools.buscar_profesor import crear_buscar_profesor
from app.agent.tools.ficha_materia import crear_ficha_materia
from app.agent.tools.proximos_eventos import crear_proximos_eventos
from app.agent.tools.rag_search import crear_rag_search
from app.agent.tools.ultimas_novedades import crear_ultimas_novedades
from app.db.models.rag import RagChunk


def construir_tools(
    db: Session,
    usuario_id: int | None,
    recolector: list[RagChunk],
    recolector_fichas: list[dict],
) -> list[BaseTool]:
    """Arma la lista de tools disponibles para una consulta concreta."""
    return [
        crear_rag_search(db, recolector),
        crear_buscar_correlativas(db, usuario_id),
        crear_buscar_horario_comision(db),
        crear_buscar_profesor(db),
        crear_proximos_eventos(db, usuario_id),
        crear_ultimas_novedades(db),
        crear_ficha_materia(db, recolector_fichas),
    ]


__all__ = ["construir_tools"]
