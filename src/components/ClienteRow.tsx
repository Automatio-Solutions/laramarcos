"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ClienteConRelaciones } from "@/lib/types";

export function ClienteRow({ cliente: c }: { cliente: ClienteConRelaciones }) {
  const router = useRouter();
  const href = `/clientes/${c.id}`;

  return (
    <tr
      onClick={() => router.push(href)}
      className="cursor-pointer border-t border-border hover:bg-surface-raised"
    >
      <td className="px-4 py-3 font-mono text-xs text-fg">{c.cif}</td>
      <td className="px-4 py-3 text-fg">
        {c.razon_social}
        {c.fecha_baja && (
          <span className="ml-2 rounded bg-error/10 px-1.5 py-0.5 text-[11px] font-medium text-error">
            Baja {new Date(c.fecha_baja).toLocaleDateString("es-ES")}
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {c.sectores.map((s) => (
            <span key={s.id} className="rounded-md bg-primary-subtle px-2 py-0.5 text-xs text-primary">
              {s.nombre}
            </span>
          ))}
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {c.servicios.filter((s) => !s.fecha_fin).map((s) => (
            <span key={s.id} className="rounded-md bg-accent/10 px-2 py-0.5 text-xs text-accent">
              {s.servicio_nombre}
            </span>
          ))}
          {c.servicios.filter((s) => !s.fecha_fin).length === 0 && <span className="text-xs text-fg-muted">—</span>}
        </div>
      </td>
      <td className="px-4 py-3 text-fg-muted">{c.oficina ?? "—"}</td>
      <td className="px-4 py-3 text-fg-muted">{c.asesor_nombre ?? "—"}</td>
      <td className="px-4 py-3 text-right">
        <Link
          href={href}
          onClick={(e) => e.stopPropagation()}
          className="text-sm font-medium text-accent hover:underline"
        >
          Editar
        </Link>
      </td>
    </tr>
  );
}
