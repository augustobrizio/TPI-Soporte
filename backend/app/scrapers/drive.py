"""Fuente RAG: archivos públicos de Google Drive (gemas sueltas).

Descarga por id una lista curada de archivos de texto públicos del Drive de la
carrera. **No** ingiere los apuntes por año: son material para *leer* (y muchos
son escaneos), así que se ofrecen como link, no como corpus. Acá solo entran
archivos con texto útil y único que no está en otra fuente ni lo cubren las
tools —por ejemplo tips prácticos de los propios estudiantes—.

Solo sirve para archivos subidos (``uc?export=download``), no para Google Docs
nativos (que necesitan el endpoint de export). Si el archivo no es público o es
muy grande, Drive devuelve una pantalla HTML de confirmación y se omite.
"""
from __future__ import annotations

import logging
from collections.abc import Sequence
from dataclasses import dataclass

import httpx

from app.scrapers.base import DocumentoRAG

logger = logging.getLogger(__name__)

HTTP_TIMEOUT_SECONDS = 30
# Las gemas pueden ser cortas (un archivo de tips), así que el piso es bajo.
_MIN_TEXTO = 100
_DOWNLOAD_URL = "https://drive.google.com/uc?export=download&id={file_id}"
_VIEW_URL = "https://drive.google.com/file/d/{file_id}/view"


@dataclass(frozen=True, slots=True)
class ArchivoDrive:
    """Un archivo de Drive curado para el corpus."""

    file_id: str
    titulo: str


ARCHIVOS: tuple[ArchivoDrive, ...] = (
    ArchivoDrive(
        "1109YJqJuRVn4rZakbnDQM4n4K8-b7T6g",
        "Tips para ganarle al Sysacad (inscripción a materias)",
    ),
)


class DriveFuente:
    """Descarga archivos de texto públicos de una lista curada de Drive."""

    nombre = "drive"

    def __init__(self, archivos: Sequence[ArchivoDrive] = ARCHIVOS) -> None:
        self._archivos = tuple(archivos)

    def fetch_documentos(self) -> Sequence[DocumentoRAG]:
        docs: list[DocumentoRAG] = []
        with httpx.Client(
            timeout=HTTP_TIMEOUT_SECONDS, follow_redirects=True
        ) as client:
            for archivo in self._archivos:
                doc = self._fetch_uno(client, archivo)
                if doc is not None:
                    docs.append(doc)
        return docs

    def _fetch_uno(
        self, client: httpx.Client, archivo: ArchivoDrive
    ) -> DocumentoRAG | None:
        try:
            resp = client.get(_DOWNLOAD_URL.format(file_id=archivo.file_id))
            resp.raise_for_status()
        except httpx.HTTPError as exc:
            logger.warning("No se pudo bajar %s: %s", archivo.file_id, exc)
            return None

        texto = resp.text.strip()
        # Drive devuelve HTML (pantalla de confirmación) si el archivo no es
        # público o es muy grande para descarga directa.
        if "<html" in texto[:200].lower() or texto[:9].lower() == "<!doctype":
            logger.warning(
                "Drive devolvió HTML para %s (¿no público o muy grande?), se omite",
                archivo.file_id,
            )
            return None
        if len(texto) < _MIN_TEXTO:
            logger.warning(
                "Archivo %s con poco texto (%d chars), se omite",
                archivo.file_id, len(texto),
            )
            return None

        return DocumentoRAG(
            texto=texto,
            url=_VIEW_URL.format(file_id=archivo.file_id),
            titulo=archivo.titulo,
        )
