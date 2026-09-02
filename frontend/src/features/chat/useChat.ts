"use client";

import { useCallback, useRef, useState } from "react";

import {
  ApiError,
  preguntarChatStream,
  type ChatFuente,
  type ChatPaso,
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
  /** pasos del agente (uso de tools) reportados en vivo durante el stream. */
  pasos?: ChatPaso[];
  /** true mientras el asistente todavía está escribiendo esta respuesta. */
  streaming?: boolean;
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

      // Insertamos ya el mensaje del asistente vacío: el stream lo va llenando
      // (pasos + tokens) mutándolo por su id.
      const idAsist = crypto.randomUUID();
      setMensajes((prev) => [
        ...prev,
        { id: idAsist, rol: "assistant", texto: "", streaming: true, pasos: [] },
      ]);

      // Helper: aplica un patch al mensaje del asistente en curso.
      const parche = (fn: (m: MensajeChat) => MensajeChat) =>
        setMensajes((prev) => prev.map((m) => (m.id === idAsist ? fn(m) : m)));

      let ok = true;
      try {
        await preguntarChatStream(pregunta, convId, {
          onInicio: (cid) => setConvId(cid),
          onPaso: (p) =>
            parche((m) => ({ ...m, pasos: [...(m.pasos ?? []), p] })),
          onToken: (t) => parche((m) => ({ ...m, texto: m.texto + t })),
          onFin: (fin) => {
            if (fin.conversacion_id) setConvId(fin.conversacion_id);
            // El `fin` trae la respuesta autoritativa (completa y persistida):
            // la usamos como texto final por si el stream de tokens se ensució.
            parche((m) => ({
              ...m,
              texto: fin.respuesta,
              fuentes: fin.fuentes,
              fichas: fin.fichas,
              mensajeId: fin.mensaje_id ?? undefined,
              streaming: false,
            }));
          },
          onError: (msg) => {
            // Error controlado del backend (proveedor sobrecargado): sacamos el
            // placeholder y mostramos el error con botón de reintento.
            ok = false;
            pendiente.current = pregunta;
            setMensajes((prev) => prev.filter((m) => m.id !== idAsist));
            setError(msg);
          },
        });
        if (ok) pendiente.current = null;
      } catch (e) {
        pendiente.current = pregunta;
        setMensajes((prev) => prev.filter((m) => m.id !== idAsist));
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
