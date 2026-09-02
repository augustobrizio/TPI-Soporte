"use client";

import { useState } from "react";

import type { ChatPaso } from "@/lib/api";

/**
 * Muestra los "pasos" del agente (las tools que fue usando) mientras responde.
 *
 * Durante el stream la lista está expandida y el último paso gira (está en
 * curso) hasta que empiezan a llegar tokens de la respuesta: ahí el agente ya
 * dejó de buscar y está redactando, así que todos los pasos quedan como hechos.
 * Cuando termina, se colapsa a un resumen "Razonó N pasos" que se puede abrir.
 */
export function AgentSteps({
  pasos,
  streaming,
  tieneTexto,
}: {
  pasos: ChatPaso[];
  streaming: boolean;
  tieneTexto: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  if (pasos.length === 0) return null;

  // El último paso está "en curso" sólo mientras no haya arrancado la redacción.
  const enCurso = streaming && !tieneTexto;
  // Mientras stremea siempre expandido; ya terminado, según el toggle.
  const expandido = streaming || abierto;

  return (
    <div className="mb-2">
      {streaming ? (
        <div className="flex items-center gap-1.5 px-1.5 py-1 text-[11px] font-medium text-outline">
          <span className="material-symbols-outlined animate-pulse text-[15px] text-primary">
            bolt
          </span>
          Pensando…
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAbierto((o) => !o)}
          className="flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-[11px] font-medium text-outline transition hover:text-on-surface-variant"
          aria-expanded={expandido}
        >
          <span className="material-symbols-outlined text-[15px] text-primary">
            bolt
          </span>
          Razonó {pasos.length} {pasos.length === 1 ? "paso" : "pasos"}
          <span
            className={`material-symbols-outlined text-[15px] transition-transform ${
              expandido ? "rotate-180" : ""
            }`}
          >
            expand_more
          </span>
        </button>
      )}

      {expandido && (
        <ul className="mt-1 space-y-1 border-l border-outline-variant/20 pl-3">
          {pasos.map((p, i) => {
            const spinner = enCurso && i === pasos.length - 1;
            return (
              <li
                key={`${p.tool}-${i}`}
                className="flex items-center gap-2 text-xs text-on-surface-variant"
              >
                <span
                  className={`material-symbols-outlined text-[14px] ${
                    spinner ? "animate-spin text-primary" : "text-tertiary"
                  }`}
                >
                  {spinner ? "progress_activity" : "check_circle"}
                </span>
                {p.label}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
