"""Fuente RAG: blog de Gradiente (centro de estudiantes, WordPress).

Ingiere las páginas con info útil para estudiantes (mails de departamentos,
horarios, trámites, preguntas frecuentes, apoyo académico). Es texto
institucional estable —ideal para el RAG— y WordPress entrega HTML limpio.
"""
from __future__ import annotations

import logging
from collections.abc import Sequence

import httpx

from app.scrapers.base import DocumentoRAG, extraer_texto_html, parse_last_modified

logger = logging.getLogger(__name__)

HTTP_TIMEOUT_SECONDS = 30
# Piso de longitud para considerar que la página trajo contenido real (y no un
# error, un redirect o una página casi vacía). Debajo de esto se descarta.
_MIN_TEXTO = 200

# Páginas curadas del blog. Se eligen a mano (calidad > cantidad): son las que
# concentran la info que un estudiante consulta. Sumar contenido = agregar una
# URL acá.
URLS: tuple[str, ...] = (
    "https://gradienteutn.wordpress.com/info-util/",
    "https://gradienteutn.wordpress.com/preguntas-frecuentes/",
    "https://gradienteutn.wordpress.com/apoyo-academico/",
    "https://gradienteutn.wordpress.com/ceutn/",
)


class GradienteFuente:
    """Scraper de las páginas de info útil de Gradiente."""

    nombre = "gradiente"

    def __init__(self, urls: Sequence[str] = URLS) -> None:
        self._urls = tuple(urls)

    def fetch_documentos(self) -> Sequence[DocumentoRAG]:
        docs: list[DocumentoRAG] = []
        with httpx.Client(
            timeout=HTTP_TIMEOUT_SECONDS, follow_redirects=True
        ) as client:
            for url in self._urls:
                doc = self._fetch_una(client, url)
                if doc is not None:
                    docs.append(doc)
        return docs

    def _fetch_una(self, client: httpx.Client, url: str) -> DocumentoRAG | None:
        """Trae y limpia una página. Best-effort: ante error devuelve ``None``."""
        try:
            resp = client.get(url)
            resp.raise_for_status()
        except httpx.HTTPError as exc:
            logger.warning("No se pudo traer %s: %s", url, exc)
            return None

        titulo, texto = extraer_texto_html(resp.text)
        if len(texto) < _MIN_TEXTO:
            logger.warning(
                "Página %s con poco texto (%d chars), se omite", url, len(texto)
            )
            return None

        fecha = parse_last_modified(resp.headers.get("last-modified"))
        return DocumentoRAG(
            texto=texto, url=url, titulo=titulo, fecha_actualizacion=fecha
        )
