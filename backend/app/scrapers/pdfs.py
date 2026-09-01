"""Fuente RAG: PDFs institucionales de FRRO.

Descarga una lista curada de PDFs y extrae su texto con PyMuPDF (``fitz``).
Mismo criterio que las páginas web: **curado, no todo**. Bajar todos los PDFs
enlazados del sitio metería anexos de CONEAU, backups y demás ruido que ensucia
el retrieval.

OJO — muchas ordenanzas oficiales de FRRO son PDFs **escaneados** (imágenes sin
capa de texto): ``fitz`` devuelve casi nada y esta fuente los omite. Ingerirlos
requeriría OCR, que no está incluido acá.
"""
from __future__ import annotations

import io
import logging
from collections.abc import Sequence
from dataclasses import dataclass

import fitz  # PyMuPDF
import httpx
import pytesseract
from PIL import Image

from app.scrapers.base import DocumentoRAG, parse_last_modified

logger = logging.getLogger(__name__)

HTTP_TIMEOUT_SECONDS = 40
# Piso de texto para distinguir un PDF con contenido de uno escaneado (imágenes,
# sin capa de texto), que ``fitz`` devuelve casi vacío. Debajo de esto se omite
# (o se intenta OCR, si el PDF está marcado con ``ocr=True``).
_MIN_TEXTO = 300
# Rasterizado para OCR: más DPI = más precisión pero más lento. 200 es un buen
# equilibrio para escaneos de texto.
_OCR_DPI = 200
# Tope de páginas a OCR-ear por documento (los escaneos legales largos son muy
# lentos; arriba de esto se corta para no colgar la ingesta).
_OCR_MAX_PAGINAS = 60


@dataclass(frozen=True, slots=True)
class Pdf:
    """Un PDF curado, con su título legible para las citas."""

    url: str
    titulo: str
    #: Si el PDF es un escaneo (imágenes), ``fitz`` no saca texto y hay que
    #: OCR-earlo. Solo se OCR-ea cuando esto es True (el OCR es lento y no
    #: queremos dispararlo por accidente en cualquier PDF corto).
    ocr: bool = False


# PDFs con capa de texto real (verificados). Los reglamentos/ordenanzas oficiales
# quedan afuera porque son escaneos (necesitan OCR). Sumar un PDF = agregar acá.
PDFS: tuple[Pdf, ...] = (
    Pdf(
        "https://f.frro.utn.edu.ar/repositorio/redes/Procedimiento_Alumnos_Alta_Email_Mod_cont_y_cuenta_Office_365.pdf",
        "Instructivo: alta de email institucional y cuenta Office 365 (alumnos)",
    ),
    Pdf(
        "https://f.frro.utn.edu.ar/repositorio/redes/Instructivo Office 365.pdf",
        "Instructivo: Office 365",
    ),
    Pdf(
        "https://f.frro.utn.edu.ar/repositorio/redes/instructivo-cambio-de-contraseña.pdf",
        "Instructivo: cambio de contraseña",
    ),
    Pdf(
        "https://f.frro.utn.edu.ar/repositorio/redes/Manual_de_conexion_wifi.pdf",
        "Instructivo: conexión al WiFi de la facultad",
    ),
    Pdf(
        "https://f.frro.utn.edu.ar/repositorio/redes/matriculacion-automatriculacion.pdf",
        "Instructivo: matriculación en el campus virtual",
    ),
    Pdf(
        "https://f.frro.utn.edu.ar/repositorio/campus/Manual de usuario Teams.pdf",
        "Instructivo: uso de Microsoft Teams",
    ),
    # Reglamentos/ordenanzas: son escaneos (imágenes), se ingieren vía OCR.
    Pdf(
        "https://f.frro.utn.edu.ar/repositorio/secretarias/sac/academica/files/Ordenanza 1549.pdf",
        "Ordenanza 1549: Reglamento de Estudio de la UTN (regularidad, promoción y exámenes)",
        ocr=True,
    ),
    Pdf(
        "https://f.frro.utn.edu.ar/repositorio/secretarias/sac/academica/files/Ordenanza 1566.pdf",
        "Ordenanza 1566: ponderación de calificaciones para el cálculo del promedio",
        ocr=True,
    ),
    Pdf(
        "https://f.frro.utn.edu.ar/repositorio/secretarias/sac/academica/files/Ordenanza 1567.pdf",
        "Ordenanza 1567: pautas de implementación del Reglamento de Estudio (Ord. 1549)",
        ocr=True,
    ),
)


class PdfFuente:
    """Descarga y extrae texto de una lista curada de PDFs de FRRO."""

    nombre = "frro_pdf"

    def __init__(self, pdfs: Sequence[Pdf] = PDFS) -> None:
        self._pdfs = tuple(pdfs)

    def fetch_documentos(self) -> Sequence[DocumentoRAG]:
        docs: list[DocumentoRAG] = []
        with httpx.Client(
            timeout=HTTP_TIMEOUT_SECONDS, follow_redirects=True
        ) as client:
            for pdf in self._pdfs:
                doc = self._fetch_uno(client, pdf)
                if doc is not None:
                    docs.append(doc)
        return docs

    def _fetch_uno(self, client: httpx.Client, pdf: Pdf) -> DocumentoRAG | None:
        try:
            resp = client.get(pdf.url)
            resp.raise_for_status()
        except httpx.HTTPError as exc:
            logger.warning("No se pudo traer %s: %s", pdf.url, exc)
            return None

        try:
            texto = _extraer_texto_pdf(resp.content)
            # Escaneado: la capa de texto vino vacía. Si el PDF está marcado
            # para OCR, se rasteriza y se reconoce; si no, se omite.
            if len(texto) < _MIN_TEXTO and pdf.ocr:
                logger.info("OCR de %s (escaneado)...", pdf.url)
                texto = _ocr_pdf(resp.content)
        except Exception as exc:  # noqa: BLE001 - PDF corrupto/ilegible, se omite
            logger.warning("No se pudo leer el PDF %s: %s", pdf.url, exc)
            return None

        if len(texto) < _MIN_TEXTO:
            detalle = "OCR sin resultado" if pdf.ocr else "¿escaneado? necesitaría OCR"
            logger.warning(
                "PDF %s con poco texto (%d chars): se omite (%s)",
                pdf.url, len(texto), detalle,
            )
            return None

        fecha = parse_last_modified(resp.headers.get("last-modified"))
        return DocumentoRAG(
            texto=texto,
            url=pdf.url,
            titulo=pdf.titulo,
            fecha_actualizacion=fecha,
        )


def _extraer_texto_pdf(contenido: bytes) -> str:
    """Texto de todas las páginas del PDF, con líneas vacías descartadas."""
    with fitz.open(stream=contenido, filetype="pdf") as doc:
        partes = [pagina.get_text() for pagina in doc]
    return _limpiar(partes)


def _ocr_pdf(contenido: bytes) -> str:
    """Reconoce texto de un PDF escaneado: rasteriza cada página y la OCR-ea.

    En español (``lang='spa'``, instalado en la imagen). Lento: se usa solo
    para los reglamentos marcados con ``ocr=True``.
    """
    partes: list[str] = []
    with fitz.open(stream=contenido, filetype="pdf") as doc:
        for numero, pagina in enumerate(doc):
            if numero >= _OCR_MAX_PAGINAS:
                logger.warning(
                    "PDF con más de %d páginas: se OCR-ean solo las primeras",
                    _OCR_MAX_PAGINAS,
                )
                break
            pix = pagina.get_pixmap(dpi=_OCR_DPI)
            imagen = Image.open(io.BytesIO(pix.tobytes("png")))
            partes.append(pytesseract.image_to_string(imagen, lang="spa"))
    return _limpiar(partes)


def _limpiar(partes: list[str]) -> str:
    """Une las páginas y descarta líneas vacías."""
    lineas = (linea.strip() for linea in "\n".join(partes).splitlines())
    return "\n".join(linea for linea in lineas if linea)
