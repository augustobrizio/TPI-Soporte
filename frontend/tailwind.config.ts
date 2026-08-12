import type { Config } from "tailwindcss";

/**
 * Design tokens del sistema "Kinetic Blueprint" del Stitch.
 *
 * Reglas duras (DESIGN.md):
 *  - prohibido usar borders 1px solid grises para secciones (usar tonal layering).
 *  - prohibido drop-shadows (usar glows con `box-shadow`).
 *  - el blanco puro #ffffff esta vetado, siempre usar `on-surface`.
 *  - estados de los nodos: aprobado (#7dffa2), regular (#ffb950), cursable (#adc6ff).
 *
 * La escala de superficies es NEUTRA (negro), alineada con los tokens
 * `--shell-*` de globals.css que usan Sidebar/TopNav/Novedades: antes era
 * azul marino (#0b1326) y las paginas viejas desentonaban con el shell.
 * `surface` == `--shell-canvas` y `surface-container-low` == `--shell-panel`.
 * Los acentos (primary/secondary/tertiary) no cambian: son la identidad del
 * sistema y contrastan mejor sobre negro.
 */
const config: Config = {
  darkMode: "class",
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/features/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        outline: "#737373",
        "on-surface-variant": "#a3a3a3",
        "surface-container-low": "#0c0c0e",
        "surface-container-high": "#1a1a1e",
        primary: "#adc6ff",
        "surface-dim": "#09090b",
        "on-background": "#fafafa",
        "inverse-on-surface": "#232327",
        "surface-tint": "#adc6ff",
        error: "#ffb4ab",
        background: "#09090b",
        "primary-fixed-dim": "#adc6ff",
        "on-surface": "#fafafa",
        "on-secondary": "#003918",
        "on-primary-fixed": "#001a41",
        "tertiary-container": "#4f3200",
        "error-container": "#93000a",
        "on-secondary-container": "#00622e",
        "secondary-fixed": "#62ff96",
        "on-secondary-fixed-variant": "#005226",
        "tertiary-fixed-dim": "#ffb950",
        "on-tertiary-fixed-variant": "#624000",
        "on-primary": "#002e69",
        "outline-variant": "#2a2a2e",
        "secondary-fixed-dim": "#00e475",
        "on-error-container": "#ffdad6",
        "surface-container": "#121215",
        "tertiary-fixed": "#ffddb3",
        "surface-container-lowest": "#050506",
        "on-tertiary": "#452b00",
        "on-secondary-fixed": "#00210b",
        "on-tertiary-container": "#db9200",
        "surface-variant": "#232327",
        surface: "#09090b",
        "on-primary-container": "#6fa1ff",
        "on-error": "#690005",
        "inverse-surface": "#fafafa",
        "surface-bright": "#2a2a2f",
        "secondary-container": "#05e777",
        secondary: "#7dffa2",
        "on-tertiary-fixed": "#291800",
        "primary-container": "#003678",
        tertiary: "#ffb950",
        "on-primary-fixed-variant": "#004494",
        "surface-container-highest": "#232327",
        "primary-fixed": "#d8e2ff",
        "inverse-primary": "#005ac1",
      },
      fontFamily: {
        headline: ["var(--font-manrope)", "ui-sans-serif", "system-ui"],
        body: ["var(--font-inter)", "ui-sans-serif", "system-ui"],
        label: ["var(--font-inter)", "ui-sans-serif", "system-ui"],
      },
      borderRadius: {
        DEFAULT: "0.25rem",
        lg: "0.5rem",
        xl: "0.75rem",
        "2xl": "1rem",
        "3xl": "1.5rem",
        full: "9999px",
      },
    },
  },
  plugins: [],
};

export default config;
