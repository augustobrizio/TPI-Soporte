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
      className="card-3d cal-card group flex flex-col gap-4 rounded-2xl bg-surface-container/60 border border-outline-variant/10 p-5 hover:border-outline-variant/25"
    >
      <div className="flex items-start gap-3">
        <div
          className={`w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 font-headline font-black text-sm ${acento.wrapper}`}
        >
          {inicialesProfesor(profesor.nombre)}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-headline font-bold text-on-surface leading-snug line-clamp-2 group-hover:text-primary transition-colors">
            {nombre}
          </h3>
          {profesor.email ? (
            <p className="text-xs text-on-surface-variant truncate mt-0.5">{profesor.email}</p>
          ) : (
            <p className="text-xs text-outline/70 italic mt-0.5">Sin email</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 mt-auto">
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
    <span className="inline-flex items-center gap-1.5 rounded-lg bg-surface-container-high/60 px-2.5 py-1 text-[11px] text-on-surface-variant">
      <span className="material-symbols-outlined text-[15px] text-outline">{icono}</span>
      <span className="font-semibold text-on-surface">{valor}</span>
      <span className="text-outline">{etiqueta}</span>
    </span>
  );
}
