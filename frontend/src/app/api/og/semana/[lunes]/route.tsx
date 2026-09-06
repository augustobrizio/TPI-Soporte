import { ImageResponse } from "next/og";

import { SITIO_URL } from "@/lib/site";
import type { SemanaCursada } from "@/lib/types";

/**
 * Tarjeta de preview de la semana.
 *
 * Es un route handler y no el `opengraph-image.tsx` de la convención por una
 * sola razón, medida: `ImageResponse` responde en chunks y **sin
 * `Content-Length`**. La app de WhatsApp lo tolera, pero el cliente de
 * escritorio cae al thumbnail chico — compartiendo el mismo link, desde el
 * celular salía la tarjeta grande y desde la compu no. Acá se materializa el
 * PNG y se declara el largo, como hace S3 con los flyers de las novedades, que
 * se ven bien en los dos lados.
 *
 * Lo demás son restricciones de Meta (ver `agent_docs/compartir_previews.md`):
 * cuadrada porque WhatsApp arma la tarjeta grande con imágenes cercanas al
 * cuadrado, y PNG chico porque el límite son 600 KB.
 */
export const runtime = "nodejs";

const LADO = 1080;
const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];
const CELESTE = "#1CA4DF";
const AMBAR = "#f0c454";
const FONDO = "#09090b";
const PANEL = "#141417";

/** Sólo `YYYY-MM-DD`: lo que llega por la URL no se reenvía sin mirar. */
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

async function traer(lunes: string): Promise<SemanaCursada | null> {
  const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  try {
    const res = await fetch(`${api}/calendario/semana?lunes=${lunes}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as SemanaCursada;
  } catch {
    return null;
  }
}

function rotulo(lunes: string): string {
  const ini = new Date(`${lunes}T00:00:00`);
  const fin = new Date(ini);
  fin.setDate(fin.getDate() + 4);
  const mes = (d: Date) => d.toLocaleDateString("es-AR", { month: "long" });
  return ini.getMonth() === fin.getMonth()
    ? `${ini.getDate()} al ${fin.getDate()} de ${mes(fin)}`
    : `${ini.getDate()} de ${mes(ini)} al ${fin.getDate()} de ${mes(fin)}`;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ lunes: string }> },
) {
  const { lunes } = await params;
  if (!FECHA.test(lunes)) {
    return new Response("Fecha invalida", { status: 400 });
  }

  const semana = await traer(lunes);
  const dias = semana?.dias ?? [];
  const sinCursada = dias.filter((d) => !d.se_cursa).length;

  // Satori exige `display: flex` explícito en todo div con más de un hijo, y
  // cuenta los nodos de texto: sin eso la generación entera falla en runtime.
  const imagen = new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: FONDO,
          padding: "60px 56px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: CELESTE, display: "flex" }} />
          <div style={{ display: "flex", color: "#fafafa", fontSize: 28, fontWeight: 800 }}>
            UTNHub
          </div>
          <div style={{ display: "flex", color: "#71717a", fontSize: 22 }}>· ISI · UTN FRRO</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 30 }}>
          <div
            style={{
              display: "flex",
              color: "#fafafa",
              fontSize: 52,
              fontWeight: 800,
              lineHeight: 1.1,
              letterSpacing: -1,
            }}
          >
            {semana ? `Semana del ${rotulo(semana.lunes)}` : "La semana en la facultad"}
          </div>
          <div style={{ display: "flex", color: "#a1a1aa", fontSize: 28, lineHeight: 1.2 }}>
            {sinCursada === 0
              ? "Se cursa normal los cinco días"
              : sinCursada === 1
                ? "Hay un día sin cursada"
                : `Hay ${sinCursada} días sin cursada`}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 40 }}>
          {dias.map((dia, i) => (
            <div
              key={dia.fecha}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 24,
                borderRadius: 18,
                padding: "26px 28px",
                background: dia.se_cursa ? PANEL : "rgba(240,196,84,0.12)",
                border: `2px solid ${dia.se_cursa ? "#27272a" : "rgba(240,196,84,0.35)"}`,
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", width: 150 }}>
                <div style={{ display: "flex", color: "#fafafa", fontSize: 34, fontWeight: 700 }}>
                  {DIAS[i]}
                </div>
                <div style={{ display: "flex", color: "#71717a", fontSize: 26, marginTop: 4 }}>
                  {new Date(`${dia.fecha}T00:00:00`).getDate()}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                <div
                  style={{
                    display: "flex",
                    color: dia.se_cursa ? "#a1a1aa" : AMBAR,
                    fontSize: 28,
                    fontWeight: dia.se_cursa ? 400 : 700,
                  }}
                >
                  {dia.se_cursa ? "Cursada normal" : "SIN CURSADA"}
                </div>
                {!dia.se_cursa && dia.motivo && (
                  <div style={{ display: "flex", marginTop: 6, color: "#fafafa", fontSize: 30, lineHeight: 1.2 }}>
                    {dia.motivo}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", marginTop: "auto", paddingTop: 24, color: "#52525b", fontSize: 22 }}>
          {SITIO_URL.replace(/^https?:\/\//, "")}
        </div>
      </div>
    ),
    { width: LADO, height: LADO },
  );

  // El punto de todo esto: materializar el PNG para poder declarar el largo.
  const png = await imagen.arrayBuffer();
  return new Response(png, {
    headers: {
      "Content-Type": "image/png",
      "Content-Length": String(png.byteLength),
      // Una semana cambia poco y el crawler la pide varias veces.
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
