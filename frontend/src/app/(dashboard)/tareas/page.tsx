import { ApiError, getComisionesCursables, listarTareas } from "@/lib/api";
import type { MateriaCursableOut, TaskOut } from "@/lib/types";
import { TareasView, type MateriaLite } from "@/features/tareas/TareasView";

async function obtenerTareas(): Promise<{ tareas: TaskOut[]; error: string | null }> {
  try {
    const tareas = await listarTareas(1);
    return { tareas, error: null };
  } catch (err) {
    if (err instanceof ApiError) return { tareas: [], error: `Backend devolvió ${err.status}` };
    if (err instanceof Error) return { tareas: [], error: err.message };
    return { tareas: [], error: "Error desconocido" };
  }
}

/**
 * Materias que el alumno está cursando = las que tienen una cursada seleccionada
 * en el armador de Horarios (cruzando ambos cuatrimestres del año académico).
 */
async function obtenerMateriasCursando(): Promise<MateriaLite[]> {
  const [m1, m2] = await Promise.all([
    getComisionesCursables(1, 2025, 1).catch((): MateriaCursableOut[] => []),
    getComisionesCursables(1, 2025, 2).catch((): MateriaCursableOut[] => []),
  ]);
  const map = new Map<string, MateriaLite>();
  for (const m of [...m1, ...m2]) {
    if (m.cursada_seleccionada_id != null && !map.has(m.materia_codigo)) {
      map.set(m.materia_codigo, {
        codigo: m.materia_codigo,
        nombre: m.materia_nombre,
        anio: m.anio_carrera,
      });
    }
  }
  return [...map.values()].sort(
    (a, b) => (a.anio ?? 99) - (b.anio ?? 99) || a.codigo.localeCompare(b.codigo),
  );
}

export default async function TareasPage() {
  const [{ tareas, error }, materias] = await Promise.all([
    obtenerTareas(),
    obtenerMateriasCursando(),
  ]);

  return (
    <div style={{ height: "calc(100vh - 4rem)" }} className="bg-blueprint overflow-hidden">
      {error && (
        <div className="p-5 md:p-6 max-w-3xl mx-auto">
          <div className="bg-error/10 border border-error/30 rounded-2xl px-4 py-3 text-sm text-error font-medium">
            No pude traer las tareas del backend ({error}).
          </div>
        </div>
      )}
      <TareasView initialTareas={tareas} materias={materias} />
    </div>
  );
}
