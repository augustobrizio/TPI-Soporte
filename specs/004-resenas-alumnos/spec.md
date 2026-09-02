# Feature Specification: Reseñas de alumnos (calificación de cátedras)

**Feature Branch**: `004-resenas-alumnos`

**Created**: 2026-07-13

**Status**: Draft (implementación bloqueada por auth — ver Dependencias)

**Input**: User description: "Que los alumnos puedan cargar sus propias reseñas por (profesor, materia).
Se mezclan con las de UTNTAC en un solo score. Se pueden cargar desde el detalle del profesor, el
historial del alumno y el modal de comisión."

## Contexto

La feature 003 trajo reseñas **agregadas de UTNTAC** (solo lectura). Esta feature permite que los
**alumnos carguen sus propias reseñas** por (profesor, materia). Como el alumno elige un **nivel de
recomendación en la misma escala de 5 niveles** que UTNTAC (de "súper recomiendo" a "súper evitaría"),
cada reseña de alumno es **un voto más en el mismo conteo**: la nota 1–5 y la cantidad de respuestas ya
combinan ambas fuentes, sin fórmula de fusión especial.

> **Prerrequisito / bloqueo**: cargar reseñas requiere saber **quién** es el alumno (login real), para
> garantizar "una reseña por alumno por cátedra". Hoy la app usa un usuario mock. **La implementación de
> esta feature se retoma cuando la autenticación de alumno esté lista** (decisión del usuario). La spec
> queda definida para poder ejecutarla apenas exista la auth.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Calificar a un profesor en una materia (Priority: P1)

Como alumno identificado quiero calificar a un profesor en una materia concreta (elegir un nivel de
recomendación, de "súper recomiendo" a "súper evitaría"), para aportar mi opinión sobre esa cátedra.

**Why this priority**: Es el núcleo de la feature. Sin la carga individual no hay reseñas de alumnos.

**Independent Test**: Un alumno identificado califica una cátedra y su reseña queda guardada, asociada a
él, y puede volver a verla/editarla.

**Acceptance Scenarios**:

1. **Given** un alumno identificado y una cátedra (profesor + materia), **When** elige un nivel y
   confirma, **Then** se guarda su reseña para ese par.
2. **Given** que el alumno ya reseñó esa cátedra, **When** vuelve a calificarla, **Then** se actualiza
   su reseña existente (no se crea una segunda) — **una reseña por (alumno, profesor, materia)**.
3. **Given** una reseña propia, **When** el alumno la elimina, **Then** deja de contar y de mostrarse
   como suya.
4. **Given** un usuario no identificado, **When** intenta calificar, **Then** no puede (se lo invita a
   iniciar sesión); no se guarda ninguna reseña anónima.

---

### User Story 2 - Que mi voto cuente en el score (Priority: P1)

Como alumno quiero que mi calificación se sume al puntaje de la cátedra, para que el score refleje
también la opinión de los alumnos de UTNHub, no solo la de UTNTAC.

**Why this priority**: Es el valor de mezclar fuentes; sin esto la reseña del alumno no impacta.

**Independent Test**: Antes/después de cargar una reseña, la nota y la cantidad de respuestas de esa
cátedra cambian de forma consistente con haber sumado un voto.

**Acceptance Scenarios**:

1. **Given** una cátedra con reseñas de UTNTAC, **When** un alumno agrega su calificación, **Then** la
   nota se recalcula sobre (votos UTNTAC + votos de alumnos) y la cantidad de respuestas aumenta en uno.
2. **Given** una cátedra sin datos de UTNTAC, **When** uno o más alumnos la califican, **Then** su nota
   surge solo de los votos de alumnos (con su cantidad de respuestas).
3. **Given** una comisión, **When** cambian las reseñas de sus cátedras, **Then** su score (promedio de
   las notas) se actualiza en consecuencia.
4. **Given** el detalle de una cátedra, **When** se lo consulta, **Then** puede mostrarse el desglose de
   origen (cuántas respuestas de UTNTAC y cuántas de alumnos), aunque el score sea uno solo.

---

### User Story 3 - Cargar desde donde el alumno ya está (Priority: P2)

Como alumno quiero poder calificar desde los lugares donde ya miro esta info, para no tener que buscar
una pantalla aparte.

**Why this priority**: Baja la fricción y sube la cantidad de reseñas; depende de US1.

**Independent Test**: Desde cada uno de los tres puntos de entrada se abre la misma acción de calificar
y el resultado es idéntico.

**Acceptance Scenarios**:

1. **Given** el **detalle de un profesor**, **When** el alumno elige una de sus materias, **Then** puede
   calificar esa cátedra ahí mismo.
2. **Given** el **historial del alumno** (las materias/cátedras que cursó), **When** lo abre, **Then**
   puede "calificar a los profes que tuvo" — priorizando las cátedras que efectivamente cursó.
3. **Given** el **modal de una comisión**, **When** ve un profesor de una materia, **Then** tiene un
   "¿lo tuviste? Calificá" que abre la misma acción.

---

### User Story 4 - Comentario opcional (Priority: P3)

Como alumno quiero poder dejar un comentario de texto junto a mi calificación, para explicar el porqué;
y como comunidad, que haya un mínimo control sobre comentarios inapropiados.

**Why this priority**: Enriquece la reseña pero no es imprescindible para el score; suma moderación.

**Independent Test**: Un alumno agrega un comentario a su reseña y se muestra asociado a ella; un
comentario reportado puede ocultarse.

**Acceptance Scenarios**:

1. **Given** una calificación, **When** el alumno agrega un comentario (opcional), **Then** se guarda y
   se muestra junto a su reseña.
2. **Given** un comentario visible, **When** se lo reporta/oculta (moderación mínima), **Then** deja de
   mostrarse públicamente sin borrar la calificación numérica.

### Edge Cases

- **No identificado** → no puede cargar (US1.4); requiere auth.
- **Reseña duplicada** del mismo alumno para la misma cátedra → se edita la existente, no se duplica.
- **Cátedra sin UTNTAC** → la nota sale solo de alumnos.
- **Materia fuera del plan / profesor no vinculado** → no hay dónde anclar la reseña; queda fuera.
- **Comentario inapropiado** → moderación mínima (ocultar) sin perder el voto.
- **Muestra chica** (pocas reseñas de alumnos) → se muestra igual con su cantidad de respuestas
  (consistente con la decisión de 003: nota cruda + #respuestas).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema MUST permitir a un **alumno identificado** calificar una cátedra (profesor +
  materia) eligiendo un nivel de recomendación en la escala de 5 niveles (súper recomiendo … súper
  evitaría).
- **FR-002**: El sistema MUST permitir **una sola reseña por (alumno, profesor, materia)**, editable y
  eliminable por su autor.
- **FR-003**: El sistema MUST impedir la carga de reseñas a usuarios no identificados (sin reseñas
  anónimas).
- **FR-004**: El sistema MUST integrar los votos de alumnos con los de UTNTAC en un **único puntaje**:
  la nota 1–5 se calcula sobre los votos combinados y la cantidad de respuestas es la suma de ambos
  orígenes.
- **FR-005**: El score de comisión (definido en 003) MUST reflejar las reseñas de alumnos al recalcular
  las notas de sus cátedras.
- **FR-006**: El sistema MUST poder exponer, en el detalle de una cátedra, el **desglose por origen**
  (respuestas de UTNTAC vs. de alumnos), aunque el puntaje mostrado sea uno solo.
- **FR-007**: El alumno MUST poder iniciar la calificación desde **tres puntos de entrada** —detalle de
  profesor, su historial de cursadas, y el modal de comisión— apuntando todos a la misma acción.
- **FR-008**: El sistema MAY permitir un **comentario de texto opcional** junto a la calificación, con
  una **moderación mínima** (reportar/ocultar) que no elimine el voto numérico.
- **FR-009**: La regla de combinación de votos (FR-004) MUST estar cubierta por tests.

### Key Entities *(include if feature involves data)*

- **Reseña de alumno**: calificación de un alumno a una cátedra. Atributos: alumno (autor), profesor,
  materia, nivel de recomendación elegido (1 de 5), comentario opcional, fecha. **Única por (alumno,
  profesor, materia)**.
- **Puntaje combinado de cátedra** (derivado): nota 1–5 e "cantidad de respuestas" calculadas sobre los
  votos de UTNTAC + los de los alumnos. Reemplaza al puntaje solo-UTNTAC de la feature 003.
- **Historial de cursadas del alumno** (existente): las cátedras que cursó, usado para priorizar a quién
  puede calificar con más señal.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un alumno identificado puede dejar (y luego editar/eliminar) una reseña de una cátedra, y
  el sistema garantiza una sola por (alumno, profesor, materia).
- **SC-002**: Al agregar una reseña, la nota y la cantidad de respuestas de esa cátedra cambian de forma
  consistente con sumar un voto (verificable en casos conocidos).
- **SC-003**: El score de comisión refleja las reseñas de alumnos además de las de UTNTAC.
- **SC-004**: La calificación se puede iniciar desde los tres puntos de entrada con idéntico resultado.
- **SC-005**: Los usuarios no identificados no pueden cargar reseñas.

## Dependencias

- **Autenticación de alumno (bloqueante)**: identidad real del alumno para "una reseña por alumno". La
  **implementación se retoma cuando la auth esté lista**. Hasta entonces esta spec queda como diseño
  aprobado, no construido.

## Assumptions

- **Escala unificada**: la calificación del alumno usa los **mismos 5 niveles** que UTNTAC, para que se
  integre como un voto más (decisión: score mezclado en un solo número).
- **Score mezclado** (decisión del usuario): una sola nota que combina ambas fuentes; el desglose por
  origen es opcional en el detalle.
- **Muestras chicas sin ajuste**: se muestran con su cantidad de respuestas (consistente con 003).
- **Puntos de entrada** (decisión del usuario): los tres (detalle profesor, historial, modal comisión).
- **Comentario + moderación**: se incluyen como opcionales/mínimos; pueden diferirse a una iteración
  posterior si se prioriza el rating puro primero.
- La feature no re-define la ingesta de UTNTAC (003); solo agrega la fuente "alumnos" y combina.
