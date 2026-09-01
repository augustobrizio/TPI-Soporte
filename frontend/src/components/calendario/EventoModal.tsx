"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";

import type { EventoCalendarioCreate, EventoCalendarioOut, TipoEventoCalendario } from "@/lib/types";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { TIPO, rolDe } from "./utils";

/** Lo que el alumno puede agendar. Mesas y feriados los pone la facultad. */
const TIPOS_CREABLES: TipoEventoCalendario[] = ["examen", "trabajo_practico", "evento"];

function pad(n: number): string { return String(n).padStart(2, "0"); }
function toDateInput(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function toTimeInput(iso: string): string {
  const d = new Date(iso);
  return d.getHours() || d.getMinutes() ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : "";
}

interface Props {
  modo: "crear" | "editar";
  evento?: EventoCalendarioOut;
  fechaInicial?: string; // YYYY-MM-DD
  plantilla?: { titulo?: string; tipo?: TipoEventoCalendario };
  onSubmit: (p: EventoCalendarioCreate) => Promise<void>;
  onEliminar?: () => Promise<void>;
  onClose: () => void;
}

export function EventoModal({ modo, evento, fechaInicial, plantilla, onSubmit, onEliminar, onClose }: Props) {
  const [titulo, setTitulo] = useState(evento?.titulo ?? plantilla?.titulo ?? "");
  const [tipo, setTipo] = useState<TipoEventoCalendario>(
    evento && TIPOS_CREABLES.includes(evento.tipo) ? evento.tipo : (plantilla?.tipo ?? "examen"),
  );
  const [fecha, setFecha] = useState(evento ? toDateInput(evento.fecha_inicio) : fechaInicial ?? "");
  const [hora, setHora] = useState(evento ? toTimeInput(evento.fecha_inicio) : "");
  const [descripcion, setDescripcion] = useState(evento?.descripcion ?? "");
  const [guardando, setGuardando] = useState(false);
  const [borrando, setBorrando] = useState(false);

  const valido = titulo.trim().length > 0 && fecha !== "";

  async function guardar() {
    if (!valido) return;
    setGuardando(true);
    try {
      await onSubmit({
        titulo: titulo.trim(),
        tipo,
        fecha_inicio: `${fecha}T${hora || "00:00"}:00`,
        descripcion: descripcion.trim() || null,
      });
      onClose();
    } catch {
      setGuardando(false);
    }
  }

  async function borrar() {
    if (!onEliminar) return;
    setBorrando(true);
    try { await onEliminar(); onClose(); } catch { setBorrando(false); }
  }

  return (
    <Dialog open onOpenChange={(abierto) => { if (!abierto) onClose(); }}>
      <DialogContent className="max-w-[460px] p-0">
        <div className="border-b border-[var(--shell-border)] px-5 py-4">
          <DialogTitle className="text-[15px] font-bold">
            {modo === "crear" ? "Nuevo evento" : "Editar evento"}
          </DialogTitle>
        </div>

        <div className="space-y-4 px-5 py-4">
          {/* Tipo */}
          <div className="flex gap-2">
            {TIPOS_CREABLES.map((t) => {
              const on = tipo === t;
              const rol = rolDe(t);
              const { Icono, label } = TIPO[t];
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTipo(t)}
                  aria-pressed={on}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-lg border py-2 font-label text-xs font-semibold transition-colors",
                    on
                      ? cn(rol.bg, rol.borde, rol.fg)
                      : "border-[var(--shell-border)] text-[var(--shell-fg-dim)] hover:text-[var(--shell-fg-muted)]",
                  )}
                >
                  <Icono className="h-3.5 w-3.5" strokeWidth={2} />
                  {label}
                </button>
              );
            })}
          </div>

          <Campo label="Título">
            <input
              autoFocus
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") guardar(); }}
              placeholder="Ej. Parcial de Análisis Matemático"
              className="w-full bg-transparent text-sm text-[var(--shell-fg)] outline-none placeholder:text-[var(--shell-fg-dim)]"
            />
          </Campo>

          <div className="grid grid-cols-2 gap-3">
            <Campo label="Fecha">
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="w-full bg-transparent text-sm text-[var(--shell-fg)] outline-none"
              />
            </Campo>
            <Campo label="Hora (opcional)">
              <input
                type="time"
                value={hora}
                onChange={(e) => setHora(e.target.value)}
                className="w-full bg-transparent text-sm text-[var(--shell-fg)] outline-none"
              />
            </Campo>
          </div>

          <Campo label="Nota (opcional)">
            <textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              rows={2}
              placeholder="Aula, temas, recordatorio…"
              className="w-full resize-none bg-transparent text-sm text-[var(--shell-fg)] outline-none placeholder:text-[var(--shell-fg-dim)]"
            />
          </Campo>
        </div>

        <div className="flex items-center gap-2 border-t border-[var(--shell-border)] px-5 py-3.5">
          {modo === "editar" && onEliminar && (
            <button
              type="button"
              onClick={borrar}
              disabled={borrando}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 font-label text-xs font-semibold text-[#dc2626] transition-colors hover:bg-[#dc2626]/10 disabled:opacity-50 dark:text-[#f87171]"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
              {borrando ? "Borrando…" : "Borrar"}
            </button>
          )}
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 font-label text-xs font-semibold text-[var(--shell-fg-muted)] transition-colors hover:text-[var(--shell-fg)]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={guardar}
            disabled={!valido || guardando}
            className="rounded-lg bg-[#1CA4DF] px-4 py-2 font-label text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {guardando ? "Guardando…" : modo === "crear" ? "Crear" : "Guardar"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-label text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--shell-fg-dim)]">
        {label}
      </span>
      <div className="rounded-lg border border-[var(--shell-border)] bg-[var(--shell-canvas)] px-3 py-2">
        {children}
      </div>
    </label>
  );
}
