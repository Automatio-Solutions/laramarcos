import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PrintButton } from "@/components/PrintButton";
import { calcularTotal, type LineaPresupuesto } from "@/lib/presupuesto/core";

const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });

// UC-203 AC-06: documento del presupuesto con branding (logo/colores/condiciones/firma).
// Imprimible a PDF desde el navegador. Requiere sesión (protegido por middleware).
export default async function ImprimirPresupuestoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("presupuestos")
    .select("lineas, descuento_global, condiciones, validez_dias, created_at, cliente:clientes(razon_social, cif, direccion)")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();

  const lineas = (data.lineas as LineaPresupuesto[]) ?? [];
  const cli = data.cliente as unknown as { razon_social: string; cif: string; direccion: string | null } | null;
  const { subtotal, total } = calcularTotal(lineas, Number(data.descuento_global ?? 0));

  return (
    <main className="mx-auto max-w-3xl bg-white p-10 text-[#1f223e]">
      <div className="mb-6 flex items-start justify-between">
        <PrintButton />
        <p className="text-xs text-neutral-400 print:hidden">Usa &quot;Guardar como PDF&quot; en el diálogo de impresión.</p>
      </div>

      {/* Cabecera con branding */}
      <header className="flex items-start justify-between border-b-2 border-[#1f223e] pb-4">
        <div>
          <h1 className="text-2xl font-bold text-[#1f223e]">LaraMarcos Asesores</h1>
          <p className="text-sm text-neutral-500">presupuestos@laramarcos.es</p>
        </div>
        <div className="text-right text-sm">
          <p className="font-semibold">PRESUPUESTO</p>
          <p className="text-neutral-500">{new Date(data.created_at as string).toLocaleDateString("es-ES")}</p>
        </div>
      </header>

      {/* Datos del cliente (auto desde M5) */}
      {cli && (
        <section className="mt-6 text-sm">
          <p className="font-semibold">{cli.razon_social}</p>
          <p className="text-neutral-600">{cli.cif}</p>
          {cli.direccion && <p className="text-neutral-600">{cli.direccion}</p>}
        </section>
      )}

      {/* Líneas */}
      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-300 text-left text-neutral-500">
            <th className="py-2">Concepto</th>
            <th className="py-2 text-right">Cant.</th>
            <th className="py-2 text-right">Precio</th>
            <th className="py-2 text-right">Dto</th>
            <th className="py-2 text-right">Importe</th>
          </tr>
        </thead>
        <tbody>
          {lineas.map((l, i) => (
            <tr key={i} className="border-b border-neutral-100">
              <td className="py-2">{l.concepto}</td>
              <td className="py-2 text-right">{l.cantidad}</td>
              <td className="py-2 text-right">{eur.format(l.precio)}</td>
              <td className="py-2 text-right">{l.descuento ? `${l.descuento}%` : "—"}</td>
              <td className="py-2 text-right font-medium">{eur.format(l.cantidad * l.precio * (1 - (l.descuento || 0) / 100))}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 ml-auto w-64 space-y-1 text-sm">
        <div className="flex justify-between text-neutral-500"><span>Subtotal</span><span>{eur.format(subtotal)}</span></div>
        {Number(data.descuento_global) > 0 && (
          <div className="flex justify-between text-neutral-500"><span>Descuento global</span><span>{data.descuento_global}%</span></div>
        )}
        <div className="flex justify-between border-t border-[#1f223e] pt-1 text-lg font-bold text-[#1f223e]"><span>Total</span><span>{eur.format(total)}</span></div>
      </div>

      {/* Condiciones + firma */}
      <section className="mt-8 text-xs text-neutral-500">
        {data.condiciones && <p className="mb-2">{data.condiciones}</p>}
        <p>Validez del presupuesto: {data.validez_dias} días desde la fecha de emisión.</p>
        <p className="mt-6 border-t border-neutral-200 pt-3">LaraMarcos Asesores · Extremadura · presupuestos@laramarcos.es</p>
      </section>
    </main>
  );
}
