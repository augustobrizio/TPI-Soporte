import type { Metadata } from "next";

import { AdminNovedades } from "@/features/admin/AdminNovedades";
import { RequiereCuenta } from "@/components/RequiereCuenta";
import { getUsuarioActual } from "@/lib/auth";

export const metadata: Metadata = { title: "Moderar novedades" };

/**
 * Moderación de novedades (admin).
 *
 * La lista arranca vacía a propósito: el componente pide los datos ya montado,
 * con la sesión del navegador. Traerlos acá obligaría a duplicar la llamada de
 * admin en el servidor, y la pantalla se recarga sola después de cada cambio.
 */
export default async function AdminNovedadesPage() {
  const usuario = await getUsuarioActual();
  const esAdmin = (usuario?.rol ?? "").toLowerCase() === "admin";

  if (!esAdmin) {
    return (
      <RequiereCuenta
        titulo="Moderar novedades"
        icono="shield"
        motivo="Esta sección es para las cuentas que moderan lo que se publica."
        next="/admin/novedades"
      />
    );
  }

  return (
    <div className="mx-auto max-w-[1000px] px-6 py-10 md:px-10 md:py-14">
      <header className="mb-8">
        <p className="font-label text-[11px] uppercase tracking-[0.18em] text-[var(--shell-fg-dim)]">
          Administración
        </p>
        <h1 className="mt-1.5 font-headline text-[26px] font-extrabold tracking-tight text-[var(--shell-fg)] md:text-[30px]">
          Novedades
        </h1>
      </header>

      <AdminNovedades portadaInicial={[]} novedadesIniciales={[]} />
    </div>
  );
}
