import { ApiError, listarComisionesConProfesores } from "@/lib/api";
import { getUsuarioActual } from "@/lib/auth";
import type { ComisionConProfesores } from "@/lib/types";
import { ComisionesView } from "@/components/comisiones/ComisionesView";

// Esta pantalla pega a `/comisiones/con-profesores`, que no pide token: es la
// oferta de comisiones de la facultad, igual para todos. Queda publica.
export default async function ComisionesPage({
  searchParams,
}: {
  // `?comision=<id>` es el deep link del buscador global: abre esa comisión
  // con el detalle desplegado.
  searchParams: Promise<{ comision?: string }>;
}) {
  const { comision: comisionParam } = await searchParams;
  let comisiones: ComisionConProfesores[] | null = null;
  let errorMsg: string | null = null;

  try {
    comisiones = await listarComisionesConProfesores();
  } catch (err) {
    if (err instanceof ApiError) {
      errorMsg = `Backend devolvió ${err.status}.`;
    } else if (err instanceof Error) {
      errorMsg = err.message;
    } else {
      errorMsg = "Error desconocido.";
    }
  }

  if (!comisiones) {
    return (
      <div className="p-8 max-w-7xl mx-auto">
        <header className="mb-8 space-y-2">
          <h1 className="text-4xl font-extrabold tracking-tight font-headline text-on-surface">
            Comisiones
          </h1>
        </header>
        <div className="bg-surface-container/40 border border-outline-variant/10 rounded-3xl p-12 flex flex-col items-center justify-center text-center min-h-[320px]">
          <div className="w-16 h-16 rounded-2xl bg-error/10 text-error flex items-center justify-center mb-5">
            <span className="material-symbols-outlined text-3xl">cloud_off</span>
          </div>
          <h2 className="text-xl font-headline font-bold text-on-surface mb-2">
            No se pudieron cargar las comisiones
          </h2>
          <p className="text-sm text-on-surface-variant max-w-md">
            {errorMsg ?? "Intentá de nuevo en unos segundos."} Verificá que el backend esté corriendo.
          </p>
        </div>
      </div>
    );
  }

  const usuario = await getUsuarioActual();
  // Un `?comision=` que no sea un número (link editado a mano, o viejo) se
  // trata como si no estuviera: la página se ve igual, sin nada abierto.
  const comisionAbierta = Number(comisionParam);
  return (
    <ComisionesView
      comisiones={comisiones}
      loggedIn={usuario != null}
      comisionAbierta={Number.isInteger(comisionAbierta) ? comisionAbierta : null}
    />
  );
}
