/**
 * Elección de la imagen de preview (`og:image`) de una novedad.
 *
 * Las reglas no son nuestras, son las que documenta Meta para el crawler de
 * WhatsApp (developers.facebook.com → WhatsApp → Link Previews):
 *
 * - menos de **600 KB**;
 * - al menos **300 px** de ancho;
 * - relación de aspecto de 4:1 o menos;
 * - `og:title`, `og:description`, `og:url` y `og:image` en el `<head>`, y ese
 *   `<head>` dentro de los primeros 300 KB del HTML.
 *
 * Lo importante del límite de peso es **cómo falla**: WhatsApp no avisa ni
 * muestra una imagen rota, simplemente arma la preview sin imagen. Un flyer de
 * 2 MB alcanzaría para que la tarjeta salga pelada, y nunca nos enteraríamos.
 *
 * Por eso acá se verifica antes de prometerla, y si no da, se cae a la tarjeta
 * de marca de `app/opengraph-image.tsx` (35 KB, siempre disponible): el
 * fallback de una imagen dudosa es una preview con marca, no una preview sin
 * imagen.
 *
 * Y se la apunta **explícitamente**. Parece que alcanzaría con no declarar
 * ninguna imagen y dejar que la ruta herede la del layout raíz, pero no: en
 * cuanto una ruta declara su propio bloque `openGraph`, Next deja de heredar
 * la imagen de arriba y el HTML sale sin `og:image` (probado sobre el HTML
 * renderizado, no deducido del doc).
 *
 * Por qué no generamos una tarjeta por novedad con `ImageResponse`, que sería
 * lo vistoso: `ImageResponse` solo emite PNG, y un PNG de 1200x630 con una foto
 * adentro pesa más de 1 MB — o sea, justo lo que WhatsApp descarta. El flyer
 * original ya viene en JPEG/WebP comprimido y por debajo del límite, y además
 * es lo que la gente quiere ver cuando le comparten una novedad.
 */
import { statSync } from "node:fs";
import { join } from "node:path";

import { SITIO_URL } from "./site";

/** Tope de Meta. Por encima de esto la preview se queda sin imagen, sin aviso. */
const PESO_MAX_BYTES = 600_000;

/** Formatos que WhatsApp rasteriza. SVG y GIF no los toma. */
const FORMATOS = ["image/jpeg", "image/png", "image/webp"];

/** Más que esto y la metadata tarda por una imagen que igual es opcional. */
const TIMEOUT_MS = 3_000;

/** La tarjeta de marca de `app/opengraph-image.tsx`, servida por Next. */
export const TARJETA_MARCA = `${SITIO_URL}/opengraph-image`;

/**
 * URL absoluta a usar como `og:image`. Siempre devuelve algo.
 *
 * `imagenUrl` llega en dos formas: una ruta relativa
 * (`/novedades/placeholder/x.jpg`, un archivo nuestro de `public/`) o una URL
 * absoluta del bucket S3 de novedades (la copia propia del flyer). Las nuestras
 * las medimos en disco; las del bucket, con un HEAD.
 */
export async function imagenParaPreview(
  imagenUrl: string | null | undefined,
): Promise<string> {
  if (!imagenUrl) return TARJETA_MARCA;

  if (imagenUrl.startsWith("/")) {
    return pesoDeArchivoPublico(imagenUrl) <= PESO_MAX_BYTES
      ? `${SITIO_URL}${imagenUrl}`
      : TARJETA_MARCA;
  }

  // WhatsApp pide HTTPS para la imagen; un http:// no lo va a ir a buscar.
  if (!imagenUrl.startsWith("https://")) return TARJETA_MARCA;

  return (await sirveComoPreview(imagenUrl)) ? imagenUrl : TARJETA_MARCA;
}

/** Bytes del archivo en `public/`, o `Infinity` si no está (así se descarta). */
function pesoDeArchivoPublico(ruta: string): number {
  try {
    return statSync(join(process.cwd(), "public", ruta.slice(1))).size;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

/**
 * HEAD contra la imagen remota para ver si entra en las reglas de Meta.
 *
 * Cualquier error (timeout, 404 de un objeto borrado del bucket, red caída) es
 * un "no": la preview no puede depender de que un tercero conteste rápido.
 * Si el servidor no manda `content-length` no hay con qué medir, y ahí se deja
 * pasar — es mejor intentar que descartar una imagen que probablemente sirva.
 */
async function sirveComoPreview(url: string): Promise<boolean> {
  try {
    const resp = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!resp.ok) return false;

    const tipo = resp.headers.get("content-type")?.split(";")[0]?.trim();
    if (!tipo || !FORMATOS.includes(tipo)) return false;

    const largo = resp.headers.get("content-length");
    if (largo === null) return true;
    return Number(largo) <= PESO_MAX_BYTES;
  } catch {
    return false;
  }
}
