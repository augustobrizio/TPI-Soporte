/**
 * Origen público de la app.
 *
 * Hace falta para todo lo que tiene que ser una URL **absoluta**: el
 * `metadataBase` de Next, las meta de Open Graph (`og:url`, `og:image`) y el
 * link que se comparte. Un crawler como el de WhatsApp no tiene forma de
 * resolver `/novedades/12`: lee el HTML fuera de contexto, sin la barra del
 * navegador.
 *
 * Reusa `APP_URL`, la misma variable que ya usa el callback de Google OAuth
 * (`lib/googleOAuth.ts`), en vez de sumar otra: es el mismo dato — dónde vive
 * la app de verdad. En dev queda vacía y cae al dominio de producción; no
 * molesta, porque una preview de localhost no la puede ver nadie igual.
 *
 * **Solo servidor.** `APP_URL` no es `NEXT_PUBLIC_*`, así que en el bundle del
 * browser vale `undefined` y esto devolvería siempre el fallback.
 */
export const SITIO_URL = (
  process.env.APP_URL?.trim() || "https://utnhub.up.railway.app"
).replace(/\/$/, "");

/** URL canónica y absoluta de una novedad: es la que se comparte. */
export function urlNovedad(id: number): string {
  return `${SITIO_URL}/novedades/${id}`;
}

/** URL canónica y absoluta de una semana del calendario. */
export function urlSemana(lunes: string): string {
  return `${SITIO_URL}/calendario/semana/${lunes}`;
}
