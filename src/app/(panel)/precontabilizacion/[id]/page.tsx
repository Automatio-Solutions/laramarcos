import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Field } from "@/components/ui/Field";
import { listClientes } from "@/lib/repos/clientes";
import { regimenDe, type Aviso, type LineaIva, type Regimen, type TipoFactura } from "@/lib/ocr/core";
import { conceptosDe } from "@/lib/ocr/conceptos";
import { corregirFacturaAction } from "../actions";

interface Factura {
  id: string; cliente_id: string | null; tipo: TipoFactura; fecha: string | null; fecha_contable: string | null;
  numero_factura: string | null; proveedor_nombre: string | null; proveedor_cif: string | null;
  concepto: string | null; base_imponible: number | null; iva_tipo: number | null;
  iva_cuota: number | null; lineas_iva: LineaIva[]; retencion_base: number | null; retencion_tipo: number | null;
  retencion_cuota: number | null; total: number | null; subcuenta: string | null; subcuenta_tercero: string | null;
  sujeto_pasivo: boolean; subcuenta_motivo: string | null; subcuenta_origen: "historico" | "ia" | "manual" | null;
  avisos: Aviso[]; confianza: number; archivo_nombre: string | null; ruta_servidor: string | null;
}

const ORIGEN_LABEL: Record<string, string> = {
  historico: "📚 Cuenta habitual de este proveedor",
  ia: "🤖 Sugerida por la IA",
  manual: "✍️ Corregida a mano",
};

// Líneas de IVA editables: una por tipo (21 %, 10 %…). Cada una es una fila del Excel.
const LINEAS = 3;

export default async function RevisarFacturaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();
  const [{ data }, clientes] = await Promise.all([
    supabase.from("facturas_ocr").select("*").eq("id", id).maybeSingle(),
    listClientes(),
  ]);
  if (!data) notFound();
  const f = data as Factura;
  const action = corregirFacturaAction.bind(null, id);
  const v = (n: number | null | undefined) => (n == null ? "" : String(n));

  const { data: cliente } = f.cliente_id
    ? await supabase.from("clientes").select("cif, regimen_contable").eq("id", f.cliente_id).maybeSingle()
    : { data: null };
  const regimen: Regimen = regimenDe(cliente?.cif, cliente?.regimen_contable);
  const tercero = f.tipo === "gasto" ? "proveedor" : "cliente";
  const lineas: LineaIva[] = f.lineas_iva?.length
    ? f.lineas_iva
    : [{ base: f.base_imponible, tipo: f.iva_tipo, cuota: f.iva_cuota }];
  const avisos = f.avisos ?? [];

  return (
    <div className="max-w-3xl space-y-6 p-8">
      <header>
        <Link href="/precontabilizacion" className="text-sm text-fg-muted hover:underline">← Precontabilización</Link>
        <h1 className="mt-1 text-2xl font-bold text-primary">Revisar factura</h1>
        <p className="text-sm text-fg-muted">{f.ruta_servidor ?? f.archivo_nombre} · confianza {f.confianza}%</p>
      </header>

      {avisos.length > 0 && (
        <ul className="space-y-1 rounded-lg border border-border bg-surface-raised p-3 text-sm">
          {avisos.map((a) => (
            <li key={a.codigo} className={a.nivel === "rojo" ? "text-error" : "text-warning"}>
              {a.nivel === "rojo" ? "🔴" : "🟠"} {a.texto}
            </li>
          ))}
        </ul>
      )}

      <form action={action} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
          {/* Obligatorio: sin cliente no sale en ningún Excel. Las del servidor cuya
              carpeta no se pudo emparejar llegan sin él. */}
          <label className="block space-y-1">
            <span className="text-sm font-medium text-fg">Cliente<span className="text-error"> *</span></span>
            <select name="cliente_id" required defaultValue={f.cliente_id ?? ""} className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg">
              <option value="" disabled>— Elige cliente —</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.razon_social}</option>)}
            </select>
            {(error === "cliente" || !f.cliente_id) && (
              <span className="block text-xs text-error">Asigna un cliente: sin él la factura no sale en ningún Excel.</span>
            )}
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium text-fg">Libro</span>
            <select name="tipo" defaultValue={f.tipo} className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg">
              <option value="gasto">Gastos (recibida)</option>
              <option value="ingreso">Ingresos (emitida)</option>
            </select>
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Fecha expedición" name="fecha" type="date" defaultValue={f.fecha} />
          <Field label="Nº factura" name="numero_factura" defaultValue={f.numero_factura} />
          {/* Factura atrasada: conserva su fecha y se contabiliza en otro periodo. */}
          <Field label="Contabilizar en (si es atrasada)" name="fecha_contable" type="date" defaultValue={f.fecha_contable} />
          <Field label={`Nombre del ${tercero}`} name="proveedor_nombre" defaultValue={f.proveedor_nombre} />
          <Field label={`NIF del ${tercero}`} name="proveedor_cif" defaultValue={f.proveedor_cif} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={regimen === "fiscal" ? "Subcuenta (código de concepto)" : "Subcuenta (gasto/ingreso)"}
            name="subcuenta"
            defaultValue={f.subcuenta}
            placeholder={regimen === "fiscal" ? "627" : "62700000"}
          />
          {regimen === "partida_doble" ? (
            <Field
              label={`Subcuenta Gasto/Ingreso (la del ${tercero} en este cliente)`}
              name="subcuenta_tercero"
              defaultValue={f.subcuenta_tercero}
              placeholder={f.tipo === "gasto" ? "41000023" : "43000015"}
            />
          ) : (
            <p className="self-end text-xs text-fg-muted">Autónomo: la columna &quot;Subcuenta Gasto/Ingreso&quot; va vacía.</p>
          )}
        </div>
        {regimen === "fiscal" && (
          <details className="text-xs text-fg-muted">
            <summary className="cursor-pointer">Códigos de concepto de {f.tipo === "gasto" ? "gasto" : "ingreso"}</summary>
            <p className="mt-1">{conceptosDe(f.tipo).map((c) => `${c.codigo} ${c.descripcion}`).join(" · ")}</p>
          </details>
        )}
        {/* AC-02: por qué esa subcuenta. El asesor decide con el motivo delante. */}
        {f.subcuenta_motivo && (
          <div className="rounded-lg border border-border bg-surface-raised p-3 text-sm">
            <p className="font-medium text-fg">
              {ORIGEN_LABEL[f.subcuenta_origen ?? ""] ?? "Subcuenta"}
              {f.subcuenta ? ` · ${f.subcuenta}` : ""}
            </p>
            <p className="mt-1 text-fg-muted">{f.subcuenta_motivo}</p>
          </div>
        )}

        <Field label="Concepto" name="concepto" defaultValue={f.concepto} />

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-fg">IVA (una línea por tipo; cada una es una fila del Excel)</legend>
          {Array.from({ length: LINEAS }, (_, i) => (
            <div key={i} className="grid gap-4 sm:grid-cols-3">
              <Field label={i === 0 ? "Base imponible" : ""} name={`linea_base_${i}`} defaultValue={v(lineas[i]?.base)} />
              <Field label={i === 0 ? "% IVA" : ""} name={`linea_tipo_${i}`} defaultValue={v(lineas[i]?.tipo)} placeholder={i === 0 ? "21" : ""} />
              <Field label={i === 0 ? "Cuota IVA" : ""} name={`linea_cuota_${i}`} defaultValue={v(lineas[i]?.cuota)} />
            </div>
          ))}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Base retención" name="retencion_base" defaultValue={v(f.retencion_base)} />
          <Field label="% Retención" name="retencion_tipo" defaultValue={v(f.retencion_tipo)} placeholder="15" />
          <Field label="Cuota retención" name="retencion_cuota" defaultValue={v(f.retencion_cuota)} />
          <Field label="Total factura" name="total" defaultValue={v(f.total)} />
        </div>

        <label className="flex items-center gap-2 text-sm text-fg">
          <input type="checkbox" name="sujeto_pasivo" defaultChecked={f.sujeto_pasivo} />
          Inversión del sujeto pasivo (se marca con X en el Excel)
        </label>

        <div className="flex gap-3">
          <button className="rounded-md bg-success px-5 py-2 font-medium text-white">Guardar y aprobar</button>
          <Link href="/precontabilizacion" className="rounded-md border border-border px-5 py-2 font-medium text-fg hover:bg-surface-raised">Cancelar</Link>
        </div>
        <p className="text-xs text-fg-muted">
          Al guardar, las subcuentas se memorizan para las próximas facturas de este {tercero} en este cliente.
        </p>
      </form>
    </div>
  );
}
