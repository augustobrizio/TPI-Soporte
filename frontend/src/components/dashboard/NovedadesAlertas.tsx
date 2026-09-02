import Link from "next/link";

export type Severidad = "critica" | "importante" | "info";

export interface NovedadAlerta {
  id: string | number;
  categoria: string;
  titulo: string;
  resumen: string;
  severidad: Severidad;
  url?: string | null;
}

interface Props {
  novedades: NovedadAlerta[];
  esMock?: boolean;
}

const STYLES: Record<
  Severidad,
  { border: string; bg: string; bar: string; tag: string }
> = {
  critica: {
    border: "border-error/35",
    bg: "bg-error/5",
    bar: "bg-error",
    tag: "text-error",
  },
  importante: {
    border: "border-tertiary/35",
    bg: "bg-tertiary/5",
    bar: "bg-tertiary",
    tag: "text-tertiary",
  },
  info: {
    border: "border-primary/30",
    bg: "bg-primary/5",
    bar: "bg-primary",
    tag: "text-primary",
  },
};

/**
 * Cards de novedades por severidad: urgente (rojo), aviso (ambar), info
 * general (azul). El feed sale del pipeline de ingesta; el mapeo
 * categoria -> severidad lo hace el caller (`PanelPersonal.severidadDe`).
 *
 * `esMock` sigue existiendo aunque ya nadie lo pase en true: es el cartel de
 * "datos de ejemplo" para cuando la card se reuse en una pantalla sin feed.
 */
export function NovedadesAlertas({ novedades, esMock = false }: Props) {
  return (
    <div className="card-3d glow-card glow-primary bg-surface-container rounded-3xl p-6 border border-outline-variant/10 h-full">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-lg font-bold font-headline text-on-surface flex items-center gap-2">
          <span className="material-symbols-outlined text-error text-[20px]">
            warning
          </span>
          Ultimas alertas
          {esMock && (
            <span className="text-[9px] text-outline/40 font-label normal-case ml-1">
              (datos de ejemplo)
            </span>
          )}
        </h3>
        <Link
          href="/novedades"
          className="text-[10px] font-bold uppercase tracking-widest text-secondary hover:text-secondary/80 font-label"
        >
          Ver todas
        </Link>
      </div>

      {novedades.length === 0 ? (
        <div className="bg-surface-container-high/30 border border-dashed border-outline-variant/20 rounded-2xl py-10 text-center">
          <span className="material-symbols-outlined text-3xl text-outline/40 mb-2 block">
            inbox
          </span>
          <p className="text-sm text-on-surface-variant font-medium">
            Sin novedades pendientes.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {novedades.map((n) => (
            <NovedadCard key={n.id} novedad={n} />
          ))}
        </div>
      )}
    </div>
  );
}

function NovedadCard({ novedad }: { novedad: NovedadAlerta }) {
  const s = STYLES[novedad.severidad];
  const Inner = (
    <div
      className={`p-4 rounded-2xl border ${s.border} ${s.bg} flex gap-4 h-full`}
    >
      <div className={`w-1.5 rounded-full shrink-0 ${s.bar}`} />
      <div className="min-w-0">
        <p
          className={`text-[10px] font-bold uppercase tracking-widest mb-1 font-label ${s.tag}`}
        >
          {novedad.categoria}
        </p>
        <p className="text-sm font-bold text-on-surface leading-snug">
          {novedad.titulo}
        </p>
        <p className="text-xs text-on-surface-variant mt-2 leading-relaxed line-clamp-3">
          {novedad.resumen}
        </p>
      </div>
    </div>
  );

  if (!novedad.url) return Inner;

  // Un deep link nuestro (`/novedades?novedad=12`) se navega con Link: abrirlo
  // en pestaña nueva sacaria al alumno de la app para mostrarle otra pantalla
  // de la misma app. Una URL externa (la fuente en Instagram) si va afuera.
  if (novedad.url.startsWith("/")) {
    return (
      <Link href={novedad.url} className="block hover:brightness-110 transition">
        {Inner}
      </Link>
    );
  }

  return (
    <a
      href={novedad.url}
      target="_blank"
      rel="noreferrer"
      className="block hover:brightness-110 transition"
    >
      {Inner}
    </a>
  );
}
