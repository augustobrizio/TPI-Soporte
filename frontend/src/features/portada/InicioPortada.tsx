"use client";

import { useState } from "react";
import { HelpCircle } from "lucide-react";

import type { SemanaCursada } from "@/lib/types";
import { Bienvenida } from "./Bienvenida";
import { PanelSemanal } from "@/features/panel-semanal/PanelSemanal";

/** Un año: la explicación no cambia, y quien vuelve en marzo ya la vio. */
const COOKIE_BIENVENIDA = "utnhub_bienvenida";
const UN_ANIO = 60 * 60 * 24 * 365;

/**
 * Lo primero de la portada: la semana de cursada, con la bienvenida encima la
 * primera vez.
 *
 * Quién ve el popup lo decide el servidor (`yaVioBienvenida`, leído de la
 * cookie) y no el cliente: con `localStorage` el servidor mandaría siempre la
 * bienvenida y el visitante recurrente la vería aparecer y desaparecer en el
 * hydrate, en cada visita. La cookie no es httpOnly a propósito — es una
 * preferencia de vista, no una credencial, y así el botón la escribe sin
 * pedirle nada al servidor.
 */
export function InicioPortada({
  semana,
  autenticado,
  yaVioBienvenida,
}: {
  semana: SemanaCursada | null;
  autenticado: boolean;
  yaVioBienvenida: boolean;
}) {
  const [bienvenidaAbierta, setBienvenidaAbierta] = useState(!yaVioBienvenida);

  function cerrar() {
    document.cookie = `${COOKIE_BIENVENIDA}=1; path=/; max-age=${UN_ANIO}; SameSite=Lax`;
    setBienvenidaAbierta(false);
  }

  return (
    <div className="space-y-3">
      {semana ? (
        // `key`: si el servidor manda otra semana (p. ej. cambia el día), el
        // panel se remonta con ella en vez de quedarse en la que el visitante
        // había navegado. Un efecto que resincronice pisaría la navegación.
        <PanelSemanal key={semana.lunes} inicial={semana} />
      ) : (
        <p className="rounded-xl border border-[var(--shell-border)] bg-[var(--shell-panel)] px-5 py-8 text-center text-sm text-[var(--shell-fg-muted)]">
          No pude traer la semana del calendario.
        </p>
      )}

      <button
        onClick={() => setBienvenidaAbierta(true)}
        className="inline-flex items-center gap-1.5 font-body text-xs text-[var(--shell-fg-dim)] transition-colors hover:text-[var(--shell-fg-muted)]"
      >
        <HelpCircle className="h-3.5 w-3.5" strokeWidth={2} />
        ¿Qué es UTNHub?
      </button>

      <Bienvenida
        abierta={bienvenidaAbierta}
        onCerrar={cerrar}
        autenticado={autenticado}
      />
    </div>
  );
}
