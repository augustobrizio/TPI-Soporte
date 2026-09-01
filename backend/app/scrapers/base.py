"""Contrato común de las fuentes del corpus RAG + extractor de texto web.

Una ``FuenteRAG`` solo sabe *traer* documentos de texto de un canal (sitio
web, PDF, ...). No corta, no embebe, no persiste: de eso se encarga el
orquestador de ingesta (``app.rag.ingest``). Es el mismo límite que las
fuentes de novedades, y es lo que permite sumar fuentes sin tocar el pipeline.
"""
from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Protocol, runtime_checkable

from bs4 import BeautifulSoup

# Etiquetas que nunca son contenido (menús, pies, scripts): se descartan antes
# de extraer el texto para que el corpus no se llene de navegación repetida,
# que es justo lo que ensucia el retrieval.
_TAGS_RUIDO = (
    "script", "style", "nav", "header", "footer", "aside", "form", "noscript",
)
# Dónde suele vivir el contenido principal, del más específico al más general.
# WordPress usa ``.entry-content``; muchos temas usan ``main`` o ``article``.
_SELECTORES_CONTENIDO = (".entry-content", "main", "article", "#content", ".content")


@dataclass(frozen=True, slots=True)
class DocumentoRAG:
    """Un documento de texto traído de una fuente, listo para ingestar.

    Es la unidad que consume ``ingestar_fuente``: un texto con la metadata que
    permite citar la fuente (``url``, ``titulo``, ``fecha_actualizacion``). El
    chunking ocurre después, en la ingesta.
    """

    texto: str
    url: str | None = None
    titulo: str | None = None
    fecha_actualizacion: datetime | None = None


@runtime_checkable
class FuenteRAG(Protocol):
    """Protocolo que implementa cada fuente del corpus RAG."""

    #: Etiqueta de la fuente, se persiste en ``rag_chunk.fuente`` (ej.
    #: ``gradiente``, ``frro_web``). Es la clave con la que la ingesta borra y
    #: re-inserta de forma idempotente, así que tiene que ser estable.
    nombre: str

    def fetch_documentos(self) -> Sequence[DocumentoRAG]:
        """Trae los documentos de la fuente.

        Tolerante a fallos parciales: si una página no se puede traer, la
        omite en vez de abortar todo el resto.
        """
        ...


def extraer_texto_html(html: str) -> tuple[str | None, str]:
    """De HTML crudo a ``(titulo, texto_limpio)``.

    Saca menús/scripts/pies y se queda con el bloque de contenido principal,
    para que el corpus tenga texto útil y no la navegación repetida de cada
    página.
    """
    soup = BeautifulSoup(html, "html.parser")

    # El título se toma antes de podar, porque algunos temas lo ponen dentro de
    # nodos que después se descartan.
    titulo = _texto_de(soup.select_one(".entry-title") or soup.find("h1"))
    if not titulo and soup.title:
        titulo = _una_linea(soup.title.get_text(" "))

    for tag in soup(list(_TAGS_RUIDO)):
        tag.decompose()

    contenido = None
    for selector in _SELECTORES_CONTENIDO:
        nodo = soup.select_one(selector)
        if nodo is not None:
            contenido = nodo
            break
    if contenido is None:
        contenido = soup.body or soup

    return titulo, _limpiar_bloques(contenido.get_text("\n"))


def _texto_de(nodo) -> str | None:
    return _una_linea(nodo.get_text(" ")) if nodo is not None else None


def _una_linea(texto: str) -> str:
    return re.sub(r"\s+", " ", texto).strip()


def _limpiar_bloques(texto: str) -> str:
    """Normaliza espacios por línea y descarta las líneas vacías."""
    lineas = (re.sub(r"[ \t]+", " ", linea).strip() for linea in texto.splitlines())
    return "\n".join(linea for linea in lineas if linea)
