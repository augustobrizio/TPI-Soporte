"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { NovedadOut } from "@/lib/types";
import { NovedadDetail } from "./NovedadDetail";

/**
 * Abre el detalle de una novedad puntual al entrar por `?novedad=<id>`.
 *
 * Existe porque las novedades se leen en un modal y el modal vivía dentro de
 * cada tarjeta, sin URL propia: no había forma de linkear a una. El buscador
 * global y la campana necesitan justamente eso.
 *
 * Al cerrar se saca el parámetro de la URL con `replace` (no `push`): si
 * quedara en el historial, el "atrás" del navegador reabriría el modal que el
 * usuario acaba de cerrar.
 */
export function NovedadDeepLink({
  novedad,
  hrefAlCerrar,
}: {
  novedad: NovedadOut;
  /** URL de la portada sin el `?novedad=`, conservando el filtro por centro. */
  hrefAlCerrar: string;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(true);

  return (
    <NovedadDetail
      novedad={novedad}
      open={abierto}
      onOpenChange={(v) => {
        setAbierto(v);
        if (!v) router.replace(hrefAlCerrar, { scroll: false });
      }}
    />
  );
}
