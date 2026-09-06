"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarOff, ChevronLeft, ChevronRight, Pencil } from "lucide-react";

import type { DiaCursada, SemanaCursada } from "@/lib/types";
import { cn } from "@/lib/utils";
import { EditorDia } from "./EditorDia";
import { CompartirSemana } from "./CompartirSemana";

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];
const DIAS_CORTOS = ["Lun", "Mar", "Mié", "Jue", "Vie"];

/** "2026-09-07" → Date local. Sin esto, `new Date(iso)` corre un día por UTC. */
function aFecha(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

function sumarDias(iso: string, n: number): string {
  const d = aFecha(iso);
  d.setDate(d.getDate() + n);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** "7 – 11 de septiembre" · cruzando mes: "28 de septiembre – 2 de octubre". */
function rotulo(lunes: string): string {
  const ini = aFecha(lunes);
  const fin = aFecha(sumarDias(lunes, 4));
  const mes = (d: Date) => d.toLocaleDateString("es-AR", { month: "long" });
  if (ini.getMonth() === fin.getMonth()) {
    return `${ini.getDate()} – ${fin.getDate()} de ${mes(fin)}`;
  }
  return `${ini.getDate()} de ${mes(ini)} – ${fin.getDate()} de ${mes(fin)}`;
}

/**
 * Cómo se llama la semana que estás mirando, relativo a hoy.
 *
 * El fin de semana el panel abre en la semana que arranca el lunes, así que
 * "Esta semana" ahí seria mentira: un sábado, la semana del lunes siguiente es
 * "La semana que viene".
 */
function encabezado(lunes: string, hoy: string): string {
  const dias = Math.round(
    (aFecha(lunes).getTime() - aFecha(sumarDias(hoy, -((aFecha(hoy).getDay() + 6) % 7))).getTime()) /
      86_400_000,
  );
  if (dias === 0) return "Esta semana";
  if (dias === 7) return "La semana que viene";
  if (dias === -7) return "La semana pasada";
  return "Semana del";
}

export function PanelSemanal({
  inicial,
  esAdmin = false,
}: {
  inicial: SemanaCursada;
  /** El admin puede fijar a mano el estado de cada día (un paro, una asamblea). */
  esAdmin?: boolean;
}) {
  const [semana, setSemana] = useState(inicial);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(false);
  const [editando, setEditando] = useState<DiaCursada | null>(null);
  // "Hoy" lo dice el backend (hora de Rosario), no el reloj del visitante.
  const hoy = semana.hoy;

  const irA = useCallback(async (lunes: string) => {
    setCargando(true);
    setError(false);
    try {
      const res = await fetch(`/api/semana?lunes=${lunes}`);
      if (!res.ok) throw new Error(String(res.status));
      setSemana((await res.json()) as SemanaCursada);
    } catch {
      setError(true);
    } finally {
      setCargando(false);
    }
  }, []);

  const recargar = useCallback(() => {
    setEditando(null);
    void irA(semana.lunes);
  }, [irA, semana.lunes]);

  const esSemanaActual = semana.lunes === inicial.lunes;
  const sinCursada = semana.dias.filter((d) => !d.se_cursa).length;

  return (
    <section aria-labelledby="semana-titulo">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-label text-[11px] uppercase tracking-[0.18em] text-[var(--shell-fg-dim)]">
            {encabezado(semana.lunes, hoy)}
          </p>
          <h2
            id="semana-titulo"
            className="mt-1.5 font-headline text-2xl font-bold tracking-tight text-[var(--shell-fg)]"
          >
            {rotulo(semana.lunes)}
          </h2>
          <p className="mt-1.5 text-sm text-[var(--shell-fg-muted)]">
            {sinCursada === 0
              ? "Se cursa normal los cinco días."
              : sinCursada === 1
                ? "Hay un día sin cursada."
                : `Hay ${sinCursada} días sin cursada.`}
          </p>
        </div>

        <div className="flex items-center gap-1">
          <CompartirSemana lunes={semana.lunes} dias={semana.dias} />
          <button
            onClick={() => irA(sumarDias(semana.lunes, -7))}
            disabled={cargando}
            aria-label="Semana anterior"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--shell-border)] text-[var(--shell-fg-muted)] transition-colors hover:bg-[var(--shell-hover)] hover:text-[var(--shell-fg)] disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={2} />
          </button>
          {!esSemanaActual && (
            <button
              onClick={() => irA(inicial.lunes)}
              disabled={cargando}
              className="rounded-lg border border-[var(--shell-border)] px-2.5 py-1.5 font-label text-xs font-semibold text-[var(--shell-fg-muted)] transition-colors hover:bg-[var(--shell-hover)] hover:text-[var(--shell-fg)] disabled:opacity-40"
            >
              Volver
            </button>
          )}
          <button
            onClick={() => irA(sumarDias(semana.lunes, 7))}
            disabled={cargando}
            aria-label="Semana siguiente"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--shell-border)] text-[var(--shell-fg-muted)] transition-colors hover:bg-[var(--shell-hover)] hover:text-[var(--shell-fg)] disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
      </div>

      {error && (
        <p className="mb-3 rounded-lg border border-[var(--cal-alerta-bd)] bg-[var(--cal-alerta-bg)] px-3 py-2 text-sm text-[var(--cal-alerta-fg)]">
          No pude traer esa semana. Probá de nuevo.
        </p>
      )}

      <div
        className={cn(
          "grid grid-cols-2 gap-2.5 transition-opacity duration-150 sm:grid-cols-3 md:grid-cols-5",
          cargando && "opacity-50",
        )}
        aria-busy={cargando}
      >
        {semana.dias.map((dia, i) => {
          const esHoy = dia.fecha === hoy;
          const propios = dia.eventos.filter((e) => e.origen === "usuario");

          return (
            <article
              key={dia.fecha}
              className={cn(
                "flex min-h-[132px] flex-col rounded-xl border p-3.5",
                dia.se_cursa
                  ? "border-[var(--shell-border)] bg-[var(--shell-panel)]"
                  : "border-[var(--cal-alerta-bd)] bg-[var(--cal-alerta-bg)]",
                esHoy && "ring-1 ring-[#1CA4DF]",
              )}
            >
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-headline text-sm font-bold text-[var(--shell-fg)]">
                  <span className="sm:hidden">{DIAS_CORTOS[i]}</span>
                  <span className="hidden sm:inline">{DIAS[i]}</span>
                </h3>
                <span className="flex items-center gap-1">
                  {esAdmin && (
                    <button
                      onClick={() => setEditando(dia)}
                      aria-label={`Editar el estado del ${dia.fecha}`}
                      className="flex h-5 w-5 items-center justify-center rounded text-[var(--shell-fg-dim)] transition-colors hover:bg-[var(--shell-hover)] hover:text-[var(--shell-fg)]"
                    >
                      <Pencil className="h-3 w-3" strokeWidth={2} />
                    </button>
                  )}
                  <span
                    className={cn(
                      "font-label text-xs tabular-nums",
                      esHoy ? "font-bold text-[var(--shell-accent-fg)]" : "text-[var(--shell-fg-dim)]",
                    )}
                  >
                    {esHoy ? "Hoy" : aFecha(dia.fecha).getDate()}
                  </span>
                </span>
              </div>

              <div className="mt-3 flex-1">
                {dia.se_cursa ? (
                  <p className="text-[13px] font-medium text-[var(--shell-fg-muted)]">
                    Cursada normal
                  </p>
                ) : (
                  <>
                    <p className="inline-flex items-center gap-1.5 font-label text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--cal-alerta-fg)]">
                      <CalendarOff className="h-3 w-3" strokeWidth={2} />
                      Sin cursada
                    </p>
                    {dia.motivo && (
                      <p className="mt-1.5 text-[13px] font-medium leading-snug text-[var(--shell-fg)]">
                        {dia.motivo}
                      </p>
                    )}
                    {dia.detalle && (
                      <p className="mt-1 text-[11px] leading-snug text-[var(--shell-fg-muted)]">
                        {dia.detalle}
                      </p>
                    )}
                  </>
                )}

                {propios.length > 0 && (
                  <p className="mt-2 text-[11px] text-[var(--shell-accent-fg)]">
                    {propios.length === 1
                      ? propios[0].titulo
                      : `${propios.length} eventos tuyos`}
                  </p>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {editando && (
        <EditorDia
          dia={editando}
          onCerrar={() => setEditando(null)}
          onGuardado={recargar}
        />
      )}

      <div className="mt-4 flex justify-end">
        <Link
          href="/calendario"
          className="group inline-flex items-center gap-1 font-body text-sm font-medium text-[var(--shell-accent-fg)]"
        >
          Ver el calendario completo
          <ArrowRight
            className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
            strokeWidth={2}
          />
        </Link>
      </div>
    </section>
  );
}
