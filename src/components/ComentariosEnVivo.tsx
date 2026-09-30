"use client";

import { useRouter } from "next/navigation";
import { useCambiosTabla } from "@/lib/chat/realtime";

/**
 * UC-607: comentarios de tarea en tiempo real. Escucha los comentarios nuevos de la tarea
 * (la RLS de `comentarios` decide qué eventos llegan) y refresca la vista del servidor con
 * debounce de 200 ms. No pinta nada; las @menciones siguen por la vía de UC-105.
 * Los comentarios cuelgan solo de la tarea (no hay comentarios de subtarea), así que basta
 * un canal filtrado por tarea_id.
 */
export function ComentariosEnVivo({ tareaId }: { tareaId: string }) {
  const router = useRouter();
  useCambiosTabla(
    { tabla: "comentarios", filtro: `tarea_id=eq.${tareaId}`, evento: "INSERT", esperaMs: 200 },
    () => router.refresh(),
  );
  return null;
}
