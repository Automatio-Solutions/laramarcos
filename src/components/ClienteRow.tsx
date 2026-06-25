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
      <td className="px-4 py-3 text-fg">{c.razon_social}</td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {c.sectores.map((s) => (
            <span key={s.id} className="rounded-md bg-primary-subtle px-2 py-0.5 text-xs text-primary">
              {s.nombre}
            </span>
          ))}
        </div>
      </td>
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
