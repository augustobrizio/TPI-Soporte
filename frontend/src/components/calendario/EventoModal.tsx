"use client";

import { useState } from "react";
import type { EventoCalendarioCreate, EventoCalendarioOut, TipoEventoCalendario } from "@/lib/types";
import { TIPO } from "./utils";

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
  const [fecha, setFecha] = useState(
    evento ? toDateInput(evento.fecha_inicio) : fechaInicial ?? "",
  );
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
      style={{ background: "rgba(5,5,6,0.7)", backdropFilter: "blur(6px)" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-[460px] rounded-2xl overflow-hidden"
        style={{ background: "#121215", border: "1px solid rgba(115,115,115,0.16)", boxShadow: "0 24px 60px rgba(0,0,0,0.5)" }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: "1px solid rgba(115,115,115,0.12)" }}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: `rgba(${TIPO[tipo].rgb},0.16)`, border: `1px solid rgba(${TIPO[tipo].rgb},0.25)` }}>
            <span className="material-symbols-outlined text-[20px]" style={{ color: TIPO[tipo].text }}>{TIPO[tipo].icon}</span>
          </div>
          <h2 className="flex-1 text-[15px] font-black font-headline text-on-surface">
            {modo === "crear" ? "Nuevo evento" : "Editar evento"}
          </h2>
          <button onClick={onClose} aria-label="Cerrar" className="w-8 h-8 rounded-lg flex items-center justify-center text-outline hover:text-on-surface hover:bg-surface-container-high transition-colors">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Form */}
        <div className="px-5 py-4 space-y-4">
          {/* Tipo */}
          <div className="flex gap-2">
            {TIPOS_CREABLES.map((t) => {
              const on = tipo === t;
              return (
                <button
                  key={t}
                  onClick={() => setTipo(t)}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-[12px] font-bold font-label transition-all"
                  style={{
                    color: on ? "#09090b" : "rgba(163,163,163,0.72)",
                    background: on ? TIPO[t].text : "rgba(35,35,39,0.6)",
                    border: `1px solid ${on ? TIPO[t].text : "rgba(115,115,115,0.18)"}`,
                  }}
                >
                  <span>{TIPO[t].emoji}</span> {TIPO[t].label}
                </button>
              );
            })}
          </div>

          {/* Título */}
          <Field label="Título">
            <input
              autoFocus
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") guardar(); }}
              placeholder="Ej. Parcial de Análisis Matemático"
              className="w-full bg-transparent outline-none text-sm text-on-surface placeholder:text-outline/40"
            />
          </Field>

          {/* Fecha + hora */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fecha">
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-full bg-transparent outline-none text-sm text-on-surface [color-scheme:dark]" />
            </Field>
            <Field label="Hora (opcional)">
              <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} className="w-full bg-transparent outline-none text-sm text-on-surface [color-scheme:dark]" />
            </Field>
          </div>

          {/* Descripción */}
          <Field label="Nota (opcional)">
            <textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              rows={2}
              placeholder="Aula, temas, recordatorio…"
              className="w-full bg-transparent outline-none text-sm text-on-surface placeholder:text-outline/40 resize-none"
            />
          </Field>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 flex items-center gap-2" style={{ borderTop: "1px solid rgba(115,115,115,0.12)" }}>
          {modo === "editar" && onEliminar && (
            <button
              onClick={borrar}
              disabled={borrando}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold font-label text-error hover:bg-error/10 transition-colors disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[16px]">delete</span>
              {borrando ? "Borrando…" : "Borrar"}
            </button>
          )}
          <div className="flex-1" />
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-xs font-bold font-label text-outline hover:text-on-surface transition-colors">
            Cancelar
          </button>
          <button
            onClick={guardar}
            disabled={!valido || guardando}
            className="px-4 py-2 rounded-lg text-xs font-bold font-label transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: "#fafafa", color: "#09090b", boxShadow: "0 2px 10px rgba(0,0,0,0.35)" }}
          >
            {guardando ? "Guardando…" : modo === "crear" ? "Crear" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-[0.12em] font-bold font-label text-outline/60 mb-1.5">{label}</span>
      <div className="rounded-lg px-3 py-2" style={{ background: "rgba(35,35,39,0.5)", border: "1px solid rgba(115,115,115,0.16)" }}>
        {children}
      </div>
    </label>
  );
}
