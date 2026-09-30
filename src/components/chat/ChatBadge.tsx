"use client";

import { useNoLeidos, usePresencia } from "@/lib/chat/realtime";

/**
 * UC-604 AC-02: total de mensajes sin leer junto a "Chat" en la barra lateral, en tiempo real.
 * UC-613: como está en todas las páginas del panel, también anuncia la presencia del usuario
 * ("conectado" mientras tenga la plataforma abierta).
 */
export function ChatBadge({ inicial }: { inicial: number }) {
  const { total } = useNoLeidos(inicial);
  usePresencia();
  if (total <= 0) return null;
  return (
    <span
      aria-label={`${total} mensajes sin leer`}
      className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-error px-1.5 text-[11px] font-bold text-white"
    >
      {total > 99 ? "99+" : total}
    </span>
  );
}
