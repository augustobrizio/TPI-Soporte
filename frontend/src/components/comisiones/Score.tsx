/**
 * Score de comisión y nota por cátedra — dato REAL desde el backend (reviews de
 * UTNTAC, feature 003). Reemplaza al viejo ScoreMock.
 *
 * - `ComisionScore`: promedio de las cátedras con reseña + cobertura (N/M).
 * - `NotaCatedra`: nota 1–5 de un (profesor, materia) + clasificación + #reseñas.
 *
 * La nota se colorea por banda: verde (≥4) · ámbar (3–4) · rojo (<3), acorde a
 * la semántica de UTNTAC ("Super Recomendado" … "Evitar").
 */

type Banda = { text: string; chip: string };

function notaBanda(n: number): Banda {
  if (n >= 4) return { text: "text-secondary", chip: "border-secondary/25 bg-secondary/15" };
  if (n >= 3) return { text: "text-tertiary", chip: "border-tertiary/25 bg-tertiary/15" };
  return { text: "text-error", chip: "border-error/25 bg-error/10" };
}

/** Score a nivel comisión (usado en la card y en el header del modal). */
export function ComisionScore({
  score,
  conReview,
  total,
  size = "sm",
}: {
  score: number | null;
  conReview: number;
  total: number;
  size?: "sm" | "lg";
}) {
  const lg = size === "lg";

  // `== null` cubre null y undefined (respuestas viejas cacheadas sin el campo).
  if (score == null) {
    return (
      <span
        title="Todavía no hay reseñas de las cátedras de esta comisión"
        className={[
          "inline-flex shrink-0 items-center gap-1 rounded-lg border border-outline-variant/20 bg-surface-container-high font-medium text-outline",
          lg ? "px-2.5 py-1.5 text-xs" : "px-2 py-1 text-[11px]",
        ].join(" ")}
      >
        <span className={`material-symbols-outlined ${lg ? "text-[17px]" : "text-[14px]"}`}>
          star
        </span>
        sin reseñas
      </span>
    );
  }

  const b = notaBanda(score);
  return (
    <span
      title={`Promedio de ${conReview} de ${total} ${total === 1 ? "cátedra" : "cátedras"} con reseña (UTNTAC)`}
      className={[
        "inline-flex shrink-0 items-center gap-1 rounded-lg border font-semibold",
        b.chip,
        b.text,
        lg ? "px-2.5 py-1.5 text-base" : "px-2 py-1 text-xs",
      ].join(" ")}
    >
      <span
        className={`material-symbols-outlined ${lg ? "text-[19px]" : "text-[15px]"}`}
        style={{ fontVariationSettings: "'FILL' 1" }}
      >
        star
      </span>
      {score.toFixed(1)}
      <span className={`font-semibold opacity-60 ${lg ? "ml-1 text-[11px]" : "ml-0.5 text-[10px]"}`}>
        {conReview}/{total}
      </span>
    </span>
  );
}

/** Nota de una cátedra (profesor×materia), con clasificación y #reseñas. */
export function NotaCatedra({
  nota,
  clasificacion,
  cantidad,
}: {
  nota: number;
  clasificacion: string | null;
  cantidad: number | null;
}) {
  const b = notaBanda(nota);
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px]">
      <span
        className={`inline-flex items-center gap-0.5 rounded-md border px-1.5 py-0.5 font-bold ${b.chip} ${b.text}`}
      >
        <span
          className="material-symbols-outlined text-[12px]"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          star
        </span>
        {nota.toFixed(1)}
      </span>
      {clasificacion && <span className={`font-semibold ${b.text}`}>{clasificacion}</span>}
      {cantidad != null && (
        <span className="text-outline">
          · {cantidad} {cantidad === 1 ? "reseña" : "reseñas"}
        </span>
      )}
    </div>
  );
}
