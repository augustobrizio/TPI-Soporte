import Link from "next/link";

/**
 * Índice de secciones de la portada.
 *
 * Grilla de hairlines en vez de un mar de cards con sombra: los items se
 * separan con bordes de 1px compartidos y el hover pinta el fondo, que es
 * como se comporta la sección de novedades (la que ya funcionaba).
 */

interface Seccion {
  titulo: string;
  descripcion: string;
  icono: string;
  href: string;
  /** Marca las que piden cuenta, para que no sea una sorpresa al entrar. */
  requiereCuenta?: boolean;
}

const SECCIONES: readonly Seccion[] = [
  {
    titulo: "Novedades",
    descripcion:
      "Avisos de la facultad y de los centros de estudiantes, reunidos automáticamente.",
    icono: "campaign",
    href: "/novedades",
  },
  {
    titulo: "Profesores",
    descripcion:
      "Quién dicta qué, horarios de consulta y datos de contacto del Dpto. ISI.",
    icono: "badge",
    href: "/profesores",
  },
  {
    titulo: "Comisiones",
    descripcion:
      "La oferta completa por año, con materias, docentes y horarios de cada comisión.",
    icono: "groups",
    href: "/comisiones",
  },
  {
    titulo: "Calendario",
    descripcion:
      "Mesas, exámenes, feriados y fechas académicas del ciclo lectivo.",
    icono: "calendar_month",
    href: "/calendario",
  },
  {
    titulo: "Material",
    descripcion: "Apuntes, parciales y resúmenes compartidos por materia.",
    icono: "folder_open",
    href: "/material",
  },
  {
    titulo: "Materias",
    descripcion:
      "El árbol de correlativas marcando qué podés cursar y qué rendir.",
    icono: "account_tree",
    href: "/materias",
    requiereCuenta: true,
  },
  {
    titulo: "Horarios",
    descripcion:
      "Armá tu cursada combinando comisiones y detectá las superposiciones.",
    icono: "schedule",
    href: "/horarios",
    requiereCuenta: true,
  },
];

export function SeccionesIndex() {
  return (
    <section aria-labelledby="secciones-titulo">
      <div className="mb-8 flex items-baseline justify-between gap-4">
        <h2
          id="secciones-titulo"
          className="font-headline text-2xl font-bold tracking-tight text-[var(--shell-fg)] sm:text-3xl"
        >
          Qué vas a encontrar
        </h2>
      </div>

      {/* Bordes compartidos: se dibuja el de arriba y el de la izquierda de
          cada celda, y el contenedor cierra los de afuera. Sin esto, cada
          card necesitaría su propio borde y se ven dobles. */}
      <div className="grid grid-cols-1 overflow-hidden rounded-xl border border-[var(--shell-border)] sm:grid-cols-2 lg:grid-cols-3">
        {SECCIONES.map((s, i) => (
          <Link
            key={s.href}
            href={s.href}
            className={[
              "group relative flex flex-col gap-2 p-6 transition-colors hover:bg-[var(--shell-hover)]",
              "border-[var(--shell-border)]",
              i > 0 ? "border-t" : "",
              "sm:border-t sm:[&:nth-child(-n+2)]:border-t-0 sm:[&:nth-child(even)]:border-l",
              "lg:[&:nth-child(-n+3)]:border-t-0 lg:[&:nth-child(3n+2)]:border-l lg:[&:nth-child(3n)]:border-l lg:[&:nth-child(even)]:border-l",
            ].join(" ")}
          >
            <div className="flex items-center gap-2.5">
              <span className="material-symbols-outlined text-[20px] text-[var(--shell-accent-fg)]">
                {s.icono}
              </span>
              <h3 className="font-headline text-base font-semibold text-[var(--shell-fg)]">
                {s.titulo}
              </h3>
              {s.requiereCuenta && (
                <span className="ml-auto shrink-0 rounded-md border border-[var(--shell-border)] px-1.5 py-0.5 font-label text-[10px] uppercase tracking-wider text-[var(--shell-fg-dim)]">
                  Con cuenta
                </span>
              )}
            </div>

            <p className="text-sm leading-relaxed text-[var(--shell-fg-muted)]">
              {s.descripcion}
            </p>

            <span className="mt-auto inline-flex items-center gap-1 pt-2 font-body text-sm font-medium text-[var(--shell-accent-fg)]">
              Entrar
              <span className="material-symbols-outlined text-[16px] transition-transform duration-200 group-hover:translate-x-0.5">
                arrow_forward
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
