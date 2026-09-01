"""Embeddings del RAG: texto -> vector, vía Google Gemini (LangChain).

Mismo patrón que ``app/ai/clasificador_novedades.py``: cliente cacheado con
``lru_cache``, import local e api key desde settings. El modelo lo define
``RAG_EMBEDDING_MODEL`` (default models/text-embedding-004, 768 dims).
"""
from __future__ import annotations

from functools import lru_cache

from app.config import get_settings
from app.db.models.rag import EMBEDDING_DIM


@lru_cache
def _get_embeddings():
    # Import local para no exigir langchain-google-genai si el RAG no se usa.
    from langchain_google_genai import GoogleGenerativeAIEmbeddings

    settings = get_settings()
    if not settings.google_api_key:
        raise RuntimeError(
            "GOOGLE_API_KEY no configurada: los embeddings del RAG la "
            "necesitan. Sacá una gratis en https://aistudio.google.com y "
            "cargala en backend/.env."
        )
    # output_dimensionality=768: gemini-embedding-001 devuelve 3072 por default,
    # pero le pedimos 768 para que coincida con la columna Vector(768). Debe ser
    # el mismo valor que EMBEDDING_DIM (única fuente de verdad de la dimensión).
    return GoogleGenerativeAIEmbeddings(
        model=settings.rag_embedding_model,
        google_api_key=settings.google_api_key,
        output_dimensionality=EMBEDDING_DIM,
    )


def embed_textos(textos: list[str]) -> list[list[float]]:
    """Vectoriza una lista de textos en una sola llamada (batch).

    Mandar N textos juntos es más barato y rápido que N llamadas sueltas.
    Se usa al cargar el corpus (ingesta).
    """
    if not textos:
        return []
    return _get_embeddings().embed_documents(textos)


def embed_consulta(texto: str) -> list[float]:
    """Vectoriza la pregunta del usuario, para buscar sus vecinos más cercanos.

    Distinguimos ``embed_consulta`` de ``embed_textos`` por claridad: una carga
    el corpus, la otra resuelve una búsqueda. Deben usar el MISMO modelo (lo
    garantiza el cliente compartido) o las distancias no significan nada.
    """
    return _get_embeddings().embed_query(texto)
