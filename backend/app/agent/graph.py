"""Grafo del agente (LangGraph).

El ciclo agéntico es simple y tiene sólo dos nodos:

    START -> agente -> ¿pidió una tool?
                        ├─ sí  -> tools -> vuelve a agente
                        └─ no  -> END

El nodo ``agente`` es el LLM: mira el historial y decide si contesta o si pide
una herramienta (eso último es sólo TEXTO: el modelo no ejecuta nada). El nodo
``tools`` es quien realmente corre la función Python y mete el resultado en el
estado. Por eso el ciclo: el agente necesita ver ese resultado para redactar.
"""
from __future__ import annotations

from datetime import date
from functools import lru_cache

from langchain_core.messages import SystemMessage
from langgraph.graph import END, START, StateGraph
from langgraph.prebuilt import ToolNode, tools_condition
from sqlalchemy.orm import Session

from app.agent.prompts import AGENTE_SYSTEM
from app.agent.state import EstadoAgente
from app.agent.tools import construir_tools
from app.config import get_settings
from app.db.models.rag import RagChunk


@lru_cache
def _get_llm_base():
    """Cliente del LLM, cacheado (crear uno por request sería un desperdicio)."""
    from langchain_google_genai import ChatGoogleGenerativeAI

    settings = get_settings()
    if not settings.google_api_key:
        raise RuntimeError(
            "GOOGLE_API_KEY no configurada: el agente la necesita. Sacá una "
            "gratis en https://aistudio.google.com y cargala en backend/.env."
        )
    # temperature=0: queremos respuestas factuales y decisiones de tool estables.
    return ChatGoogleGenerativeAI(
        model=settings.rag_llm_model,
        google_api_key=settings.google_api_key,
        temperature=0,
        timeout=60,
        max_retries=2,
    )


def construir_grafo(
    db: Session,
    usuario_id: int | None,
    recolector: list[RagChunk],
    recolector_fichas: list[dict],
):
    """Compila el grafo del agente para una consulta concreta.

    Se arma por request porque las tools capturan la sesión de DB y el usuario;
    compilar es barato (no hace I/O), el costo real está en las llamadas al LLM.
    """
    tools = construir_tools(db, usuario_id, recolector, recolector_fichas)
    # bind_tools le describe las herramientas al modelo (nombre, docstring y
    # argumentos). Esa descripción es lo único que el LLM lee para elegir.
    llm = _get_llm_base().bind_tools(tools)

    def nodo_agente(estado: EstadoAgente) -> dict:
        """Le pasa el historial al LLM y devuelve su decisión (respuesta o tool)."""
        # La fecha actual va en el system para que el agente razone 'el próximo',
        # compare vigencia de las fuentes, etc. Se calcula por request.
        sistema = f"{AGENTE_SYSTEM}\n\nFecha actual: {date.today().strftime('%d/%m/%Y')}."
        mensajes = [SystemMessage(content=sistema), *estado["messages"]]
        return {"messages": [llm.invoke(mensajes)]}

    grafo = StateGraph(EstadoAgente)
    grafo.add_node("agente", nodo_agente)
    # ToolNode ejecuta las tools que el LLM haya pedido en el último mensaje.
    grafo.add_node("tools", ToolNode(tools))

    grafo.add_edge(START, "agente")
    # tools_condition mira el último mensaje: si trae tool_calls va a "tools",
    # si no, termina. Es el "if" que decide si el ciclo sigue.
    grafo.add_conditional_edges(
        "agente", tools_condition, {"tools": "tools", END: END}
    )
    # El resultado de la tool vuelve al agente para que redacte con esos datos.
    grafo.add_edge("tools", "agente")

    return grafo.compile()
