import Link from "next/link";

export interface AgendaItem {
  id: string | number;
  titulo: string;
  detalle: string;
  hora: string;
  duracionMin: number;
  /** Material Symbol que tipifica el evento (clase, lab, parcial...). */
  icono: string;
}

interface Props {
  /** Items del dia. Si esta vacio, se muestra empty state. */
  items: AgendaItem[];
  /** Marca a la UI que los datos son placeholder hasta que exista BE. */
  esMock?: boolean;
}

/**
 * Timeline del dia: clases, parciales y eventos. Hoy esta cableado con
 * datos mock; cuando exista el endpoint /calendario/hoy se reemplaza
 * la fuente sin tocar la UI.
 */
export function AgendaHoy({ items, esMock = false }: Props) {
  return (
    <div className="card-3d glow-card glow-primary bg-surface-container rounded-3xl p-6 border border-outline-variant/10 h-full">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-bold font-headline text-on-surface flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-[20px]">
            schedule
          </span>
          Agenda de hoy
          {esMock && (
            <span className="text-[9px] text-outline/40 font-label normal-case ml-1">
              (datos de ejemplo)
            </span>
          )}
        </h3>
        <Link
          href="/calendario"
          className="text-[10px] font-bold uppercase tracking-widest text-secondary hover:text-secondary/80 font-label"
        >
          Ver calendario
        </Link>
      </div>

      {items.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="space-y-3">
          {items.map((item, idx) => (
            <TimelineItem
              key={item.id}
              item={item}
              ultimo={idx === items.length - 1}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function TimelineItem({
  item,
  ultimo,
}: {
  item: AgendaItem;
  ultimo: boolean;
}) {
  return (
    <li className="relative pl-12 group">
      {/* Linea vertical del timeline */}
      {!ultimo && (
        <span className="absolute left-[1.125rem] top-9 bottom-0 w-px bg-outline-variant/25" />
      )}

      {/* Nodo del timeline */}
      <span className="absolute left-0 top-1 w-9 h-9 rounded-xl bg-surface-container-highest border border-outline-variant/30 flex items-center justify-center z-10 group-hover:border-secondary/40 transition-colors">
        <span className="material-symbols-outlined text-[18px] text-on-surface-variant group-hover:text-secondary transition-colors">
          {item.icono}
        </span>
      </span>

      {/* Card de evento */}
      <div className="bg-surface-container-high/40 rounded-2xl px-4 py-3 border border-outline-variant/10 hover:border-primary/25 transition-all flex justify-between items-center gap-4">
        <div className="min-w-0">
          <p className="text-sm font-bold font-headline text-on-surface truncate">
            {item.titulo}
          </p>
          <p className="text-xs text-on-surface-variant mt-0.5 truncate">
            {item.detalle}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-bold text-primary font-label">{item.hora}</p>
          <p className="text-[10px] text-outline uppercase font-medium font-label mt-0.5">
            {item.duracionMin} min
          </p>
        </div>
      </div>
    </li>
  );
}

function EmptyState() {
  return (
    <div className="bg-surface-container-high/30 border border-dashed border-outline-variant/20 rounded-2xl py-10 text-center">
      <span className="material-symbols-outlined text-3xl text-outline/40 mb-2 block">
        beach_access
      </span>
      <p className="text-sm text-on-surface-variant font-medium">
        No tenes nada en agenda para hoy.
      </p>
      <p className="text-xs text-outline/60 mt-1">
        Aprovecha y arrancale a esa lectura pendiente.
      </p>
    </div>
  );
}
