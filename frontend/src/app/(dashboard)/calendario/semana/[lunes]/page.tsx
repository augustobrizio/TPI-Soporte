import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PanelSemanal } from "@/features/panel-semanal/PanelSemanal";
import { getSemanaCursada } from "@/lib/api";
import { getUsuarioActual } from "@/lib/auth";
import { urlSemana } from "@/lib/site";
import type { SemanaCursada } from "@/lib/types";

/** Sólo `YYYY-MM-DD`: lo que llega por la URL no se reenvía sin mirar. */
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];

async function traer(lunes: string): Promise<SemanaCursada | null> {
  if (!FECHA.test(lunes)) return null;
  try {
    return await getSemanaCursada(lunes);
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

/**
 * Resumen en una línea, que es lo que se lee en la tarjeta del link.
 *
 * Dice los días sin cursada con su motivo, porque es la única pregunta que la
 * gente le hace a esto. "Se cursa normal" también es información: evita tener
 * que abrir el link para confirmar que no pasa nada.
 */
function resumen(semana: SemanaCursada): string {
  const sin = semana.dias
    .map((d, i) => ({ d, nombre: DIAS[i] }))
    .filter(({ d }) => !d.se_cursa);
  if (sin.length === 0) return "Se cursa normal los cinco días.";
  return sin
    .map(({ d, nombre }) => `${nombre}: sin cursada${d.motivo ? ` (${d.motivo})` : ""}`)
    .join(" · ");
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lunes: string }>;
}): Promise<Metadata> {
  const { lunes } = await params;
  const semana = await traer(lunes);
  if (semana === null) return { title: "Semana" };

  const titulo = `Semana del ${rotulo(semana.lunes)}`;
  const url = urlSemana(semana.lunes);

  return {
    title: titulo,
    description: resumen(semana),
    // La imagen no se declara acá: la genera `opengraph-image.tsx` de esta
    // misma carpeta y Next la enlaza solo, con su tamaño y su content-type.
    openGraph: {
      title: `${titulo} · UTNHub`,
      description: resumen(semana),
      url,
      type: "article",
    },
    twitter: { card: "summary_large_image" },
    alternates: { canonical: url },
  };
}

export default async function SemanaCompartidaPage({
  params,
}: {
  params: Promise<{ lunes: string }>;
}) {
  const { lunes } = await params;
  const [semana, usuario] = await Promise.all([traer(lunes), getUsuarioActual()]);
  if (semana === null) notFound();

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-14 md:px-10 md:py-20">
      <PanelSemanal
        inicial={semana}
        esAdmin={(usuario?.rol ?? "").toLowerCase() === "admin"}
      />
    </div>
  );
}
