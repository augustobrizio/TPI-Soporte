"use client";

/**
 * Widget para que un alumno califique una cátedra (profesor × materia).
 *
 * Escala de 5 niveles (misma que UTNTAC): 5 súper recomiendo … 1 súper evitaría.
 * Colapsado muestra el estado ("Calificar" o "Tu voto ★N"); expandido, el
 * selector + comentario opcional. Guarda contra PUT /mi/resenas y refleja el
 * cambio en el contexto de "mis reseñas". Sin sesión, invita a iniciarla.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { ApiError, borrarResena, guardarResena } from "@/lib/api";
import { useMisResenas } from "./MisResenasProvider";

const NIVELES = [
  { nivel: 5, label: "Súper recomiendo", icon: "sentiment_very_satisfied" },
  { nivel: 4, label: "Recomiendo", icon: "sentiment_satisfied" },
  { nivel: 3, label: "Normal", icon: "sentiment_neutral" },
  { nivel: 2, label: "Evitaría", icon: "sentiment_dissatisfied" },
  { nivel: 1, label: "Súper evitaría", icon: "sentiment_very_dissatisfied" },
] as const;

const LABEL: Record<number, string> = Object.fromEntries(
  NIVELES.map((n) => [n.nivel, n.label]),
);

/** Clases por banda de nivel: verde (≥4) · ámbar (3) · rojo (<3). */
function banda(nivel: number, activo: boolean): string {
  const base =
    nivel >= 4
      ? ["text-secondary", "border-secondary/40", "bg-secondary/15"]
      : nivel === 3
        ? ["text-tertiary", "border-tertiary/40", "bg-tertiary/15"]
        : ["text-error", "border-error/40", "bg-error/10"];
  return activo
    ? `${base[0]} ${base[1]} ${base[2]}`
    : "text-on-surface-variant border-outline-variant/20 hover:border-outline-variant/40";
}

export function CalificarCatedra({
  materiaCodigo,
  profesorId,
}: {
  materiaCodigo: string;
  profesorId: number;
}) {
  const { loggedIn, getResena, aplicar, quitar } = useMisResenas();
  const existente = getResena(materiaCodigo, profesorId);
  const pathname = usePathname();

  const [abierto, setAbierto] = useState(false);
  const [nivel, setNivel] = useState<number | null>(null);
  const [comentario, setComentario] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!loggedIn) {
    return (
      <Link
        href={`/login?next=${encodeURIComponent(pathname)}`}
        className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
      >
        <span className="material-symbols-outlined text-[14px]">rate_review</span>
        Iniciá sesión para calificar
      </Link>
    );
  }

  function abrir() {
    setNivel(existente?.nivel ?? null);
    setComentario(existente?.comentario ?? "");
    setError(null);
    setAbierto(true);
  }

  async function onGuardar() {
    if (nivel == null) return;
    setGuardando(true);
    setError(null);
    try {
      const r = await guardarResena({
        materia_codigo: materiaCodigo,
        profesor_id: profesorId,
        nivel,
        comentario: comentario.trim() || null,
      });
      aplicar(r);
      setAbierto(false);
    } catch (e) {
      setError(e instanceof ApiError ? "No se pudo guardar." : "Error de red.");
    } finally {
      setGuardando(false);
    }
  }

  async function onBorrar() {
    setGuardando(true);
    setError(null);
    try {
      await borrarResena(materiaCodigo, profesorId);
      quitar(materiaCodigo, profesorId);
      setAbierto(false);
    } catch {
      setError("No se pudo borrar.");
    } finally {
      setGuardando(false);
    }
  }

  // --- Colapsado ---
  if (!abierto) {
    if (existente) {
      return (
        <button
          type="button"
          onClick={abrir}
          className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${banda(existente.nivel, true)}`}
          title={`Tu voto: ${LABEL[existente.nivel]} · editar`}
        >
          <span className="material-symbols-outlined text-[13px]">how_to_vote</span>
          Tu voto: {LABEL[existente.nivel]}
          <span className="material-symbols-outlined text-[13px] opacity-60">edit</span>
        </button>
      );
    }
    return (
      <button
        type="button"
        onClick={abrir}
        className="inline-flex items-center gap-1 rounded-md border border-outline-variant/25 px-1.5 py-0.5 text-[11px] font-semibold text-on-surface-variant transition-colors hover:border-primary/40 hover:text-primary"
      >
        <span className="material-symbols-outlined text-[14px]">rate_review</span>
        Calificar
      </button>
    );
  }

  // --- Expandido ---
  return (
    <div className="mt-1 w-full rounded-lg border border-outline-variant/20 bg-surface-container-high/60 p-2.5">
      <div className="flex flex-wrap gap-1">
        {NIVELES.map((n) => (
          <button
            key={n.nivel}
            type="button"
            onClick={() => setNivel(n.nivel)}
            className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-1 text-[11px] font-semibold transition-colors ${banda(n.nivel, nivel === n.nivel)}`}
            title={n.label}
          >
            <span className="material-symbols-outlined text-[15px]">{n.icon}</span>
            <span className="hidden sm:inline">{n.label}</span>
          </button>
        ))}
      </div>

      <textarea
        value={comentario}
        onChange={(e) => setComentario(e.target.value)}
        maxLength={1000}
        rows={2}
        placeholder="Comentario (opcional)…"
        className="mt-2 w-full resize-none rounded-md border border-outline-variant/20 bg-surface-container-low px-2 py-1.5 text-xs text-on-surface placeholder:text-outline focus:border-primary/40 focus:outline-none"
      />

      {error && <p className="mt-1 text-[11px] text-error">{error}</p>}

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={onGuardar}
          disabled={nivel == null || guardando}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[11px] font-bold text-on-primary transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          <span className="material-symbols-outlined text-[14px]">check</span>
          Guardar
        </button>
        <button
          type="button"
          onClick={() => setAbierto(false)}
          disabled={guardando}
          className="text-[11px] font-semibold text-on-surface-variant hover:text-on-surface"
        >
          Cancelar
        </button>
        {existente && (
          <button
            type="button"
            onClick={onBorrar}
            disabled={guardando}
            className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-error/80 hover:text-error"
          >
            <span className="material-symbols-outlined text-[14px]">delete</span>
            Borrar
          </button>
        )}
      </div>
    </div>
  );
}
