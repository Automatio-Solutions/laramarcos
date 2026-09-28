import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listClientes } from "@/lib/repos/clientes";
import { CONFIANZA_VERDE, semaforo, trimestreDe } from "@/lib/ocr/core";
import { OFICINAS } from "@/lib/types";
import { SubidaMasivaFacturas } from "@/components/SubidaMasivaFacturas";
import { ClienteBuscador } from "@/components/ClienteBuscador";
import { aprobarFacturaAction } from "./actions";

// Las acciones de la subida masiva leen una factura por llamada (10–30 s con Claude).
export const maxDuration = 60;

const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** El trimestre actual y los cinco anteriores ("2026-3T"…). */
function ultimosTrimestres(n = 6): string[] {
  const hoy = new Date();
  return Array.from({ length: n }, (_, i) =>
    trimestreDe(new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - i * 3, 1))));
}

/** El mes actual y los once anteriores ("2026-09"…): hay clientes que van por meses. */
function ultimosMeses(n = 12): { valor: string; texto: string }[] {
  const hoy = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - i, 1));
    const m = d.getUTCMonth();
    return { valor: `${d.getUTCFullYear()}-${String(m + 1).padStart(2, "0")}`, texto: `${MESES[m]} ${d.getUTCFullYear()}` };
  });
}

const COLOR = { verde: "bg-success/10 text-success", naranja: "bg-warning/10 text-warning", rojo: "bg-error/10 text-error" };

interface FacturaRow {
  id: string; tipo: "gasto" | "ingreso"; proveedor_nombre: string | null; proveedor_cif: string | null;
  base_imponible: number | null; iva_tipo: number | null; subcuenta: string | null;
  confianza: number; revisada: boolean; archivo_nombre: string | null;
  cliente: { razon_social: string } | null;
}

interface Filtros {
  cliente?: string;
  tipo?: string;
  estado?: string;  // "pendientes" | "sin_cliente" | "" (todas)
  oficina?: string;
}

export default async function PrecontabilizacionPage({ searchParams }: { searchParams: Promise<Filtros> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const clientes = await listClientes();
  const nombreCliente = new Map(clientes.map((c) => [c.id, c.razon_social]));

  // Lista, con los filtros de la barra (y los que trae el enlace de la campana).
  let q = supabase
    .from("facturas_ocr")
    .select("id, tipo, proveedor_nombre, proveedor_cif, base_imponible, iva_tipo, subcuenta, confianza, revisada, archivo_nombre, cliente:clientes(razon_social)")
    .order("created_at", { ascending: false })
    .limit(500);
  if (sp.cliente) q = q.eq("cliente_id", sp.cliente);
  if (sp.tipo === "gasto" || sp.tipo === "ingreso") q = q.eq("tipo", sp.tipo);
  if (sp.estado === "pendientes") q = q.eq("revisada", false).lt("confianza", CONFIANZA_VERDE);
  if (sp.estado === "sin_cliente") q = q.is("cliente_id", null);
  if (sp.oficina) q = q.in("cliente_id", clientes.filter((c) => c.oficina === sp.oficina).map((c) => c.id));

  // Panel "Por revisar": pendientes por cliente y libro, de lo que el usuario ve (RLS).
  const [{ data }, { data: pend }] = await Promise.all([
    q,
    supabase.from("facturas_ocr").select("cliente_id, tipo").eq("revisada", false).lt("confianza", CONFIANZA_VERDE).limit(5000),
  ]);
  const facturas = (data ?? []) as unknown as FacturaRow[];
  const opcionesCliente = clientes.map((c) => ({ id: c.id, razon_social: c.razon_social, cif: c.cif }));
  const porRevisar = new Map<string, { cliente_id: string; tipo: string; n: number }>();
  let sinCliente = 0;
  for (const f of pend ?? []) {
    if (!f.cliente_id) { sinCliente++; continue; }
    const k = `${f.cliente_id}|${f.tipo}`;
    porRevisar.set(k, { cliente_id: f.cliente_id, tipo: f.tipo, n: (porRevisar.get(k)?.n ?? 0) + 1 });
  }
  const pendientesPorCliente = [...porRevisar.values()].sort((a, b) => b.n - a.n);
  const hayFiltros = !!(sp.cliente || sp.tipo || sp.estado || sp.oficina);
  const cont = { verde: 0, naranja: 0, rojo: 0 };
  for (const f of facturas) cont[semaforo(f.confianza)]++;

  return (
    <div className="space-y-6 p-8">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary">Precontabilización OCR</h1>
          <p className="text-sm text-fg-muted">Facturas → Excel modelo Aplifisa. Semáforo de confianza por fila.</p>
        </div>
      </header>

      {/* Excel Aplifisa por cliente, libro y periodo: revisadas y verdes; el resto en "Pendientes de revisar" */}
      <form action="/api/facturas/excel" method="get" className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-4 text-sm">
        <label className="space-y-1">
          <span className="block text-fg-muted">Cliente</span>
          <ClienteBuscador name="cliente" required clientes={opcionesCliente} />
        </label>
        <label className="space-y-1">
          <span className="block text-fg-muted">Libro</span>
          <select name="tipo" className="rounded-md border border-border bg-surface px-2 py-2 text-fg">
            <option value="gasto">Gastos</option>
            <option value="ingreso">Ingresos</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-fg-muted">Periodo</span>
          <select name="periodo" className="rounded-md border border-border bg-surface px-2 py-2 text-fg">
            <optgroup label="Trimestre">
              {ultimosTrimestres().map((t) => <option key={t} value={t}>{t}</option>)}
            </optgroup>
            <optgroup label="Mes">
              {ultimosMeses().map((m) => <option key={m.valor} value={m.valor}>{m.texto}</option>)}
            </optgroup>
          </select>
        </label>
        <button className="rounded-md bg-primary px-4 py-2 font-medium text-white hover:bg-[var(--color-primary-hover)]">⬇ Excel Aplifisa</button>
      </form>

      {/* Subida masiva: varios archivos, carpetas o arrastrar */}
      <SubidaMasivaFacturas clientes={opcionesCliente} />

      {/* Por revisar: lo que no irá al Excel hasta que un asesor lo mire */}
      {(pendientesPorCliente.length > 0 || sinCliente > 0) && (
        <section className="space-y-2 rounded-lg border border-warning/40 bg-warning/5 p-4 text-sm">
          <h2 className="font-semibold text-fg">
            Por revisar: {(pend ?? []).length} {(pend ?? []).length === 1 ? "factura" : "facturas"}
          </h2>
          <div className="flex flex-wrap gap-2">
            {sinCliente > 0 && (
              <Link href="/precontabilizacion?estado=sin_cliente" className="rounded-md bg-error/10 px-2.5 py-1 font-medium text-error hover:underline">
                Sin cliente · {sinCliente}
              </Link>
            )}
            {pendientesPorCliente.slice(0, 30).map((p) => (
              <Link
                key={`${p.cliente_id}|${p.tipo}`}
                href={`/precontabilizacion?cliente=${p.cliente_id}&tipo=${p.tipo}&estado=pendientes`}
                className="rounded-md bg-surface px-2.5 py-1 text-fg ring-1 ring-border hover:underline"
              >
                {nombreCliente.get(p.cliente_id) ?? "Cliente"} · {p.tipo === "gasto" ? "Gastos" : "Ingresos"} · <b>{p.n}</b>
              </Link>
            ))}
            {pendientesPorCliente.length > 30 && <span className="px-1 py-1 text-fg-muted">y {pendientesPorCliente.length - 30} más…</span>}
          </div>
        </section>
      )}

      {/* Filtros de la lista */}
      <form method="get" className="flex flex-wrap items-end gap-3 text-sm">
        <label className="space-y-1">
          <span className="block text-fg-muted">Estado</span>
          <select name="estado" defaultValue={sp.estado ?? ""} className="rounded-md border border-border bg-surface px-2 py-2 text-fg">
            <option value="">Todas</option>
            <option value="pendientes">Por revisar</option>
            <option value="sin_cliente">Sin cliente</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-fg-muted">Oficina</span>
          <select name="oficina" defaultValue={sp.oficina ?? ""} className="rounded-md border border-border bg-surface px-2 py-2 text-fg">
            <option value="">Todas</option>
            {OFICINAS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-fg-muted">Libro</span>
          <select name="tipo" defaultValue={sp.tipo ?? ""} className="rounded-md border border-border bg-surface px-2 py-2 text-fg">
            <option value="">Gastos e ingresos</option>
            <option value="gasto">Gastos</option>
            <option value="ingreso">Ingresos</option>
          </select>
        </label>
        <div className="space-y-1">
          <span className="block text-fg-muted">Cliente</span>
          <ClienteBuscador name="cliente" defaultValue={sp.cliente} clientes={opcionesCliente} />
        </div>
        <button className="rounded-md border border-border px-4 py-2 font-medium text-fg hover:bg-surface-raised">Filtrar</button>
        {hayFiltros && <Link href="/precontabilizacion" className="px-2 py-2 text-fg-muted hover:underline">Quitar filtros</Link>}
      </form>

      {/* Métricas / semáforo (de la lista filtrada) */}
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
              <th className="px-4 py-3 font-medium">Proveedor / cliente</th>
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 font-medium">Libro</th>
              <th className="px-4 py-3 font-medium text-right">Base</th>
              <th className="px-4 py-3 font-medium">Subcuenta</th>
              <th className="px-4 py-3 font-medium text-right">Conf.</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {facturas.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-fg-muted">{hayFiltros ? "Ninguna factura con estos filtros." : "Sin facturas. Sube la primera."}</td></tr>
            )}
            {facturas.map((f) => {
              const s = semaforo(f.confianza);
              return (
                <tr key={f.id} className="border-t border-border hover:bg-surface-raised">
                  <td className="px-4 py-2.5"><span className={`inline-block h-2.5 w-2.5 rounded-full ${s === "verde" ? "bg-success" : s === "naranja" ? "bg-warning" : "bg-error"}`} /></td>
                  <td className="px-4 py-2.5 text-fg">{f.proveedor_nombre ?? <span className="text-fg-muted">{f.archivo_nombre}</span>}</td>
                  <td className="px-4 py-2.5 text-fg-muted">{f.cliente?.razon_social ?? <span className="text-error">Sin cliente</span>}</td>
                  <td className="px-4 py-2.5 text-fg-muted">{f.tipo === "ingreso" ? "Ingresos" : "Gastos"}</td>
                  <td className="px-4 py-2.5 text-right text-fg">{f.base_imponible != null ? eur.format(f.base_imponible) : "—"}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-fg-muted">{f.subcuenta ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right"><span className={`rounded px-1.5 py-0.5 text-xs ${COLOR[s]}`}>{f.confianza}%</span></td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex justify-end gap-2">
                      <Link href={`/precontabilizacion/${f.id}`} className="text-xs font-medium text-accent hover:underline">Revisar</Link>
                      {!f.revisada && s === "verde" && f.cliente && (
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
