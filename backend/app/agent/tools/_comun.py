"""Helpers compartidos por las tools del agente.

El usuario escribe "progra 2" o "diseño de sistemas", no el código de la
materia. Estas funciones resuelven ese texto libre contra el plan de estudios
usando matching difuso (rapidfuzz), para que las tools reciban algo usable.
"""
from __future__ import annotations

from rapidfuzz import fuzz, process
from sqlalchemy.orm import Session

from app.db.models.academico import Materia
from app.repositories import materia_repo

# Debajo de este puntaje consideramos que no hubo match confiable.
UMBRAL_MATCH = 65


def buscar_materia(db: Session, texto: str) -> Materia | None:
    """Encuentra la materia cuyo nombre (o código) se parece más a `texto`."""
    texto = (texto or "").strip()
    if not texto:
        return None

    # Si el usuario pasó directamente el código, resolvemos exacto.
    exacta = materia_repo.get_by_codigo(db, texto)
    if exacta is not None:
        return exacta

    materias = list(materia_repo.list_materias(db))
    if not materias:
        return None

    nombres = {m.nombre: m for m in materias}
    match = process.extractOne(
        texto, nombres.keys(), scorer=fuzz.WRatio, score_cutoff=UMBRAL_MATCH
    )
    return nombres[match[0]] if match else None


def formatear_hora(inicio, fin) -> str:
    """'08:00 a 12:00', tolerando horarios incompletos."""
    if inicio is None and fin is None:
        return "horario sin especificar"
    if fin is None:
        return f"desde {inicio.strftime('%H:%M')}"
    if inicio is None:
        return f"hasta {fin.strftime('%H:%M')}"
    return f"{inicio.strftime('%H:%M')} a {fin.strftime('%H:%M')}"
