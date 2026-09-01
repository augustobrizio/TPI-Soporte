import { ApiError, listarEventosCalendario } from "@/lib/api";
import type { EventoCalendarioOut } from "@/lib/types";
import { CalendarioView } from "@/components/calendario/CalendarioView";
import { getUsuarioActual } from "@/lib/auth";

async function obtenerEventos(): Promise<{ eventos: EventoCalendarioOut[]; error: string | null }> {
  try {
    const eventos = await listarEventosCalendario({
      desde: "2025-01-01",
      hasta: "2027-12-31",
      carrera: "ISI",
    });
    return { eventos, error: null };
  } catch (err) {
    if (err instanceof ApiError) return { eventos: [], error: `Backend devolvió ${err.status}` };
    if (err instanceof Error) return { eventos: [], error: err.message };
    return { eventos: [], error: "Error desconocido" };
  }
}

export default async function CalendarioPage() {
  // Seccion publica (ver middleware.ts): el calendario academico se ve sin
  // cuenta. La sesion solo decide si ademas se pueden agendar eventos propios.
  const [{ eventos, error }, usuario] = await Promise.all([
    obtenerEventos(),
    getUsuarioActual(),
  ]);

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-blueprint">
      {error && (
        <div className="p-5 md:p-6 max-w-[1500px] mx-auto">
          <div className="bg-error/10 border border-error/30 rounded-2xl px-4 py-3 text-sm text-error font-medium">
            No pude traer el calendario del backend ({error}).
          </div>
        </div>
      )}
      <CalendarioView eventos={eventos} autenticado={usuario !== null} />
    </div>
  );
}
