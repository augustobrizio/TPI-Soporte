"use client";

// Preguntas de seguimiento genéricas pero útiles: atajos para seguir la charla
// sin tener que escribir. Aparecen sólo bajo la última respuesta del asistente.
const SEGUIMIENTOS = [
  "¿Cuándo son las próximas mesas de examen?",
  "¿Qué necesito para inscribirme?",
  "¿Dónde lo consulto de forma oficial?",
] as const;

/** Chips para seguir preguntando, bajo la última respuesta del asistente. */
export function SugerenciasSeguimiento({
  onElegir,
}: {
  onElegir: (pregunta: string) => void;
}) {
  return (
    <div className="pl-11">
      <p className="mb-1.5 flex items-center gap-1 font-label text-[10px] uppercase tracking-widest text-outline">
        <span className="material-symbols-outlined text-[13px]">
          quiz
        </span>
        Seguir preguntando
      </p>
      <div className="flex flex-wrap gap-2">
        {SEGUIMIENTOS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onElegir(s)}
            className="rounded-full border border-outline-variant/20 bg-surface-container px-3 py-1.5 text-xs text-on-surface-variant transition hover:border-primary/40 hover:text-on-surface"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
