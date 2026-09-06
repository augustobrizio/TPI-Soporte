import type { LucideIcon } from "lucide-react";

/**
 * Panel de estado vacío / error del feed de novedades.
 *
 * Vivía como función local de la portada; lo comparte ahora con la página de
 * una novedad, que necesita el mismo panel para el link roto (un `/novedades/
 * <id>` que ya no existe llega desde afuera, compartido por alguien).
 */
export function EstadoVacio({
  icono: Icono,
  titulo,
  detalle,
}: {
  icono: LucideIcon;
  titulo: string;
  detalle: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-[var(--shell-border)] bg-[var(--shell-panel)] px-6 py-24 text-center">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#1CA4DF]/10">
        <Icono
          className="h-7 w-7 text-[var(--shell-accent-fg)]"
          strokeWidth={1.75}
        />
      </div>
      <h2 className="font-headline text-lg font-semibold tracking-tight text-[var(--shell-fg)]">
        {titulo}
      </h2>
      <p className="mt-1.5 max-w-sm text-[13.5px] leading-relaxed text-[var(--shell-fg-dim)]">
        {detalle}
      </p>
    </div>
  );
}
