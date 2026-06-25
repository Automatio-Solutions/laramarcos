import Link from "next/link";
import type { TareaConRelaciones, EstadoTarea } from "@/lib/types";

const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const CHIP: Record<EstadoTarea, string> = {
  pendiente: "bg-neutral-100 text-neutral-700",
  en_curso: "bg-info/15 text-info",
  bloqueada: "bg-error/15 text-error",
  completada: "bg-success/15 text-success",
};

function ymd(d: Date) { return d.toISOString().slice(0, 10); }

export function CalendarioMensual({ tareas, mes }: { tareas: TareaConRelaciones[]; mes: string }) {
  const [yy, mm] = mes.split("-").map(Number);
  const year = yy, month = mm - 1; // 0-based
  const primero = new Date(Date.UTC(year, month, 1));
  const offset = (primero.getUTCDay() + 6) % 7; // lunes = 0
  const diasMes = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const hoy = ymd(new Date());

  // tareas por día (las que tienen vencimiento en este mes)
  const porDia = new Map<string, TareaConRelaciones[]>();
  for (const t of tareas) {
    if (!t.vencimiento) continue;
    if (!porDia.has(t.vencimiento)) porDia.set(t.vencimiento, []);
    porDia.get(t.vencimiento)!.push(t);
  }

  // celdas: huecos previos + días
  const celdas: (string | null)[] = [];
  for (let i = 0; i < offset; i++) celdas.push(null);
  for (let d = 1; d <= diasMes; d++) celdas.push(ymd(new Date(Date.UTC(year, month, d))));
  while (celdas.length % 7 !== 0) celdas.push(null);

  const prevMes = new Date(Date.UTC(year, month - 1, 1)).toISOString().slice(0, 7);
  const nextMes = new Date(Date.UTC(year, month + 1, 1)).toISOString().slice(0, 7);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold capitalize text-primary">{MESES[month]} {year}</h2>
        <div className="flex gap-1">
          <Link href={`/tareas?view=calendario&mes=${prevMes}`} className="rounded-md border border-border px-3 py-1.5 text-sm text-fg hover:bg-surface-raised">←</Link>
          <Link href={`/tareas?view=calendario&mes=${nextMes}`} className="rounded-md border border-border px-3 py-1.5 text-sm text-fg hover:bg-surface-raised">→</Link>
        </div>
      </div>

      <div className="grid grid-cols-7 overflow-hidden rounded-lg border border-border bg-surface text-sm">
        {DIAS.map((d) => (
          <div key={d} className="border-b border-border bg-surface-raised px-2 py-2 text-center text-xs font-medium text-fg-muted">{d}</div>
        ))}
        {celdas.map((dia, i) => {
          const items = dia ? porDia.get(dia) ?? [] : [];
          const num = dia ? Number(dia.slice(8, 10)) : null;
          return (
            <div key={i} className={`min-h-28 border-b border-r border-border p-1.5 ${dia ? "" : "bg-surface-raised/40"}`}>
              {dia && (
                <>
                  <div className={`mb-1 text-right text-xs ${dia === hoy ? "font-bold text-primary" : "text-fg-muted"}`}>
                    {dia === hoy ? <span className="rounded-full bg-primary px-1.5 py-0.5 text-white">{num}</span> : num}
                  </div>
                  <div className="space-y-1">
                    {items.slice(0, 3).map((t) => (
                      <Link key={t.id} href={`/tareas/${t.id}`} className={`block truncate rounded px-1.5 py-0.5 text-xs ${CHIP[t.estado]} hover:opacity-80`} title={t.titulo}>
                        {t.titulo}
                      </Link>
                    ))}
                    {items.length > 3 && <p className="px-1 text-[10px] text-fg-muted">+{items.length - 3} más</p>}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
