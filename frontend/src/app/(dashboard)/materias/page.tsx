import { ApiError, getGrafo } from "@/lib/api";
import type { GrafoResponse, TipoMateria } from "@/lib/types";
import { MateriasGraphView } from "@/components/materias/MateriasGraphView";
import { GrafoErrorState } from "@/components/materias/GrafoErrorState";

interface PageProps {
  searchParams: Promise<{ tipo?: string; usuario_id?: string }>;
}

export default async function MateriasPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const tipo: TipoMateria = params.tipo === "electiva" ? "electiva" : "troncal";

  let grafo: GrafoResponse | null = null;
  let errorMsg: string | null = null;

  try {
    grafo = await getGrafo({ tipo });
  } catch (err) {
    if (err instanceof ApiError) {
      errorMsg = `Backend devolvio ${err.status}.`;
    } else if (err instanceof Error) {
      errorMsg = err.message;
    } else {
      errorMsg = "Error desconocido.";
    }
  }

  if (!grafo) {
    return <GrafoErrorState mensaje={errorMsg ?? "No se pudo cargar el grafo."} />;
  }

  // key={tipo} fuerza remount limpio al cambiar de pestaña
  return <MateriasGraphView key={tipo} grafo={grafo} tipo={tipo} />;
}
