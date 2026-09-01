"""Tool: búsqueda por significado en el corpus de documentos (RAG).

Es la tool "comodín" para preguntas generales sobre la facultad que no están
modeladas en la DB (trámites, reglamentos, servicios).

El `recolector` es una lista que la tool va llenando con los fragmentos que
recuperó. El servicio que arma la respuesta la lee después para poder mostrar
las fuentes al usuario (RNF-12): sin esto, el agente devolvería texto sin que
sepamos de dónde salió.
"""
from __future__ import annotations

from langchain_core.tools import tool
from sqlalchemy.orm import Session

from app.db.models.rag import RagChunk
from app.rag.retriever import recuperar


def crear_rag_search(db: Session, recolector: list[RagChunk]):
    """Devuelve la tool `rag_search` atada a esta sesión de DB."""

    @tool
    def rag_search(consulta: str) -> str:
        """Busca información general sobre la UTN FRRO en los documentos oficiales.

        Usar para preguntas sobre trámites, reglamentos, servicios, instalaciones,
        becas, requisitos administrativos y cualquier tema de la facultad que no
        sean correlativas, horarios, profesores, fechas de examen ni novedades.

        Args:
            consulta: la pregunta o el tema a buscar, en lenguaje natural.
        """
        resultados = recuperar(db, consulta)
        if not resultados:
            return "No se encontró información sobre eso en los documentos."

        recolector.extend(chunk for chunk, _dist in resultados)
        return "\n\n".join(
            f"[{i}] ({chunk.titulo or chunk.fuente}) {chunk.contenido}"
            for i, (chunk, _dist) in enumerate(resultados, start=1)
        )

    return rag_search
