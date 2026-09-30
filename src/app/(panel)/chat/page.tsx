import { redirect, unstable_rethrow } from "next/navigation";
import { listConversaciones } from "@/lib/repos/chat";
import { ChatNoDisponible } from "@/components/chat/ChatNoDisponible";

/** /chat → abre el canal General (UC-602 AC-01). */
export default async function ChatPage() {
  let destino: string | null = null;
  try {
    const conversaciones = await listConversaciones();
    destino = (conversaciones.find((c) => c.tipo === "general") ?? conversaciones[0])?.id ?? null;
  } catch (e) {
    unstable_rethrow(e);
    console.error("[chat] /chat", e);
  }
  // redirect() lanza: siempre fuera del try.
  if (destino) redirect(`/chat/${destino}`);
  return (
    <div className="flex h-[calc(100dvh-3.5rem)]">
      <ChatNoDisponible />
    </div>
  );
}
