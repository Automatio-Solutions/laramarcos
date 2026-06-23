// Cálculo de alertas de vencimiento (UC-103). Puro y testeable.
// 7 días y 48h antes → aviso al responsable de la tarea.
// Vencida sin completar → escalado al/los responsable(s) del despacho.

export interface TareaAlerta {
  id: string;
  titulo: string;
  vencimiento: string | null; // YYYY-MM-DD
  estado: string;
  bloqueada: boolean;
  responsable_id: string | null;
}

export interface AvisoGenerado {
  usuario_id: string;
  tipo: "alerta_7d" | "alerta_48h" | "escalado";
  mensaje: string;
  enlace: string;
}

function diaUTC(s: string): number {
  return Math.floor(new Date(`${s}T00:00:00Z`).getTime() / 86_400_000);
}

export function computeAlertas(
  tareas: TareaAlerta[],
  hoy: string,
  responsablesDespacho: string[],
): AvisoGenerado[] {
  const hoyN = diaUTC(hoy);
  const out: AvisoGenerado[] = [];

  for (const t of tareas) {
    if (t.estado === "completada" || t.bloqueada || !t.vencimiento) continue;
    const dias = diaUTC(t.vencimiento) - hoyN;
    const enlace = `/tareas/${t.id}`;

    if (dias === 7 && t.responsable_id) {
      out.push({ usuario_id: t.responsable_id, tipo: "alerta_7d", mensaje: `Vence en 7 días: ${t.titulo}`, enlace });
    } else if (dias === 2 && t.responsable_id) {
      out.push({ usuario_id: t.responsable_id, tipo: "alerta_48h", mensaje: `Vence en 48h: ${t.titulo}`, enlace });
    } else if (dias < 0) {
      // vencida sin completar → escalar al/los responsable(s) del despacho
      for (const r of responsablesDespacho) {
        out.push({ usuario_id: r, tipo: "escalado", mensaje: `VENCIDA sin completar: ${t.titulo}`, enlace });
      }
    }
  }
  return out;
}
