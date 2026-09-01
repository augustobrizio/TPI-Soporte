"""Embeddings del RAG: texto -> vector, vía Google Gemini (LangChain).

Mismo patrón que ``app/ai/clasificador_novedades.py``: cliente cacheado con
``lru_cache``, import local e api key desde settings. El modelo lo define
``RAG_EMBEDDING_MODEL`` (default models/text-embedding-004, 768 dims).
"""
from __future__ import annotations

import logging
import re
import time
from functools import lru_cache

from app.config import get_settings
from app.db.models.rag import EMBEDDING_DIM

logger = logging.getLogger(__name__)

# El tier gratis de Gemini limita los embeddings a 100 por minuto. Al cargar el
# corpus (ingesta) se pasa fácil, así que se manda en sub-lotes y se reintenta
# con backoff cuando la API devuelve 429 (RESOURCE_EXHAUSTED). El chat (una sola
# consulta por pregunta) no lo toca.
_SUB_LOTE = 80
_MAX_REINTENTOS = 6
_ESPERA_DEFAULT_S = 55


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
    """Vectoriza una lista de textos (ingesta del corpus).

    Divide en sub-lotes para no pasar el límite del tier gratis y reintenta con
    backoff si la API tira 429. Se usa offline al cargar el corpus, nunca en el
    camino del chat.
    """
    if not textos:
        return []
    emb = _get_embeddings()
    vectores: list[list[float]] = []
    for i in range(0, len(textos), _SUB_LOTE):
        vectores.extend(_embed_lote_con_reintentos(emb, textos[i : i + _SUB_LOTE]))
    return vectores


def _embed_lote_con_reintentos(emb, lote: list[str]) -> list[list[float]]:
    for intento in range(1, _MAX_REINTENTOS + 1):
        try:
            return emb.embed_documents(lote)
        except Exception as exc:  # noqa: BLE001 - se re-lanza si no es 429
            espera = _segundos_de_espera(exc)
            if espera is None or intento == _MAX_REINTENTOS:
                raise
            logger.warning(
                "Rate limit de embeddings (429); reintento %d/%d en %ds",
                intento, _MAX_REINTENTOS, espera,
            )
            time.sleep(espera)
    return []  # inalcanzable: el loop retorna o re-lanza


def _segundos_de_espera(exc: Exception) -> int | None:
    """Si ``exc`` es un 429, cuántos segundos esperar; si no, ``None``."""
    msg = str(exc)
    if "RESOURCE_EXHAUSTED" not in msg and "429" not in msg:
        return None
    # Google sugiere el retraso: "retry in 52.8s" o "retryDelay: '52s'".
    m = re.search(r"retry in ([\d.]+)s", msg, re.IGNORECASE) or re.search(
        r"retryDelay['\"]?:\s*['\"]?(\d+)", msg
    )
    return int(float(m.group(1))) + 2 if m else _ESPERA_DEFAULT_S


def embed_consulta(texto: str) -> list[float]:
    """Vectoriza la pregunta del usuario, para buscar sus vecinos más cercanos.

    Distinguimos ``embed_consulta`` de ``embed_textos`` por claridad: una carga
    el corpus, la otra resuelve una búsqueda. Deben usar el MISMO modelo (lo
    garantiza el cliente compartido) o las distancias no significan nada.
    """
    return _get_embeddings().embed_query(texto)
