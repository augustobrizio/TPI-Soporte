"use client";

import { useState } from "react";

import { enviarFeedback } from "@/lib/api";

const MOTIVOS = [
  "Información incorrecta",
  "Información desactualizada",
  "No respondió mi pregunta",
  "Falta información",
] as const;

/**
 * Acciones bajo una respuesta: 👍 útil / 👎 no útil / 📋 copiar / 🔄 regenerar.
 * En 👎 se pide el motivo. El voto se guarda en el backend por mensaje.
 *
 * `onRegenerar` es opcional: sólo se pasa en la última respuesta del hilo (no
 * tiene sentido regenerar una del medio).
 */
export function FeedbackBar({
  mensajeId,
  texto,
  onRegenerar,
}: {
  mensajeId: number;
  texto: string;
  onRegenerar?: () => void;
}) {
  const [voto, setVoto] = useState<"util" | "no-util" | null>(null);
  const [pidiendoMotivo, setPidiendoMotivo] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const votar = async (util: boolean, motivo?: string) => {
    setVoto(util ? "util" : "no-util");
    setPidiendoMotivo(false);
    try {
      await enviarFeedback(mensajeId, util, motivo);
    } catch {
      /* feedback best-effort: no molestamos al usuario si falla */
    }
  };

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      /* algunos navegadores bloquean clipboard sin gesto/https */
    }
  };

  const btn =
    "flex h-7 w-7 items-center justify-center rounded-lg text-outline transition hover:bg-surface-container-high hover:text-on-surface";

  return (
    <div className="mt-2">
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => votar(true)}
          className={`${btn} ${voto === "util" ? "text-secondary" : ""}`}
          aria-label="Respuesta útil"
          aria-pressed={voto === "util"}
          title="Útil"
        >
          <span className="material-symbols-outlined text-[16px]">thumb_up</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setVoto("no-util");
            setPidiendoMotivo(true);
          }}
          className={`${btn} ${voto === "no-util" ? "text-error" : ""}`}
          aria-label="Respuesta no útil"
          aria-pressed={voto === "no-util"}
          title="No útil"
        >
          <span className="material-symbols-outlined text-[16px]">thumb_down</span>
        </button>
        <button
          type="button"
          onClick={copiar}
          className={btn}
          aria-label="Copiar respuesta"
          title="Copiar"
        >
          <span className="material-symbols-outlined text-[16px]">
            {copiado ? "check" : "content_copy"}
          </span>
        </button>
        {onRegenerar && (
          <button
            type="button"
            onClick={onRegenerar}
            className={btn}
            aria-label="Regenerar respuesta"
            title="Regenerar"
          >
            <span className="material-symbols-outlined text-[16px]">refresh</span>
          </button>
        )}
        {voto === "util" && (
          <span className="ml-1 text-xs text-outline/70">¡Gracias!</span>
        )}
      </div>

      {pidiendoMotivo && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {MOTIVOS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => votar(false, m)}
              className="rounded-full border border-outline-variant/20 px-2.5 py-1 text-[11px] text-on-surface-variant transition hover:border-error/40 hover:text-on-surface"
            >
              {m}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
