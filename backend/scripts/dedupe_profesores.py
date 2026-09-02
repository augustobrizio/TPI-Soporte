"""Fusiona profesores duplicados del padron.

Las fuentes escriben el mismo profesor de formas distintas ('RIPANI, Luciano
Ernesto' vs 'Ripani, Luciano'). Desde la migracion ``d7a4b3c8e921`` el unique de
``profesor.nombre_key`` frena las variantes exactas, y
``services/profesor_matching`` resuelve las variantes sueltas antes de insertar,
asi que el padron no deberia volver a ensuciarse. Este script queda para
limpiar lo que ya haya quedado sucio: dumps viejos, cargas manuales, o una
fuente nueva que todavia no pase por el matcher.

Agrupa con el **mismo** criterio que usa el sync (``son_la_misma_persona`` +
email compartido), elige como sobreviviente al profesor mas referenciado y le
repunta cargos, horarios, cursadas y reseñas. Cuando dos duplicados tienen
reseñas de UTNTAC para la misma materia, **suma los votos** en vez de descartar
uno: cada duplicado se habia llevado una parte del tally.

Uso (dry-run — no escribe nada, imprime exactamente lo que haria):
    docker compose exec backend uv run python scripts/dedupe_profesores.py

Uso (aplica, dentro de una transaccion; aborta si quedaria alguna FK huerfana):
    docker compose exec backend uv run python scripts/dedupe_profesores.py --apply
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Permite importar app.* corriendo el script desde cualquier directorio.
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

from sqlalchemy import text  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.db.session import SessionLocal  # noqa: E402
from app.services.profesor_matching import (  # noqa: E402
    clave_nombre,
    es_mas_completo,
    son_la_misma_persona,
)

# Tablas con FK a profesor.id, y como se repuntan.
TABLAS_FK = ("cursada", "horario_consulta", "materia_profesor", "resena_alumno", "review_catedra")

# Columnas de votos de review_catedra que se suman al fusionar.
VOTOS = (
    "super_recomiendo",
    "recomiendo",
    "normal",
    "evitaria",
    "super_evitaria",
    "cantidad_respuestas",
)

# Filas hijas que quedan identicas despues del repunte y hay que colapsar.
DEDUP = (
    ("materia_profesor", ("materia_codigo", "cargo", "anio")),
    ("horario_consulta", ("dia", "hora_inicio", "hora_fin", "modalidad", "aula")),
)

SQL_PADRON = """
    SELECT p.id, p.nombre, p.email,
           (SELECT count(*) FROM materia_profesor mp WHERE mp.profesor_id = p.id)
         + (SELECT count(*) FROM horario_consulta hc WHERE hc.profesor_id = p.id)
         + (SELECT count(*) FROM cursada c        WHERE c.profesor_id  = p.id)
         + (SELECT count(*) FROM review_catedra r WHERE r.profesor_id  = p.id)
         + (SELECT count(*) FROM resena_alumno ra WHERE ra.profesor_id = p.id) AS refs
    FROM profesor p ORDER BY p.id
"""


def _clusters(padron: list[dict]) -> list[list[dict]]:
    """Agrupa el padron en conjuntos de filas que son la misma persona."""
    padre = {p["id"]: p["id"] for p in padron}

    def raiz(x: int) -> int:
        while padre[x] != x:
            padre[x] = padre[padre[x]]
            x = padre[x]
        return x

    def unir(a: int, b: int) -> None:
        ra, rb = raiz(a), raiz(b)
        if ra != rb:
            padre[ra] = rb

    por_email: dict[str, int] = {}
    for p in padron:
        if p["email"]:
            clave = p["email"].strip().lower()
            if clave in por_email:
                unir(por_email[clave], p["id"])
            else:
                por_email[clave] = p["id"]

    for i, a in enumerate(padron):
        for b in padron[i + 1:]:
            if son_la_misma_persona(a["nombre"] or "", b["nombre"] or ""):
                unir(a["id"], b["id"])

    grupos: dict[int, list[dict]] = {}
    for p in padron:
        grupos.setdefault(raiz(p["id"]), []).append(p)
    return [g for g in grupos.values() if len(g) > 1]


def _elegir(grupo: list[dict]) -> tuple[dict, str, str | None]:
    """Devuelve (sobreviviente, nombre_final, email_final).

    Sobrevive el mas referenciado —mover menos filas es menos riesgo—, se queda
    con la grafia mas completa del grupo y con el primer email disponible,
    prefiriendo el institucional.
    """
    ganador = max(grupo, key=lambda p: (p["refs"], -p["id"]))

    nombre = ganador["nombre"] or ""
    for p in grupo:
        if p["nombre"] and es_mas_completo(p["nombre"], nombre):
            nombre = p["nombre"]

    mails = [p["email"] for p in grupo if p["email"]]
    institucionales = [m for m in mails if "frro.utn.edu.ar" in m]
    email = (institucionales or mails or [None])[0]
    return ganador, nombre, email


def _fusionar(db: Session, grupo: list[dict], log: list[str]) -> None:
    """Repunta todo lo que cuelga de los duplicados al sobreviviente y los borra."""
    ganador, nombre, email = _elegir(grupo)
    w = ganador["id"]
    perdedores = [p["id"] for p in grupo if p["id"] != w]

    log.append(f"→ queda id={w} {nombre!r} <{email or '-'}>")
    for p in grupo:
        marca = "KEEP " if p["id"] == w else "BORRA"
        log.append(f"   {marca} id={p['id']:<5} {p['nombre']!r} <{p['email'] or '-'}> refs={p['refs']}")

    # review_catedra: (materia, profesor) es unico -> si ambos reseñaron la
    # misma materia hay que sumar los votos, no repuntar.
    for perdedor in perdedores:
        filas = db.execute(
            text("SELECT * FROM review_catedra WHERE profesor_id = :p"), {"p": perdedor}
        ).all()
        for fila in filas:
            fila = dict(fila._mapping)
            existente = db.execute(
                text("SELECT * FROM review_catedra WHERE profesor_id = :w AND materia_codigo = :m"),
                {"w": w, "m": fila["materia_codigo"]},
            ).first()
            if existente is None:
                db.execute(
                    text("UPDATE review_catedra SET profesor_id = :w WHERE id = :id"),
                    {"w": w, "id": fila["id"]},
                )
                continue
            existente = dict(existente._mapping)
            sumas = {k: (existente[k] or 0) + (fila[k] or 0) for k in VOTOS}
            log.append(
                f"   reseña materia={fila['materia_codigo']}: suma votos "
                f"{[existente[k] for k in VOTOS]} + {[fila[k] for k in VOTOS]}"
                f" = {[sumas[k] for k in VOTOS]}"
            )
            db.execute(
                text("UPDATE review_catedra SET "
                     + ", ".join(f"{k} = :{k}" for k in VOTOS)
                     + " WHERE id = :id"),
                {**sumas, "id": existente["id"]},
            )
            db.execute(text("DELETE FROM review_catedra WHERE id = :id"), {"id": fila["id"]})

    # resena_alumno: (usuario, profesor, materia) es unico -> si el alumno ya
    # reseño la catedra del sobreviviente, su reseña del duplicado se descarta.
    for perdedor in perdedores:
        for fila in db.execute(
            text("SELECT * FROM resena_alumno WHERE profesor_id = :p"), {"p": perdedor}
        ).all():
            fila = dict(fila._mapping)
            choca = db.execute(
                text("SELECT id FROM resena_alumno WHERE profesor_id = :w "
                     "AND usuario_id = :u AND materia_codigo = :m"),
                {"w": w, "u": fila["usuario_id"], "m": fila["materia_codigo"]},
            ).first()
            if choca is None:
                db.execute(
                    text("UPDATE resena_alumno SET profesor_id = :w WHERE id = :id"),
                    {"w": w, "id": fila["id"]},
                )
            else:
                log.append(f"   reseña {fila['id']} descartada (el alumno ya reseño la catedra)")
                db.execute(text("DELETE FROM resena_alumno WHERE id = :id"), {"id": fila["id"]})

    for tabla in ("materia_profesor", "horario_consulta", "cursada"):
        db.execute(
            text(f"UPDATE {tabla} SET profesor_id = :w WHERE profesor_id = ANY(:p)"),
            {"w": w, "p": perdedores},
        )

    for tabla, cols in DEDUP:
        borradas = db.execute(
            text(f"""
                DELETE FROM {tabla} WHERE id IN (
                    SELECT id FROM (
                        SELECT id, row_number() OVER (
                            PARTITION BY profesor_id, {', '.join(cols)} ORDER BY id) AS rn
                        FROM {tabla} WHERE profesor_id = :w
                    ) s WHERE rn > 1)"""),
            {"w": w},
        ).rowcount
        if borradas:
            log.append(f"   {tabla}: {borradas} fila(s) duplicada(s) colapsada(s)")

    # Borrar primero y renombrar despues: el nombre final suele ser el de un
    # duplicado, y el unique de nombre_key rechazaria el UPDATE al reves.
    db.execute(text("DELETE FROM profesor WHERE id = ANY(:p)"), {"p": perdedores})
    db.execute(
        text("UPDATE profesor SET nombre = :n, nombre_key = :k, email = coalesce(email, :e) "
             "WHERE id = :w"),
        {"n": nombre, "k": clave_nombre(nombre), "e": email, "w": w},
    )


def _huerfanas(db: Session) -> dict[str, int]:
    """FKs que quedaron apuntando a un profesor inexistente (deberia dar todo 0)."""
    return {
        tabla: db.execute(
            text(f"SELECT count(*) FROM {tabla} x LEFT JOIN profesor p ON p.id = x.profesor_id "
                 "WHERE x.profesor_id IS NOT NULL AND p.id IS NULL")
        ).scalar()
        for tabla in TABLAS_FK
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true",
                        help="commitea la fusion (por defecto: dry-run con rollback)")
    parser.add_argument("--backup", default="dedupe_profesores_backup.json",
                        help="archivo donde volcar las filas afectadas antes de tocarlas")
    args = parser.parse_args()

    with SessionLocal() as db:
        padron = [dict(r._mapping) for r in db.execute(text(SQL_PADRON)).all()]
        grupos = _clusters(padron)
        if not grupos:
            print(f"Sin duplicados: {len(padron)} profesores.")
            return 0

        ids = [p["id"] for g in grupos for p in g]
        backup = {"profesor": [dict(r._mapping) for r in db.execute(
            text("SELECT * FROM profesor WHERE id = ANY(:i)"), {"i": ids})]}
        for tabla in TABLAS_FK:
            backup[tabla] = [dict(r._mapping) for r in db.execute(
                text(f"SELECT * FROM {tabla} WHERE profesor_id = ANY(:i)"), {"i": ids})]
        Path(args.backup).write_text(
            json.dumps(backup, ensure_ascii=False, default=str, indent=1), encoding="utf-8"
        )

        log: list[str] = []
        for grupo in sorted(grupos, key=lambda g: -max(p["refs"] for p in g)):
            _fusionar(db, sorted(grupo, key=lambda p: p["id"]), log)
            log.append("")

        huerfanas = _huerfanas(db)
        if any(huerfanas.values()):
            db.rollback()
            print(f"ABORTADO: quedarian FKs huerfanas {huerfanas}")
            return 1

        total = db.execute(text("SELECT count(*) FROM profesor")).scalar()
        db.commit() if args.apply else db.rollback()

        print("\n".join(log))
        print("MODO:", "APPLY (commiteado)" if args.apply else "DRY-RUN (rollback)")
        print(f"  grupos fusionados : {len(grupos)}")
        print(f"  profesores borrados: {len(ids) - len(grupos)}")
        print(f"  padron: {len(padron)} -> {total}")
        print(f"  backup: {args.backup}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
