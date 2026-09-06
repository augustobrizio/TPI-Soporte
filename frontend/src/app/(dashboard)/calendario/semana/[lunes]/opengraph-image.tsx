import { ImageResponse } from "next/og";

import { SITIO_URL } from "@/lib/site";
import type { SemanaCursada } from "@/lib/types";

export const alt = "La semana en la UTN FRRO, día por día";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie"];
const CELESTE = "#1CA4DF";
const AMBAR = "#f0c454";
const FONDO = "#09090b";
const PANEL = "#141417";

/**
 * Tarjeta de preview de la semana.
 *
 * `ImageResponse` sólo emite PNG, y por eso no se usa para las novedades: un
 * PNG de 1200x630 con una foto adentro se pasa del límite de 600 KB de
 * WhatsApp y la preview sale pelada (ver `agent_docs/compartir_previews.md`).
 * Acá sí conviene: son cinco cajas y texto, sin fotos, así que el PNG queda
 * chico y la tarjeta muestra de un vistazo lo único que importa — qué días no
 * se cursa.
 *
 * Se pide el dato sin credenciales a propósito: la tarjeta la arma el teléfono
 * de quien comparte, que no tiene la sesión de nadie. Sale el calendario de la
 * facultad, nunca los eventos propios de un alumno.
 */
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

export default async function Image({
  params,
}: {
  params: { lunes: string };
}) {
  const semana = await traer(params.lunes);
  const dias = semana?.dias ?? [];
  const sinCursada = dias.filter((d) => !d.se_cursa).length;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: FONDO,
          padding: "64px 56px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 8,
              background: CELESTE,
              display: "flex",
            }}
          />
          <div style={{ display: "flex", color: "#fafafa", fontSize: 28, fontWeight: 800 }}>
            UTNHub
          </div>
          <div style={{ display: "flex", color: "#71717a", fontSize: 22 }}>· ISI · UTN FRRO</div>
        </div>

        <div
          style={{
            display: "flex",
            color: "#fafafa",
            fontSize: 60,
            fontWeight: 800,
            marginTop: 28,
            letterSpacing: -1,
          }}
        >
          {semana ? `Semana del ${rotulo(semana.lunes)}` : "La semana en la facultad"}
        </div>

        <div style={{ display: "flex", color: "#a1a1aa", fontSize: 28, marginTop: 12 }}>
          {sinCursada === 0
            ? "Se cursa normal los cinco días"
            : sinCursada === 1
              ? "Hay un día sin cursada"
              : `Hay ${sinCursada} días sin cursada`}
        </div>

        <div style={{ display: "flex", gap: 16, marginTop: 44 }}>
          {dias.map((dia, i) => (
            <div
              key={dia.fecha}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                borderRadius: 16,
                padding: "22px 18px",
                minHeight: 210,
                background: dia.se_cursa ? PANEL : "rgba(240,196,84,0.12)",
                border: `2px solid ${dia.se_cursa ? "#27272a" : "rgba(240,196,84,0.35)"}`,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
                <div style={{ display: "flex", color: "#fafafa", fontSize: 26, fontWeight: 700 }}>
                  {DIAS[i]}
                </div>
                <div style={{ display: "flex", color: "#71717a", fontSize: 24 }}>
                  {new Date(`${dia.fecha}T00:00:00`).getDate()}
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  marginTop: 18,
                  color: dia.se_cursa ? "#a1a1aa" : AMBAR,
                  fontSize: 21,
                  fontWeight: dia.se_cursa ? 400 : 700,
                }}
              >
                {dia.se_cursa ? "Cursada normal" : "SIN CURSADA"}
              </div>

              {!dia.se_cursa && dia.motivo && (
                <div
                  style={{
                    display: "flex",
                    marginTop: 10,
                    color: "#fafafa",
                    fontSize: 22,
                    lineHeight: 1.25,
                  }}
                >
                  {dia.motivo}
                </div>
              )}
            </div>
          ))}
        </div>

        <div style={{ display: "flex", marginTop: "auto", color: "#52525b", fontSize: 20 }}>
          {SITIO_URL.replace(/^https?:\/\//, "")}
        </div>
      </div>
    ),
    size,
  );
}
