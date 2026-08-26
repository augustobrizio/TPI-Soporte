/**
 * Boton "Continuar con Google" y su separador.
 *
 * Es un `<a>` y no un `<button>` a proposito: el flow arranca con una
 * navegacion top-level a `/api/auth/google/start`, que setea la cookie de
 * `state` y redirige a Google. Un `fetch()` no serviria — el browser tiene
 * que *irse* a accounts.google.com, no leer la respuesta.
 *
 * El logo va inline como SVG (no como `<img>` de un CDN de Google) para que
 * el boton no dependa de una request externa ni filtre una visita a Google
 * antes de que el usuario decida usarlo.
 */
import { cn } from "@/lib/utils";

/** Separador entre el formulario de email y el ingreso con Google. */
export function SeparadorO() {
  return (
    <div className="flex items-center gap-3" aria-hidden>
      <span className="h-px flex-1 bg-white/[0.08]" />
      <span className="font-label text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-600">
        o
      </span>
      <span className="h-px flex-1 bg-white/[0.08]" />
    </div>
  );
}

function LogoGoogle() {
  return (
    <svg
      viewBox="0 0 18 18"
      className="h-[18px] w-[18px] shrink-0"
      aria-hidden
      focusable="false"
    >
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

export function BotonGoogle({
  next,
  className,
}: {
  /** Ruta interna a la que volver despues de entrar. */
  next?: string | null;
  className?: string;
}) {
  const href = next
    ? `/api/auth/google/start?next=${encodeURIComponent(next)}`
    : "/api/auth/google/start";

  return (
    <a
      href={href}
      className={cn(
        "flex w-full items-center justify-center gap-2.5 rounded-lg border border-white/[0.10]",
        "bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-white/90",
        "transition-all duration-200",
        "hover:border-white/[0.18] hover:bg-white/[0.07]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1CA4DF]/40",
        "active:translate-y-px",
        className,
      )}
    >
      <LogoGoogle />
      Continuar con Google
    </a>
  );
}
