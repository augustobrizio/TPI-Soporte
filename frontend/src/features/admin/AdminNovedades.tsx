"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  EyeOff,
  Loader2,
  Pin,
  PinOff,
  RotateCcw,
} from "lucide-react";

import { fijarOrdenPortada, listarNovedadesAdmin, listarPortada, moderarNovedad } from "@/lib/api";
import type { NovedadOut } from "@/lib/types";
import { cn } from "@/lib/utils";

type Estado = "publicada" | "pendiente" | "descartada";

const ESTADOS: { valor: Estado; label: string }[] = [
  { valor: "publicada", label: "Publicadas" },
  { valor: "pendiente", label: "Pendientes" },
  { valor: "descartada", label: "Descartadas" },
];

/** Cómo se ve cada estado. El descarte no es un error: es una decisión. */
const COLOR_ESTADO: Record<string, string> = {
  publicada: "border-[#1CA4DF]/25 bg-[#1CA4DF]/10 text-[var(--shell-accent-fg)]",
  pendiente: "border-[var(--cal-alerta-bd)] bg-[var(--cal-alerta-bg)] text-[var(--cal-alerta-fg)]",
  descartada: "border-[var(--shell-border)] bg-[var(--shell-hover)] text-[var(--shell-fg-dim)]",
};

function fecha(n: NovedadOut): string {
  const iso = n.fecha_publicacion ?? n.created_at;
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
}

/**
 * Moderación de novedades.
 *
 * Dos cosas en una pantalla porque son la misma decisión: qué se publica y en
 * qué orden se ve. Arriba la portada —lo que el visitante encuentra primero—,
 * abajo el resto, incluido lo que el clasificador descartó, que hasta ahora no
 * se podía revisar desde ningún lado.
 */
export function AdminNovedades({
  portadaInicial,
  novedadesIniciales,
}: {
  portadaInicial: NovedadOut[];
  novedadesIniciales: NovedadOut[];
}) {
  const [portada, setPortada] = useState(portadaInicial);
  const [todas, setTodas] = useState(novedadesIniciales);
  const [filtro, setFiltro] = useState<Estado | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enPortada = useMemo(() => new Set(portada.map((n) => n.id)), [portada]);

  const refrescar = useCallback(async () => {
    const [p, t] = await Promise.all([listarPortada(), listarNovedadesAdmin()]);
    setPortada(p);
    setTodas(t);
  }, []);

  useEffect(() => { void refrescar(); }, [refrescar]);

  async function correr(accion: () => Promise<unknown>) {
    setOcupado(true);
    setError(null);
    try {
      await accion();
      await refrescar();
    } catch {
      setError("No se pudo aplicar el cambio. Probá de nuevo.");
    } finally {
      setOcupado(false);
    }
  }

  const mover = (desde: number, hacia: number) => {
    if (hacia < 0 || hacia >= portada.length) return;
    const ids = portada.map((n) => n.id);
    [ids[desde], ids[hacia]] = [ids[hacia], ids[desde]];
    void correr(() => fijarOrdenPortada(ids));
  };

  const quitarDePortada = (id: number) =>
    void correr(() => fijarOrdenPortada(portada.filter((n) => n.id !== id).map((n) => n.id)));

  const ponerEnPortada = (id: number) =>
    void correr(() => fijarOrdenPortada([id, ...portada.map((n) => n.id)]));

  const visibles = filtro ? todas.filter((n) => n.estado === filtro) : todas;

  return (
    <div className="space-y-8">
      {error && (
        <p className="rounded-lg border border-[#dc2626]/30 bg-[#dc2626]/10 px-3 py-2 text-sm text-[#dc2626] dark:text-[#f87171]">
          {error}
        </p>
      )}

      {/* ── Portada ──────────────────────────────────────────────────── */}
      <section>
        <div className="mb-1 flex items-center gap-2">
          <h2 className="font-headline text-lg font-bold text-[var(--shell-fg)]">
            En la portada
          </h2>
          {ocupado && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--shell-fg-dim)]" strokeWidth={2} />
          )}
        </div>
        <p className="mb-4 text-sm text-[var(--shell-fg-muted)]">
          En este orden. Una novedad nueva entra primera y desplaza a la última.
        </p>

        {portada.length === 0 ? (
          <p className="rounded-xl border border-[var(--shell-border)] bg-[var(--shell-panel)] px-4 py-6 text-sm text-[var(--shell-fg-muted)]">
            Sin novedades fijadas: la portada muestra las más recientes.
          </p>
        ) : (
          <ol className="space-y-2">
            {portada.map((n, i) => (
              <li
                key={n.id}
                className="flex items-center gap-3 rounded-xl border border-[var(--shell-border)] bg-[var(--shell-panel)] p-3"
              >
                <span className="font-headline text-sm font-bold tabular-nums text-[var(--shell-fg-dim)]">
                  {i + 1}
                </span>
                <p className="min-w-0 flex-1 truncate text-sm text-[var(--shell-fg)]">
                  {n.titulo ?? "(sin título)"}
                </p>
                <span className="shrink-0 font-label text-[11px] text-[var(--shell-fg-dim)]">
                  {fecha(n)}
                </span>
                <div className="flex shrink-0 items-center gap-0.5">
                  <BotonIcono onClick={() => mover(i, i - 1)} disabled={ocupado || i === 0} label="Subir">
                    <ArrowUp className="h-3.5 w-3.5" strokeWidth={2} />
                  </BotonIcono>
                  <BotonIcono
                    onClick={() => mover(i, i + 1)}
                    disabled={ocupado || i === portada.length - 1}
                    label="Bajar"
                  >
                    <ArrowDown className="h-3.5 w-3.5" strokeWidth={2} />
                  </BotonIcono>
                  <BotonIcono onClick={() => quitarDePortada(n.id)} disabled={ocupado} label="Sacar de la portada">
                    <PinOff className="h-3.5 w-3.5" strokeWidth={2} />
                  </BotonIcono>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* ── Todas ────────────────────────────────────────────────────── */}
      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-headline text-lg font-bold text-[var(--shell-fg)]">
              Todas las novedades
            </h2>
            <p className="mt-1 text-sm text-[var(--shell-fg-muted)]">
              Incluye lo que el clasificador descartó.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip activo={filtro === null} onClick={() => setFiltro(null)}>
              Todas
            </Chip>
            {ESTADOS.map(({ valor, label }) => (
              <Chip key={valor} activo={filtro === valor} onClick={() => setFiltro(valor)}>
                {label}
              </Chip>
            ))}
          </div>
        </div>

        <ul className="space-y-2">
          {visibles.map((n) => (
            <li
              key={n.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--shell-border)] bg-[var(--shell-panel)] p-3"
            >
              <span
                className={cn(
                  "shrink-0 rounded-full border px-2 py-0.5 font-label text-[10px] font-semibold uppercase tracking-[0.08em]",
                  COLOR_ESTADO[n.estado] ?? COLOR_ESTADO.descartada,
                )}
              >
                {n.estado}
              </span>
              <p className="min-w-0 flex-1 truncate text-sm text-[var(--shell-fg)]">
                {n.titulo ?? "(sin título)"}
              </p>
              <span className="shrink-0 font-label text-[11px] text-[var(--shell-fg-dim)]">
                {fecha(n)}
              </span>

              <div className="flex shrink-0 items-center gap-0.5">
                {n.estado !== "publicada" && (
                  <BotonIcono
                    onClick={() => void correr(() => moderarNovedad(n.id, "publicada"))}
                    disabled={ocupado}
                    label="Publicar"
                  >
                    <Check className="h-3.5 w-3.5" strokeWidth={2} />
                  </BotonIcono>
                )}
                {n.estado !== "descartada" && (
                  <BotonIcono
                    onClick={() => void correr(() => moderarNovedad(n.id, "descartada"))}
                    disabled={ocupado}
                    label="Descartar"
                  >
                    <EyeOff className="h-3.5 w-3.5" strokeWidth={2} />
                  </BotonIcono>
                )}
                {n.estado !== "pendiente" && (
                  <BotonIcono
                    onClick={() => void correr(() => moderarNovedad(n.id, "pendiente"))}
                    disabled={ocupado}
                    label="Volver a pendiente"
                  >
                    <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} />
                  </BotonIcono>
                )}
                {n.estado === "publicada" && !enPortada.has(n.id) && (
                  <BotonIcono
                    onClick={() => ponerEnPortada(n.id)}
                    disabled={ocupado}
                    label="Poner en la portada"
                  >
                    <Pin className="h-3.5 w-3.5" strokeWidth={2} />
                  </BotonIcono>
                )}
              </div>
            </li>
          ))}
        </ul>

        {visibles.length === 0 && (
          <p className="rounded-xl border border-[var(--shell-border)] bg-[var(--shell-panel)] px-4 py-6 text-sm text-[var(--shell-fg-muted)]">
            No hay novedades con ese estado.
          </p>
        )}
      </section>
    </div>
  );
}

function BotonIcono({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--shell-fg-dim)] transition-colors hover:bg-[var(--shell-hover)] hover:text-[var(--shell-fg)] disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function Chip({
  activo,
  onClick,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={activo}
      className={cn(
        "rounded-full border px-3 py-1 font-label text-[11px] font-semibold transition-colors",
        activo
          ? "border-[#1CA4DF]/30 bg-[#1CA4DF]/10 text-[var(--shell-accent-fg)]"
          : "border-[var(--shell-border)] text-[var(--shell-fg-dim)] hover:text-[var(--shell-fg-muted)]",
      )}
    >
      {children}
    </button>
  );
}
