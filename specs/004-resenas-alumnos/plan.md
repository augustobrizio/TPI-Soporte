# Implementation Plan: Reseñas de alumnos

**Branch**: `main` | **Date**: 2026-08-26 | **Spec**: [spec.md](./spec.md)

## Summary

Los alumnos cargan reseñas por (profesor, materia) eligiendo un nivel 1–5 (súper evitaría … súper
recomiendo, la misma escala de UTNTAC). Cada reseña es **un voto más** en el tally de esa cátedra: la
nota y la cobertura combinan UTNTAC + alumnos, sin fórmula de fusión. Auth ya disponible
(`UsuarioActual`). **Este plan cubre el backend**; el frontend (rating UI + 3 puntos de entrada) va en
una fase siguiente.

## Technical Context

- Auth lista: `app/api/deps.py` expone `UsuarioActual` (JWT). Endpoints protegidos = patrón de
  `api/usuario_materia.py` (`/mi/materias`): service hace la lógica, endpoint hace `db.commit()`.
- Reuso `review_service` de 003 (nota 1–5 por promedio ponderado). Se agrega la combinación de votos.
- Storage: Neon — **1 tabla nueva** `resena_alumno`.

## Constitution Check
Capas ✅ (api→service→repo). ORM+Alembic ✅. Regla de negocio (merge de votos) con tests ✅. Auth por
token, sin `usuario_id` por URL ✅. **PASS**.

## Cambios (backend)

```
backend/
├── alembic/versions/<rev>_resena_alumno.py     # [NEW] down_revision = b9c0d1e2f3a4
├── app/db/models/resena_alumno.py               # [NEW] ResenaAlumno (unique usuario+profesor+materia)
├── app/db/models/__init__.py                    # [EDIT] registrar ResenaAlumno
├── app/repositories/resena_repo.py              # [NEW] upsert/get/delete + tallies_por_par (merge)
├── app/services/review_service.py               # [EDIT] votos_combinados(utntac, tally_alumnos)
├── app/services/resena_service.py               # [NEW] upsert/eliminar/listar_mias (valida nivel/materia/profesor)
├── app/services/comision_service.py             # [EDIT] nota/score combinan UTNTAC + alumnos
├── app/schemas/resena.py                        # [NEW] ResenaAlumnoIn / ResenaAlumnoOut
├── app/api/resenas.py                           # [NEW] /mi/resenas (GET, PUT, DELETE) con UsuarioActual
├── app/main.py                                  # [EDIT] montar el router
└── tests/test_resena_alumno.py                  # [NEW] merge de votos + reglas
```

## Decisiones

- **Modelo** `resena_alumno(id, usuario_id FK, profesor_id FK, materia_codigo FK, nivel INT[1..5],
  comentario TEXT?, created_at, updated_at)`, unique `(usuario_id, profesor_id, materia_codigo)`, FKs
  `ON DELETE CASCADE`. `nivel` entero 1–5 (mapea directo a los pesos) para sumar al tally sin traducir.
- **Merge**: `votos_combinados(review_utntac, tally_alumnos)` suma, por nivel, los conteos de UTNTAC y
  los votos de alumnos; la nota se calcula sobre el combinado (reusa `nota_desde_votos`). La cantidad de
  respuestas = UTNTAC + nº de reseñas de alumnos.
- **Score de comisión**: `comision_service` carga UTNTAC (`reviews_por_par`) **y** los tallies de
  alumnos (`resena_repo.tallies_por_par`) y computa la nota combinada por cursada; el score sale de esas.
- **Endpoints** `/mi/resenas` (mismo criterio que `/mi/materias`: el alumno sale del token):
  `GET` mis reseñas · `PUT` upsert `{materia_codigo, profesor_id, nivel, comentario?}` · `DELETE`
  `{materia_codigo, profesor_id}`. Valida nivel 1–5, materia y profesor existentes (422 si no).
- **`/comisiones/con-profesores` queda público**: el score combinado se ve para todos; "¿ya calificaste?"
  lo resuelve el frontend cruzando con `GET /mi/resenas` (no ensucia el endpoint público con datos de
  sesión).

## Verificación
- `alembic upgrade head` (tabla nueva).
- `pytest tests/test_resena_alumno.py` (merge + reglas).
- Flujo con token: `PUT /mi/resenas` → la nota de esa cátedra y el score de su comisión cambian
  (sumó un voto); `DELETE` → vuelve atrás. Re-`PUT` del mismo par no duplica.
- Frontend (rating UI + puntos de entrada) → fase siguiente.
