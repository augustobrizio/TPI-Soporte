"""Estado que viaja por el grafo del agente.

Es la "memoria de trabajo" de una consulta: la lista de mensajes que se va
acumulando en cada vuelta (pregunta del usuario, decisión del LLM de llamar una
tool, resultado de esa tool, respuesta final).

``add_messages`` es un reducer: cuando un nodo devuelve ``{"messages": [...]}``,
LangGraph los AGREGA a la lista en vez de pisarla. Sin él, cada nodo borraría el
historial y el agente perdería el hilo.

La clave se llama ``messages`` (en inglés) a propósito: es el nombre que esperan
los helpers prearmados de LangGraph (``ToolNode``, ``tools_condition``).
"""
from __future__ import annotations

from typing import Annotated, TypedDict

from langchain_core.messages import AnyMessage
from langgraph.graph.message import add_messages


class EstadoAgente(TypedDict):
    """Estado del grafo: sólo el historial de mensajes de esta consulta."""

    messages: Annotated[list[AnyMessage], add_messages]
