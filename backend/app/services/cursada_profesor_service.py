"""Resolucion docente -> profesor para cursadas.

El campo ``cursada.docente`` viene del Excel como un apellido suelto. Este
service lo resuelve al profesor real del padron cruzando por **materia +
apellido**:

- candidatos = profesores que dictan esa materia (``materia_profesor``) cuyo
  apellido coincide (normalizado, sin acentos ni mayusculas) con el ``docente``.
- si hay exactamente 1 candidato -> se vincula (``cursada.profesor_id``).
- si 0 o >1 candidatos -> se deja ``NULL`` (sin match o ambiguo; no se adivina).

Idempotente y **NO destructivo**: solo completa ``profesor_id`` cuando esta
``NULL``, para preservar vinculos ya resueltos y correcciones manuales.
"""
from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models.academico import Cursada
from app.db.models.profesor import MateriaProfesor, Profesor
from app.services.profesor_matching import apellido_principal as _apellido


@dataclass
class ResultadoResolucion:
    """Resumen de una corrida del matcher."""

    total: int = 0          # cursadas con docente evaluadas (sin vinculo previo)
    vinculadas: int = 0     # nuevas resoluciones 1:1
    ambiguas: int = 0       # >1 candidato -> quedaron NULL
    sin_match: int = 0      # 0 candidatos -> quedaron NULL
    ya_resueltas: int = 0   # ya tenian profesor_id (no se tocan)


def _apellidos_por_materia(db: Session) -> dict[str, dict[str, list[int]]]:
    """Indice ``{materia_codigo: {apellido: [profesor_id, ...]}}`` para el cruce."""
    stmt = select(
        MateriaProfesor.materia_codigo, Profesor.id, Profesor.nombre
    ).join(Profesor, Profesor.id == MateriaProfesor.profesor_id)

    index: dict[str, dict[str, list[int]]] = {}
    for materia_codigo, pid, nombre in db.execute(stmt).all():
        if not nombre:
            continue
        ape = _apellido(nombre)
        if not ape:
            continue
        index.setdefault(materia_codigo, {}).setdefault(ape, [])
        if pid not in index[materia_codigo][ape]:
            index[materia_codigo][ape].append(pid)
    return index


def resolver_cursadas(db: Session, *, commit: bool = True) -> ResultadoResolucion:
    """Resuelve ``docente -> profesor`` para las cursadas sin vinculo.

    No destructivo: no toca las cursadas que ya tienen ``profesor_id``.
    """
    index = _apellidos_por_materia(db)
    res = ResultadoResolucion()

    for cur in db.execute(select(Cursada)).scalars().all():
        if cur.profesor_id is not None:
            res.ya_resueltas += 1
            continue
        if not cur.docente:
            continue
        res.total += 1
        ape = _apellido(cur.docente)
        candidatos = index.get(cur.materia_codigo, {}).get(ape, [])
        if len(candidatos) == 1:
            cur.profesor_id = candidatos[0]
            res.vinculadas += 1
        elif len(candidatos) > 1:
            res.ambiguas += 1
        else:
            res.sin_match += 1

    if commit:
        db.commit()
    return res


if __name__ == "__main__":  # pragma: no cover - backfill manual
    from app.db.session import SessionLocal

    with SessionLocal() as _db:
        _resultado = resolver_cursadas(_db)
        print(_resultado)
