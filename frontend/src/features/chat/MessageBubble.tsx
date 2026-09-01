"use client";

import { FeedbackBar } from "./FeedbackBar";
import { FichaMateriaCard } from "./FichaMateriaCard";
import { Markdown } from "./Markdown";
import type { MensajeChat } from "./useChat";
import { SourcesPopover } from "./SourcesPopover";

/** Una burbuja de mensaje: usuario (derecha) o asistente (izquierda). */
export function MessageBubble({
  mensaje,
  onAccion,
}: {
  mensaje: MensajeChat;
  onAccion: (pregunta: string) => void;
}) {
  const esUsuario = mensaje.rol === "user";

  if (esUsuario) {
    return (
      <div className="flex justify-end">
        <div className="card-3d max-w-[85%] rounded-2xl rounded-br-sm bg-on-surface px-4 py-3 text-sm leading-relaxed text-surface">
          {mensaje.texto}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start gap-3">
      <div className="icon-chip chip-primary mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl text-primary">
        <span className="material-symbols-outlined text-[18px]">smart_toy</span>
      </div>
      <div className="card-3d chat-bubble max-w-[85%] rounded-2xl rounded-tl-sm border border-outline-variant/10 bg-surface-container px-4 py-3">
        <div className="text-sm text-on-surface">
          <Markdown>{mensaje.texto}</Markdown>
        </div>
        {mensaje.fichas?.map((f) => (
          <FichaMateriaCard key={f.codigo} ficha={f} onAccion={onAccion} />
        ))}
        {mensaje.fuentes && <SourcesPopover fuentes={mensaje.fuentes} />}
        {mensaje.mensajeId !== undefined && (
          <FeedbackBar mensajeId={mensaje.mensajeId} texto={mensaje.texto} />
        )}
      </div>
    </div>
  );
}
