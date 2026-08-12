/**
 * Piezas visuales compartidas por login y registro.
 *
 * Siguen el sistema `--shell-*` (el mismo del Sidebar/TopNav): canvas neutro,
 * hairline borders, acento celeste institucional. Ver `agent_docs/ui_style_guide.md`.
 */
import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function AuthShell({
  titulo,
  subtitulo,
  children,
  pie,
}: {
  titulo: string;
  subtitulo: string;
  children: ReactNode;
  pie: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-[var(--shell-canvas)] flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-[400px]">
        {/* Marca */}
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-[#1CA4DF]/25 bg-[#1CA4DF]/10">
            <span className="material-symbols-outlined text-[22px] text-[var(--shell-accent-fg)]">
              school
            </span>
          </div>
          <h1 className="font-headline text-[26px] font-extrabold tracking-tight text-[var(--shell-fg)]">
            {titulo}
          </h1>
          <p className="mt-1.5 text-sm text-[var(--shell-fg-muted)]">{subtitulo}</p>
        </div>

        <div className="rounded-xl border border-[var(--shell-border)] bg-[var(--shell-panel)] p-6">
          {children}
        </div>

        <p className="mt-6 text-center text-sm text-[var(--shell-fg-muted)]">{pie}</p>
      </div>
    </main>
  );
}

export function EnlaceAuth({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="font-semibold text-[var(--shell-accent-fg)] underline-offset-4 hover:underline"
    >
      {children}
    </Link>
  );
}

interface CampoProps extends React.InputHTMLAttributes<HTMLInputElement> {
  etiqueta: string;
  /** Mensaje de error puntual del campo. */
  error?: string | null;
  /** Slot a la derecha del input (ej. el ojo de mostrar contraseña). */
  accion?: ReactNode;
}

export function Campo({ etiqueta, error, accion, className, id, ...props }: CampoProps) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block font-label text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--shell-fg-muted)]"
      >
        {etiqueta}
      </label>
      <div className="relative">
        <input
          id={id}
          className={cn(
            "w-full rounded-lg border bg-[var(--shell-canvas)] px-3 py-2.5 text-sm text-[var(--shell-fg)]",
            "placeholder:text-[var(--shell-fg-dim)]",
            "transition-colors outline-none",
            "focus:border-[#1CA4DF]/60 focus:ring-2 focus:ring-[#1CA4DF]/20",
            "disabled:opacity-60",
            error
              ? "border-red-500/60 focus:border-red-500/60 focus:ring-red-500/20"
              : "border-[var(--shell-border)]",
            accion && "pr-11",
            className,
          )}
          aria-invalid={Boolean(error)}
          aria-describedby={error && id ? `${id}-error` : undefined}
          {...props}
        />
        {accion && (
          <div className="absolute right-1 top-1/2 -translate-y-1/2">{accion}</div>
        )}
      </div>
      {error && (
        <p id={id ? `${id}-error` : undefined} className="mt-1.5 text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

export function BotonSubmit({
  cargando,
  children,
}: {
  cargando: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={cargando}
      className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--shell-fg)] px-4 py-2.5 text-sm font-bold text-[var(--shell-canvas)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {cargando && (
        <span className="material-symbols-outlined animate-spin text-[18px]">
          progress_activity
        </span>
      )}
      {children}
    </button>
  );
}

export function ErrorGeneral({ mensaje }: { mensaje: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-300"
    >
      <span className="material-symbols-outlined shrink-0 text-[18px]">error</span>
      <span className="min-w-0">{mensaje}</span>
    </div>
  );
}
