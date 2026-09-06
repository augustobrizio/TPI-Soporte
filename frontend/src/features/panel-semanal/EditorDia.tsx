"use client";

import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";

import { borrarEstadoDia, definirEstadoDia } from "@/lib/api";
import type { DiaCursada } from "@/lib/types";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/** Motivos que se repiten. Son atajos, el campo sigue siendo libre. */
const SUGERENCIAS = ["Paro", "Asamblea", "Jornada", "Feriado", "Receso"];

function fechaLarga(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  const t = d.toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * Edición manual del estado de un día, para admin.
 *
 * Existe porque el calendario no se entera de lo que la facultad no publica
 * como evento: un paro, una asamblea. Y al revés, deja corregir un día que la
 * ingesta dio por caído sin tener que tocar la ingesta.
 */
export function EditorDia({
  dia,
  onCerrar,
  onGuardado,
}: {
  dia: DiaCursada;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const [seCursa, setSeCursa] = useState(dia.se_cursa);
  const [motivo, setMotivo] = useState(dia.intervenido_por ? dia.motivo ?? "" : "");
  const [detalle, setDetalle] = useState(dia.detalle ?? "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tieneOverride = dia.intervenido_por !== null;

  async function guardar() {
    setGuardando(true);
    setError(null);
    try {
      await definirEstadoDia(dia.fecha, {
        se_cursa: seCursa,
        motivo: motivo.trim() || null,
        detalle: detalle.trim() || null,
      });
      onGuardado();
    } catch {
      setError("No se pudo guardar. Probá de nuevo.");
      setGuardando(false);
    }
  }

  async function quitar() {
    setGuardando(true);
    setError(null);
    try {
      await borrarEstadoDia(dia.fecha);
      onGuardado();
    } catch {
      setError("No se pudo quitar. Probá de nuevo.");
      setGuardando(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onCerrar(); }}>
      <DialogContent className="max-w-md p-0">
        <div className="border-b border-[var(--shell-border)] px-5 py-4">
          <DialogTitle className="text-[15px] font-bold">
            {fechaLarga(dia.fecha)}
          </DialogTitle>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSeCursa(true)}
              aria-pressed={seCursa}
              className={cn(
                "flex-1 rounded-lg border py-2 font-label text-xs font-semibold transition-colors",
                seCursa
                  ? "border-[#1CA4DF]/25 bg-[#1CA4DF]/10 text-[var(--shell-accent-fg)]"
                  : "border-[var(--shell-border)] text-[var(--shell-fg-dim)] hover:text-[var(--shell-fg-muted)]",
              )}
            >
              Se cursa
            </button>
            <button
              type="button"
              onClick={() => setSeCursa(false)}
              aria-pressed={!seCursa}
              className={cn(
                "flex-1 rounded-lg border py-2 font-label text-xs font-semibold transition-colors",
                !seCursa
                  ? "border-[var(--cal-alerta-bd)] bg-[var(--cal-alerta-bg)] text-[var(--cal-alerta-fg)]"
                  : "border-[var(--shell-border)] text-[var(--shell-fg-dim)] hover:text-[var(--shell-fg-muted)]",
              )}
            >
              Sin cursada
            </button>
          </div>

          {!seCursa && (
            <label className="block">
              <span className="mb-1.5 block font-label text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--shell-fg-dim)]">
                Motivo
              </span>
              <input
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Paro"
                maxLength={80}
                className="w-full rounded-lg border border-[var(--shell-border)] bg-[var(--shell-canvas)] px-3 py-2 text-sm text-[var(--shell-fg)] outline-none placeholder:text-[var(--shell-fg-dim)]"
              />
              <span className="mt-2 flex flex-wrap gap-1.5">
                {SUGERENCIAS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setMotivo(s)}
                    className="rounded-full border border-[var(--shell-border)] px-2.5 py-0.5 font-label text-[11px] text-[var(--shell-fg-muted)] transition-colors hover:bg-[var(--shell-hover)]"
                  >
                    {s}
                  </button>
                ))}
              </span>
            </label>
          )}

          <label className="block">
            <span className="mb-1.5 block font-label text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--shell-fg-dim)]">
              Detalle (opcional)
            </span>
            <textarea
              value={detalle}
              onChange={(e) => setDetalle(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="Paro de 24 h de la federación docente."
              className="w-full resize-none rounded-lg border border-[var(--shell-border)] bg-[var(--shell-canvas)] px-3 py-2 text-sm text-[var(--shell-fg)] outline-none placeholder:text-[var(--shell-fg-dim)]"
            />
          </label>

          {error && (
            <p className="rounded-lg border border-[#dc2626]/30 bg-[#dc2626]/10 px-3 py-2 text-xs text-[#dc2626] dark:text-[#f87171]">
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-[var(--shell-border)] px-5 py-3.5">
          {tieneOverride && (
            <button
              type="button"
              onClick={quitar}
              disabled={guardando}
              title="El día vuelve a lo que diga el calendario"
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 font-label text-xs font-semibold text-[#dc2626] transition-colors hover:bg-[#dc2626]/10 disabled:opacity-50 dark:text-[#f87171]"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
              Quitar
            </button>
          )}
          <div className="flex-1" />
          <button
            type="button"
            onClick={onCerrar}
            className="rounded-lg px-4 py-2 font-label text-xs font-semibold text-[var(--shell-fg-muted)] transition-colors hover:text-[var(--shell-fg)]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={guardar}
            disabled={guardando}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#1CA4DF] px-4 py-2 font-label text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />}
            Guardar
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
