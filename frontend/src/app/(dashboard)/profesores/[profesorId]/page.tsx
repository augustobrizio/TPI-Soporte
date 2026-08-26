import Link from "next/link";
import { ApiError, getProfesorDetalle } from "@/lib/api";
import { getUsuarioActual } from "@/lib/auth";
import type { ProfesorDetalleOut } from "@/lib/types";
import { ProfesorDetalle } from "@/components/profesores/ProfesorDetalle";

interface PageProps {
  params: Promise<{ profesorId: string }>;
}

export default async function ProfesorDetallePage({ params }: PageProps) {
  const { profesorId } = await params;
  const id = Number(profesorId);

  let detalle: ProfesorDetalleOut | null = null;
  let noEncontrado = false;
  let errorMsg: string | null = null;

  if (!Number.isFinite(id)) {
    noEncontrado = true;
  } else {
    try {
      detalle = await getProfesorDetalle(id);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        noEncontrado = true;
      } else if (err instanceof ApiError) {
        errorMsg = `Backend devolvió ${err.status}.`;
      } else if (err instanceof Error) {
        errorMsg = err.message;
      } else {
        errorMsg = "Error desconocido.";
      }
    }
  }

  if (noEncontrado || errorMsg) {
    return (
      <div className="p-8 max-w-5xl mx-auto">
        <Link
          href="/profesores"
          className="inline-flex items-center gap-1.5 text-sm text-on-surface-variant hover:text-on-surface transition-colors mb-6"
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          Volver a profesores
        </Link>
        <div className="bg-surface-container/40 border border-outline-variant/10 rounded-3xl p-12 flex flex-col items-center justify-center text-center min-h-[320px]">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-5">
            <span className="material-symbols-outlined text-3xl">
              {noEncontrado ? "person_off" : "cloud_off"}
            </span>
          </div>
          <h2 className="text-xl font-headline font-bold text-on-surface mb-2">
            {noEncontrado ? "Profesor no encontrado" : "No se pudo cargar el profesor"}
          </h2>
          <p className="text-sm text-on-surface-variant max-w-md">
            {noEncontrado
              ? "El profesor que buscás no existe o fue removido del directorio."
              : errorMsg}
          </p>
        </div>
      </div>
    );
  }

  const usuario = await getUsuarioActual();
  return <ProfesorDetalle detalle={detalle!} loggedIn={usuario != null} />;
}
