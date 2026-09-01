"use client";

import type { FichaMateria } from "@/lib/api";

/**
 * Tarjeta académica de una materia (§19): datos + correlativas + acciones.
 * Las acciones disparan preguntas de seguimiento en el mismo chat.
 */
export function FichaMateriaCard({
  ficha,
  onAccion,
}: {
  ficha: FichaMateria;
  onAccion: (pregunta: string) => void;
}) {
  return (
    <div className="card-3d glow-card glow-primary mt-3 overflow-hidden rounded-2xl border border-outline-variant/10 bg-surface-container">
      <div className="flex items-start gap-3 border-b border-outline-variant/10 p-3">
        <span className="icon-chip chip-primary mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-primary">
          <span className="material-symbols-outlined text-[20px]">book_2</span>
        </span>
        <div className="min-w-0">
          <p className="font-headline text-sm font-bold text-on-surface">
            {ficha.nombre}
          </p>
          <p className="text-xs text-outline">
            {ficha.carrera ?? "UTN FRRO"} · código {ficha.codigo}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-2 p-3 text-xs sm:grid-cols-3">
        {ficha.anio != null && (
          <Dato label="Año" valor={`${ficha.anio}º`} />
        )}
        {ficha.cuatrimestre && (
          <Dato label="Cuatrimestre" valor={ficha.cuatrimestre} />
        )}
        {ficha.tipo && <Dato label="Tipo" valor={ficha.tipo} />}
      </div>

      {ficha.correlativas.length > 0 && (
        <div className="px-3 pb-3">
          <p className="mb-1 font-label text-[10px] uppercase tracking-widest text-outline">
            Correlativas
          </p>
          <ul className="space-y-0.5">
            {ficha.correlativas.map((c) => (
              <li key={c.nombre} className="flex items-center gap-1.5 text-xs">
                <span className="text-on-surface-variant">{c.nombre}</span>
                <span className="rounded-full border border-outline-variant/20 px-1.5 py-0.5 text-[10px] text-outline">
                  {c.tipo}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 border-t border-outline-variant/10 p-2">
        <Accion
          onClick={() =>
            onAccion(`¿Ya puedo cursar ${ficha.nombre}?`)
          }
          icon="rule"
          label="¿Puedo cursarla?"
        />
        <Accion
          onClick={() =>
            onAccion(`¿En qué horarios y comisiones se cursa ${ficha.nombre}?`)
          }
          icon="schedule"
          label="Ver horarios"
        />
        <Accion
          onClick={() =>
            onAccion(`¿Cuándo son las mesas de examen de ${ficha.nombre}?`)
          }
          icon="event"
          label="Ver fechas"
        />
      </div>
    </div>
  );
}

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <p className="font-label text-[10px] uppercase tracking-widest text-outline">
        {label}
      </p>
      <p className="text-on-surface">{valor}</p>
    </div>
  );
}

function Accion({
  onClick,
  icon,
  label,
}: {
  onClick: () => void;
  icon: string;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-on-surface-variant transition hover:bg-surface-container hover:text-on-surface"
    >
      <span className="material-symbols-outlined text-[15px]">{icon}</span>
      {label}
    </button>
  );
}
