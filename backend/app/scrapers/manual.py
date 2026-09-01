"""Fuente RAG: notas redactadas a mano por el equipo.

Para aclaraciones autoritativas que no están —o están desactualizadas— en las
fuentes externas. Ejemplo: cuál es el plan de estudios vigente (el sitio linkea
el plan 2008, discontinuado). Es texto propio, curado, que el equipo puede
afirmar con certeza. Se usa con mesura: solo datos estables y verificados.
"""
from __future__ import annotations

from collections.abc import Sequence

from app.scrapers.base import DocumentoRAG

# Cada nota es un hecho que el equipo sostiene. Sumar una nota = agregar acá.
NOTAS: tuple[DocumentoRAG, ...] = (
    DocumentoRAG(
        titulo="Plan de estudios vigente de Ingeniería en Sistemas de Información",
        texto=(
            "El plan de estudios vigente de la carrera Ingeniería en Sistemas de "
            "Información (ISI) en la UTN Facultad Regional Rosario es el plan "
            "2023. El plan 2008 está discontinuado: quienes ingresan cursan con "
            "el plan 2023. Para el detalle de materias, correlatividades y año de "
            "cada asignatura del plan 2023, se pueden usar las herramientas del "
            "asistente (correlativas y materias) o la sección de planes de "
            "estudio del sitio oficial de la facultad."
        ),
        url="https://www.frro.utn.edu.ar/26/ingenieria-en-sistemas-de-informacion-utn",
    ),
)


class ManualFuente:
    """Notas curadas a mano por el equipo, como cualquier otra fuente RAG."""

    nombre = "manual"

    def __init__(self, notas: Sequence[DocumentoRAG] = NOTAS) -> None:
        self._notas = tuple(notas)

    def fetch_documentos(self) -> Sequence[DocumentoRAG]:
        return self._notas
