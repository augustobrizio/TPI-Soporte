"use client";

import { useCallback, useRef, useState } from "react";

import {
  ApiError,
  preguntarChat,
  type ChatFuente,
  type FichaMateria,
} from "@/lib/api";

export type Rol = "user" | "assistant";

export interface MensajeChat {
  id: string;
  rol: Rol;
  texto: string;
  fuentes?: ChatFuente[];
  /** id del mensaje en la BD (para feedback). Sólo en respuestas del asistente. */
  mensajeId?: number;
  /** fichas de materia a mostrar como tarjeta (§19). */
  fichas?: FichaMateria[];
}

interface Opciones {
  /** Conversacion existente que se esta retomando (null = nueva). */
  conversacionId?: number | null;
  /** Mensajes ya guardados en el backend, para precargar el hilo. */
  inicial?: MensajeChat[];
}

/**
 * Estado de una conversacion con el asistente.
 *
 * El backend es la fuente de verdad del historial: guarda cada turno y lo usa
 * como contexto. Aca mantenemos el `conversacionId` para que los mensajes
 * siguientes caigan en el mismo hilo, y la ultima pregunta fallida para poder
 * reintentar sin que el usuario tenga que reescribirla.
 */
export function useChat({ conversacionId = null, inicial = [] }: Opciones = {}) {
  const [mensajes, setMensajes] = useState<MensajeChat[]>(inicial);
  const [convId, setConvId] = useState<number | null>(conversacionId);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendiente = useRef<string | null>(null);

  const consultar = useCallback(
    async (pregunta: string) => {
      setError(null);
      setCargando(true);
      try {
        const r = await preguntarChat(pregunta, convId);
        if (r.conversacion_id) setConvId(r.conversacion_id);
        setMensajes((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            rol: "assistant",
            texto: r.respuesta,
            fuentes: r.fuentes,
            mensajeId: r.mensaje_id ?? undefined,
            fichas: r.fichas,
          },
        ]);
        pendiente.current = null;
      } catch (e) {
        pendiente.current = pregunta;
        const status = e instanceof ApiError ? e.status : 0;
        setError(
          status === 401
            ? "Tu sesión expiró. Actualizá la página e iniciá sesión de nuevo."
            : "No pudimos consultar las fuentes de UTN FRRO.",
        );
      } finally {
        setCargando(false);
      }
    },
    [convId],
  );

  const enviar = useCallback(
    async (pregunta: string) => {
      const texto = pregunta.trim();
      if (!texto || cargando) return;
      setMensajes((prev) => [
        ...prev,
        { id: crypto.randomUUID(), rol: "user", texto },
      ]);
      await consultar(texto);
    },
    [cargando, consultar],
  );

  const reintentar = useCallback(() => {
    if (pendiente.current && !cargando) consultar(pendiente.current);
  }, [cargando, consultar]);

  return {
    mensajes,
    cargando,
    error,
    enviar,
    reintentar,
    conversacionId: convId,
  };
}
