"""Scraper de horarios de consulta del Dpto. ISI de FRRO.

Fuente: https://www.frro.utn.edu.ar/horarios-consulta

La pagina entrega los datos a traves de un POST al mismo endpoint con el
form de busqueda vacio (devuelve todos los registros). El HTML resultante
tiene una unica tabla de datos:

    Día | Docente | Materia | Lugar | Hora de Inicio | Hora de Fin

- ``Lugar`` puede ser fisico (ej: "5to Piso Dpto Sistemas") o un link
  (Zoom/Meet/Calendar/Forms). En el segundo caso clasificamos modalidad
  como "Virtual"; en el primero, "Presencial".
- La pagina NO publica el email del docente: queda ``None``.

Las columnas se ubican leyendo el header, no por posicion fija: el sitio ya
cambio una vez (el endpoint viejo, ``horarios_consulta_dptoisi2023.php``,
devolvia 404 y no traia "Hora de Fin") y conviene que sumar o reordenar una
columna no rompa el parseo.

Este modulo solo hace fetch + parseo. La persistencia y el matching de
materias contra la DB viven en ``services/profesor_consulta_service.py``.
"""
from __future__ import annotations

import logging
import re
import unicodedata
from dataclasses import dataclass
from datetime import time

import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

URL_HORARIOS_CONSULTA = "https://www.frro.utn.edu.ar/horarios-consulta"
HTTP_TIMEOUT_SECONDS = 30

# Header de la tabla -> campo de ``HorarioParseado``. La clave se busca como
# substring del encabezado normalizado, para tolerar "Inicio" / "Hora de Inicio".
COLUMNAS: dict[str, str] = {
    "dia": "dia",
    "docente": "docente",
    "materia": "materia",
    "lugar": "lugar",
    "inicio": "hora_inicio",
    "fin": "hora_fin",
}
COLUMNAS_REQUERIDAS = ("docente", "materia")

# Sustrings que indican que el "Lugar" es un link en vez de un aula fisica.
_INDICADORES_VIRTUAL: tuple[str, ...] = (
    "http://", "https://", "zoom.us", "meet.google", "calendar", "calendly", "forms",
)


@dataclass(frozen=True, slots=True)
class HorarioParseado:
    """Una fila del scraper, ya normalizada pero todavia sin matchear a la DB."""

    nombre_profesor: str
    email: str | None
    materia_nombre: str | None
    dia: str | None
    hora_inicio: time | None
    hora_fin: time | None
    modalidad: str | None
    aula: str | None


def fetch_html(url: str = URL_HORARIOS_CONSULTA) -> str:
    """Descarga el HTML: hace POST al form vacio. Levanta ``httpx.HTTPError`` si falla.

    El sitio renderiza solo el formulario si se hace GET; hay que enviar el form
    —con los dos filtros vacios— para que devuelva la tabla con todos los
    registros.
    """
    data = {"docente": "", "materia": "", "buscar": "Buscar"}
    with httpx.Client(timeout=HTTP_TIMEOUT_SECONDS, follow_redirects=True) as client:
        resp = client.post(url, data=data)
        resp.raise_for_status()
        return resp.text


def _clean(texto: str) -> str:
    """Colapsa espacios internos y hace strip."""
    return re.sub(r"\s+", " ", texto).strip()


def _parsear_hora(raw: str) -> time | None:
    """'16:30:00' / '16:30' -> time(16, 30). Devuelve None si no matchea."""
    m = re.match(r"^(\d{1,2}):(\d{2})(?::(\d{2}))?$", raw.strip())
    if not m:
        return None
    try:
        return time(int(m.group(1)), int(m.group(2)), int(m.group(3) or 0))
    except ValueError:
        return None


def _clasificar_lugar(lugar: str) -> tuple[str, str | None]:
    """Devuelve (modalidad, aula).

    Si el lugar es un link → ("Virtual", url). Si es fisico → ("Presencial", texto).
    Si el lugar viene vacio → ("Presencial", None) por defecto.
    """
    if not lugar:
        return ("Presencial", None)
    lugar_lower = lugar.lower()
    if any(token in lugar_lower for token in _INDICADORES_VIRTUAL):
        return ("Virtual", lugar)
    return ("Presencial", lugar)


def _normalizar_encabezado(texto: str) -> str:
    """'Hora de Inicio' -> 'hora de inicio' (sin acentos), para ubicar columnas."""
    nfkd = unicodedata.normalize("NFKD", _clean(texto))
    return "".join(c for c in nfkd if not unicodedata.combining(c)).lower()


def _mapear_columnas(fila_header) -> dict[str, int]:  # noqa: ANN001
    """``{campo: indice_de_columna}`` a partir de la fila de encabezados."""
    mapa: dict[str, int] = {}
    for i, celda in enumerate(fila_header.find_all(["th", "td"])):
        encabezado = _normalizar_encabezado(celda.get_text())
        for token, campo in COLUMNAS.items():
            if token in encabezado and campo not in mapa:
                mapa[campo] = i
    return mapa


def parsear_html(html: str) -> list[HorarioParseado]:
    """Extrae las filas de la tabla de horarios de consulta.

    Busca la tabla cuyo header nombra "Docente" y "Materia", mapea las columnas
    por nombre (ver ``COLUMNAS``) y convierte cada fila de datos en un
    ``HorarioParseado``. Filas sin docente se descartan.
    """
    soup = BeautifulSoup(html, "html.parser")
    items: list[HorarioParseado] = []

    tabla = None
    fila_header = None
    columnas: dict[str, int] = {}
    for t in soup.find_all("table"):
        for fila in t.find_all("tr")[:3]:  # el header esta arriba de todo
            mapa = _mapear_columnas(fila)
            if all(campo in mapa for campo in COLUMNAS_REQUERIDAS):
                tabla, fila_header, columnas = t, fila, mapa
                break
        if tabla is not None:
            break

    if tabla is None:
        logger.warning("No se encontro la tabla de horarios en el HTML")
        return items

    faltantes = sorted(set(COLUMNAS.values()) - set(columnas))
    if faltantes:
        logger.warning("La tabla de horarios no trae las columnas %s", faltantes)

    def celda(celdas: list, campo: str) -> str:
        i = columnas.get(campo)
        return _clean(celdas[i].get_text()) if i is not None and i < len(celdas) else ""

    for fila in tabla.find_all("tr"):
        if fila is fila_header:
            continue  # el header tambien puede venir en <td> y parecer una fila
        celdas = fila.find_all("td")
        if len(celdas) <= max(columnas.values()):
            continue  # fila que no es de datos

        docente = celda(celdas, "docente")
        if not docente:
            continue

        lugar = celda(celdas, "lugar")
        modalidad, aula = _clasificar_lugar(lugar)
        items.append(
            HorarioParseado(
                nombre_profesor=docente,
                email=None,
                materia_nombre=celda(celdas, "materia") or None,
                dia=celda(celdas, "dia") or None,
                hora_inicio=_parsear_hora(celda(celdas, "hora_inicio")),
                hora_fin=_parsear_hora(celda(celdas, "hora_fin")),
                modalidad=modalidad,
                aula=aula,
            )
        )

    return items
