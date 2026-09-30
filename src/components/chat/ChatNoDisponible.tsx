/** Estado de error del chat (tablas aún no creadas, fallo de red o conversación inaccesible). */
export function ChatNoDisponible({
  titulo = "El chat no está disponible",
  detalle = "No se ha podido cargar el chat. Inténtalo de nuevo en unos minutos.",
}: {
  titulo?: string;
  detalle?: string;
}) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center bg-surface p-8">
      <div className="max-w-sm text-center">
        <p aria-hidden className="text-3xl">💬</p>
        <h1 className="mt-3 text-base font-semibold text-fg">{titulo}</h1>
        <p className="mt-1 text-sm text-fg-muted">{detalle}</p>
      </div>
    </div>
  );
}
