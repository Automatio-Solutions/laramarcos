import { createClient } from "@/lib/supabase/server";
import { setImporteAction, marcarFacturadaAction } from "./actions";

const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });

interface LineaRow {
  id: string;
  concepto: string;
  importe: number;
  facturada: boolean;
  created_at: string;
  cliente: { razon_social: string } | null;
}

export default async function FacturacionPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("lineas_factura")
    .select("id, concepto, importe, facturada, created_at, cliente:clientes(razon_social)")
    .eq("facturada", false)
    .order("created_at", { ascending: false });
  const lineas = (data ?? []) as unknown as LineaRow[];

  // Agrupar por cliente
  const porCliente = new Map<string, LineaRow[]>();
  for (const l of lineas) {
    const k = l.cliente?.razon_social ?? "(sin cliente)";
    if (!porCliente.has(k)) porCliente.set(k, []);
    porCliente.get(k)!.push(l);
  }
  const totalPendiente = lineas.reduce((a, l) => a + Number(l.importe), 0);

  return (
    <div className="space-y-6 p-8">
      <header>
        <h1 className="text-2xl font-bold text-primary">Facturación pendiente</h1>
        <p className="text-sm text-fg-muted">
          {lineas.length} líneas sin facturar · {eur.format(totalPendiente)} · ninguna gestión completada queda sin cobrar
        </p>
      </header>

      {porCliente.size === 0 && <p className="text-sm text-fg-muted">No hay líneas pendientes de facturar.</p>}

      <div className="space-y-5">
        {[...porCliente.entries()].map(([cliente, items]) => (
          <div key={cliente} className="overflow-hidden rounded-lg border border-border bg-surface">
            <div className="flex items-center justify-between border-b border-border bg-surface-raised px-4 py-2">
              <span className="text-sm font-semibold text-primary">{cliente}</span>
              <span className="text-xs text-fg-muted">{eur.format(items.reduce((a, l) => a + Number(l.importe), 0))}</span>
            </div>
            <table className="w-full text-sm">
              <tbody>
                {items.map((l) => (
                  <tr key={l.id} className="border-t border-border first:border-t-0">
                    <td className="px-4 py-2.5 text-fg">{l.concepto}</td>
                    <td className="px-4 py-2.5 text-right">
                      <form action={setImporteAction.bind(null, l.id)} className="inline-flex items-center gap-1">
                        <input name="importe" type="text" defaultValue={String(l.importe)} className="w-24 rounded-md border border-border bg-surface px-2 py-1 text-right text-xs text-fg" />
                        <span className="text-xs text-fg-muted">€</span>
                        <button className="rounded-md border border-border px-2 py-1 text-xs text-fg hover:bg-surface-raised">Guardar</button>
                      </form>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <form action={marcarFacturadaAction.bind(null, l.id)}>
                        <button className="rounded-md bg-success px-3 py-1 text-xs font-medium text-white">Marcar facturada</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}
