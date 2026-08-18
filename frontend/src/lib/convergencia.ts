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
    // SysAcad es de donde sale la vida academica del alumno (examenes, notas,
    // inscripciones). Es fuente del hub aunque no publique novedades, igual
    // que Drive; por eso ninguna de las dos aparece en la seccion Novedades.
    id: "sysacad",
    nombre: "SysAcad",
    logo: "/novedades/fuentes/sysacad.png",
    fondo: "#ffffff",
    contain: true,
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
export const NODO_X = 210;
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

/** Cuánto corrió el usuario un nodo respecto de su lugar original. */
export interface Corrimiento {
  dx: number;
  dy: number;
}

/**
 * Margen para que un nodo no se escape del dibujo.
 *
 * Ajustado para que la deriva del primer y del ultimo nodo no choque contra el
 * tope: con un margen grande, el vaiven de arriba quedaba aplastado contra el
 * limite y ese nodo se movia menos que el resto.
 */
const BORDE = R + 2;

/** Centro del nodo `i`, ya con el arrastre aplicado y acotado al viewBox. */
export function centroDe(i: number, corr?: Corrimiento): Punto {
  const x = NODO_X + (corr?.dx ?? 0);
  const y = yDe(i) + (corr?.dy ?? 0);
  return {
    // El tope de la derecha deja libre el nodo de llegada: si se pudiera
    // soltar una fuente encima del hub, la curva quedaría de largo cero.
    x: Math.max(BORDE, Math.min(DESTINO.x - DESTINO.lado / 2 - 40, x)),
    y: Math.max(BORDE, Math.min(VB_ALTO - BORDE, y)),
  };
}

export interface Punto {
  x: number;
  y: number;
}

/** Hasta dónde llega la influencia del cursor, en unidades del viewBox. */
export const RADIO_INFLUENCIA = 260;
/** Tope del desvío, para que la curva no se dé vuelta sobre sí misma. */
export const DESVIO_MAX = 70;

/**
 * Extremos de la curva `i`.
 *
 * El inicio sale del BORDE del círculo mirando al nodo de llegada, no de un
 * punto fijo: como la fuente se puede arrastrar a cualquier lado, un inicio
 * fijo a la derecha dejaría la línea saliendo del aire cuando el nodo está
 * por encima o por debajo del hub.
 */
export function extremosDe(i: number, corr?: Corrimiento): {
  inicio: Punto;
  fin: Punto;
} {
  const centro = centroDe(i, corr);
  const fin: Punto = {
    x: DESTINO.x - DESTINO.lado / 2,
    // Abre apenas en abanico para que no entren todas por el mismo punto.
    y: DESTINO.y + (yDe(i) - DESTINO.y) * 0.05,
  };
  const ang = Math.atan2(fin.y - centro.y, fin.x - centro.x);
  return {
    inicio: { x: centro.x + Math.cos(ang) * R, y: centro.y + Math.sin(ang) * R },
    fin,
  };
}

/**
 * Curva de la fuente `i`, opcionalmente doblada hacia el cursor.
 *
 * Solo se mueven los puntos de control: los extremos quedan clavados al nodo
 * de origen y al de llegada, así se puede empujar sin que el grafo se
 * desarme.
 */
export function curvaDe(
  i: number,
  cursor: Punto | null,
  corr?: Corrimiento,
): string {
  const { inicio, fin } = extremosDe(i, corr);

  // Los controles se reparten sobre el tramo real inicio→fin, así la curva
  // sigue teniendo la misma panza aunque el nodo se haya movido.
  const tramo = fin.x - inicio.x;
  const c1: Punto = { x: inicio.x + tramo * 0.45, y: inicio.y };
  const c2: Punto = {
    x: fin.x - tramo * 0.3,
    y: inicio.y + (fin.y - inicio.y) * 0.5,
  };

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
  return `M ${n(inicio.x)} ${n(inicio.y)} C ${n(c1.x)} ${n(c1.y)}, ${n(c2.x)} ${n(c2.y)}, ${n(fin.x)} ${n(fin.y)}`;
}

/**
 * Deriva: el vaivén lento que hace que un nodo nunca quede del todo quieto.
 *
 * Dos senos de período distinto y desfasados por índice. Si todos compartieran
 * frecuencia se moverían en bloque, como una fila haciendo la ola, y se notaría
 * el truco; con períodos primos entre sí el conjunto no se repite a la vista.
 *
 * Es chico a propósito (unos pocos px del viewBox): tiene que leerse como que
 * el grafo respira, no como que se desarma.
 */
export function derivaDe(i: number, t: number): Corrimiento {
  const fase = i * 1.7;
  return {
    dx: Math.sin(t / 3100 + fase) * 5,
    dy: Math.cos(t / 2600 + fase * 1.3) * 6,
  };
}

/** Suma del arrastre del usuario y la deriva. */
export function corrimientoTotal(
  arrastrado: Corrimiento | undefined,
  deriva: Corrimiento | null,
): Corrimiento | undefined {
  if (!deriva) return arrastrado;
  return {
    dx: (arrastrado?.dx ?? 0) + deriva.dx,
    dy: (arrastrado?.dy ?? 0) + deriva.dy,
  };
}
