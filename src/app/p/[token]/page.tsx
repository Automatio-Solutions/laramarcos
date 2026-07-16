import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { aceptarPorTokenAction, rechazarPorTokenAction } from "./actions";
import type { LineaPresupuestoT } from "@/lib/types";

const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });

export default async function AceptacionPublicaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();

  // Marca abierto (tracking básico) si estaba enviado
  await admin.from("presupuestos").update({ abierto_at: new Date().toISOString(), estado: "abierto" })
    .eq("token", token).eq("estado", "enviado");

  const { data } = await admin
    .from("presupuestos")
    .select("estado, lineas, descuento_global, base_imponible, iva_tipo, iva_cuota, total, condiciones, validez_dias, cliente:clientes(razon_social)")
    .eq("token", token)
    .maybeSingle();
  if (!data) notFound();

  const lineas = (data.lineas as LineaPresupuestoT[]) ?? [];
  const cliente = (data.cliente as unknown as { razon_social: string } | null)?.razon_social ?? "";
  const decidido = data.estado === "aceptado" || data.estado === "rechazado";

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 py-12">
      <div className="rounded-lg border border-border bg-surface p-8 shadow-sm">
        <header className="mb-6 border-b border-border pb-4">
          <h1 className="text-xl font-bold text-primary">LaraMarcos Asesores</h1>
          <p className="text-sm text-fg-muted">Presupuesto para {cliente}</p>
        </header>

        <table className="w-full text-sm">
          <thead className="text-left text-fg-muted">
            <tr><th className="py-2">Concepto</th><th className="py-2 text-right">Cant.</th><th className="py-2 text-right">Precio</th><th className="py-2 text-right">Importe</th></tr>
          </thead>
          <tbody>
            {lineas.map((l, i) => (
              <tr key={i} className="border-t border-border">
                <td className="py-2 text-fg">{l.concepto}</td>
                <td className="py-2 text-right text-fg-muted">{l.cantidad}</td>
                <td className="py-2 text-right text-fg-muted">{eur.format(l.precio)}</td>
                <td className="py-2 text-right font-mono text-fg">{eur.format(l.cantidad * l.precio * (1 - (l.descuento || 0) / 100))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* El cliente debe ver el IVA desglosado, no solo el importe final. */}
        <div className="mt-4 ml-auto w-64 space-y-1 text-sm">
          <div className="flex justify-between text-fg-muted">
            <span>Base imponible</span><span>{eur.format(Number(data.base_imponible))}</span>
          </div>
          <div className="flex justify-between text-fg-muted">
            <span>IVA {Number(data.iva_tipo)}%</span><span>{eur.format(Number(data.iva_cuota))}</span>
          </div>
          <div className="flex justify-between border-t border-border pt-1 text-xl font-bold text-primary">
            <span>Total</span><span>{eur.format(Number(data.total))}</span>
          </div>
        </div>
        {data.condiciones && <p className="mt-4 text-sm text-fg-muted">{data.condiciones}</p>}
        <p className="mt-1 text-xs text-fg-muted">Validez: {data.validez_dias} días.</p>

        <div className="mt-8">
          {decidido ? (
            <p className={`rounded-md px-4 py-3 text-center font-medium ${data.estado === "aceptado" ? "bg-success/10 text-success" : "bg-error/10 text-error"}`}>
              {data.estado === "aceptado" ? "✓ Has aceptado este presupuesto. Gracias." : "Has rechazado este presupuesto."}
            </p>
          ) : (
            <div className="flex gap-3">
              <form action={aceptarPorTokenAction.bind(null, token)} className="flex-1">
                <button className="w-full rounded-md bg-success px-5 py-3 font-medium text-white">Aceptar presupuesto</button>
              </form>
              <form action={rechazarPorTokenAction.bind(null, token)}>
                <button className="rounded-md border border-border px-5 py-3 font-medium text-fg hover:bg-surface-raised">Rechazar</button>
              </form>
            </div>
          )}
        </div>
      </div>
      <p className="mt-4 text-center text-xs text-fg-muted">Aceptación con registro de fecha y hora. LaraMarcos Asesores.</p>
    </main>
  );
}
