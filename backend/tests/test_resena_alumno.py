"""Tests del merge de votos alumnos + UTNTAC (review_service, feature 004)."""
from __future__ import annotations

import os
import sys
from pathlib import Path

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db.models.review import ReviewCatedra  # noqa: E402
from app.services import review_service  # noqa: E402


def _review(sr=0, r=0, n=0, e=0, se=0, cantidad=0) -> ReviewCatedra:
    return ReviewCatedra(
        materia_codigo="1",
        profesor_id=1,
        super_recomiendo=sr,
        recomiendo=r,
        normal=n,
        evitaria=e,
        super_evitaria=se,
        cantidad_respuestas=cantidad,
    )


def test_combina_ambas_fuentes():
    # UTNTAC: 10 súper recomiendo (nota 5.0). Alumnos: 10 súper evitaría (nivel 1).
    v = review_service.votos_combinados(_review(sr=10, cantidad=10), {1: 10})
    assert v.super_recomiendo == 10
    assert v.super_evitaria == 10
    assert v.cantidad == 20  # 10 UTNTAC + 10 alumnos
    assert v.nota == 3.0  # (5*10 + 1*10) / 20


def test_solo_alumnos_sin_utntac():
    # Sin review de UTNTAC: la nota sale solo de los alumnos.
    v = review_service.votos_combinados(None, {5: 2, 3: 2})
    assert v.cantidad == 4
    assert v.nota == 4.0  # (5*2 + 3*2) / 4


def test_solo_utntac_sin_alumnos():
    v = review_service.votos_combinados(_review(sr=41, r=33, n=13, e=1, se=0, cantidad=88), None)
    assert v.cantidad == 88
    assert v.nota == 4.3  # caso de referencia de 003


def test_sin_datos_nota_none():
    v = review_service.votos_combinados(None, None)
    assert v.cantidad == 0
    assert v.nota is None


def test_un_voto_de_alumno_mueve_la_nota():
    # UTNTAC: 1 súper recomiendo (nota 5.0). Un alumno vota súper evitaría.
    antes = review_service.votos_combinados(_review(sr=1, cantidad=1), None)
    despues = review_service.votos_combinados(_review(sr=1, cantidad=1), {1: 1})
    assert antes.nota == 5.0
    assert despues.nota == 3.0  # (5 + 1) / 2
    assert despues.cantidad == antes.cantidad + 1
