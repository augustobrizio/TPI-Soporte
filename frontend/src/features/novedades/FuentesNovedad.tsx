import { ArrowUpRight } from "lucide-react";

import type { FuenteOut } from "@/lib/types";

/**
 * De dónde salió la novedad. Una novedad es un hecho y puede haber aparecido
 * en varios centros: por eso el encabezado cambia de "Fuente" a "Publicado en"
 * cuando hay más de una.
 *
 * Lo comparten el modal de la portada y la página propia de la novedad (la que
 * se comparte por link), que muestran lo mismo en dos contenedores distintos.
 */
export function FuentesNovedad({ fuentes }: { fuentes: FuenteOut[] }) {
  if (fuentes.length === 0) return null;

  return (
    <div className="mt-5 space-y-1.5 border-t border-[var(--shell-border)] pt-4">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--shell-fg-dim)]">
        {fuentes.length > 1 ? "Publicado en" : "Fuente"}
      </p>
      {fuentes.map((f, i) => (
        <a
          key={`${f.centro.handle}-${i}`}
          href={f.url ?? f.centro.url_perfil ?? undefined}
          target="_blank"
          rel="noopener noreferrer"
          className="group -mx-2 flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-[var(--shell-hover)]"
        >
          {f.centro.logo_url ? (
            <span className="flex h-6 w-6 shrink-0 overflow-hidden rounded-full bg-[var(--shell-hover)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={f.centro.logo_url}
                alt=""
                className="h-full w-full object-cover"
              />
            </span>
          ) : (
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#1CA4DF]" />
          )}
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--shell-fg-muted)] group-hover:text-[var(--shell-fg)]">
            {f.centro.nombre}
          </span>
          {f.url && (
            <ArrowUpRight
              className="h-4 w-4 shrink-0 text-[var(--shell-fg-dim)] transition-colors group-hover:text-[var(--shell-accent-fg)]"
              strokeWidth={2}
            />
          )}
        </a>
      ))}
    </div>
  );
}
