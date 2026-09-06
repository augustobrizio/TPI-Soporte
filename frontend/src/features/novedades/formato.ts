/** Formateo compartido por la tarjeta y la página de una novedad. */

/** ISO -> "14 mar 2026". `null` si no hay fecha o no parsea. */
export function fechaCorta(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const mes = d.toLocaleDateString("es-AR", { month: "short" }).replace(".", "");
  return `${d.getDate()} ${mes} ${d.getFullYear()}`;
}

/**
 * Recorta a `max` caracteres sin cortar una palabra al medio.
 *
 * Lo usa la `og:description`: WhatsApp muestra una o dos líneas y corta solo,
 * pero corta por ancho de píxel, con lo cual una descripción larga entra al
 * HTML entera para nada. Meta recomienda ~80 caracteres para esa meta.
 */
export function recortar(texto: string, max: number): string {
  const limpio = texto.trim().replace(/\s+/g, " ");
  if (limpio.length <= max) return limpio;
  const corte = limpio.slice(0, max);
  const espacio = corte.lastIndexOf(" ");
  return `${(espacio > max * 0.6 ? corte.slice(0, espacio) : corte).trimEnd()}…`;
}
