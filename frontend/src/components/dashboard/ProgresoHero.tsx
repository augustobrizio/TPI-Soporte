import type { ContadoresGrafo } from "@/lib/types";

interface Props {
  /** Nombre del usuario logueado. */
  nombre: string;
  /** Texto de carrera + anio (ej: "ISI - 3er Anio"). */
  carrera: string;
  /** Contadores agregados del grafo de troncales (cross-tab incluye electivas). */
  contadores: ContadoresGrafo;
  /** Materias en cursada actualmente (para el KPI lateral). */
  enCursada: number;
  /** Cantidad de finales / examenes proximos. Mock hasta que exista BE. */
  finalesProximos?: number;
  /** Si la fuente de progreso es real (vino del BE) o mock. */
  esMock?: boolean;
}

const SIZE = 192;
const STROKE = 12;
const RADIUS = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * RADIUS;

/**
 * Hero del dashboard: gauge circular con el progreso de la carrera +
 * KPIs de "en cursada" y "finales proximos". El progreso viene del
 * grafo de troncales del backend; los KPIs secundarios son placeholder
 * hasta que se implementen los endpoints de calendario/examenes.
 */
export function ProgresoHero({
  nombre,
  carrera,
  contadores,
  enCursada,
  finalesProximos,
  esMock = false,
}: Props) {
  const porcentaje = Math.max(0, Math.min(100, contadores.porcentaje_aprobadas));
  const dashOffset = CIRC * (1 - porcentaje / 100);

  return (
    <section className="card-3d relative bg-surface-container rounded-3xl overflow-hidden border border-outline-variant/10 p-8 md:p-10">
      {/* Glow ambient en el costado derecho */}
      <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-primary-container/20 to-transparent pointer-events-none" />
      {/* Patron de "circuit" sutil arriba a la izquierda */}
      <div className="absolute top-0 left-0 w-72 h-72 bg-secondary/[0.04] blur-3xl rounded-full pointer-events-none" />

      <div className="relative z-10 flex flex-col md:flex-row md:justify-between md:items-center gap-8">
        <div className="max-w-2xl">
          <span className="inline-block px-3 py-1 rounded-full bg-secondary/10 text-secondary text-[10px] font-bold tracking-[0.2em] uppercase mb-4 border border-secondary/20 font-label">
            Cursada activa
          </span>
          <h1 className="text-4xl md:text-5xl font-extrabold font-headline text-on-surface tracking-tight mb-2">
            Hola, {nombre}.
          </h1>
          <p className="text-primary text-base font-medium opacity-80 mb-6 flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">school</span>
            {carrera}
          </p>

          <div className="flex flex-wrap gap-3">
            <KpiPill
              icon="play_circle"
              label="En cursada"
              valor={enCursada}
              unidad={enCursada === 1 ? "materia" : "materias"}
              color="primary"
            />
            <KpiPill
              icon="event_upcoming"
              label="Proximos"
              valor={finalesProximos ?? 0}
              unidad={
                (finalesProximos ?? 0) === 1 ? "examen" : "examenes"
              }
              color="tertiary"
              mock={finalesProximos === undefined}
            />
            <KpiPill
              icon="bolt"
              label="Cursables"
              valor={contadores.cursables}
              unidad={contadores.cursables === 1 ? "materia" : "materias"}
              color="secondary"
            />
          </div>
        </div>

        {/* Gauge circular de progreso */}
        <div className="relative w-48 h-48 flex items-center justify-center shrink-0">
          <svg
            className="w-full h-full -rotate-90"
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            aria-hidden="true"
          >
            <circle
              className="text-surface-container-highest"
              cx={SIZE / 2}
              cy={SIZE / 2}
              fill="transparent"
              r={RADIUS}
              stroke="currentColor"
              strokeWidth={STROKE}
            />
            <circle
              className="text-secondary drop-shadow-[0_0_8px_rgba(125,255,162,0.5)]"
              cx={SIZE / 2}
              cy={SIZE / 2}
              fill="transparent"
              r={RADIUS}
              stroke="currentColor"
              strokeDasharray={CIRC}
              strokeDashoffset={dashOffset}
              strokeWidth={STROKE}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="num-glow chip-secondary text-4xl font-extrabold font-headline text-on-surface">
              {porcentaje.toFixed(0)}%
            </span>
            <span className="text-[10px] text-outline uppercase font-bold tracking-widest font-label mt-1">
              Aprobadas
            </span>
            <span className="text-[10px] text-outline/60 mt-0.5 font-label">
              {contadores.aprobadas}/{contadores.total}
            </span>
            {esMock && (
              <span className="text-[8px] text-outline/40 mt-1 italic font-label">
                sin BE
              </span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

const PILL_COLORS = {
  primary: {
    icon: "text-primary",
    iconBg: "bg-primary/15 border-primary/25",
  },
  secondary: {
    icon: "text-secondary",
    iconBg: "bg-secondary/15 border-secondary/25",
  },
  tertiary: {
    icon: "text-tertiary",
    iconBg: "bg-tertiary/15 border-tertiary/25",
  },
} as const;

function KpiPill({
  icon,
  label,
  valor,
  unidad,
  color,
  mock = false,
}: {
  icon: string;
  label: string;
  valor: number;
  unidad: string;
  color: keyof typeof PILL_COLORS;
  mock?: boolean;
}) {
  const c = PILL_COLORS[color];
  return (
    <div className="bg-surface-container-high/60 backdrop-blur-sm border border-outline-variant/15 rounded-2xl px-4 py-3 flex items-center gap-3">
      <div
        className={`icon-chip chip-${color} w-10 h-10 rounded-xl flex items-center justify-center shrink-0`}
      >
        <span className={`material-symbols-outlined text-[20px] ${c.icon}`}>
          {icon}
        </span>
      </div>
      <div className="leading-tight">
        <p className="text-[9px] text-outline uppercase tracking-widest font-bold font-label">
          {label}
          {mock && <span className="ml-1 normal-case text-outline/40">(mock)</span>}
        </p>
        <p className="text-base font-bold font-headline text-on-surface">
          {valor} <span className="text-xs font-normal text-on-surface-variant">{unidad}</span>
        </p>
      </div>
    </div>
  );
}
