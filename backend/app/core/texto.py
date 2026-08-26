"""Normalizacion de texto compartida por los matchers.

Vive en ``core`` y no dentro de un servicio porque la usan dominios que no se
conocen entre si: la identidad de profesores (``services/profesor_matching``) y
el matcheo de materias del pegado de SYSACAD (``services/sysacad_paste_service``).
Tener una sola implementacion evita que dos matchers normalicen distinto y
discrepen sobre si dos grafias son la misma cosa.
"""
from __future__ import annotations

import re
import unicodedata


def normalizar_texto(texto: str) -> str:
    """Minusculas, sin acentos, sin puntuacion, espacios colapsados."""
    nfkd = unicodedata.normalize("NFKD", texto)
    sin_tildes = "".join(c for c in nfkd if not unicodedata.combining(c))
    # Los apostrofes se borran (no separan): D’Arrigo -> darrigo.
    sin_apostrofes = re.sub(r"['’`´]", "", sin_tildes)
    return " ".join(re.sub(r"[^0-9a-zñ]+", " ", sin_apostrofes.lower()).split())
