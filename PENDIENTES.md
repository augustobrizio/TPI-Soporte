# UTNHub — Trabajo pendiente

> Documento de análisis para repartir tareas. Estado verificado archivo por archivo
> el **2026-08-10** sobre `origin/main` (`2ee2b2b`). No asigna personas: cada tarea
> indica área (back/front), alcance, requerimientos que cubre, dependencias y esfuerzo
> estimado, para que el analista reparta.
>
> **Actualización 2026-08-26** (`f43c415` + árbol de trabajo): se agregan los
> **Frentes 7 a 13** — el repaso de UX y de datos del alumno que quedó pendiente
> después de auth y reseñas. Verificados archivo por archivo igual que el resto.
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
1. ~~**Autenticación & sesión**~~ — **hecho**, Google incluido (Frente 8 ✅). Queda solo la expiración por inactividad. Ver Frente 1.
2. **Chatbot: RAG + Agente + Chat** — greenfield *(feature de Bruno)*
3. **Tests de reglas de negocio** — obligatorio por la materia
4. ~~**Integración multi-usuario en el frontend**~~ — **hecho**. Ver Frente 4.
5. **Deuda técnica / housekeeping**

### 🟠 Repaso de UX y datos del alumno (agregado 2026-08-26)
6. ~~**Shell: barra superior y navegación**~~ — ✅ **hecho** (Frente 7): buscador global con `⌘K`, campana con notificaciones reales y avatar con menú de cuenta.
7. ~~**Login con Google**~~ — ✅ **hecho** (Frente 8). Único paso manual pendiente: crear el cliente OAuth en Google Cloud y pegar las credenciales en `backend/.env`.
8. **Modo claro** — los tokens ya están; faltan los hardcodeos — Frente 9
9. ~~**Importación de SYSACAD**~~ — ✅ **hecho** (Frente 10): marca la comisión al importar y deja corregir el mapeo a mano.
10. **Calendario ↔ Google** — greenfield — Frente 11
11. **Comisiones y profesores** — implementado; quedan puntas sueltas (una de seguridad) — Frente 12
12. **Inicio / dashboard / panel personal** — ruteo por sesión + mocks a reemplazar — Frente 13

---

## ⚠️ Decisiones de equipo previas (resolver antes de codear)

| # | Decisión | Detalle |
|---|----------|---------|
| D1 | **¿Login con contraseña o Google OAuth?** | RF-01 pide "login con mail y contraseña" pero RNF-04 pide "Google OAuth 2.0 restringido a `@frro.utn.edu.ar`". El modelo `Usuario` tiene campo `password` (hash). Hay que decidir si se hace uno, otro, o ambos. **Afecta todo el Frente 1.** |
| D2 | **Credenciales de LLM / S3** | El chat y la ingesta necesitan `OPENAI_API_KEY` (y S3 para novedades). Hoy `backend/.env` solo tiene `DATABASE_URL`. Definir quién provee/paga las claves. **Bloquea el Frente 2.** |
| D3 | **Modelo de embeddings en español** | RNF-13 exige evaluar la calidad de recuperación en español argentino antes de fijar el modelo. Definir candidatos (p.ej. OpenAI `text-embedding-3`, multilingual-e5). |
| D4 | **¿Qué pasa con la portada cuando hay sesión?** | Si al loguearse `/` pasa a ser el dashboard, la portada pública (hero + secciones + novedades) deja de ser alcanzable para el usuario logueado. Definir si se pierde o se mueve a otra URL (`/inicio`, `/about`). Es la pantalla que explica el proyecto: para la defensa conviene que siga estando. **Afecta al Frente 13.A.** |
| ~~D5~~ ✅ | **¿Google reemplaza al login por contraseña o convive?** → **Conviven, sin filtro de dominio.** | Concreta a D1 ahora que el login por password ya está hecho y andando. Si conviven, hay que definir el vínculo entre una cuenta con contraseña y la misma persona entrando por Google (T8.5). Y si se aplica el dominio `@frro.utn.edu.ar` de RNF-04, decidir si también corta el registro por contraseña, que hoy acepta cualquier mail. **Afecta al Frente 8.** |
| D6 | **Calendario: ICS o API de Google** | Exportar `.ics` (o una URL suscribible) no necesita credenciales y cubre Google, Apple y Outlook. La API de Google Calendar permite sync bidireccional pero arrastra OAuth con scopes de Calendar. **Afecta al Frente 11.** |

---

## Frente 1 — Autenticación & Sesión  🟡  *(casi cerrado — revisado 2026-08-26)*
**Requerimientos:** RF-01, RNF-02, RNF-04, RNF-05, RNF-06
**Estado:** **implementado y andando.** `api/auth.py` (registro, login, `/auth/me`), `services/auth_service.py` y `core/security.py` (bcrypt con pre-hash SHA-256 + JWT), rate limit de login, router registrado en `main.py`. En el front: login y registro reales, cookie **httpOnly** escrita por los route handlers de Next (`app/api/auth/*`), `middleware.ts` y `getUsuarioActual()` validando contra el backend en cada Server Component.
**Lo que queda:** ~~Google OAuth~~ (hecho en el **Frente 8** ✅), la expiración **por inactividad** de RNF-05 y aplicar `requerir_admin` a los endpoints que reescriben datos (ver **Frente 12**, T12.1).
**Depende de:** D1, D5.

| ID | Tarea | Área | Alcance | Esf. |
|----|-------|------|---------|------|
| ~~T1.1~~ ✅ | Login + hashing | Back | Crear `api/auth.py` + `services/auth_service.py`. Hash de password con `passlib`/`bcrypt` (RNF-02). Emitir JWT (o sesión). Registrar router en `main.py`. | M |
| T1.2 ⚠️ | `get_current_user` + roles | Back | `get_current_user` ✅ y aplicado en calendario, comisiones, materias, reseñas y usuario_materia. **Falta el control por rol:** `deps.requerir_admin` está escrito pero no se usa en ningún endpoint (ver T12.1). | S |
| ~~T1.3~~ ✅ | Google OAuth | Back | Hecho en el **Frente 8**. | — |
| T1.4 ⚠️ | Expiración + logout | Back | Logout manual ✅ (`app/api/auth/logout/route.ts`, POST). **Falta la expiración por inactividad:** hoy el JWT tiene un `exp` fijo (`JWT_EXPIRE_MINUTES`, 12 h) que no se renueva con el uso. | S |
| ~~T1.5~~ ✅ | Pantalla de login real | Front | Reemplazar el placeholder `login/page.tsx`. Form o botón OAuth, guardar token, redirigir al dashboard. | M |
| ~~T1.6~~ ✅ | Guard de rutas + contexto de sesión | Front | Resuelto por Server Components (`getUsuarioActual()`) + `middleware.ts` + `RequiereCuenta`, no por un provider de cliente. `features/auth/AuthProvider.tsx` y `useAuth.ts` quedaron sin usar → ver T5.5. | M |

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

## Frente 4 — Multi-usuario en el frontend  ✅  *(cerrado — revisado 2026-08-26)*
**Requerimientos:** consecuencia de RF-01 (dejar de simular un único usuario).
**Estado:** **hecho.** No queda ningún `USUARIO_ID` en el frontend (`grep -rn "USUARIO_ID" frontend/src` = vacío) y los endpoints toman el usuario del token (`usuario.id`), no de la query: calendario, comisiones, materias, reseñas y usuario_materia.

| ID | Tarea | Área | Alcance | Esf. |
|----|-------|------|---------|------|
| ~~T4.1~~ ✅ | Quitar `USUARIO_ID` hardcodeado | Front | — | M |
| ~~T4.2~~ ✅ | Proteger endpoints por usuario | Back | El `usuario_id` salió de las URLs; sale del JWT. Falta sólo el rol (T12.1). | M |

---

## Frente 5 — Deuda técnica / housekeeping  🟢
| ID | Tarea | Área | Alcance | Esf. |
|----|-------|------|---------|------|
| T5.1 | Andamiaje muerto | Back | `promedio_service.py` y `api/promedio.py` están vacíos (el promedio vive en `materia_service`). Borrarlos o mover la lógica ahí. Igual con las 6 tools/rag si se decide otra estructura. | S |
| T5.2 | Constitution de spec-kit | Docs | `.specify/memory/constitution.md` es el template sin llenar. Completarla si el equipo sigue usando spec-kit. | S |
| T5.3 | Setup del frontend | Docs | El equipo migró a **pnpm**. Documentar `pnpm install` limpio (había symlinks rotos apuntando a una copia fantasma `C:\Soporte\TPI-Soporte`). | S |
| T5.4 | `.env` completo | Docs | Documentar y repartir las claves de `OPENAI_API_KEY`, S3 y LangSmith; sin ellas no corren chat ni ingesta. | S |
| T5.5 | Auth de cliente sin usar | Front | `features/auth/AuthProvider.tsx`, `useAuth.ts` y `destino.ts` no los importa nadie fuera de `features/auth/`: la sesión se resuelve en el servidor. Borrarlos o dejarlos si se van a usar. | S |
| T5.6 | Dos lockfiles | Front | Conviven `pnpm-lock.yaml` y `package-lock.json` en `frontend/`. Elegir uno y borrar el otro: instalar con el gestor equivocado deja el árbol distinto al de producción. | S |

---

## Frente 6 — Reseñas de alumnos: moderación  🟢  *(a futuro, no bloqueante)*
**Contexto:** las **reseñas de alumnos (feature 004)** ya están implementadas — un alumno logueado califica una cátedra (nivel 1–5 + comentario opcional) desde el modal de comisión, el detalle de profesor y el perfil; su voto se combina con las reviews de UTNTAC en el score de la cátedra/comisión (`resena_alumno`, endpoints `/mi/resenas`, `review_service.votos_combinados`). Lo que falta es **moderar el texto** de los comentarios para que no se suba cualquier cosa (contenido inapropiado).

| ID | Tarea | Área | Alcance | Esf. |
|----|-------|------|---------|------|
| T6.1 | Moderación de comentarios | Back+Front | Evitar contenido inapropiado en el comentario libre de `resena_alumno` (hoy se guarda tal cual, máx 1000 chars): p.ej. filtro de palabras / validación, botón de **reportar** + **ocultar** el comentario sin borrar el voto numérico, o moderación asistida por IA. Es la US4 (P3) de la spec `004-resenas-alumnos`. | M |

**Criterio de aceptación:** un comentario reportado se puede ocultar del público sin perder la calificación; el contenido claramente inapropiado no queda visible.

---

## Repaso de UX y datos del alumno (2026-08-26)

Los nueve puntos del repaso, mapeados a los frentes nuevos. Verificado archivo
por archivo sobre `f43c415` + el árbol de trabajo actual.

| Punto del repaso | Dónde quedó |
|---|---|
| ~~Terminar la barra de arriba (buscador, perfil, barra lateral colapsada)~~ ✅ | **Frente 7** |
| Loguearse con Google | **Frente 8** |
| Revisar el modo claro | **Frente 9** |
| Las materias que estás cursando no se ponen solas en Horarios | **Frente 10 (10.A)** ✅ |
| La electiva de Soporte no matchea al importar de SYSACAD | **Frente 10 (10.B)** ✅ |
| Exportar/importar el calendario a Google | **Frente 11** |
| Revisar si está todo lo de comisiones y profesores | **Frente 12** |
| Inicio si no está logueado / dashboard si sí | **Frente 13 (13.A)** |
| Que el dashboard esté conectado de verdad | **Frente 13 (13.B)** |

---

## ~~Frente 7 — Shell: barra superior y navegación~~  ✅  *(hecho — 2026-08-26)*
**Origen:** repaso de UX (2026-08-26).
**Estado:** **cerrado.** Los tres controles de `components/TopNav.tsx` que eran cascarón ahora funcionan, y la barra lateral colapsada tuvo su repaso. Criterio de aceptación cumplido: no queda ningún control decorativo en la barra superior.

| ID | Tarea | Cómo quedó |
|----|-------|------------|
| T7.1 | Avatar real + menú de cuenta | ✅ El layout le pasa el usuario (objeto, no `autenticado: boolean`) a las dos barras. Iniciales reales vía `iniciales()`, o la foto de Google si la cuenta entró por ahí (con caída a iniciales si la URL se rompe). `MenuCuenta.tsx` abre un dropdown con Perfil / Cerrar sesión. |
| T7.2 | Buscador global (front) | ✅ `components/buscador/BuscadorGlobal.tsx`: command palette con `⌘K`/`Ctrl+K`, debounce de 180 ms con `AbortController`, resultados agrupados por tipo, navegación con flechas y Enter. Disparador ancho en escritorio y de lupa abajo de `md`. |
| T7.3 | Endpoint de búsqueda | ✅ `GET /buscar?q=` **público** (`api/busqueda.py` → `services/busqueda_service.py` → los cuatro repos). Match sin acentos reusando `core.texto.normalizar_texto`, límite por tipo, y un escalón aproximado con rapidfuzz para la variación de género y número ("matematica" encuentra "Matemático"). |
| T7.4 | Notificaciones: definir o sacar | ✅ **Definidas**: novedades nuevas + mesas y finales de los próximos 7 días. `GET /notificaciones` y `POST /notificaciones/visto`, con `usuario.notificaciones_vistas_at` (migración `a5e1c74b90f3`, aplicada en Neon). |
| T7.5 | Repaso de la barra colapsada | ✅ El bloque del logo de la barra superior reproduce la columna de la sidebar (256/64px, mismo padding): antes había 4px de corrimiento expandida y 10px colapsada. Los tooltips del modo compacto ahora aparecen también con el foco de teclado. |

### Decisiones que quedaron tomadas

- **El buscador es público.** No pasa por `/api/backend/*` —ese proxy corta con 401 sin cookie— sino por un route handler propio, `app/api/buscar/route.ts`. Materias, profesores, comisiones y novedades ya se navegan sin cuenta; con token, el buscador habría quedado decorativo justo para el visitante nuevo.
- **Deep links.** El palette necesitaba poder navegar a un resultado y sólo profesores tenía URL propia. Se agregaron: `/materias?tipo=&codigo=`, `/comisiones?comision=<id>` y `/novedades?novedad=<id>`. El `tipo` de la materia viaja en el resultado de búsqueda porque el grafo se abre por tipo y una electiva no existe en el de troncales. Las comisiones se identifican por id de fila y no por nombre: "1K01" existe una vez por año académico.
- **Qué cuenta como "nuevo".** Para una novedad es haber aparecido después de la última visita al panel, y "aparecer" es la **más temprana** entre `fecha_publicacion` y `created_at`. Con la fecha de publicación sola, los avisos de eventos futuros (la ingesta los fecha con la fecha del evento) contaban como nuevos para siempre y la campana no se apagaba nunca; con `created_at` solo, un backfill de posts viejos inundaba el panel. Para una mesa es haber **entrado en la ventana** de 7 días después de la última visita.
- **Primitivas nuevas.** `components/ui/dropdown-menu.tsx` y `components/ui/popover.tsx`, Radix headless + tokens `--shell-*`, siguiendo lo que ya decía la guía de estilo. Suman `@radix-ui/react-dropdown-menu` y `@radix-ui/react-popover` al `package.json`.

**Tests:** 33 nuevos (`tests/test_busqueda.py`, `tests/test_notificaciones.py`). Suite completa: 161 ✅.

---

## ~~Frente 8 — Login con Google~~  ✅  *(hecho — 2026-08-26)*
**Requerimientos:** RNF-04 (Google OAuth 2.0 restringido a `@frro.utn.edu.ar`), RNF-06.
**Estado:** **código completo y probado (31 tests).** Authorization code flow con `state` + PKCE (S256): el backend concentra todo lo de OAuth (`services/google_oauth.py`, endpoints `GET /auth/google/config`, `GET /auth/google/autorizar`, `POST /auth/google`) y el frontend hace de relay y escribe la cookie httpOnly (`app/api/auth/google/{start,callback}`). Migración `f2c9a7d1e480` (`google_sub` único + `avatar_url`) **ya aplicada en Neon**.

**Lo único que falta es T8.1:** crear el cliente OAuth en Google Cloud Console y pegar `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` en `backend/.env`. Mientras estén vacías, el botón no se renderiza y el login por contraseña funciona igual. **Paso a paso en [`agent_docs/google_oauth.md`](./agent_docs/google_oauth.md).**

**Sobre RNF-04:** se decidió **no** restringir a `@frro.utn.edu.ar` — entra cualquier cuenta de Google, igual que el registro por contraseña. El filtro por dominio quedó implementado y testeado detrás de `GOOGLE_DOMINIOS_PERMITIDOS` (vacío por default) por si el criterio cambia: se activa por env, sin tocar código.

De paso, sobre el Frente 1: el logout manual está hecho (`app/api/auth/logout/route.ts`), pero la expiración es un `exp` fijo de 12 h (`jwt_expire_minutes`), no por **inactividad** como pide RNF-05. Sigue abierto en T1.4.

**Depende de:** ~~D1~~, ~~D5~~ — **resuelta**: Google y contraseña **conviven** (una cuenta preexistente se vincula por email al entrar con Google), y **no** se aplica el filtro de dominio a ninguna de las dos vías. Reemplaza a la tarea **T1.3** del Frente 1.

| ID | Tarea | Área | Alcance | Esf. |
|----|-------|------|---------|------|
| T8.1 ⚠️ | Credenciales de Google Cloud | Infra | `config.py` y `.env.example` ✅ (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_DOMINIOS_PERMITIDOS`). **Falta lo manual:** crear el proyecto/cliente OAuth y cargar el redirect URI `<APP_URL>/api/auth/google/callback`. Guía en `agent_docs/google_oauth.md`. | S |
| ~~T8.2~~ ✅ | Migración de `usuario` | Back | `f2c9a7d1e480`: `google_sub` (índice único, nullable) + `avatar_url`. Aplicada en Neon. `password` sin tocar. | S |
| ~~T8.3~~ ✅ | Flujo OAuth | Back | `services/google_oauth.py` + 3 endpoints. `state` + **PKCE S256** (verifier requerido: sin él da 422, no un flow degradado), `id_token` validado contra las JWKS de Google (firma, `iss`, `aud`, `exp`), filtro de dominio opcional (`GOOGLE_DOMINIOS_PERMITIDOS`, apagado por default), y el mismo `TokenOut` que `/auth/login`. El callback cae en el **frontend**, no en FastAPI, porque la cookie httpOnly solo la puede escribir Next. | L |
| ~~T8.4~~ ✅ | Botón en el front | Front | `features/auth/BotonGoogle.tsx` en `LoginForm` y `RegisterForm` (se renderiza solo si el backend tiene credenciales), + `app/api/auth/google/{start,callback}/route.ts`. El JWT nunca toca JavaScript. Errores por código, no por texto libre en la URL. | M |
| ~~T8.5~~ ✅ | Cuentas que ya existen | Back | `auth_service.autenticar_con_google`: busca por `google_sub`, si no por email (y vincula), si no crea. La contraseña previa sigue funcionando. Vincular por email es seguro **solo** porque antes se exige `email_verified`. | S |

**Criterio de aceptación:** un alumno entra con su cuenta de Google y queda con la misma cookie/JWT que por el login clásico. → **cumplido en código**; queda verificarlo contra Google real una vez cargadas las credenciales (T8.1). La segunda mitad del criterio original ("un mail de fuera del dominio recibe un rechazo con motivo claro") ya no aplica: se decidió no restringir el dominio, aunque el mecanismo quedó disponible por env.

---

## Frente 9 — Modo claro  🟡
**Estado:** el toggle vive en el `TopNav` (`next-themes`) y `globals.css` ya define la escala **completa** en claro (`:root`) y oscuro (`.dark`): los `--shell-*` y también los tokens de Kinetic Blueprint (`--surface`, `--on-surface`, `--outline`, categorías del calendario, glows y sombras de card). O sea, la infraestructura está.

Lo que rompe el modo claro son los **colores hardcodeados** que quedaron de la época dark-only. Conteo con `grep -rEn "#[0-9a-fA-F]{6}|rgba\(" --include="*.tsx" src/components src/features`, sacando el celeste institucional `#1CA4DF` (que es intencional y funciona en los dos temas):

| Archivo | Hardcodeos |
|---|---|
| `features/horarios/HorariosBuilder.tsx` | 49 |
| `features/horarios/OptimizadorModal.tsx` | 42 |
| `components/calendario/CalendarioView.tsx` | 16 |
| `features/auth/AuthCard.tsx` | 13 |
| `components/materias/GrafoCanvas.tsx` | 10 |
| `components/calendario/EventoModal.tsx` | 10 |
| `components/materias/LeyendaEstados.tsx` | 3 |
| `MateriasGraphView`, `ProgresoHero`, `Sidebar` | 1 c/u |

Concretamente: la `PALETTE` de `HorariosBuilder` son pasteles con texto pensado para fondo negro (`{ rgb: "138,180,255", text: "#bcd4ff" }`), y `GrafoCanvas` pinta aristas y nodos con `#adc6ff` / `#ffb950` / `#7dffa2` / `#737373` más una sombra interna `rgba(9,9,11,0.6)` — sobre canvas claro pierden todo el contraste. Aparte, el `ThemeToggle` asume oscuro hasta que monta (`esOscuro = montado ? … : true`), así que en claro el ícono parpadea en el primer render.

Y `agent_docs/ui_style_guide.md` **quedó desactualizado**: sigue diciendo que Kinetic Blueprint es dark-only con `color-scheme: dark` fijo. El próximo que lo lea vuelve a hardcodear.

| ID | Tarea | Área | Alcance | Esf. |
|----|-------|------|---------|------|
| T9.1 | Horarios en claro | Front | `HorariosBuilder` + `OptimizadorModal`: la paleta de materias necesita una variante legible sobre blanco (o pasar a tokens con alpha). Es el 60% de la deuda. | M |
| T9.2 | Calendario en claro | Front | `CalendarioView` + `EventoModal`. Las categorías (`--cat-*`) ya tienen variante clara en `globals.css`: hay que usarlas en vez de los hex. | M |
| T9.3 | Grafo en claro | Front | `GrafoCanvas` + `LeyendaEstados` + `MateriasGraphView`: colores de estado y de arista a tokens, y revisar la sombra interna y el patrón `bg-blueprint`. | M |
| T9.4 | Login/registro | Front | `AuthCard` es un diseño "cinematic" pensado para negro (`placeholder:text-zinc-600`, etc.). Decidir: se adapta, o se declara dark-only a propósito y se fuerza `.dark` en esa ruta. | S |
| T9.5 | Flash del toggle | Front | Que el ícono no asuma oscuro antes de montar (o resolver el tema con el script de `next-themes` para evitar el parpadeo). | S |
| T9.6 | Actualizar el style guide | Docs | `agent_docs/ui_style_guide.md`: Kinetic Blueprint ya **no** es dark-only. Actualizar la tabla de equivalencias hardcodeado → token. | S |

**Criterio de aceptación:** recorrer las 10 secciones en tema claro sin que queden textos ilegibles, cards que desaparecen contra el fondo o íconos invisibles.

---

## Frente 10 — Importación de SYSACAD: matching y cursada  ✅  *(cerrado — 2026-08-26)*
Dos bugs distintos del mismo flujo (`services/sysacad_paste_service.py` + `components/materias/ImportarSysacadModal.tsx`). **Los dos arreglados**, con tests en `tests/test_sysacad_import.py`.

### 10.A — Las materias "Cursa en …" no quedan puestas en Horarios

`confirmar_importacion()` llama a `materia_repo.upsert_usuario_materia()`, que escribe `condicion`, `nota` y `anio_cursada` — **nunca `cursada_id`** (`repositories/materia_repo.py:200`). Y la grilla de Horarios se pinta a partir de `cursada_seleccionada_id`, que sale justamente de `usuario_materia.cursada_id` (`comision_service.materias_cursables_con_comisiones`). Resultado: la materia importada como `CURSANDO` aparece en la lista de cursables —el estado está contemplado— pero **sin comisión elegida**, y la grilla queda vacía.

De rebote también queda vacía la "Agenda de hoy" del panel personal, que arma las clases del día a partir de la comisión elegida (`PanelPersonal.clasesDeHoy`).

Lo bueno: **el dato está en el texto pegado**. SYSACAD escribe `Cursa en 4K02 Aula 501 Zeballos 1341`, y `4K02` es exactamente el formato de `Comision.nombre` (`1K01`, `3EK02`…). Antes `_parsear_condicion()` miraba ese texto sólo para devolver `CURSANDO` y descartaba el resto.

**Resuelto.** `_parsear_comision()` saca la comisión del estado y viaja en `ItemImportMapeado.comision_nombre` hasta `confirmar_importacion`, que llama a `comision_service.seleccionar_cursada`. Verificado contra la DB real (en transacción con rollback): `SOPORTE… Cursa en 4EK01` queda con `cursada_id=2078` → comisión 4EK01 2025 C1.

| ID | Tarea | Área | Alcance | Esf. |
|----|-------|------|---------|------|
| ~~T10.1~~ ✅ | Extraer la comisión del texto | Back | `_parsear_comision()` con el patrón `\d[A-Z]{0,3}K\d{1,3}`, sólo para filas `CURSANDO`. La dirección de la sede no lo confunde (exige la `K` entre los números). | S |
| ~~T10.2~~ ✅ | Auto-seleccionar la cursada | Back | `_autoseleccionar_cursada()` + `comision_repo.cursadas_por_nombre_comision()` (año desc, cuatrimestre asc). Si la comisión no está cargada se importa igual, y el fallo va aparte del contador de errores. | M |
| ~~T10.3~~ ✅ | Mostrarlo en el preview | Front | Chip `ComisionChip` en la columna Estado; clickearlo apaga la autoselección de esa fila. Chip de resumen "N con comisión" y línea en la pantalla de éxito. | S |

### 10.B — La electiva de Soporte no matchea

El matcher (`_matchear_materias`) usa `process.extractOne(..., scorer=fuzz.token_sort_ratio)` **sin `processor`**: rapidfuzz no normaliza por su cuenta, así que compara respetando mayúsculas y acentos. El umbral para marcar `importar=True` es `CONFIANZA_MINIMA = 0.72`. La materia en la DB es `E13 · "Soporte a las Bases de Datos con Programación Visual"` (`db/seed/isi_2023.py`): si SYSACAD la escribe abreviada (`Prog. Visual`), en mayúsculas o sin tildes, el score cae debajo del umbral y el ítem llega al preview como "Sin coincidencia" o con confianza baja.

Y ahí aparece el segundo problema: **en el preview no se puede corregir el mapeo a mano**. La tabla muestra el nombre original, la materia adivinada y un checkbox que está `disabled` cuando `materia_codigo` es `null`. No hay selector de materia, así que una fila mal mapeada no tiene salida.

**Resuelto**, y el bug era bastante más grande que una electiva: medido sobre las 56 materias del plan, con el nombre **en mayúsculas** —como lo escribe SYSACAD— el matcher acertaba **0/56**. Soporte daba 19.6% y se mapeaba a "Análisis y Diseño de Datos e Información".

| Variante del nombre | Antes | Después |
|---|---|---|
| tal cual | 56/56 | 56/56 |
| sin tildes | 55/56 | 56/56 |
| **MAYÚSCULAS** | **0/56** | **56/56** |
| minúsculas | 46/56 | 56/56 |

La normalización quedó en `app/core/texto.py::normalizar_texto` (movida desde `profesor_matching`, que la sigue usando): un solo punto de verdad para los dos matchers. De paso `_CURSILLO_EXCLUIR` dejó de listar cada nombre dos veces —con y sin tilde— porque ahora compara normalizado.

| ID | Tarea | Área | Alcance | Esf. |
|----|-------|------|---------|------|
| ~~T10.4~~ ✅ | Normalizar antes de matchear | Back | `processor=normalizar_texto` en `process.extractOne`. Soporte en mayúsculas: **19.6% → 100%**. | S |
| ~~T10.5~~ ✅ | Elegir la materia a mano | Front | `MateriaCell` muestra un `<select>` con el plan en las filas sin match o por debajo del umbral, y un "cambiar" en las demás: cualquier fila se corrige. Las elegidas a mano dicen "elegida a mano" en vez de un % inventado. | M |
| ~~T10.6~~ ✅ | Fixture del caso real | QA | `tests/test_sysacad_import.py` — 9 tests sobre el pegado en mayúsculas con `Cursa en 4K02`. | S |

**Criterio de aceptación:** ✅ pegar el Estado Académico completo de un alumno de 4°/5° deja todas las materias mapeadas (a mano las que haga falta), y las que dicen "Cursa en …" aparecen ya puestas en la grilla de Horarios.

---

## Frente 11 — Calendario ↔ Google  🟢
**Estado:** no existe nada. Ni exportación `.ics` ni integración con Google Calendar — `grep -rn "ics\|google" backend/app/services/calendario_service.py backend/app/api/calendario.py frontend/src/components/calendario/` no devuelve nada.

Lo que sí está y alcanza para empezar: el modelo `EventoCalendario` con `fecha_inicio`, `fecha_fin`, `tipo`, `descripcion` y `usuario_id` (NULL = evento institucional compartido; con valor = evento personal del alumno), el CRUD completo de eventos personales y un `content_hash` único que sirve de `UID` estable.

**Depende de:** D6. Son dos productos distintos y conviene no confundirlos:

- **Exportar `.ics`** — no necesita credenciales de nadie y lo comen Google Calendar, Apple Calendar y Outlook. Si además se expone como **suscripción** (una URL con token por usuario), Google la re-lee sola cada tantas horas y el alumno ve los cambios sin volver a importar. Cubre casi todo lo pedido.
- **API de Google Calendar** — sync bidireccional e importar los eventos propios del alumno. Necesita OAuth con scope de Calendar, o sea que **arrastra el Frente 8**.

Recomendación: ICS primero; el import desde Google, atado al Frente 8.

| ID | Tarea | Área | Alcance | Esf. |
|----|-------|------|---------|------|
| T11.1 | Export ICS | Back | `GET /calendario/export.ics`: un `VEVENT` por evento (institucionales + los personales del usuario), `UID` estable desde `content_hash`, `DTSTART`/`DTEND` con timezone `America/Argentina/Buenos_Aires`. La lógica va en `calendario_service`, no en el endpoint. | M |
| T11.2 | URL de suscripción | Back | Token opaco por usuario para que la URL se pueda pegar en Google Calendar sin exponer el JWT (Google no manda headers). Poder revocarlo. | M |
| T11.3 | Botón en la UI | Front | "Agregar a mi calendario" en `/calendario`, con la URL copiable y el paso a paso de Google/Apple. | S |
| T11.4 | Import desde Google | Back+Front | Leer el calendario del alumno y mostrarlo junto a lo académico. Scope `calendar.readonly` — **depende del Frente 8**. | L |

**Criterio de aceptación:** el alumno se suscribe una vez y las mesas, feriados y sus TPs aparecen en su Google Calendar; los cambios del calendario académico se propagan solos.

---

## Frente 12 — Comisiones y profesores: repaso  🟡
**Estado:** es de lo más completo del proyecto. Las specs `001-profesores-directory`, `002-comisiones-profesores`, `003-reviews-catedra` y `004-resenas-alumnos` están implementadas: directorio con búsqueda, detalle con cátedras y horarios de consulta, comisiones agrupadas por año con modal de materias, score combinado (UTNTAC + reseñas de alumnos) y los tres scrapers de sincronización. Lo que queda son puntas sueltas — una de ellas seria:

1. **Los endpoints de sincronización están abiertos.** `POST /profesores/sincronizar-horarios`, `/sincronizar-mails` y `/sincronizar-catedras-utntac` (`api/profesores.py:117`) no piden token: cualquiera con la URL dispara un scrapeo completo que **reemplaza** `horario_consulta` y `materia_profesor`. Y `deps.requerir_admin` ya está escrito pero **no se usa en ningún lado** (`grep -rn requerir_admin backend/app/` devuelve sólo su definición). Es T1.2 del Frente 1 sin terminar, y acá es donde más duele.
2. **El `SincronizarMenu` se le muestra a cualquiera** en `/profesores`, incluso sin sesión. `UsuarioOut` y `UsuarioSesion` ya traen `rol`, así que condicionarlo es directo.
3. **Puntajes de UTNTAC sin capturar.** El docstring de `sincronizar_catedras_utntac` avisa que los puntajes / popularidad / recomendaciones de la sheet no se guardan porque "requieren un modelo nuevo". Hoy el score sale de reviews de cátedra + reseñas de alumnos.
4. **Cambios sin commitear.** `ComisionCard`, `ComisionModal` y `ComisionesView` están modificados en el árbol de trabajo: las electivas pasan de badge por card a sección propia con título. Hay que cerrarlo.

| ID | Tarea | Área | Alcance | Esf. |
|----|-------|------|---------|------|
| T12.1 | Cerrar los endpoints de sync | Back | `Depends(requerir_admin)` en las tres rutas de sincronización. Es lo mínimo antes de que esto quede público. | S |
| T12.2 | Ocultar el menú de sync | Front | Mostrar `SincronizarMenu` sólo con `rol == "admin"`. Sin T12.1 es cosmético: la ruta sigue abierta. | S |
| T12.3 | Cerrar el rediseño de electivas | Front | Commitear o descartar los cambios de `ComisionCard` / `ComisionModal` / `ComisionesView`. `ElectivaBadge` queda usado sólo por el modal: revisar que no quede huérfano. | S |
| T12.4 | Puntajes de UTNTAC | Back | Evaluar si se capturan (modelo nuevo + merge con el score actual) o si se documenta que quedan afuera a propósito. | M |
| T12.5 | Repaso de datos | QA | Contra la DB: comisiones sin horarios, profesores sin cátedra, cursadas sin docente, duplicados por nombre. Es lo que "no está muy visto". | M |

**Criterio de aceptación:** ningún endpoint que reescribe tablas queda abierto, la UI de mantenimiento sólo la ve un admin, y hay un informe corto de huecos de datos.

---

## Frente 13 — Inicio, dashboard y panel personal  🟠

### 13.A — Inicio o dashboard según la sesión

Hoy `/` es la **portada pública** (hero, secciones y últimas novedades reales) y el panel personal vive dentro de `/perfil`, debajo de los datos de la cuenta (`perfil/page.tsx` → `<PanelPersonal />`). El `NAV_ITEMS` de la Sidebar es una constante estática: "Inicio" y "Perfil" aparecen siempre, haya sesión o no. El `middleware` ya no redirige `/` a ningún lado.

Lo pedido: sin sesión → "Inicio" con la portada; con sesión → desaparece "Inicio" y aparece "Dashboard".

**Depende de:** D4 — qué pasa con la portada cuando hay sesión. Es la pantalla que explica de qué se trata el proyecto: para la defensa conviene que siga siendo alcanzable en alguna URL.

| ID | Tarea | Área | Alcance | Esf. |
|----|-------|------|---------|------|
| T13.1 | Nav según sesión | Front | Pasarle a `Sidebar` si hay sesión (el layout ya tiene el usuario) y armar `NAV_ITEMS` en función de eso: "Inicio" o "Dashboard", no los dos. | S |
| T13.2 | `/` según sesión | Front | Con sesión, `/` renderiza el panel personal; sin sesión, la portada. Se resuelve en el Server Component con el `getUsuarioActual()` que ya se llama. | M |
| T13.3 | Perfil vuelve a ser perfil | Front | Sacar `<PanelPersonal />` de `/perfil` y dejar ahí los datos de la cuenta y "Calificá a tus cátedras". | S |

### 13.B — Que el panel esté conectado de verdad

`PanelPersonal` fue de lo primero que se hizo y hoy mezcla datos reales con mocks:

| Widget | Estado |
|---|---|
| `ProgresoHero` | **Real** — `getGrafo()`: aprobadas, %, carga horaria, créditos de electivas, promedio. |
| `AgendaHoy` | **Real** — clases de hoy desde la comisión elegida + eventos del calendario. Queda vacío sólo si el alumno nunca eligió comisión; el import de SYSACAD ya la elige solo (Frente 10.A ✅). |
| `NovedadesAlertas` | **Mock** — `NOVEDADES_MOCK` hardcodeado ("Paro docente del 09/05"), con `/novedades` real al lado. |
| `ChatSnippet` | **Vacío por diseño** — recibe `null` fijo; depende del Frente 2. |
| `AccionesRapidas` / `AtajosToolbox` | Links estáticos; funcionan. |
| Carrera | Constante `CARRERA` hardcodeada. `Usuario.anio_ingresado` existe en el modelo pero no se expone en `UsuarioOut`. |

| ID | Tarea | Área | Alcance | Esf. |
|----|-------|------|---------|------|
| T13.4 | Novedades reales | Front | Reemplazar `NOVEDADES_MOCK` por `listarNovedades({ limite })` y mapear categoría → severidad. Es el mock más visible: hoy el panel anuncia un paro de mayo que no existe. | S |
| T13.5 | Datos reales de la cuenta | Back+Front | Exponer `anio_ingresado` (y carrera, si se agrega al modelo) en `UsuarioOut` / `UsuarioSesion` y dejar de hardcodear `CARRERA`. | S |
| T13.6 | Qué agregar y qué sacar | Front | Con lo que el backend ya devuelve, entran sin trabajo de back: **próximas mesas/finales** (`finalesProximos` ya se calcula y se usa sólo como número suelto), **materias que podés cursar** (`/comisiones/cursables`), **reseñas pendientes** (`MisCatedrasCalificar`) y **horarios de consulta de hoy**. Del otro lado, `ChatSnippet` ocupa 4 columnas para mostrar un empty state hasta que exista el chat: evaluar achicarlo o esconderlo. | M |

**Criterio de aceptación:** ningún widget del panel muestra datos inventados, y cada uno enlaza a la sección donde ese dato vive.

---

## Orden sugerido y dependencias

```
D2, D3        ──► destraban el chatbot
D4, D5, D6    ──► destraban los frentes 13.A, 8 y 11

Frente 1  (auth)            ── ✅ salvo Google, inactividad y rol
Frente 4  (multi-usuario)   ── ✅ cerrado
Frente 3  (tests)           ── independiente, se puede empezar YA — obligatorio por la materia
Frente 2  (chatbot)         ── de Bruno; necesita D2/D3 + pgvector
Frente 5  (housekeeping)    ── en cualquier momento, tareas chicas

Frente 12 (comisiones/profes) ── T12.1 y T12.2 primero: hoy hay endpoints
                                 abiertos que reescriben tablas
Frente 10 (import SYSACAD)  ── independiente; destraba Horarios y la Agenda del panel
Frente 9  (modo claro)      ── independiente; se reparte por pantalla entre varios
Frente 7  (shell/topbar)    ── ✅ hecho (2026-08-26)
Frente 13 (inicio/dashboard)── 13.B se puede hacer ya; 13.A necesita D4
Frente 8  (Google OAuth)    ── necesita D5 + credenciales de Google Cloud (T8.1)
Frente 11 (calendario ICS)  ── T11.1–T11.3 independientes; T11.4 después del Frente 8
```

**Recomendación:** el orden de arriba está pensado por **riesgo y dependencia**, no por
tamaño. Primero **T12.1** (cerrar los endpoints de sincronización: es la única falla de
seguridad abierta y son minutos de trabajo), después **Frente 3 (tests)**, que es
condición de la materia y no depende de nadie. En paralelo, **Frente 10** y **Frente 9**
se pueden repartir entre varias personas porque no se pisan entre sí ni necesitan
credenciales externas. **Frente 8** y **Frente 11 (T11.4)** quedan últimos porque
dependen de credenciales de Google que hay que gestionar antes.
