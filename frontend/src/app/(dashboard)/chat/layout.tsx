import { ChatSidebar } from "@/features/chat/ChatSidebar";
import { listarConversaciones, type ConversacionOut } from "@/lib/api";

/**
 * Layout de la sección chat: panel de historial + la conversación activa.
 *
 * Trae las conversaciones del backend en el servidor (con la cookie de sesión).
 * Ojo: un layout NO se re-renderiza al navegar entre /chat y /chat/[id], así que
 * cuando se crea una conversación nueva el ChatWindow llama a router.refresh()
 * para que esta lista se actualice.
 */
export default async function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let conversaciones: ConversacionOut[] = [];
  try {
    conversaciones = await listarConversaciones();
  } catch {
    // Si el backend no responde, mostramos el chat igual (sin historial).
    conversaciones = [];
  }

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      <ChatSidebar conversaciones={conversaciones} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
