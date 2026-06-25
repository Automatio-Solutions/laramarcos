import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Field } from "@/components/ui/Field";
import { corregirFacturaAction } from "../actions";

interface Factura {
  id: string; fecha: string | null; proveedor_nombre: string | null; proveedor_cif: string | null;
  concepto: string | null; base_imponible: number | null; iva_tipo: number | null;
  iva_cuota: number | null; total: number | null; subcuenta: string | null;
  confianza: number; archivo_nombre: string | null;
}

export default async function RevisarFacturaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("facturas_ocr").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const f = data as Factura;
  const action = corregirFacturaAction.bind(null, id);
  const v = (n: number | null) => (n == null ? "" : String(n));

  return (
    <div className="max-w-2xl space-y-6 p-8">
      <header>
        <Link href="/precontabilizacion" className="text-sm text-fg-muted hover:underline">← Precontabilización</Link>
        <h1 className="mt-1 text-2xl font-bold text-primary">Revisar factura</h1>
        <p className="text-sm text-fg-muted">{f.archivo_nombre} · confianza {f.confianza}%</p>
      </header>

      <form action={action} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Fecha" name="fecha" type="date" defaultValue={f.fecha} />
          <Field label="Proveedor" name="proveedor_nombre" defaultValue={f.proveedor_nombre} />
          <Field label="CIF proveedor" name="proveedor_cif" defaultValue={f.proveedor_cif} />
          <Field label="Subcuenta" name="subcuenta" defaultValue={f.subcuenta} placeholder="600 / 628 / 410…" />
        </div>
        <Field label="Concepto" name="concepto" defaultValue={f.concepto} />
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Base imponible" name="base_imponible" defaultValue={v(f.base_imponible)} />
          <Field label="% IVA" name="iva_tipo" defaultValue={v(f.iva_tipo)} />
          <Field label="Cuota IVA" name="iva_cuota" defaultValue={v(f.iva_cuota)} />
          <Field label="Total" name="total" defaultValue={v(f.total)} />
        </div>

        <div className="flex gap-3">
          <button className="rounded-md bg-success px-5 py-2 font-medium text-white">Guardar y aprobar</button>
          <Link href="/precontabilizacion" className="rounded-md border border-border px-5 py-2 font-medium text-fg hover:bg-surface-raised">Cancelar</Link>
        </div>
        <p className="text-xs text-fg-muted">Al guardar, la subcuenta se memoriza para futuras facturas de este proveedor (aprendizaje).</p>
      </form>
    </div>
  );
}
