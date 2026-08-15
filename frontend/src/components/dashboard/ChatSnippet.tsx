import Link from "next/link";

interface Props {
  /** Ultima pregunta del usuario al chatbot. Null si nunca uso el chat. */
  ultimaPregunta: string | null;
  /** Texto humano del tiempo desde el ultimo mensaje (ej: "hace 2 min"). */
  haceTexto?: string | null;
  /** ID de la conversacion para volver a abrirla. */
  conversacionId?: number | null;
}

/**
 * Atajo al chatbot: muestra la ultima pregunta y un CTA para retomarla.
 * Cuando no hay historial muestra un empty state que invita a iniciar.
 */
export function ChatSnippet({ ultimaPregunta, haceTexto, conversacionId }: Props) {
  const hayHistorial = !!ultimaPregunta;
  const href = conversacionId ? `/chat/${conversacionId}` : "/chat";

  return (
    <div className="card-3d glow-card glow-secondary bg-surface-container rounded-3xl p-6 border border-outline-variant/10 flex flex-col h-full">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center text-primary">
          <span className="material-symbols-outlined text-[18px]">smart_toy</span>
        </div>
        <h3 className="font-bold font-headline text-on-surface">UTNHub Asistente</h3>
      </div>

      <div className="bg-surface-container-lowest rounded-2xl p-4 flex-1 border border-outline-variant/10 flex flex-col">
        {hayHistorial ? (
          <>
            <p className="text-[9px] text-secondary font-bold uppercase tracking-widest mb-2 font-label">
              Ultima consulta
            </p>
            <p className="text-sm text-on-surface italic opacity-80 mb-4 leading-relaxed line-clamp-4">
              &ldquo;{ultimaPregunta}&rdquo;
            </p>
            <div className="mt-auto flex items-center gap-2">
              <div className="h-px flex-1 bg-outline-variant/25" />
              <span className="text-[9px] text-outline font-medium font-label uppercase tracking-widest">
                {haceTexto ?? "hace un rato"}
              </span>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-4">
            <span className="material-symbols-outlined text-3xl text-primary/40 mb-2">
              auto_awesome
            </span>
            <p className="text-sm text-on-surface font-medium mb-1">
              Tu primer chat te espera.
            </p>
            <p className="text-xs text-outline/60 leading-relaxed">
              Pregunta sobre regimen, profesores, fechas o lo que necesites.
            </p>
          </div>
        )}
      </div>

      <Link
        href={href}
        className="mt-4 w-full py-3 bg-on-surface text-surface rounded-xl text-sm font-bold hover:opacity-90 transition flex items-center justify-center gap-2"
      >
        {hayHistorial ? "Retomar conversacion" : "Iniciar chat"}
        <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
      </Link>
    </div>
  );
}
