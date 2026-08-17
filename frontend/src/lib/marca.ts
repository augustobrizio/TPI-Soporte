/**
 * Geometría de la marca, en un solo lugar.
 *
 * La usan el componente `LogoUTNHub` (que dibuja JSX y apunta al PNG de
 * `public/`) y la imagen de preview de Open Graph (que necesita el mismo
 * dibujo pero como string de SVG, con el símbolo embebido). Si los trazos
 * vivieran duplicados en los dos, se irían separando con el primer retoque.
 */

export const CELESTE = "#1CA4DF";

/** Cuadrado de la marca dentro del viewBox extendido. */
export const CUADRADO = { x: 64, y: 16, lado: 64, radio: 15 } as const;

/** Trazos que entran por la izquierda y confluyen en el borde del cuadrado. */
export const LINEAS = [
  "M 8 8 C 32 8, 44 30, 62 45",
  "M 3 26 C 30 26, 46 38, 62 46.5",
  "M 1 48 L 62 48",
  "M 3 70 C 30 70, 46 58, 62 49.5",
  "M 8 88 C 32 88, 44 66, 62 51",
  "M 16 100 C 40 100, 50 72, 62 52",
] as const;

/** viewBox con lugar a la izquierda para los trazos. */
export const VIEWBOX_CON_LINEAS = "0 0 128 96";
/** viewBox recortado al cuadrado, para tamaños chicos. */
export const VIEWBOX_SOLO_MARCA = "64 16 64 64";

/**
 * La marca como string de SVG autocontenido.
 *
 * `simbolo` es un data URI del símbolo UTN: acá no sirve una ruta de
 * `public/`, porque este SVG se usa embebido (favicon) donde no hay servidor
 * que resuelva rutas relativas. Vacío devuelve solo trazos y cuadrado, para
 * quien necesite superponer el símbolo por su cuenta.
 */
export function svgMarca({
  simbolo,
  conLineas = true,
  ancho = 128,
}: {
  simbolo: string;
  conLineas?: boolean;
  ancho?: number;
}): string {
  const { x, y, lado, radio } = CUADRADO;
  const viewBox = conLineas ? VIEWBOX_CON_LINEAS : VIEWBOX_SOLO_MARCA;
  const alto = conLineas ? (ancho * 96) / 128 : ancho;

  const trazos = conLineas
    ? LINEAS.map(
        (d) =>
          `<path d="${d}" fill="none" stroke="${CELESTE}" stroke-width="3" stroke-linecap="round"/>`,
      ).join("")
    : "";

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${viewBox}" width="${ancho}" height="${alto}">`,
    trazos,
    `<rect x="${x}" y="${y}" width="${lado}" height="${lado}" rx="${radio}" fill="${CELESTE}"/>`,
    simbolo
      ? `<image x="${x + 12}" y="${y + 12}" width="40" height="40" preserveAspectRatio="xMidYMid meet" xlink:href="${simbolo}"/>`
      : "",
    `</svg>`,
  ].join("");
}
