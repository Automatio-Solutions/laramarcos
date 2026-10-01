import { createAdminClient } from "@/lib/supabase/admin";
import { autorizadoAgente, noAutorizado } from "@/lib/agente/auth";
import { todosLosClientes } from "@/lib/ocr/registrar";

/**
 * Clientes activos, para que el programa del servidor sepa qué carpetas de
 * cliente son de verdad: solo en esas crea las carpetas del trimestre, y las que
 * no emparejan las lista para que el despacho las revise. Solo lo justo para
 * emparejar (nombre, NIF, código, oficina).
 */
export async function GET(request: Request) {
  if (!autorizadoAgente(request)) return noAutorizado();
  const admin = createAdminClient();
  const activos = new Set<string>();
  for (let desde = 0; ; desde += 1000) {
    const { data } = await admin.from("clientes").select("id").eq("activo", true).order("id").range(desde, desde + 999);
    for (const c of data ?? []) activos.add(c.id);
    if (!data || data.length < 1000) break;
  }
  const clientes = (await todosLosClientes(admin)).filter((c) => activos.has(c.id));
  return Response.json({ clientes });
}
