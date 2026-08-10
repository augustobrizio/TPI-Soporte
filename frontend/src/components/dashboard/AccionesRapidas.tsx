import Link from "next/link";

interface Accion {
  href: string;
  icon: string;
  label: string;
  color: "primary" | "secondary" | "tertiary";
}

const ACCIONES: readonly Accion[] = [
  {
    href: "/horarios",
    icon: "schedule",
    label: "Armar mis horarios",
    color: "primary",
  },
  {
    href: "/materias",
    icon: "account_tree",
    label: "Actualizar mi cursada",
    color: "secondary",
  },
  {
    href: "/profesores",
    icon: "star",
    label: "Calificar a un profesor",
    color: "tertiary",
  },
] as const;

const COLORS = {
  primary: "text-primary",
  secondary: "text-secondary",
  tertiary: "text-tertiary",
} as const;

/**
 * Lista de accesos rapidos a flujos secundarios (calificar, registrar
 * cursada, ver novedades). Reemplaza al "Quick Contributions Hub" del
 * Stitch, adaptado a las features que el proyecto si tiene previstas.
 */
export function AccionesRapidas() {
  return (
    <div className="bg-surface-container rounded-3xl p-6 border border-outline-variant/10 h-full">
      <h3 className="text-lg font-bold font-headline text-on-surface mb-5">
        Acciones rapidas
      </h3>
      <div className="space-y-3">
        {ACCIONES.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="w-full flex items-center gap-4 p-4 rounded-2xl bg-surface-container-high hover:bg-surface-bright transition-all border border-outline-variant/10 group"
          >
            <span
              className={`material-symbols-outlined text-[22px] ${COLORS[a.color]} group-hover:scale-110 transition-transform`}
            >
              {a.icon}
            </span>
            <span className="text-sm font-medium font-body text-on-surface flex-1">
              {a.label}
            </span>
            <span className="material-symbols-outlined text-[16px] text-outline/40 group-hover:text-outline/80 group-hover:translate-x-0.5 transition-all">
              arrow_forward
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
