# Plan de mejora integral — UTNHub Asistente

Auditoría del estado actual (verificada contra el código) + roadmap por fases.
Objetivo: producto académico moderno, oscuro/tecnológico/minimalista, identidad
UTN FRRO. NO una copia de ChatGPT. Conservar lo que ya funciona y mejorar sobre eso.

Estados: ✅ hecho · 🟡 parcial · ❌ falta · ⏸ diferido (depende de algo externo).

## Hallazgos de arquitectura (transversales)

- **Dos sistemas de tokens** conviven a propósito: `--shell-*` (celeste `#1CA4DF`,
  light/dark) en `Sidebar`/`TopNav`/`Novedades`; y "Kinetic Blueprint"
  (`surface`/`on-surface`/`primary`=`#adc6ff`, dark-only) en el contenido
  (grafo, materias, calendario) **y el chat**. Ambos comparten el negro
  `#09090b`. El chat es coherente con el contenido; el nav es su propio lenguaje.
- **Patrón de puntos**: `.bg-blueprint` en `globals.css` (radial-gradient,
  `rgba(82,82,91,0.18)`, `40px`). Aplicado por `DashboardMain`.
- **Doble sidebar en `/chat`**: el nav del dashboard (64/256px) + el historial de
  chat (256px) → 3 columnas. Hay que reconciliar (ancho, colapso, mobile).
- **Fuentes**: `rag_chunk` tiene `titulo`, `url`, `fuente` pero **no** fecha de
  actualización. Las fuentes **no** se persisten por mensaje (al retomar una
  conversación se pierden). Los datos demo (`demo_seed`) no tienen `url`.
- **Sin modelos** de feedback ni de "confianza" para el chat (el `confianza`
  existente es del clasificador de novedades).
- **Sin responsive/drawer** en ningún módulo (el sidebar es `fixed` y empuja el
  contenido 256px; en mobile se rompe).
- **Materia** expone `codigo, nombre, anio_carrera, cuatrimestre, creditos,
  horas, tipo, correlativas` → alcanza para fichas académicas.
- **Fecha actual**: el agente NO recibe la fecha de hoy en el prompt (el
  razonamiento de "el próximo" depende de la tool `proximos_eventos`).

## Auditoría por sección

| # | Sección | Estado | Ya existe | Falta |
|---|---------|--------|-----------|-------|
| 2 | Home / pantalla inicial | 🟡 | Empty state con ícono + 3 chips de sugerencia; desaparecen al empezar | Título "UTNHub / Asistente académico" + bajada; tarjetas por categoría (📚📅📝🎓); composición equilibrada; menos vacío |
| 3 | Diseño general | 🟡 | Fondo oscuro + `.bg-blueprint`; scroll dentro del área | Ancho máx 900–1000 (hoy 768); bajar intensidad del patrón; gradientes sutiles de profundidad |
| 4 | Sidebar | 🟡 | "Nuevo chat", lista de historial, resalta activa; colapso del nav dashboard | Agrupar por fecha (Hoy/Ayer/7 días); renombrar; eliminar; menú "..."; colapsar el sidebar de chat; tooltips |
| 5 | Header | 🟡 | `TopNav` con tema/notif/perfil + buscador; header propio del chat | "UTNHub Asistente / UTN FRRO"; perfil hoy hardcodea "JR"; notif no funciona; integrar |
| 6 | Input | 🟡 | Textarea, enviar, disabled sin texto, Enter=enviar, Shift+Enter=nueva línea | Spinner en loading; hint "Enter para enviar · Shift+Enter…"; placeholder "Preguntá sobre la UTN FRRO…"; adjuntar (⏸ backend no soporta) |
| 7 | Mensajes usuario | ✅ | Burbuja diferenciada, alineada a la derecha, legible | Pulido menor |
| 8 | Respuestas asistente | 🟡 | Markdown (negrita, listas, links, código) | Tablas (falta remark-gfm); fechas destacadas; bloques de info; tarjetas |
| 9 | Fuentes | 🟡 | `SourcesPopover` con título + link, dedup | Fecha de actualización (falta campo); "Ver fuente"; persistir fuentes por mensaje; datos reales con URL |
| 10 | Anti-alucinaciones | 🟡 | Prompt "solo con contexto/tools" | Aviso de info desactualizada; respuestas graduadas; requiere metadata de fecha |
| 11 | Estado de búsqueda | 🟡 | Indicador "Escribiendo…" | Textos útiles ("🔎 Buscando información oficial…"); estados por operación |
| 12 | Contexto conversacional | ✅ | Memoria por conversación (verificado) | — |
| 13 | Detección de intención | 🟡 | Ruteo implícito por selección de tool del agente (funciona) | Taxonomía/registro explícito (opcional) |
| 14 | Fechas | 🟡 | `proximos_eventos` filtra desde hoy | Inyectar la fecha actual al prompt; destacar fechas visualmente |
| 15 | Nivel de confianza | ❌ | — | Señal (🟢🟡🔴) desde backend + badges en UI (con mesura) |
| 16 | Sugerencias post-respuesta | ❌ | — | "También podés preguntar:" con hasta 3 relacionadas |
| 17 | Feedback | ❌ | — | 👍/👎/📋; motivo en 👎; modelo + endpoint |
| 18 | Estados de error | 🟡 | Mensaje de error genérico; backend responde amable en 503 | Estados diseñados: conexión (+Reintentar), sin resultados, desactualizado, ocupado |
| 19 | Fichas académicas | ❌ | Datos en `Materia`; el agente devuelve texto | Tarjetas estructuradas (materia/carrera) con acciones |
| 20 | Personalidad | 🟡 | Prompt: claro/directo/amable/rioplatense, breve | Afinar "respuesta concreta primero" |
| 21 | Responsive | ❌ | Chat centrado max-w | Sidebar→drawer en mobile; header reducido; tarjetas adaptables; touch; sin scroll horizontal |
| 22 | Accesibilidad | 🟡 | Algunos `aria-label` | `focus-visible`; navegación por teclado en listas/menús; no depender del color |
| 23 | Microinteracciones | 🟡 | Hover/transiciones; `animate-pulse` en loading | Aparición de mensajes; aparición de fuentes; transición del drawer |

## Roadmap por fases (orden de prioridad de la sección 25)

- **F1 — Home + diseño general** (§2, §3): rediseñar pantalla inicial (título,
  bajada, tarjetas por categoría), ancho 900–1000, bajar patrón, gradiente sutil.
- **F2 — Chat y mensajes** (§8, §7, §20): remark-gfm (tablas), fechas destacadas,
  bloques de info, pulir burbujas, afinar prompt de personalidad.
- **F3 — Input** (§6): placeholder, hint, spinner de loading. Adjuntar ⏸.
- **F4 — Sidebar e historial** (§4): agrupar por fecha, renombrar, eliminar, menú
  "...", colapsar; reconciliar doble sidebar. Backend: PATCH/DELETE conversación.
- **F5 — Fuentes verificables** (§9): backend `fecha_actualizacion` en `rag_chunk`
  + persistir fuentes por mensaje; UI con fecha y "Ver fuente".
- **F6 — Info no encontrada/desactualizada** (§10, §14): fecha actual al prompt,
  respuestas graduadas, aviso de desactualizado.
- **F7 — Contexto** (§12): ✅ hecho; verificar/pulir.
- **F8 — Loading / error** (§11, §18): estados diseñados con Reintentar, etc.
- **F9 — Sugerencias contextuales** (§16): follow-ups del agente + UI.
- **F10 — Feedback** (§17): modelo `chat_feedback` + endpoint + UI 👍👎📋.
- **F11 — Fichas académicas** (§19): tool/endpoint que devuelva ficha estructurada
  + componente de tarjeta con acciones.
- **F12 — Responsive + accesibilidad** (§21, §22).
- **F13 — Microinteracciones** (§23).
- Transversales: intención (§13), confianza (§15) según valor.

## Decisiones de producto a confirmar

1. **Adjuntar documentos (§6)**: el backend no ingesta documentos del usuario en
   tiempo de consulta. Propuesta: **diferir** (dejar el ícono fuera hasta tener la
   ingesta). 
2. **Fichas académicas (§19)**: es el mayor cambio (el agente debe emitir datos
   estructurados, no texto). Propuesta: tool `ficha_materia` que devuelva JSON +
   render de tarjeta.
3. **Fuentes con fecha (§9)**: requiere migración (`fecha_actualizacion`) y que la
   ingesta real la complete; con `demo_seed` quedará vacía.
