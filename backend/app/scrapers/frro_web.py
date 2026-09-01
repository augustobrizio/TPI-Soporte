"""Fuente RAG: sitio oficial de FRRO (CMS institucional).

Ingiere una lista curada de páginas académicas/estudiantiles (ingreso,
alumnado, trámites, becas, horarios, calendario). El CMS tiene dos rarezas que
esta fuente resuelve:

- **No hay título por página**: el ``<h1>`` es siempre "Universidad
  Tecnológica Nacional", así que el título de cada página se asigna a mano en
  ``PAGINAS`` (para que las citas del asistente sean legibles).
- **Páginas con colas de listados**: algunas mezclan info útil con volcados
  largos (ej. el catálogo histórico de la biblioteca). Se acota el largo por
  página con ``max_chars`` para que ese contenido —que nadie le pregunta al
  asistente— no domine el corpus y ensucie el retrieval.

Las páginas se curan por id de CMS: varios ítems de menú comparten el mismo id
numérico vía anclas (``/5/Academica`` y ``/5/horarios-y-aulas`` son la misma
página), así que se toma una URL por id.
"""
from __future__ import annotations

import logging
import re
from collections.abc import Sequence
from dataclasses import dataclass

import httpx

from app.scrapers.base import DocumentoRAG, extraer_texto_html, parse_last_modified

logger = logging.getLogger(__name__)

HTTP_TIMEOUT_SECONDS = 30
_MIN_TEXTO = 200
# Encabezado institucional que el CMS repite arriba de cada página. Se saca
# para no meter el mismo ruido en cada documento.
_BOILERPLATE = re.compile(
    r"^\s*Universidad Tecnológica Nacional\s*\n\s*Facultad Regional Rosario\s*\n"
)


@dataclass(frozen=True, slots=True)
class Pagina:
    """Una página curada del sitio, con su título legible y tope opcional."""

    url: str
    titulo: str
    #: Tope de caracteres a ingestar. ``None`` = sin tope. Se usa para páginas
    #: cuya parte útil está arriba y el resto es un listado largo.
    max_chars: int | None = None


PAGINAS: tuple[Pagina, ...] = (
    Pagina("https://www.frro.utn.edu.ar/78/ingreso", "Ingreso a la facultad"),
    Pagina(
        "https://www.frro.utn.edu.ar/73/Alumnado",
        "Departamento de Alumnos: información y trámites",
    ),
    Pagina(
        "https://www.frro.utn.edu.ar/11/Direccion-Academica",
        "Dirección Académica: títulos y trámites",
    ),
    Pagina(
        "https://www.frro.utn.edu.ar/2/Asuntos-Universitarios",
        "Asuntos Universitarios: becas, bolsa de trabajo y deportes",
    ),
    Pagina(
        "https://www.frro.utn.edu.ar/5/horarios-y-aulas",
        "Secretaría Académica: horarios, aulas, bedelía y tutorías",
    ),
    Pagina(
        "https://www.frro.utn.edu.ar/87/Consejo-Directivo",
        "Consejo Directivo y calendario académico",
    ),
    Pagina(
        "https://www.frro.utn.edu.ar/55/Formularios-e-Instructivos",
        "Formularios e instructivos",
    ),
    Pagina(
        "https://www.frro.utn.edu.ar/21/materias-basicas", "Materias básicas"
    ),
    Pagina(
        "https://www.frro.utn.edu.ar/26/ingenieria-en-sistemas-de-informacion-utn",
        "Ingeniería en Sistemas de Información",
    ),
    Pagina(
        "https://www.frro.utn.edu.ar/40/Biblioteca",
        "Biblioteca Manuel Belgrano",
        max_chars=4000,  # el resto de la página es el catálogo histórico
    ),
)


class FrroWebFuente:
    """Scraper de páginas curadas del sitio oficial de FRRO."""

    nombre = "frro_web"

    def __init__(self, paginas: Sequence[Pagina] = PAGINAS) -> None:
        self._paginas = tuple(paginas)

    def fetch_documentos(self) -> Sequence[DocumentoRAG]:
        docs: list[DocumentoRAG] = []
        with httpx.Client(
            timeout=HTTP_TIMEOUT_SECONDS, follow_redirects=True
        ) as client:
            for pagina in self._paginas:
                doc = self._fetch_una(client, pagina)
                if doc is not None:
                    docs.append(doc)
        return docs

    def _fetch_una(
        self, client: httpx.Client, pagina: Pagina
    ) -> DocumentoRAG | None:
        """Trae, limpia y acota una página. Best-effort: ante error, ``None``."""
        try:
            resp = client.get(pagina.url)
            resp.raise_for_status()
        except httpx.HTTPError as exc:
            logger.warning("No se pudo traer %s: %s", pagina.url, exc)
            return None

        _, texto = extraer_texto_html(resp.text)
        texto = _BOILERPLATE.sub("", texto, count=1).strip()
        if pagina.max_chars is not None:
            texto = _recortar(texto, pagina.max_chars)

        if len(texto) < _MIN_TEXTO:
            logger.warning(
                "Página %s con poco texto (%d chars), se omite",
                pagina.url, len(texto),
            )
            return None

        fecha = parse_last_modified(resp.headers.get("last-modified"))
        return DocumentoRAG(
            texto=texto,
            url=pagina.url,
            titulo=pagina.titulo,
            fecha_actualizacion=fecha,
        )


def _recortar(texto: str, max_chars: int) -> str:
    """Recorta a ``max_chars`` sin cortar una palabra al medio."""
    if len(texto) <= max_chars:
        return texto
    corte = texto.rfind(" ", 0, max_chars)
    return texto[: corte if corte > 0 else max_chars].rstrip()
