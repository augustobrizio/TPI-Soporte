# Guía de estilo de UI

El frontend tiene actualmente **dos sistemas de estilos distintos**,
aplicados a distintas páginas. Este doc los describe técnicamente, tal como
existen hoy en el código — no toma posición sobre cuál debería usarse a
futuro; esa discusión sigue abierta.

## Los dos sistemas

| | **Kinetic Blueprint** | **Sistema de tokens `--shell-*`** |
|---|---|---|
| Dónde se usa | Grafo de correlativas, Materias, Horarios | Sidebar, TopNav, Novedades, portada, **Calendario** |
| Paleta | Navy/MD3 (`surface`, `on-surface`, `primary`, etc. en `tailwind.config.ts`) | Canvas neutro (blanco/negro según modo), acento celeste institucional (`#1CA4DF`) |
| Dark/Light | **Los dos modos** desde 2026-08 (`:root` claro / `.dark` oscuro en `globals.css`), pero varios componentes todavía tienen el color dark hardcodeado | Ambos modos, toggle en el TopNav (`next-themes`) |
| Bordes | "No-Line Rule" (comentario en `globals.css`): nada de `border 1px solid gris`, se usa tonal layering / glow | Hairline borders explícitos vía `border-[var(--shell-border)]` |
| Nombre en el código | Comentario "Kinetic Blueprint" en `tailwind.config.ts` y `globals.css` | Sin nombre propio en el código; identificado acá por el prefijo de sus variables CSS |

**El Calendario se migró a `--shell-*` (2026-09-01).** Era la página con más
deuda de las dos listas: colores dark-only hardcodeados, Material Symbols y
emojis como identidad de categoría. Hoy usa los tokens del shell, lucide y
—esto es lo que cambió de fondo— **el color dejó de nombrar la categoría y pasó
a nombrar el rol**: qué significa ese evento para la cursada del alumno. Ver
`components/calendario/utils.ts` (`RolEvento`, `ROL`, `impideCursada`) y los
tokens `--cal-alerta-*` de `globals.css`. Los tres roles son `sin_cursada`
(mesa de examen y feriado: en FRRO las dos cosas suspenden la cursada, así que
comparten el ámbar), `propio` (lo que carga el alumno, en el celeste de marca)
e `info` (institucional sin efecto sobre la cursada, en neutro). Cinco tonos
saturados que competían entre sí pasaron a tres con significado.

**No mezclar los dos sistemas en el mismo componente.** Cada página usa uno
u otro completo. Si una página usa `surface`/`on-surface`/etc., seguir con
esos tokens; si usa `--shell-*`, seguir con esos. Migrar una página de un
sistema al otro es un cambio de diseño explícito, no algo para hacer de
paso en un PR de otra cosa.

## Sistema de tokens `--shell-*`

### Tokens de color

Definidos en `frontend/src/app/globals.css`, con valores distintos en
`:root` (modo claro) y `.dark` (modo oscuro):

```css
:root {
  --shell-canvas: #fafafa;      /* bg de página */
  --shell-panel: #ffffff;       /* bg de card/sidebar/topnav/dialog */
  --shell-border: rgba(0,0,0,0.08);
  --shell-hover: rgba(0,0,0,0.04);
  --shell-fg: #171717;          /* texto de alto énfasis (títulos) */
  --shell-fg-muted: #525252;    /* texto secundario (body, labels) */
  --shell-fg-dim: #a3a3a3;      /* texto terciario (hints, iconos idle) */
  --shell-accent-fg: #0e7fb0;   /* celeste sobre texto/iconos (contraste en claro) */
}
.dark { /* mismos nombres, valores oscuros */ }
```

En Tailwind se usan como arbitrary values: `bg-[var(--shell-canvas)]`,
`text-[var(--shell-fg-muted)]`, `border-[var(--shell-border)]`. Es lo que
permite que un componente cambie de paleta según el modo sin lógica
condicional — el valor de la variable cambia solo con la clase `.dark` en
el `<html>`.

El celeste institucional **`#1CA4DF`** se deja literal (no es una variable)
— funciona igual sobre fondo blanco o negro. Se usa típicamente en `/10` de
opacidad para fondos (`bg-[#1CA4DF]/10`) y sin opacidad para acentos sólidos
(barrita del nav activo, punto de notificación).

Tabla de equivalencia para componentes que todavía tienen color
hardcodeado (útil si vas a migrar uno):

| Hardcodeado (dark-only) | Token equivalente |
|---|---|
| `bg-[#09090b]`, `bg-[#0a0a0a]` (canvas de página) | `bg-[var(--shell-canvas)]` |
| `bg-[#0c0c0e]` (card/panel/sidebar/topnav) | `bg-[var(--shell-panel)]` |
| `border-white/[0.06]`, `border-white/[0.07]`, `border-white/10` | `border-[var(--shell-border)]` |
| `bg-white/[0.04]`, `bg-white/[0.05]`, `bg-white/[0.06]`, `hover:bg-[#111113]` | `bg-[var(--shell-hover)]` |
| `text-neutral-50`, `text-neutral-100`, `text-neutral-200` | `text-[var(--shell-fg)]` |
| `text-neutral-300`, `text-neutral-400` | `text-[var(--shell-fg-muted)]` |
| `text-neutral-500`, `text-neutral-600` | `text-[var(--shell-fg-dim)]` |
| `text-[#4EC0EC]` (celeste sobre texto) | `text-[var(--shell-accent-fg)]` |

### Tipografía

- `font-headline` (Manrope) — títulos, nombres propios (UTNHub, títulos de card).
- `font-body` (Inter) — todo el resto (default del `<body>`, no hace falta declararlo).
- `font-label` (Inter) — labels en mayúscula/tracking ancho (ej. "MÓDULOS", "ACTUALIZADO AUTOMATICAMENTE").

Estas fuentes están cargadas globalmente en `app/layout.tsx` y son
compartidas por ambos sistemas.

### Iconos

Material Symbols Outlined (`<span className="material-symbols-outlined">nombre_del_icono</span>`),
cargado globalmente en `app/layout.tsx`.

**La decisión está tomada: `lucide-react`.** Es lo que declara
`components.json` (`iconLibrary: "lucide"`) desde que se configuró shadcn. Ya
están migrados el shell (`TopNav`, `Sidebar`, `MenuCuenta`,
`CampanaNotificaciones`, `BuscadorGlobal`), la portada, el `Dialog` compartido
y el Calendario. Lo que queda con Material Symbols es deuda: **al tocar un
archivo que los use, migralo**, no agregues más.

Y nada de emojis como iconografía. Se ven distintos en cada sistema operativo,
no toman el color del tema y a 10px son manchas.

### Componentes base (`components/ui/`)

Primitivas estilo shadcn/ui, usadas por las páginas que siguen el sistema
`--shell-*`: `Card`/`CardContent`/`CardFooter` (`card.tsx`), `Badge`
(`badge.tsx`, variantes `celeste`/`neutral`/`outline`), `Dialog`
(`dialog.tsx`, wrapper de `@radix-ui/react-dialog`), `DropdownMenu`
(`dropdown-menu.tsx`) y `Popover` (`popover.tsx`). Todas usan
`React.forwardRef` + `cn()` (`lib/utils.ts`, clsx + tailwind-merge) para
aceptar `className` adicional desde el caller. Un primitivo nuevo (tooltip,
sheet) sigue el mismo patrón: Radix headless + wrapper con los
tokens `--shell-*`, sin librería de componentes con estilos propios
(Chakra, MUI, etc.).

`DropdownMenu` y `Popover` no son intercambiables: el menú es para **acciones**
(navegación con flechas entre items, semántica `menu`) y el popover para
**contenido arbitrario**. Usar el menú para una lista de texto le promete a un
lector de pantalla items navegables que no existen.

Un caso que **no** usa el `DialogContent` compartido es el command palette
(`components/buscador/BuscadorGlobal.tsx`): el wrapper centra el panel en la
pantalla y le pone una ✕ en la esquina, que ahí caería sobre el campo de texto.
Se arma sobre las primitivas de Radix con los mismos tokens.

### Dark/Light mode

`next-themes` (`attribute="class"`, `defaultTheme="dark"`, `enableSystem={false}`),
provider en `components/ThemeProvider.tsx` envolviendo todo en
`app/layout.tsx`. El toggle vive en `TopNav.tsx` (`useTheme()`).

**Actualizado 2026-08-26.** Kinetic Blueprint dejó de ser dark-only:
`globals.css` define la escala completa en claro (`:root`, con
`color-scheme: light`) y en oscuro (`.dark`), incluidos `--surface`,
`--on-surface`, `--outline`, las categorías del calendario, los glows y las
sombras de card. El toggle **sí** afecta a esas páginas.

Lo que sigue roto en claro son los **colores hardcodeados** que quedaron de
la época dark-only — sobre todo en Horarios, Calendario, el grafo y
`AuthCard`. Está relevado con conteo por archivo en el **Frente 9** de
[`PENDIENTES.md`](../PENDIENTES.md). Al tocar cualquiera de esos
componentes, usar los tokens (tabla de equivalencias más arriba) en vez de
agregar otro hex.

## Layout / composición (sistema `--shell-*`)

- Cards: `rounded-xl`, hairline border, sin drop-shadow — el hover es un
  cambio sutil de `bg` + `border-color` hacia el celeste (`group-hover:border-[#1CA4DF]/40`).
- Footers de card con dos grupos flex explícitos (`min-w-0 flex-1` a la
  izquierda para lo que trunca, `shrink-0` a la derecha para lo que no) en
  vez de `ml-auto` suelto — evita gaps inconsistentes cuando el contenido
  varía en longitud (ver `NovedadCard.tsx`).
- Modales/detalles (`Dialog`): overlay con blur, panel `rounded-xl` +
  hairline border, transición vía `data-[state=open|closed]` de Radix (sin
  plugin de animaciones — no está instalado `tailwindcss-animate`).
- Filtros como chips (`rounded-full`, border hairline, estado activo =
  `bg-[#1CA4DF]/10 text-[var(--shell-accent-fg)]` + `border-[#1CA4DF]/30`),
  navegación vía querystring (`?centro=handle`) en vez de estado de cliente
  cuando la página ya es un Server Component — ver `FiltroFuentes.tsx`.

## Referencia de archivos

- `app/globals.css` — tokens `--shell-*` + estilos de Kinetic Blueprint (secciones separadas dentro del mismo archivo).
- `components/ThemeProvider.tsx`, `components/TopNav.tsx` (toggle) — dark/light.
- `components/Sidebar.tsx`, `components/TopNav.tsx` — usan el sistema `--shell-*`.
- `components/ui/card.tsx`, `badge.tsx`, `dialog.tsx` — primitivas del sistema `--shell-*`.
- `features/novedades/` — ejemplo end-to-end del sistema `--shell-*` aplicado a una feature completa (card, detalle, filtro).
