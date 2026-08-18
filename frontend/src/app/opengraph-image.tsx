import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ImageResponse } from "next/og";

import { svgMarca } from "@/lib/marca";

/**
 * Imagen que se ve al compartir el link (WhatsApp, Discord, Twitter, Slack).
 *
 * Next la genera en tiempo de build y la sirve en `/opengraph-image`, y arma
 * sola las meta `og:image` — por eso no hace falta declararla en el `metadata`
 * del layout.
 *
 * El símbolo se lee del disco y viaja como data URI: acá no hay servidor que
 * resuelva `/utn-simbolo-white.png`, la imagen se renderiza fuera del ciclo de
 * request.
 */

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "UTNHub — Todo lo de la facultad, en un solo lugar";

// Los mismos tokens que usa la app en tema oscuro, para que el preview y el
// sitio no parezcan dos productos distintos.
const FONDO = "#09090b";
const TEXTO = "#fafafa";
const TENUE = "#a3a3a3";

/**
 * Ancho de la marca (con trazos) dentro de la tarjeta.
 *
 * La tarjeta es casi pura marca, y eso es a proposito. WhatsApp no muestra la
 * imagen grande: la reduce a una miniatura de ~100px al lado del titulo. Ahi
 * cualquier texto dentro de la imagen queda ilegible —se ve "pixelado"— y
 * ademas es redundante, porque WhatsApp YA muestra el titulo y la descripcion
 * como texto propio. Un logo grande sobrevive a esa reduccion; una frase no.
 */
// El alto tiene que cerrar: 630 - 2*48 de padding = 534 disponibles, y el
// bloque de texto se lleva ~120. La marca es 96/128 de su ancho, asi que 480
// da 360 de alto y el total queda en 480. Con 620 se pasaba y satori, que no
// recorta ni scrollea, encimaba los renglones.
const MARCA_ANCHO = 480;

export default async function Image() {
  const simbolo = readFileSync(
    join(process.cwd(), "public", "utn-simbolo-white.png"),
  ).toString("base64");

  // Sin el simbolo adentro: satori rasteriza el SVG con resvg y NO dibuja una
  // <image> anidada dentro de un SVG que llega como data URI — quedaba el
  // cuadrado celeste vacio. Asi que el SVG trae solo trazos y cuadrado, y el
  // simbolo se superpone como una capa aparte.
  const marca = svgMarca({ simbolo: "", conLineas: true, ancho: 128 });

  // Geometria del overlay, derivada del viewBox para no quedar a ojo.
  const escala = MARCA_ANCHO / 128;
  const cuadradoLado = 64 * escala;
  const simboloAlto = cuadradoLado * 0.62;
  const simboloAncho = simboloAlto * (70 / 80); // el PNG recortado es 70x80

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: FONDO,
          padding: 48,
        }}
      >
        <div
          style={{
            display: "flex",
            position: "relative",
            width: MARCA_ANCHO,
            height: (MARCA_ANCHO * 96) / 128,
            marginLeft: -28,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`data:image/svg+xml;base64,${Buffer.from(marca).toString("base64")}`}
            width={MARCA_ANCHO}
            height={(MARCA_ANCHO * 96) / 128}
            alt=""
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`data:image/png;base64,${simbolo}`}
            width={simboloAncho}
            height={simboloAlto}
            alt=""
            style={{
              position: "absolute",
              left: 64 * escala + (cuadradoLado - simboloAncho) / 2,
              top: 16 * escala + (cuadradoLado - simboloAlto) / 2,
            }}
          />
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 76,
            fontWeight: 700,
            color: TEXTO,
            letterSpacing: -2,
            marginTop: 4,
          }}
        >
          UTNHub
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 28,
            color: TENUE,
            marginTop: 12,
            letterSpacing: 2,
          }}
        >
          ISI · UTN FRRO
        </div>

      </div>
    ),
    size,
  );
}
