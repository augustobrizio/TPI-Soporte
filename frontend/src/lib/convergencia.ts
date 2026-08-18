/**
 * Geometría del grafo de fuentes de la portada.
 *
 * Vive separada del componente a propósito: acá no hay React ni DOM, así que
 * la matemática de las curvas se puede razonar —y probar— sola. El componente
 * solo dibuja lo que estas funciones devuelven.
 */

export interface Fuente {
  id: string;
  nombre: string;
  /** Logo en `public/`. */
  logo: string;
  /**
   * Relleno del círculo detrás del logo. El isotipo UTN es blanco y sin esto
   * desaparece en tema claro; el de Drive es transparente y necesita piso.
   */
  fondo?: string;
  /**
   * `true` = el logo entra completo y centrado (marcas con aire propio, como
   * Drive). Por defecto las fotos de perfil llenan el círculo recortadas.
   */
  contain?: boolean;
}

export const CELESTE = "#1CA4DF";

export const FUENTES: readonly Fuente[] = [
  {
    id: "gradienteutn",
    nombre: "Gradiente UTN",
    logo: "/novedades/fuentes/gradienteutn.jpg",
  },
  {
    id: "puebloyreforma",
    nombre: "Pueblo y Reforma",
    logo: "/novedades/fuentes/puebloyreforma.jpg",
  },
  {
    id: "utnfrro",
    nombre: "Sitio UTN FRRO",
    logo: "/utn-isotipo-white.png",
    fondo: CELESTE,
  },
  {
    id: "sauutnrosario",
    nombre: "SAU UTN Rosario",
    logo: "/novedades/fuentes/sauutnrosario.jpg",
  },
  {
    id: "utnalumnosfrro",
    nombre: "UTN Alumnos FRRO IG",
    logo: "/novedades/fuentes/utnalumnosfrro.jpg",
  },
  {
    // El material de estudio se sirve desde una carpeta de Drive: es una
    // fuente mas del hub, aunque no publique novedades.
    id: "drive",
    nombre: "Material en Drive",
    logo: "/novedades/fuentes/google-drive.svg",
    fondo: "#ffffff",
    contain: true,
  },
];

// ── Medidas ─────────────────────────────────────────────────────────────────

/** Radio de los nodos de origen. */
export const R = 26;
/** Columna donde se alinean las fuentes. */
export const NODO_X = 190;
/** Separación vertical: con r=26 deja 28px de aire entre círculo y círculo. */
export const SEPARACION = 80;
export const PRIMERA_Y = 40;
/** Aire debajo del último nodo. */
const MARGEN_INFERIOR = 40;

const N = FUENTES.length;
const ULTIMA_Y = PRIMERA_Y + (N - 1) * SEPARACION;

/**
 * El alto sale de la cantidad de fuentes, no escrito a mano: sumar una fuente
 * es agregar una línea a `FUENTES` y todo se reacomoda.
 */
export const VB_ANCHO = 640;
export const VB_ALTO = ULTIMA_Y + MARGEN_INFERIOR;

/** Nodo de llegada, centrado contra la columna de fuentes. */
export const DESTINO = {
  x: 500,
  y: (PRIMERA_Y + ULTIMA_Y) / 2,
  lado: 88,
} as const;

export const yDe = (i: number) => PRIMERA_Y + i * SEPARACION;

export interface Punto {
  x: number;
  y: number;
}

/** Hasta dónde llega la influencia del cursor, en unidades del viewBox. */
export const RADIO_INFLUENCIA = 260;
/** Tope del desvío, para que la curva no se dé vuelta sobre sí misma. */
export const DESVIO_MAX = 70;

/** Extremos fijos de la curva `i`: no los mueve el cursor. */
export function extremosDe(i: number): { inicio: Punto; fin: Punto } {
  const y = yDe(i);
  return {
    inicio: { x: NODO_X + R, y },
    // El final abre apenas en abanico para que no entren todas por el mismo
    // punto exacto y se pisen.
    fin: {
      x: DESTINO.x - DESTINO.lado / 2,
      y: DESTINO.y + (y - DESTINO.y) * 0.05,
    },
  };
}

/**
 * Curva de la fuente `i`, opcionalmente doblada hacia el cursor.
 *
 * Solo se mueven los puntos de control: los extremos quedan clavados al nodo
 * de origen y al de llegada, así se puede empujar sin que el grafo se
 * desarme.
 */
export function curvaDe(i: number, cursor: Punto | null): string {
  const y = yDe(i);
  const { inicio, fin } = extremosDe(i);

  const c1: Punto = { x: NODO_X + R + 110, y };
  const c2: Punto = { x: DESTINO.x - 114, y: y + (DESTINO.y - y) * 0.5 };

  if (cursor) {
    const medio = { x: (c1.x + c2.x) / 2, y: (c1.y + c2.y) / 2 };
    const dx = cursor.x - medio.x;
    const dy = cursor.y - medio.y;
    const dist = Math.hypot(dx, dy);

    if (dist < RADIO_INFLUENCIA) {
      // Caída cuadrática: cerca empuja fuerte, lejos se apaga suave.
      const caida = 1 - dist / RADIO_INFLUENCIA;
      const fuerza = caida * caida;
      const limitar = (v: number) =>
        Math.max(-DESVIO_MAX, Math.min(DESVIO_MAX, v));
      const despX = limitar(dx * fuerza);
      const despY = limitar(dy * fuerza);

      // c1 se mueve menos: la curva sale del nodo con su ángulo y recién
      // después se deja llevar.
      c1.x += despX * 0.55;
      c1.y += despY * 0.55;
      c2.x += despX;
      c2.y += despY;
    }
  }

  const n = (v: number) => v.toFixed(1);
  return `M ${inicio.x} ${inicio.y} C ${n(c1.x)} ${n(c1.y)}, ${n(c2.x)} ${n(c2.y)}, ${fin.x} ${n(fin.y)}`;
}
