import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listClientes } from "@/lib/repos/clientes";
import { semaforo } from "@/lib/ocr/core";
import { subirFacturaAction, aprobarFacturaAction } from "./actions";

const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
const COLOR = { verde: "bg-success/10 text-success", naranja: "bg-warning/10 text-warning", rojo: "bg-error/10 text-error" };

interface FacturaRow {
  id: string; proveedor_nombre: string | null; proveedor_cif: string | null;
  base_imponible: number | null; iva_tipo: number | null; subcuenta: string | null;
  confianza: number; revisada: boolean; archivo_nombre: string | null;
  cliente: { razon_social: string } | null;
}

export default async function PrecontabilizacionPage() {
  const supabase = await createClient();
  const [{ data }, clientes] = await Promise.all([
    supabase.from("facturas_ocr").select("id, proveedor_nombre, proveedor_cif, base_imponible, iva_tipo, subcuenta, confianza, revisada, archivo_nombre, cliente:clientes(razon_social)").order("created_at", { ascending: false }),
    listClientes(),
  ]);
  const facturas = (data ?? []) as unknown as FacturaRow[];
  const cont = { verde: 0, naranja: 0, rojo: 0 };
  for (const f of facturas) cont[semaforo(f.confianza)]++;

  return (
    <div className="space-y-6 p-8">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary">Precontabilización OCR</h1>
          <p className="text-sm text-fg-muted">Facturas → Excel modelo Aplifisa. Semáforo de confianza por fila. (Datos en VPS propio en producción.)</p>
        </div>
        <a href="/api/facturas/excel" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)]">⬇ Excel Aplifisa</a>
      </header>

      {/* Subida */}
      <form action={subirFacturaAction} className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-4 text-sm">
        <label className="space-y-1">
          <span className="block text-fg-muted">Cliente (carpeta)</span>
          <select name="cliente_id" className="rounded-md border border-border bg-surface px-2 py-2 text-fg">
            <option value="">— Sin cliente —</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.razon_social}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-fg-muted">Factura (PDF/JPG/PNG)</span>
          <input type="file" name="archivo" accept=".pdf,image/*" required className="text-fg" />
        </label>
        <button className="rounded-md bg-primary px-4 py-2 font-medium text-white hover:bg-[var(--color-primary-hover)]">Subir y procesar</button>
      </form>

      {/* Métricas / semáforo */}
      <div className="flex gap-3 text-sm">
        <span className="rounded-md bg-success/10 px-3 py-1.5 font-medium text-success">🟢 {cont.verde} aprobadas</span>
        <span className="rounded-md bg-warning/10 px-3 py-1.5 font-medium text-warning">🟠 {cont.naranja} revisión rápida</span>
        <span className="rounded-md bg-error/10 px-3 py-1.5 font-medium text-error">🔴 {cont.rojo} revisar</span>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-surface-raised text-left text-fg-muted">
            <tr>
              <th className="px-4 py-3 font-medium" />
              <th className="px-4 py-3 font-medium">Proveedor</th>
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 font-medium text-right">Base</th>
              <th className="px-4 py-3 font-medium">Subcuenta</th>
              <th className="px-4 py-3 font-medium text-right">Conf.</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {facturas.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-fg-muted">Sin facturas. Sube la primera.</td></tr>}
            {facturas.map((f) => {
              const s = semaforo(f.confianza);
              return (
                <tr key={f.id} className="border-t border-border hover:bg-surface-raised">
                  <td className="px-4 py-2.5"><span className={`inline-block h-2.5 w-2.5 rounded-full ${s === "verde" ? "bg-success" : s === "naranja" ? "bg-warning" : "bg-error"}`} /></td>
                  <td className="px-4 py-2.5 text-fg">{f.proveedor_nombre ?? <span className="text-fg-muted">{f.archivo_nombre}</span>}</td>
                  <td className="px-4 py-2.5 text-fg-muted">{f.cliente?.razon_social ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right text-fg">{f.base_imponible != null ? eur.format(f.base_imponible) : "—"}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-fg-muted">{f.subcuenta ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right"><span className={`rounded px-1.5 py-0.5 text-xs ${COLOR[s]}`}>{f.confianza}%</span></td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex justify-end gap-2">
                      <Link href={`/precontabilizacion/${f.id}`} className="text-xs font-medium text-accent hover:underline">Revisar</Link>
                      {!f.revisada && s === "verde" && (
                        <form action={aprobarFacturaAction.bind(null, f.id)}><button className="text-xs text-success hover:underline">Aprobar</button></form>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
