import Link from "next/link";
import type { ProfesorListItem } from "@/lib/types";
import { acentoProfesor, inicialesProfesor } from "@/lib/profesorAvatar";

/**
 * Tarjeta de un profesor en el listado. Enlaza al detalle (/profesores/{id}).
 * Muestra avatar con iniciales, nombre, email y dos contadores.
 */
export function ProfesorCard({ profesor }: { profesor: ProfesorListItem }) {
  const acento = acentoProfesor(profesor.id);
  const nombre = profesor.nombre ?? "Sin nombre";

  return (
    <Link
      href={`/profesores/${profesor.id}`}
      className="card-3d group flex flex-col gap-3.5 rounded-2xl border border-outline-variant/10 bg-surface-container/50 p-4 transition-colors hover:border-primary/30 hover:bg-surface-container/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <div className="flex items-start gap-3">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border font-headline text-sm font-black ${acento.wrapper}`}
        >
          {inicialesProfesor(profesor.nombre)}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 font-headline text-sm font-bold leading-snug text-on-surface transition-colors group-hover:text-primary">
            {nombre}
          </h3>
          {profesor.email ? (
            <p className="mt-0.5 truncate text-xs text-on-surface-variant">{profesor.email}</p>
          ) : (
            <p className="mt-0.5 text-xs italic text-outline/70">Sin email</p>
          )}
        </div>
        <span className="material-symbols-outlined shrink-0 text-[18px] text-outline/50 transition-all group-hover:translate-x-0.5 group-hover:text-primary">
          arrow_forward
        </span>
      </div>

      <div className="mt-auto flex items-center gap-3.5 border-t border-outline-variant/10 pt-3 text-[11px] text-outline">
        <Contador icono="menu_book" valor={profesor.cantidad_materias} etiqueta="materias" />
        <Contador icono="schedule" valor={profesor.cantidad_horarios} etiqueta="consulta" />
      </div>
    </Link>
  );
}

function Contador({
  icono,
  valor,
  etiqueta,
}: {
  icono: string;
  valor: number;
  etiqueta: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="material-symbols-outlined text-[15px] text-outline/70">{icono}</span>
      <span className="font-semibold text-on-surface-variant tabular-nums">{valor}</span>
      <span>{etiqueta}</span>
    </span>
  );
}
