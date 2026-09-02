import type { ComisionConProfesores } from "@/lib/types";
import { esComisionElectiva } from "@/lib/comision";
import { DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ElectivaBadge } from "./ElectivaBadge";
import { MateriaComisionRow } from "./MateriaComisionRow";
import { ComisionScore } from "./Score";

/**
 * Cuerpo del modal de una comisión: header (nombre + año + score) y el detalle
 * completo de sus materias (materia + horario + profesor) en dos columnas.
 */
/** Etiqueta y orden del cuatrimestre real del plan (materia.cuatrimestre). */
const CUATRI_LABEL: Record<string, string> = {
  "1": "1.er cuatrimestre",
  "2": "2.º cuatrimestre",
  "1 y 2": "1.º y 2.º cuatrimestre",
  anual: "Anual",
};
const CUATRI_ORDEN: Record<string, number> = { "1": 0, "2": 1, "1 y 2": 2, anual: 3 };

function cuatriLabel(cuat: string | null): string {
  return (cuat && CUATRI_LABEL[cuat]) ?? "Sin cuatrimestre";
}

export function ComisionModal({ comision }: { comision: ComisionConProfesores }) {
  const nMaterias = new Set(comision.cursadas.map((c) => c.materia_codigo)).size;
  const nProfes = new Set(
    comision.cursadas.filter((c) => c.profesor).map((c) => c.materia_codigo),
  ).size;
  const anio = (comision.nombre ?? "").match(/\d+/)?.[0] ?? null;
  const electiva = esComisionElectiva(comision.nombre);

  // Agrupar por el cuatrimestre REAL del plan (anual / 1 / 2 / "1 y 2"), no por
  // el 1/2 de la cursada — las materias anuales ya vienen deduplicadas.
  const grupos = (() => {
    const map = new Map<string | null, typeof comision.cursadas>();
    for (const c of comision.cursadas) {
      const k = c.cuatrimestre_materia ?? null;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(c);
    }
    return [...map.entries()].sort((a, b) => {
      const oa = a[0] == null ? 99 : (CUATRI_ORDEN[a[0]] ?? 98);
      const ob = b[0] == null ? 99 : (CUATRI_ORDEN[b[0]] ?? 98);
      return oa - ob;
    });
  })();

  return (
    <div className="flex max-h-[85vh] flex-col">
      {/* Header */}
      <header className="flex items-start gap-4 border-b border-outline-variant/10 px-6 pb-5 pt-6 pr-14">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
          <span className="material-symbols-outlined text-[26px] text-primary">groups</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle className="font-headline text-2xl font-extrabold leading-tight text-on-surface">
              {comision.nombre ?? "Comisión"}
            </DialogTitle>
            {anio && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-primary">
                {anio}° año
              </span>
            )}
            {electiva && <ElectivaBadge size="lg" />}
          </div>
          <DialogDescription className="mt-1 text-sm text-on-surface-variant">
            {nMaterias} {nMaterias === 1 ? "materia" : "materias"} · {nProfes} con profesor vinculado
          </DialogDescription>
        </div>
        <div className="shrink-0">
          <ComisionScore
            score={comision.score}
            conReview={comision.score_con_review}
            total={comision.score_total}
            size="lg"
          />
        </div>
      </header>

      {/* Materias, agrupadas por cuatrimestre (único contenedor scrolleable) */}
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
        {comision.cursadas.length > 0 ? (
          grupos.map(([cuat, cursadas]) => (
            <section key={cuat ?? "sin"}>
              <h4 className="mb-2.5 flex items-center gap-2 font-headline text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                {cuatriLabel(cuat)}
                <span className="font-body font-normal normal-case tracking-normal text-outline">
                  {cursadas.length} {cursadas.length === 1 ? "materia" : "materias"}
                </span>
              </h4>
              <ul className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                {cursadas.map((c) => (
                  <MateriaComisionRow key={c.id} cursada={c} />
                ))}
              </ul>
            </section>
          ))
        ) : (
          <p className="py-8 text-center text-sm text-outline italic">
            Esta comisión no tiene materias cargadas.
          </p>
        )}
      </div>

      {/* Footer: origen del puntaje */}
      <footer className="border-t border-outline-variant/10 px-6 py-3">
        <p className="flex items-center gap-1.5 text-[11px] text-outline">
          <span className="material-symbols-outlined text-[14px]">info</span>
          {comision.score !== null
            ? `Puntaje: promedio de las notas de ${comision.score_con_review} de ${comision.score_total} cátedras con reseña en UTNTAC.`
            : "Todavía no hay reseñas de las cátedras de esta comisión en UTNTAC."}
        </p>
      </footer>
    </div>
  );
}
