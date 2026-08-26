"""Reglas de negocio de las reviews de cátedra.

- ``nota_catedra``: nota 1–5 de un (profesor, materia) como promedio ponderado de
  sus votos. Cruda (sin ajuste por muestra chica); se expone junto a la cantidad
  de respuestas.
- ``promedio_notas`` / ``score_comision``: promedio de las notas de un conjunto de
  cátedras (para el score de una comisión), informando la cobertura.
"""
from __future__ import annotations

from dataclasses import dataclass

from app.db.models.review import ReviewCatedra

# Peso de cada voto en la escala 1–5.
PESO_SUPER_RECOMIENDO = 5
PESO_RECOMIENDO = 4
PESO_NORMAL = 3
PESO_EVITARIA = 2
PESO_SUPER_EVITARIA = 1


def nota_desde_votos(
    super_recomiendo: int,
    recomiendo: int,
    normal: int,
    evitaria: int,
    super_evitaria: int,
) -> float | None:
    """Promedio ponderado 1–5 de los votos. ``None`` si no hay votos."""
    total = super_recomiendo + recomiendo + normal + evitaria + super_evitaria
    if total <= 0:
        return None
    suma = (
        PESO_SUPER_RECOMIENDO * super_recomiendo
        + PESO_RECOMIENDO * recomiendo
        + PESO_NORMAL * normal
        + PESO_EVITARIA * evitaria
        + PESO_SUPER_EVITARIA * super_evitaria
    )
    return round(suma / total, 2)


def nota_catedra(review: ReviewCatedra | None) -> float | None:
    """Nota 1–5 de una reseña (``None`` si no hay reseña o no tiene votos)."""
    if review is None:
        return None
    return nota_desde_votos(
        review.super_recomiendo,
        review.recomiendo,
        review.normal,
        review.evitaria,
        review.super_evitaria,
    )


@dataclass(frozen=True, slots=True)
class VotosCatedra:
    """Votos combinados de una cátedra: UTNTAC + reseñas de alumnos (feature 004)."""

    super_recomiendo: int
    recomiendo: int
    normal: int
    evitaria: int
    super_evitaria: int
    cantidad: int  # respuestas totales: UTNTAC reportadas + nº de reseñas de alumnos

    @property
    def nota(self) -> float | None:
        return nota_desde_votos(
            self.super_recomiendo,
            self.recomiendo,
            self.normal,
            self.evitaria,
            self.super_evitaria,
        )


def votos_combinados(
    review: ReviewCatedra | None,
    tally_alumnos: dict[int, int] | None,
) -> VotosCatedra:
    """Suma los votos de UTNTAC con los de alumnos (por nivel 1–5).

    ``tally_alumnos`` es ``{nivel: cantidad}`` (5 = súper recomiendo … 1 = súper
    evitaría), consistente con la escala de UTNTAC. Cualquiera de las dos fuentes
    puede faltar.
    """
    t = tally_alumnos or {}
    n_alumnos = sum(t.values())
    return VotosCatedra(
        super_recomiendo=(review.super_recomiendo if review else 0) + t.get(5, 0),
        recomiendo=(review.recomiendo if review else 0) + t.get(4, 0),
        normal=(review.normal if review else 0) + t.get(3, 0),
        evitaria=(review.evitaria if review else 0) + t.get(2, 0),
        super_evitaria=(review.super_evitaria if review else 0) + t.get(1, 0),
        cantidad=(review.cantidad_respuestas if review else 0) + n_alumnos,
    )


@dataclass(frozen=True, slots=True)
class ScoreComision:
    """Score de una comisión: promedio de las notas de sus cátedras con reseña."""

    score: float | None  # None si ninguna cátedra tiene reseña
    con_review: int  # cátedras con reseña (nota calculable)
    total: int  # cátedras consideradas


def score_comision(notas: list[float | None]) -> ScoreComision:
    """Promedio de las notas disponibles + cobertura. ``score`` None si no hay
    ninguna nota."""
    disponibles = [n for n in notas if n is not None]
    total = len(notas)
    if not disponibles:
        return ScoreComision(score=None, con_review=0, total=total)
    return ScoreComision(
        score=round(sum(disponibles) / len(disponibles), 2),
        con_review=len(disponibles),
        total=total,
    )
