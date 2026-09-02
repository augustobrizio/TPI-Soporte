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

  // Antes del primer token no hay texto que mostrar: dejamos un indicador de
  // "escribiendo" para que la burbuja no aparezca vacía.
  const escribiendoSinTexto = mensaje.streaming && mensaje.texto.length === 0;

  return (
    <div className="flex justify-start gap-3">
      <div className="icon-chip chip-primary mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl text-primary">
        <span className="material-symbols-outlined text-[18px]">smart_toy</span>
      </div>
      <div className="card-3d chat-bubble max-w-[85%] rounded-2xl rounded-tl-sm border border-outline-variant/10 bg-surface-container px-4 py-3">
        {escribiendoSinTexto ? (
          <PuntosEscribiendo />
        ) : (
          <div className="text-sm text-on-surface">
            <Markdown>{mensaje.texto}</Markdown>
            {mensaje.streaming && <Cursor />}
          </div>
        )}
        {/* Fichas, fuentes y feedback sólo cuando la respuesta terminó. */}
        {!mensaje.streaming &&
          mensaje.fichas?.map((f) => (
            <FichaMateriaCard key={f.codigo} ficha={f} onAccion={onAccion} />
          ))}
        {!mensaje.streaming && mensaje.fuentes && (
          <SourcesPopover fuentes={mensaje.fuentes} />
        )}
        {!mensaje.streaming && mensaje.mensajeId !== undefined && (
          <FeedbackBar mensajeId={mensaje.mensajeId} texto={mensaje.texto} />
        )}
      </div>
    </div>
  );
}

/** Cursor de escritura: barrita que parpadea al final del texto en streaming. */
function Cursor() {
  return (
    <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse rounded-full bg-primary align-middle" />
  );
}

/** Tres puntos animados mientras el asistente todavía no emitió texto. */
function PuntosEscribiendo() {
  return (
    <div className="flex items-center gap-1 py-1" aria-label="Escribiendo…">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-outline/60"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </div>
  );
}
