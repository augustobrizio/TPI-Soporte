import { notFound } from "next/navigation";

import { ChatWindow } from "@/features/chat/ChatWindow";
import type { MensajeChat } from "@/features/chat/useChat";
import { ApiError, getConversacion } from "@/lib/api";

/**
 * Retoma una conversacion guardada. El historial lo trae el backend, que es
 * quien lo persiste (incluidas las fuentes citadas por cada respuesta).
 */
export default async function ConversacionPage({
  params,
}: {
  params: Promise<{ conversacionId: string }>;
}) {
  const { conversacionId } = await params;
  const id = Number(conversacionId);
  if (!Number.isInteger(id)) notFound();

  try {
    const conversacion = await getConversacion(id);
    const inicial: MensajeChat[] = conversacion.mensajes
      .filter((m) => m.contenido && (m.role === "user" || m.role === "assistant"))
      .map((m) => ({
        id: String(m.id),
        rol: m.role as "user" | "assistant",
        texto: m.contenido as string,
        fuentes: m.role === "assistant" ? m.fuentes : undefined,
        mensajeId: m.role === "assistant" ? m.id : undefined,
      }));

    return <ChatWindow conversacionId={id} inicial={inicial} />;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
}
