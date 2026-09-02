"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { MessageBubble } from "./MessageBubble";
import { SugerenciasSeguimiento } from "./SugerenciasSeguimiento";
import { useChat, type MensajeChat } from "./useChat";

type Acento = "primary" | "secondary" | "tertiary";

interface Categoria {
  icon: string;
  categoria: string;
  pregunta: string;
  color: Acento;
}

const CATEGORIAS: readonly Categoria[] = [
  {
    icon: "menu_book",
    categoria: "Materias y carreras",
    pregunta: "¿Qué necesito para cursar Diseño de Sistemas?",
    color: "primary",
  },
  {
    icon: "event",
    categoria: "Fechas importantes",
    pregunta: "¿Cuándo son las próximas mesas?",
    color: "tertiary",
  },
  {
    icon: "how_to_reg",
    categoria: "Inscripciones",
    pregunta: "¿Hasta cuándo puedo inscribirme?",
    color: "secondary",
  },
  {
    icon: "school",
    categoria: "Correlatividades",
    pregunta: "¿Qué materias necesito tener aprobadas?",
    color: "primary",
  },
] as const;

// Clases LITERALES por acento (Tailwind no detecta `text-${color}` armado a
// mano). Mismo criterio que AtajosToolbox del dashboard.
const ACENTOS: Record<Acento, { badge: string; glow: string; hover: string }> = {
  primary: {
    badge: "border-primary/20 bg-primary/10 text-primary",
    glow: "glow-card glow-primary",
    hover: "hover:border-primary/50",
  },
  secondary: {
    badge: "border-secondary/20 bg-secondary/10 text-secondary",
    glow: "glow-card glow-secondary",
    hover: "hover:border-secondary/50",
  },
  tertiary: {
    badge: "border-tertiary/20 bg-tertiary/10 text-tertiary",
    glow: "glow-card glow-tertiary",
    hover: "hover:border-tertiary/50",
  },
};

interface Props {
  /** Conversacion que se retoma (null = nueva). */
  conversacionId?: number | null;
  /** Mensajes ya guardados, para precargar el hilo. */
  inicial?: MensajeChat[];
}

/** Ventana de chat con el asistente UTNHub (agente + RAG). */
export function ChatWindow({ conversacionId = null, inicial = [] }: Props) {
  const router = useRouter();
  const {
    mensajes,
    cargando,
    error,
    enviar,
    reintentar,
    regenerar,
    conversacionId: convActivo,
  } = useChat({ conversacionId, inicial });
  const [texto, setTexto] = useState("");
  const finRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<number | null>(null);
  const yaNavego = useRef(false);

  // La barra de scroll es un overlay que sólo se ve mientras se hace scroll:
  // al scrollear se marca `is-scrolling` y se borra tras una pausa, así no
  // queda cortando el chat de forma permanente. (Ver `.chat-scroll` en el CSS.)
  const onScrollList = () => {
    const el = scrollRef.current;
    if (!el) return;
    el.classList.add("is-scrolling");
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(
      () => el.classList.remove("is-scrolling"),
      900,
    );
  };
  useEffect(
    () => () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    },
    [],
  );

  // El textarea crece con el contenido (Shift+Enter) hasta un tope, y vuelve
  // a una línea al enviar.
  const autoGrow = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  // Auto-scroll al último mensaje cada vez que la conversación cambia.
  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensajes, cargando]);

  // Al crear una conversación nueva (empezamos sin id y el backend nos dio uno),
  // reflejamos la URL y refrescamos el historial del panel lateral.
  //
  // Clave: esperamos a que el stream TERMINE (`!cargando`). El backend recién
  // commitea la conversación al final del stream, así que navegar antes llevaría
  // a `/chat/{id}` cuando la fila todavía no existe para otra transacción → 404.
  useEffect(() => {
    if (
      conversacionId == null &&
      convActivo != null &&
      !cargando &&
      !error &&
      !yaNavego.current
    ) {
      yaNavego.current = true;
      router.replace(`/chat/${convActivo}`);
      router.refresh();
    }
  }, [conversacionId, convActivo, cargando, error, router]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    enviar(texto);
    setTexto("");
    if (inputRef.current) inputRef.current.style.height = "auto";
  };

  const vacio = mensajes.length === 0;
  const ultimo = mensajes[mensajes.length - 1];
  // Chips de seguimiento: sólo con el chat en reposo y una respuesta ya cerrada.
  const mostrarSeguimiento =
    !vacio &&
    !cargando &&
    ultimo?.rol === "assistant" &&
    !ultimo.streaming &&
    ultimo.mensajeId !== undefined;

  return (
    <div className="flex h-full w-full flex-col">
      {!vacio && (
        <div className="mx-auto w-full max-w-[960px] px-4 pt-6">
          <header className="mb-4 flex items-center gap-2.5">
            <div className="icon-chip chip-primary flex h-8 w-8 items-center justify-center rounded-xl text-primary">
              <span className="material-symbols-outlined text-[18px]">smart_toy</span>
            </div>
            <div className="leading-tight">
              <h1 className="font-headline text-base font-bold text-on-surface">
                meK
              </h1>
              <p className="font-label text-[10px] uppercase tracking-widest text-outline">
                Asistente · UTN FRRO
              </p>
            </div>
          </header>
        </div>
      )}

      <div
        ref={scrollRef}
        onScroll={onScrollList}
        className="chat-scroll flex-1 overflow-y-auto"
      >
        <div className="mx-auto flex min-h-full w-full max-w-[960px] flex-col space-y-4 px-4 pb-4 pt-4">
        {vacio ? (
          <div className="flex flex-1 flex-col items-center justify-center py-6">
            <div className="relative w-full max-w-2xl">
              {/* Glow sutil de profundidad, detrás del título */}
              <div
                aria-hidden
                className="pointer-events-none absolute left-1/2 top-4 h-52 w-[520px] max-w-full -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
              />
              <div className="relative text-center">
                <div className="icon-chip chip-primary mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl text-primary">
                  <span className="material-symbols-outlined text-[30px]">smart_toy</span>
                </div>
                <h1 className="font-headline text-3xl font-extrabold tracking-tight text-on-surface">
                  meK
                </h1>
                <p className="mt-1 font-headline text-lg font-medium text-on-surface-variant">
                  Tu asistente académico de UTNHub
                </p>
                <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-outline">
                  Información académica de la UTN FRRO, respaldada por fuentes
                  oficiales.
                </p>
              </div>

              <div className="relative mt-8 grid grid-cols-1 gap-3 text-left sm:grid-cols-2">
                {CATEGORIAS.map((c) => (
                  <button
                    key={c.categoria}
                    type="button"
                    onClick={() => enviar(c.pregunta)}
                    className={`card-3d card-lift ${ACENTOS[c.color].glow} group flex items-start gap-3 rounded-2xl border border-outline-variant/10 bg-surface-container p-4 text-left ${ACENTOS[c.color].hover} focus-visible:border-primary/50 focus-visible:outline-none`}
                  >
                    <span
                      className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${ACENTOS[c.color].badge}`}
                    >
                      <span className="material-symbols-outlined text-[20px]">
                        {c.icon}
                      </span>
                    </span>
                    <span className="min-w-0">
                      <span className="block font-label text-[10px] uppercase tracking-widest text-outline">
                        {c.categoria}
                      </span>
                      <span className="mt-1 block text-sm leading-snug text-on-surface">
                        {c.pregunta}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <>
            {mensajes.map((m, i) => {
              // "Regenerar" sólo en la última respuesta del hilo y con el chat
              // en reposo.
              const esUltimo = i === mensajes.length - 1;
              return (
                <MessageBubble
                  key={m.id}
                  mensaje={m}
                  onAccion={enviar}
                  onRegenerar={
                    esUltimo && !cargando ? regenerar : undefined
                  }
                />
              );
            })}
            {mostrarSeguimiento && (
              <SugerenciasSeguimiento onElegir={enviar} />
            )}
          </>
        )}

        {error && (
          <div className="flex justify-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-error/30 bg-error/10 text-error">
              <span className="material-symbols-outlined text-[18px]">error</span>
            </div>
            <div className="card-3d rounded-2xl rounded-tl-sm border border-error/20 bg-error/5 px-4 py-3">
              <p className="text-sm text-on-surface">{error}</p>
              <button
                type="button"
                onClick={reintentar}
                className="mt-2 inline-flex items-center gap-1 rounded-lg border border-outline-variant/20 px-2.5 py-1 text-xs text-on-surface transition hover:border-primary/40"
              >
                <span className="material-symbols-outlined text-[14px]">refresh</span>
                Reintentar
              </button>
            </div>
          </div>
        )}

          <div ref={finRef} />
        </div>
      </div>

      <div className="mx-auto w-full max-w-[960px] px-4 pt-2 pb-6">
        <form onSubmit={onSubmit} className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              autoGrow(e.target);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSubmit(e);
              }
            }}
            rows={1}
            placeholder="Preguntá sobre la UTN FRRO..."
            aria-label="Escribí tu pregunta"
            className="card-3d chat-bubble max-h-40 flex-1 resize-none rounded-2xl border border-outline-variant/20 bg-surface-container-lowest px-4 py-3 text-sm text-on-surface placeholder:text-outline/60 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20"
          />
          <button
            type="submit"
            disabled={cargando || !texto.trim()}
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-on-surface text-surface transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Enviar mensaje"
          >
            <span
              className={`material-symbols-outlined text-[20px] ${cargando ? "animate-spin" : ""}`}
            >
              {cargando ? "progress_activity" : "send"}
            </span>
          </button>
        </form>
        <p className="mt-1.5 px-1 text-[11px] text-outline/60">
          <kbd className="font-sans">Enter</kbd> para enviar ·{" "}
          <kbd className="font-sans">Shift + Enter</kbd> para nueva línea
        </p>
      </div>
    </div>
  );
}
