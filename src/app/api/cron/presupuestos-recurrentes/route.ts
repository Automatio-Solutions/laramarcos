import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// UC-208 AC-17: genera los presupuestos recurrentes vencidos (cada N días).
// El envío automático por Resend se añadirá cuando haya RESEND_API_KEY.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  }

  const admin = createAdminClient();
  const hoy = new Date().toISOString().slice(0, 10);

  const { data: recs } = await admin
    .from("presupuestos_recurrentes")
    .select("id, cliente_id, servicio_id, periodo_dias, proximo, creado_por")
    .eq("activo", true)
    .lte("proximo", hoy);

  let generados = 0;
  for (const r of recs ?? []) {
    const { data: serv } = await admin.from("servicios").select("nombre, precio_base").eq("id", r.servicio_id).maybeSingle();
    if (!serv) continue;
    const precio = Number(serv.precio_base);
    await admin.from("presupuestos").insert({
      cliente_id: r.cliente_id,
      servicio_id: r.servicio_id,
      creado_por: r.creado_por,
      estado: "borrador",
      lineas: [{ concepto: serv.nombre, cantidad: 1, precio, descuento: 0 }],
      total: precio,
    });
    const prox = new Date(`${r.proximo}T00:00:00Z`);
    prox.setUTCDate(prox.getUTCDate() + r.periodo_dias);
    await admin.from("presupuestos_recurrentes").update({ proximo: prox.toISOString().slice(0, 10) }).eq("id", r.id);
    generados++;
  }

  return NextResponse.json({ fecha: hoy, evaluados: recs?.length ?? 0, generados });
}
