"use client";

import { useState } from "react";

import type { ChatFuente } from "@/lib/api";

/**
 * Fuentes en las que se basó una respuesta (RNF-12): nombre, fecha de
 * actualización cuando se conoce, y enlace "Ver fuente" para comprobarlo.
 */
export function SourcesPopover({ fuentes }: { fuentes: ChatFuente[] }) {
  const [abierto, setAbierto] = useState(false);
  if (!fuentes.length) return null;

  return (
    <div className="mt-3 border-t border-outline-variant/10 pt-2">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex items-center gap-1 font-label text-[11px] uppercase tracking-widest text-outline transition hover:text-on-surface"
      >
        <span className="material-symbols-outlined text-[14px]">
          {abierto ? "expand_less" : "expand_more"}
        </span>
        {fuentes.length} {fuentes.length === 1 ? "fuente" : "fuentes"} consultada
        {fuentes.length === 1 ? "" : "s"}
      </button>

      {abierto && (
        <ul className="mt-2 space-y-1.5">
          {fuentes.map((f, i) => (
            <li
              key={i}
              className="card-3d rounded-lg border border-outline-variant/10 bg-surface-container-lowest p-2 text-xs"
            >
              <div className="flex items-start gap-1.5">
                <span className="text-outline/70">[{i + 1}]</span>
                <span className="font-medium text-on-surface">
                  {f.titulo ?? f.fuente}
                </span>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 pl-5 text-outline/70">
                {f.fecha && <span>Actualizado: {f.fecha}</span>}
                {f.url && (
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 text-primary hover:underline"
                  >
                    Ver fuente
                    <span className="material-symbols-outlined text-[13px]">
                      open_in_new
                    </span>
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
