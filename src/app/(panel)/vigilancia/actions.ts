"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { procesarBoletines } from "@/lib/vigilancia/procesar";
import { enviarEmail, hayResend, trocear, REMITENTE_CIRCULARES } from "@/lib/email/cliente";
import { emailCircular } from "@/lib/email/plantillas";

// Demo/manual: procesa unos items de ejemplo para ver el pipeline (en prod lo hace n8n).
export async function procesarEjemploAction() {
  const admin = createAdminClient();
  const fecha = new Date().toISOString().slice(0, 10);
  const stamp = Date.now();
  await procesarBoletines(admin, fecha, [
    { boletin: "DOE", titulo: `Ayudas para bares y restaurantes de Extremadura, plazo abierto`, enlace: `https://doe.es/ej-${stamp}-1` },
    { boletin: "BOE", titulo: `Nueva obligación de registro para el sector de la construcción`, enlace: `https://boe.es/ej-${stamp}-2` },
    { boletin: "DOE", titulo: `Convocatoria de subvenciones agrarias y de ganadería`, enlace: `https://doe.es/ej-${stamp}-3` },
  ]);
  revalidatePath("/vigilancia");
}

/**
 * UC-303/304: envía una circular a los clientes del sector.
 *
 * Los destinatarios van en copia oculta y en tandas de 50 (límite de Resend),
 * para que ningún cliente vea la cartera del despacho.
 */
export async function enviarNewsletterAction(id: string) {
  const admin = createAdminClient();

  const { data: n } = await admin
    .from("newsletters")
    .select("id, fecha, contenido, enviada, sector_id, sector:sectores(nombre)")
    .eq("id", id)
    .maybeSingle();
  if (!n || n.enviada || !n.sector_id) return;

  const { data: rels } = await admin
    .from("cliente_sectores")
    .select("cliente:clientes(email)")
    .eq("sector_id", n.sector_id);

  const correos = Array.from(
    new Set(
      (rels ?? [])
        .map((r) => (r.cliente as unknown as { email: string | null } | null)?.email)
        .filter((e): e is string => Boolean(e)),
    ),
  );

  // AC-09: sin destinatarios no se envía nada, y el estado no miente.
  if (!correos.length || !hayResend()) return;

  const sector = (n.sector as unknown as { nombre: string } | null)?.nombre ?? "su sector";
  const { asunto, html } = emailCircular({ sector, fecha: n.fecha, contenido: n.contenido });

  let enviados = 0;
  let ultimoId: string | undefined;
  for (const tanda of trocear(correos)) {
    const res = await enviarEmail({
      from: REMITENTE_CIRCULARES,
      to: "circulares@laramarcosasesores.es",
      bcc: tanda,
      replyTo: "circulares@laramarcosasesores.es",
      subject: asunto,
      html,
    });
    if (res.ok) {
      enviados += tanda.length;
      ultimoId = res.id ?? ultimoId;
    }
  }

  // Solo se marca enviada si salió al menos una tanda.
  if (enviados > 0) {
    await admin
      .from("newsletters")
      .update({ enviada: true, destinatarios: enviados, resend_msg_id: ultimoId ?? null })
      .eq("id", id);
  }
  revalidatePath("/vigilancia");
}
