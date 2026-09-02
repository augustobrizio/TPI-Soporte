"""Reglas curadas del Plan 2023 de Ingeniería en Sistemas (ISI).

Datos **autoritativos** del plan que NO vienen de scraping: son estables,
exactos y se usan en cálculos (avance de carrera, requisitos para recibirse).
Viven acá —versionados a mano— y no en el RAG, porque un número que alimenta un
cálculo tiene que ser confiable, no recuperado por similitud de un documento.

Si algún día cambia el plan, se toca este archivo y nada más.
"""
from __future__ import annotations

# Horas (créditos) de materias electivas que el plan exige aprobar para
# recibirse. Las electivas se cursan por créditos: no hay que aprobarlas todas,
# sino juntar estas horas.
HORAS_ELECTIVAS_REQUERIDAS = 20

# Materias que figuran en el plan pero NO son obligatorias para graduarse, así
# que no cuentan para el total de materias ni para el porcentaje de avance.
# ADUSI = Seminario Integrador Profesional.
MATERIAS_OPCIONALES: frozenset[str] = frozenset({"ADUSI"})
