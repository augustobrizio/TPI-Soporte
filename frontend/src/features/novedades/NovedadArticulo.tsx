import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import type { NovedadOut } from "@/lib/types";
import { CompartirNovedad } from "./CompartirNovedad";
import { fechaCorta } from "./formato";
import { FuentesNovedad } from "./FuentesNovedad";

/**
 * Una novedad como página, no como modal.
 *
 * El modal de la portada (`NovedadDetail`) no tiene URL propia y no sirve para
 * compartir: lo que se manda por WhatsApp tiene que ser una dirección que un
 * crawler pueda pedir y leer. Esta es esa página — y además es a donde cae
 * quien abre el link, que puede no haber entrado nunca a UTNHub, así que
 * arranca con la vuelta a la portada bien a la vista.
 */
export function NovedadArticulo({ novedad }: { novedad: NovedadOut }) {
  const cuerpo = novedad.contenido ?? novedad.descripcion;
  const fecha = fechaCorta(novedad.fecha_publicacion ?? novedad.created_at);

  return (
    <article className="overflow-hidden rounded-xl border border-[var(--shell-border)] bg-[var(--shell-panel)]">
      {novedad.imagen_url && (
        <div className="aspect-[16/9] w-full overflow-hidden border-b border-[var(--shell-border)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={novedad.imagen_url}
            alt={novedad.titulo ?? ""}
            className="h-full w-full object-cover"
          />
        </div>
      )}

      <div className="p-6 sm:p-8">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          {novedad.categoria && (
            <Badge variant="celeste">{novedad.categoria}</Badge>
          )}
          {fecha && (
            <span className="text-[12px] tabular-nums text-[var(--shell-fg-dim)]">
              {fecha}
            </span>
          )}
        </div>

        <h1 className="font-headline text-2xl font-bold leading-snug tracking-tight text-[var(--shell-fg)] sm:text-[28px]">
          {novedad.titulo ?? "Sin título"}
        </h1>

        <p className="mt-4 whitespace-pre-line text-[15px] leading-relaxed text-[var(--shell-fg-muted)]">
          {cuerpo ?? "Sin más información disponible."}
        </p>

        <CompartirNovedad id={novedad.id} titulo={novedad.titulo} />

        <FuentesNovedad fuentes={novedad.fuentes} />
      </div>
    </article>
  );
}

/** Vuelta a la portada, arriba de la novedad. */
export function VolverANovedades() {
  return (
    <Link
      href="/novedades"
      className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--shell-fg-muted)] transition-colors hover:text-[var(--shell-fg)]"
    >
      <ArrowLeft className="h-4 w-4" strokeWidth={2} />
      Volver a novedades
    </Link>
  );
}
