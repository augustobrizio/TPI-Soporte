import Link from "next/link";

interface Atajo {
  href: string;
  icon: string;
  label: string;
  color: "primary" | "secondary" | "tertiary" | "neutral";
  externo?: boolean;
}

const ATAJOS: readonly Atajo[] = [
  { href: "/horarios", icon: "schedule", label: "Horarios", color: "primary" },
  { href: "/materias", icon: "account_tree", label: "Correlativas", color: "secondary" },
  { href: "/calendario", icon: "calendar_month", label: "Calendario", color: "tertiary" },
  { href: "/profesores", icon: "badge", label: "Profesores", color: "primary" },
  { href: "/novedades", icon: "campaign", label: "Novedades", color: "secondary" },
  {
    href: "https://campus.frro.utn.edu.ar",
    icon: "open_in_new",
    label: "Campus virtual",
    color: "neutral",
    externo: true,
  },
] as const;

const COLORS = {
  primary: { icon: "text-primary", hover: "hover:border-primary/50" },
  secondary: { icon: "text-secondary", hover: "hover:border-secondary/50" },
  tertiary: { icon: "text-tertiary", hover: "hover:border-tertiary/50" },
  neutral: { icon: "text-on-surface-variant", hover: "hover:border-on-surface/40" },
} as const;

/**
 * Banda inferior con accesos directos a las secciones mas usadas.
 * Cada tile imita el "node card" del DESIGN.md (radius xl, glow al hover).
 */
export function AtajosToolbox() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
      {ATAJOS.map((a) => (
        <AtajoTile key={a.label} atajo={a} />
      ))}
    </div>
  );
}

function AtajoTile({ atajo }: { atajo: Atajo }) {
  const c = COLORS[atajo.color];
  const inner = (
    <>
      <span
        className={`material-symbols-outlined text-3xl mb-2 block group-hover:scale-110 transition-transform ${c.icon}`}
      >
        {atajo.icon}
      </span>
      <p className="text-[10px] font-bold uppercase tracking-widest text-outline group-hover:text-on-surface font-label transition-colors">
        {atajo.label}
      </p>
    </>
  );

  const glow = atajo.color === "neutral" ? "" : `glow-card glow-${atajo.color}`;
  const className = `card-3d card-lift ${glow} p-4 bg-surface-container rounded-2xl border border-outline-variant/10 ${c.hover} transition-all cursor-pointer text-center group block`;

  if (atajo.externo) {
    return (
      <a
        href={atajo.href}
        target="_blank"
        rel="noreferrer"
        className={className}
      >
        {inner}
      </a>
    );
  }
  return (
    <Link href={atajo.href} className={className}>
      {inner}
    </Link>
  );
}
