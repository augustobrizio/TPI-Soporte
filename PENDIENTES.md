# UTNHub — Trabajo pendiente

> Documento de análisis para repartir tareas. Estado verificado archivo por archivo
> el **2026-08-10** sobre `origin/main` (`2ee2b2b`). No asigna personas: cada tarea
> indica área (back/front), alcance, requerimientos que cubre, dependencias y esfuerzo
> estimado, para que el analista reparta.
>
> Escala de esfuerzo: **S** ≤ medio día · **M** 1–2 días · **L** 3–5 días · **XL** > 1 semana.

---

## Estado general

### ✅ Ya implementado (no tocar salvo bugs)
- **Materias / grafo / correlatividades** (`materia_service`, `correlatividad_service` 231 líneas) — RF-02
- **Promedio general y % ingeniero** — vive dentro de `materia_service.py` (no en `promedio_service`) — RF-03
- **Comisiones + profesores + horarios de consulta + reviews de cátedra** — extra sobre lo pedido
- **Calendario académico** (`calendario_service`, tests) — RF-10
- **Novedades + pipeline de ingesta con IA** (scrapers, Lambdas, S3) — RF-09, RF-12
- **Perfil** — RF-11
- **Modelos de DB de auth y chat ya creados** (`usuario`, `conversacion`, `mensaje`) — falta la lógica

### 🔴 Pendiente (el grueso del trabajo)
1. **Autenticación & sesión** — greenfield
2. **Chatbot: RAG + Agente + Chat** — greenfield *(feature de Bruno)*
3. **Tests de reglas de negocio** — obligatorio por la materia
4. **Integración multi-usuario en el frontend** — depende de (1)
5. **Deuda técnica / housekeeping**

---

## ⚠️ Decisiones de equipo previas (resolver antes de codear)

| # | Decisión | Detalle |
|---|----------|---------|
| D1 | **¿Login con contraseña o Google OAuth?** | RF-01 pide "login con mail y contraseña" pero RNF-04 pide "Google OAuth 2.0 restringido a `@frro.utn.edu.ar`". El modelo `Usuario` tiene campo `password` (hash). Hay que decidir si se hace uno, otro, o ambos. **Afecta todo el Frente 1.** |
| D2 | **Credenciales de LLM / S3** | El chat y la ingesta necesitan `OPENAI_API_KEY` (y S3 para novedades). Hoy `backend/.env` solo tiene `DATABASE_URL`. Definir quién provee/paga las claves. **Bloquea el Frente 2.** |
| D3 | **Modelo de embeddings en español** | RNF-13 exige evaluar la calidad de recuperación en español argentino antes de fijar el modelo. Definir candidatos (p.ej. OpenAI `text-embedding-3`, multilingual-e5). |

---

## Frente 1 — Autenticación & Sesión  🔴
**Requerimientos:** RF-01, RNF-02, RNF-04, RNF-05, RNF-06
**Estado:** `backend/app/api/auth.py` vacío · router de auth no registrado en `main.py` · `login/page.tsx` es un placeholder de 19 líneas · modelo `Usuario` (con `password`, `rol`) ya existe.
**Depende de:** D1.

| ID | Tarea | Área | Alcance | Esf. |
|----|-------|------|---------|------|
| T1.1 | Login + hashing | Back | Crear `api/auth.py` + `services/auth_service.py`. Hash de password con `passlib`/`bcrypt` (RNF-02). Emitir JWT (o sesión). Registrar router en `main.py`. | M |
| T1.2 | `get_current_user` + roles | Back | Dependency de FastAPI que valida el token y expone `usuario`+`rol`. Control de acceso por rol (RNF-06). Aplicar a endpoints que hoy son abiertos. | M |
| T1.3 | Google OAuth (si D1=OAuth) | Back | Flujo OAuth 2.0, validar dominio `@frro.utn.edu.ar` (RNF-04), crear/actualizar `Usuario` en callback. | L |
| T1.4 | Expiración + logout | Back | Expiración por inactividad configurable + logout manual (RNF-05). | S |
| T1.5 | Pantalla de login real | Front | Reemplazar el placeholder `login/page.tsx`. Form o botón OAuth, guardar token, redirigir al dashboard. | M |
| T1.6 | Guard de rutas + contexto de sesión | Front | Proteger el route group `(dashboard)`; provider/context con el usuario actual. | M |

**Criterios de aceptación:** un usuario `@frro.utn.edu.ar` puede iniciar sesión, la sesión persiste, expira por inactividad, se puede cerrar, y un admin ve funciones que un alumno no.

---

## Frente 2 — Chatbot: RAG + Agente + Chat  🔴  *(feature de Bruno)*
**Requerimientos:** RF-04, RF-05, RF-06, RF-07, RNF-09, RNF-10, RNF-11, RNF-12, RNF-13
**Estado:** TODO greenfield. `agent/{graph,prompts,state}.py`, las 6 tools, y todo `rag/{chunker,embeddings,ingest,retriever}.py` están en **0 líneas**. `chat_service.py` y `api/chat.py` vacíos, router no registrado. **Los modelos `Conversacion` y `Mensaje` (con campo `tokens`) ya existen.**
**Depende de:** D2, D3.

| ID | Tarea | Área | Alcance | Esf. |
|----|-------|------|---------|------|
| T2.1 | Pipeline RAG | Back | `chunker.py` (chunks con solapamiento configurable), `embeddings.py` (modelo español), `ingest.py` (extracción→limpieza→chunk→embeddings→pgvector con metadata: fuente/fecha/categoría/hash), `retriever.py` (similitud en pgvector). Verificar tabla de chunks + `CREATE EXTENSION vector` en Neon (RNF-09, RNF-13). | XL |
| T2.2 | Tools del agente | Back | Implementar las 6 tools consumiendo los `services/` existentes (respetar capas): `buscar_correlativas`, `buscar_horario_comision`, `buscar_profesor`, `proximos_eventos`, `rag_search`, `ultimas_novedades`. | L |
| T2.3 | Agente LangGraph | Back | `state.py`, `graph.py` (arquitectura agéntica que decide tools — RNF-10), `prompts.py` (system prompt: no inventar, citar fuentes — RF-06/RF-07/RNF-12). | L |
| T2.4 | Chat service + API | Back | `chat_service.py` + `api/chat.py`: persistir conversación/mensajes (modelos ya existen), contexto conversacional (RF-05), límite de tokens por consulta y sesión (RNF-11). Registrar router en `main.py`. | L |
| T2.5 | Set de evaluación | Back | Consultas reales en español argentino para medir recuperación y comparar modelos de embeddings (RNF-13). Carpeta `tests/eval/` ya existe vacía. | M |
| T2.6 | Front del chat | Front | Ya existen `chat/page.tsx` y `chat/[conversacionId]/page.tsx`: conectarlos al `api/chat` real, streaming de respuesta, y **mostrar las fuentes citadas** (RF-06). | L |

**Criterios de aceptación:** el usuario pregunta en lenguaje natural, el agente elige tools, responde citando fuentes, dice "no tengo esa info" cuando no la encuentra, mantiene contexto en la sesión y respeta el límite de tokens.

---

## Frente 3 — Tests de reglas de negocio  🟡  *(obligatorio por la materia)*
**Requerimientos:** condición de la cátedra ("reglas de negocio con tests").
**Estado:** hay tests de calendario, cursada_profesor, novedades y review. **Faltan los del núcleo académico.** `tests/unit/` e `tests/integration/` existen vacías.

| ID | Tarea | Área | Alcance | Esf. |
|----|-------|------|---------|------|
| T3.1 | Tests de correlatividad | Back | `correlatividad_service`: `puede_cursar`, `puede_rendir`, `calcular_estado` (+ regla de proyecto final). Casos: correlativas cumplidas/faltantes, regular vs aprobada. | M |
| T3.2 | Tests de inscripción | Back | `inscripcion_service`: `registrar_estado` (validando correlativas), `eliminar_estado`, `listar_estado_usuario`. | M |
| T3.3 | Tests de promedio | Back | `materia_service`: `promedio_general` y % ingeniero (troncales + electivas). | S |

**Criterios de aceptación:** `docker compose exec app uv run pytest` pasa en verde y cubre las tres áreas.

---

## Frente 4 — Multi-usuario en el frontend  🟡
**Requerimientos:** consecuencia de RF-01 (dejar de simular un único usuario).
**Estado:** `USUARIO_ID = 1` hardcodeado en `frontend/src/app/(dashboard)/page.tsx` y `frontend/src/components/materias/MateriasGraphView.tsx` (y donde más aparezca).
**Depende de:** Frente 1.

| ID | Tarea | Área | Alcance | Esf. |
|----|-------|------|---------|------|
| T4.1 | Quitar `USUARIO_ID` hardcodeado | Front | Reemplazar el `1` por el usuario de la sesión en todas las llamadas a la API. | M |
| T4.2 | Proteger endpoints por usuario | Back | Los endpoints que hoy reciben `usuario_id` por query deben usar el usuario autenticado, no confiar en el parámetro. | M |

---

## Frente 5 — Deuda técnica / housekeeping  🟢
| ID | Tarea | Área | Alcance | Esf. |
|----|-------|------|---------|------|
| T5.1 | Andamiaje muerto | Back | `promedio_service.py` y `api/promedio.py` están vacíos (el promedio vive en `materia_service`). Borrarlos o mover la lógica ahí. Igual con las 6 tools/rag si se decide otra estructura. | S |
| T5.2 | Constitution de spec-kit | Docs | `.specify/memory/constitution.md` es el template sin llenar. Completarla si el equipo sigue usando spec-kit. | S |
| T5.3 | Setup del frontend | Docs | El equipo migró a **pnpm**. Documentar `pnpm install` limpio (había symlinks rotos apuntando a una copia fantasma `C:\Soporte\TPI-Soporte`). | S |
| T5.4 | `.env` completo | Docs | Documentar y repartir las claves de `OPENAI_API_KEY`, S3 y LangSmith; sin ellas no corren chat ni ingesta. | S |

---

## Frente 6 — Reseñas de alumnos: moderación  🟢  *(a futuro, no bloqueante)*
**Contexto:** las **reseñas de alumnos (feature 004)** ya están implementadas — un alumno logueado califica una cátedra (nivel 1–5 + comentario opcional) desde el modal de comisión, el detalle de profesor y el perfil; su voto se combina con las reviews de UTNTAC en el score de la cátedra/comisión (`resena_alumno`, endpoints `/mi/resenas`, `review_service.votos_combinados`). Lo que falta es **moderar el texto** de los comentarios para que no se suba cualquier cosa (contenido inapropiado).

| ID | Tarea | Área | Alcance | Esf. |
|----|-------|------|---------|------|
| T6.1 | Moderación de comentarios | Back+Front | Evitar contenido inapropiado en el comentario libre de `resena_alumno` (hoy se guarda tal cual, máx 1000 chars): p.ej. filtro de palabras / validación, botón de **reportar** + **ocultar** el comentario sin borrar el voto numérico, o moderación asistida por IA. Es la US4 (P3) de la spec `004-resenas-alumnos`. | M |

**Criterio de aceptación:** un comentario reportado se puede ocultar del público sin perder la calificación; el contenido claramente inapropiado no queda visible.

---

## Orden sugerido y dependencias

```
D1, D2, D3  (decisiones)  ──► desbloquean todo

Frente 3 (tests)      ── independiente, se puede empezar YA
Frente 1 (auth)       ── requisito de defensa ──► habilita Frente 4
Frente 2 (chatbot)    ── de Bruno; necesita D2/D3 + pgvector
Frente 4 (multi-user) ── después de Frente 1
Frente 5 (housekeeping)── en cualquier momento, tareas chicas
```

**Recomendación:** arrancar en paralelo con **Frente 3 (tests)** y **Frente 1 (auth)** porque no dependen de credenciales externas ni entre sí, mientras se resuelven D2/D3 para destrabar el chatbot.
