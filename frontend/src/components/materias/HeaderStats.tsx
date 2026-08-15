import type { ContadoresGrafo } from "@/lib/types";

// Paleta semántica por tipo de KPI
const KPI_COLORS = {
  green:  { icon: "text-secondary/70",          value: "text-secondary",          ac: "chip-secondary" },
  amber:  { icon: "text-tertiary/70",            value: "text-tertiary",           ac: "chip-tertiary"  },
  blue:   { icon: "text-primary/70",             value: "text-primary",            ac: "chip-primary"   },
  muted:  { icon: "text-on-surface-variant/50",  value: "text-on-surface-variant", ac: ""               },
} as const;

type KpiColor = keyof typeof KPI_COLORS;

function KpiItem({
  icon,
  label,
  value,
  total,
  color,
  filled = false,
}: {
  icon: string;
  label: string;
  value: number | string;
  total?: number;
  color: KpiColor;
  filled?: boolean;
}) {
  const c = KPI_COLORS[color];
  return (
    <div className="flex flex-col items-center justify-center px-4 py-3 min-w-[68px] gap-0.5">
      <span
        className={`material-symbols-outlined text-[18px] ${c.icon} ${filled ? "material-symbols-filled" : ""}`}
      >
        {icon}
      </span>
      <p className={`text-lg font-black font-headline leading-none ${c.value} ${c.ac} ${color === "muted" ? "" : "num-glow"}`}>
        {value}
        {total !== undefined && (
          <span className="text-xs font-normal text-on-surface-variant/40 ml-0.5">/{total}</span>
        )}
      </p>
      <p className="text-[9px] uppercase tracking-widest text-outline/60 font-bold font-label leading-none">
        {label}
      </p>
    </div>
  );
}

function Divider() {
  return <div className="rule-fade-v self-stretch my-2" />;
}

export function HeaderStats({ contadores }: { contadores: ContadoresGrafo }) {
  const creditosOk = contadores.creditos_electivas >= contadores.meta_creditos_electivas;

  return (
    <div className="card-3d flex items-stretch bg-surface-container rounded-2xl border border-outline-variant/15 overflow-hidden shrink-0">
      {/* Aprobadas → verde */}
      <KpiItem icon="check_circle" label="Aprobadas" value={contadores.aprobadas} total={contadores.total} color="green" filled />
      <Divider />
      {/* Regulares → ámbar */}
      <KpiItem icon="schedule" label="Regulares" value={contadores.regulares} color="amber" />
      <Divider />
      {/* Cursando → azul */}
      <KpiItem icon="play_circle" label="Cursando" value={contadores.cursando} color="blue" />
      <Divider />
      {/* Cursables → gris neutro (potencial, no logro) */}
      <KpiItem icon="bolt" label="Cursables" value={contadores.cursables} color="muted" />
      <Divider />
      {/* Progreso → dinámico según % */}
      <KpiItem icon="percent" label="Progreso" value={`${contadores.porcentaje_aprobadas.toFixed(1)}%`} color="green" />
      {contadores.carga_horaria_cursando > 0 && (
        <>
          <Divider />
          <KpiItem icon="timer" label="Hs. cursando" value={`${contadores.carga_horaria_cursando}h`} color="blue" />
        </>
      )}
      <Divider />
      {/* Electivas → verde si completó, ámbar si faltan */}
      <KpiItem
        icon="stars"
        label="Electivas"
        value={contadores.creditos_electivas}
        total={contadores.meta_creditos_electivas}
        color={creditosOk ? "green" : "amber"}
        filled={creditosOk}
      />
    </div>
  );
}
