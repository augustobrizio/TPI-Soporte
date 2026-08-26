"use client";

/**
 * Vista de comisiones (isla cliente). Recibe todas las comisiones y las agrupa
 * por año, con un filtro por año. Cada comisión muestra sus materias con
 * profesor + horario (ver ComisionCard).
 */

import { useMemo, useState } from "react";
import type { ComisionConProfesores } from "@/lib/types";
import { MisResenasProvider } from "@/components/resenas/MisResenasProvider";
import { ComisionCard } from "./ComisionCard";

/**
 * Año de carrera de una comisión, derivado del nombre (ej. "1K01" → 1,
 * "3EK02" → 3). `Comision.anio` guarda el año académico (2025), no el de
 * carrera, así que para segmentar usamos el número inicial del nombre.
 */
function anioDeComision(c: ComisionConProfesores): number | null {
  const m = (c.nombre ?? "").match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

export function ComisionesView({
  comisiones,
  loggedIn = false,
}: {
  comisiones: ComisionConProfesores[];
  loggedIn?: boolean;
}) {
  const anios = useMemo(() => {
    const s = new Set<number>();
    for (const c of comisiones) {
      const a = anioDeComision(c);
      if (a != null) s.add(a);
    }
    return [...s].sort((a, b) => a - b);
  }, [comisiones]);

  const [anioSel, setAnioSel] = useState<number | null>(null); // null = todos

  const grupos = useMemo(() => {
    const filtradas =
      anioSel == null ? comisiones : comisiones.filter((c) => anioDeComision(c) === anioSel);
    const map = new Map<number | null, ComisionConProfesores[]>();
    for (const c of filtradas) {
      const k = anioDeComision(c);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(c);
    }
    return [...map.entries()].sort((a, b) => {
      if (a[0] == null) return 1;
      if (b[0] == null) return -1;
      return a[0] - b[0];
    });
  }, [comisiones, anioSel]);

  const vacio = comisiones.length === 0;

  return (
    <MisResenasProvider loggedIn={loggedIn}>
    <div className="p-8 max-w-7xl mx-auto">
      <header className="glow-band glow-tertiary bg-surface-container border border-outline-variant/10 rounded-3xl p-6 md:p-7 mb-6 space-y-2">
        <h1 className="text-4xl font-extrabold tracking-tight font-headline text-on-surface">
          Comisiones
        </h1>
        <p className="text-on-surface-variant text-sm">
          {vacio
            ? "Comisiones de la carrera por año"
            : `${comisiones.length} comisiones · materias, profesores y horarios`}
        </p>
      </header>

      {!vacio && anios.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          <FiltroAnio label="Todos" activo={anioSel == null} onClick={() => setAnioSel(null)} />
          {anios.map((a) => (
            <FiltroAnio
              key={a}
              label={`${a}° año`}
              activo={anioSel === a}
              onClick={() => setAnioSel(a)}
            />
          ))}
        </div>
      )}

      {vacio ? (
        <EstadoVacio
          titulo="Todavía no hay comisiones"
          detalle="No hay comisiones cargadas para mostrar."
        />
      ) : (
        <div className="space-y-8">
          {grupos.map(([anio, coms]) => (
            <section key={anio ?? "sin"}>
              <h2 className="sec-title chip-tertiary text-sm font-headline font-bold text-on-surface-variant uppercase tracking-wider mb-3">
                {anio != null ? `${anio}° año` : "Sin año"}
                <span className="ml-2 text-outline font-body font-normal normal-case tracking-normal">
                  {coms.length}
                </span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {coms.map((c) => (
                  <ComisionCard key={c.id} comision={c} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
    </MisResenasProvider>
  );
}

function FiltroAnio({
  label,
  activo,
  onClick,
}: {
  label: string;
  activo: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors border",
        activo
          ? "bg-primary/15 text-primary border-primary/30"
          : "bg-surface-container/60 text-on-surface-variant border-outline-variant/15 hover:text-on-surface hover:bg-surface-container-high",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function EstadoVacio({ titulo, detalle }: { titulo: string; detalle: string }) {
  return (
    <div className="card-3d glow-card glow-tertiary bg-surface-container/40 border border-outline-variant/10 rounded-3xl p-12 flex flex-col items-center justify-center text-center min-h-[320px]">
      <div className="icon-chip chip-tertiary w-16 h-16 rounded-2xl text-tertiary flex items-center justify-center mb-5">
        <span className="material-symbols-outlined text-3xl">groups</span>
      </div>
      <h2 className="text-xl font-headline font-bold text-on-surface mb-2">{titulo}</h2>
      <p className="text-sm text-on-surface-variant max-w-md">{detalle}</p>
    </div>
  );
}
