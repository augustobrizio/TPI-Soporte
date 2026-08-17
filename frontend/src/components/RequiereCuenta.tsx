import Link from "next/link";

/**
 * Pantalla de las secciones que sí necesitan cuenta.
 *
 * Reemplaza al viejo `redirect("/login")`: el visitante ve de qué se trata la
 * sección y por qué hace falta una cuenta, y decide desde ahí. Antes se
 * encontraba un formulario de login sin contexto, que es justamente lo que
 * hacía sentir la app cerrada.
 *
 * Se renderiza adentro del shell, así la sidebar sigue disponible y se puede
 * volver a las secciones abiertas sin usar el botón de atrás.
 */
export function RequiereCuenta({
  titulo,
  icono,
  motivo,
  next,
}: {
  /** Nombre de la sección, para que el CTA hable de algo concreto. */
  titulo: string;
  /** Ícono de Material Symbols, el mismo que usa la sección en la sidebar. */
  icono: string;
  /** Por qué esta sección necesita cuenta, en una frase. */
  motivo: string;
  /** Ruta a la que volver después de loguearse. */
  next?: string;
}) {
  // El `next` viaja encodeado: sin eso, un path con query string cortaría el
  // parámetro a la mitad. El login solo acepta rutas relativas (ver
  // features/auth/destino.ts), así que no sirve como redirector abierto.
  const hrefLogin = next
    ? `/login?next=${encodeURIComponent(next)}`
    : "/login";

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <header className="mb-10 space-y-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/20 px-3 py-1 font-label text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
          <span className="material-symbols-outlined text-[13px]">lock</span>
          Necesita cuenta
        </span>
        <h1 className="text-4xl font-extrabold tracking-tight font-headline text-on-surface">
          {titulo}
        </h1>
        <p className="text-on-surface-variant">{motivo}</p>
      </header>

      <div className="card-3d glow-card glow-primary bg-surface-container/50 border border-outline-variant/10 rounded-3xl p-12 flex flex-col items-center justify-center text-center min-h-[420px] overflow-hidden">
        <div className="relative mb-7">
          <span className="absolute inset-0 rounded-3xl bg-primary/20 blur-2xl" />
          <div className="icon-chip chip-primary relative w-24 h-24 rounded-3xl text-primary flex items-center justify-center">
            <span className="material-symbols-outlined text-[52px]">{icono}</span>
          </div>
        </div>

        <h2 className="text-2xl font-headline font-bold text-on-surface mb-2">
          Entrá para ver esta sección
        </h2>
        <p className="text-sm text-on-surface-variant max-w-md leading-relaxed">
          El resto de UTNHub —novedades, profesores, comisiones, calendario y
          material— se puede usar sin cuenta.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href={hrefLogin}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 font-body text-sm font-semibold text-on-primary transition-opacity hover:opacity-90"
          >
            <span className="material-symbols-outlined text-[18px]">login</span>
            Iniciar sesión
          </Link>
          <Link
            href="/register"
            className="inline-flex items-center gap-2 rounded-xl border border-outline-variant/30 px-5 py-2.5 font-body text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container-highest"
          >
            Crear cuenta
          </Link>
        </div>
      </div>
    </div>
  );
}
