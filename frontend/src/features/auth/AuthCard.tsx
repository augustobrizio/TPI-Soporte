/**
 * Piezas visuales compartidas por login y registro.
 *
 * Layout cinematic split-screen: cubo 3D animado a la izquierda, formulario a
 * la derecha, fondo negro forzado (no depende del tema light/dark).
 *
 * Efectos ambientales (CSS-only):
 * - Glow nebuloso multicapa detrás del cubo
 * - Partículas/estrellas flotantes (keyframes)
 * - Halo celeste detrás del logo
 * - Grid de dots como fondo estrellado global
 */
import Link from "next/link";
import type { ReactNode } from "react";

import { LogoUTNHub } from "@/components/LogoUTNHub";
import { cn } from "@/lib/utils";

const STARS = Array.from({ length: 40 }, (_, i) => ({
  id: i,
  left: `${(i * 37 + 13) % 100}%`,
  top: `${(i * 53 + 7) % 100}%`,
  size: 1 + (i % 3),
  delay: `${(i * 1.3) % 8}s`,
  duration: `${3 + (i % 5)}s`,
}));

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
    <main className="auth-cinematic relative flex min-h-screen overflow-hidden bg-[#050507]">
      {/* ── Fondo global: dots estrellados + nebula ───────────────────── */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.07) 0.5px, transparent 0)",
          backgroundSize: "40px 40px",
        }}
      />

      {/* Nebula ambiental global: glow celeste desde la zona del cubo */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: [
            "radial-gradient(ellipse 50% 60% at 25% 50%, rgba(20, 120, 200, 0.10), transparent 70%)",
            "radial-gradient(ellipse 30% 40% at 30% 55%, rgba(30, 164, 223, 0.07), transparent 60%)",
            "radial-gradient(ellipse 80% 50% at 50% 100%, rgba(10, 60, 120, 0.08), transparent 50%)",
          ].join(", "),
        }}
      />

      {/* Estrellas/partículas flotantes (CSS-only) */}
      {STARS.map((s) => (
        <div
          key={s.id}
          aria-hidden
          className="auth-star pointer-events-none absolute rounded-full bg-white"
          style={{
            left: s.left,
            top: s.top,
            width: s.size,
            height: s.size,
            animationDelay: s.delay,
            animationDuration: s.duration,
          }}
        />
      ))}

      {/* ── Lado izquierdo: cubo animado ──────────────────────────────── */}
      <div className="relative hidden w-1/2 items-center justify-center overflow-hidden lg:flex">
        {/* Glow primario: halo grande celeste */}
        <div
          aria-hidden
          className="pointer-events-none absolute"
          style={{
            width: "70%",
            height: "70%",
            top: "15%",
            left: "15%",
            background:
              "radial-gradient(ellipse at center, rgba(30, 144, 220, 0.18), rgba(30, 144, 220, 0.04) 50%, transparent 72%)",
            filter: "blur(40px)",
          }}
        />

        {/* Glow secundario: reflejo cálido */}
        <div
          aria-hidden
          className="auth-glow-pulse pointer-events-none absolute"
          style={{
            width: "40%",
            height: "40%",
            top: "35%",
            left: "30%",
            background:
              "radial-gradient(ellipse at center, rgba(80, 180, 255, 0.12), transparent 70%)",
            filter: "blur(60px)",
          }}
        />

        {/* Video del cubo */}
        <video
          autoPlay
          loop
          muted
          playsInline
          className="relative z-10 w-[70%] max-w-[520px]"
          style={{ mixBlendMode: "screen" }}
        >
          <source src="/cubo_utn.webm" type="video/webm" />
        </video>

        {/* Reflejo del cubo en el "piso" */}
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2"
          style={{
            width: "60%",
            height: "80px",
            background:
              "radial-gradient(ellipse at center top, rgba(30, 164, 223, 0.10), transparent 70%)",
            filter: "blur(20px)",
          }}
        />
      </div>

      {/* ── Lado derecho: formulario ──────────────────────────────────── */}
      <div className="relative flex w-full flex-col items-center justify-center px-6 py-12 lg:w-1/2 lg:pl-0 lg:pr-[8%]">
        {/* Glow ambiental sutil detrás del form */}
        <div
          aria-hidden
          className="pointer-events-none absolute"
          style={{
            width: "300px",
            height: "300px",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -60%)",
            background:
              "radial-gradient(ellipse at center, rgba(30, 144, 220, 0.06), transparent 70%)",
            filter: "blur(50px)",
          }}
        />

        <div className="relative w-full max-w-[400px]">
          {/* Marca */}
          <div className="mb-8 flex flex-col items-center text-center">
            {/* Halo detrás del logo */}
            <div className="relative mb-4">
              <div
                aria-hidden
                className="auth-glow-pulse pointer-events-none absolute -inset-4"
                style={{
                  background:
                    "radial-gradient(circle, rgba(28, 164, 223, 0.25), transparent 70%)",
                  filter: "blur(12px)",
                }}
              />
              <LogoUTNHub size={44} className="relative" />
            </div>
            <h1 className="font-headline text-[22px] font-extrabold tracking-tight text-white/90">
              <span className="text-white">UTN</span>
              <span className="text-[#1CA4DF]">Hub</span>
            </h1>
            <p className="mt-1.5 text-sm text-zinc-400">{subtitulo}</p>
          </div>

          {/* Card del formulario — borde shimmer + glow */}
          <div className="auth-card-wrapper relative rounded-2xl p-px">
            {/* Borde animado con shimmer celeste */}
            <div
              aria-hidden
              className="auth-shimmer pointer-events-none absolute inset-0 rounded-2xl"
            />
            {/* Glow externo de la card */}
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-px rounded-2xl"
              style={{
                boxShadow:
                  "0 0 20px rgba(30, 144, 220, 0.08), 0 0 60px rgba(30, 144, 220, 0.04)",
              }}
            />
            <div
              className="relative rounded-2xl p-6"
              style={{
                background:
                  "linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.015) 100%)",
                boxShadow:
                  "inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(255,255,255,0.02)",
              }}
            >
              {children}
            </div>
          </div>

          <p className="mt-6 text-center text-sm text-zinc-500">{pie}</p>
        </div>
      </div>
    </main>
  );
}

export function EnlaceAuth({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="font-semibold text-[#1CA4DF] underline-offset-4 hover:underline"
    >
      {children}
    </Link>
  );
}

interface CampoProps extends React.InputHTMLAttributes<HTMLInputElement> {
  etiqueta: string;
  error?: string | null;
  accion?: ReactNode;
}

export function Campo({
  etiqueta,
  error,
  accion,
  className,
  id,
  ...props
}: CampoProps) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block font-label text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400"
      >
        {etiqueta}
      </label>
      <div className="relative">
        <input
          id={id}
          className={cn(
            "auth-input w-full rounded-lg border px-3 py-2.5 text-sm text-white/90",
            "placeholder:text-zinc-600",
            "transition-all duration-200 outline-none",
            "disabled:opacity-60",
            error
              ? "border-red-500/60 focus:border-red-500/60 focus:ring-red-500/20"
              : "border-white/[0.08] focus:border-[#1CA4DF]/40",
            accion && "pr-11",
            className,
          )}
          aria-invalid={Boolean(error)}
          aria-describedby={error && id ? `${id}-error` : undefined}
          {...props}
        />
        {accion && (
          <div className="absolute right-1 top-1/2 -translate-y-1/2">
            {accion}
          </div>
        )}
      </div>
      {error && (
        <p
          id={id ? `${id}-error` : undefined}
          className="mt-1.5 text-xs text-red-400"
        >
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
      className="auth-btn mt-2 flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold text-white transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50"
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
      <span className="material-symbols-outlined shrink-0 text-[18px]">
        error
      </span>
      <span className="min-w-0">{mensaje}</span>
    </div>
  );
}
