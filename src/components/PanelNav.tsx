"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/clientes", label: "Clientes", icon: "👥" },
  { href: "/servicios", label: "Servicios", icon: "📦" },
  { href: "/proveedores", label: "Proveedores", icon: "🏭" },
  { href: "/sectores", label: "Sectores", icon: "🏷️" },
  { href: "/auditoria", label: "Auditoría", icon: "📋" },
];

export function PanelNav() {
  const pathname = usePathname();
  return (
    <nav className="flex-1 space-y-1 p-3">
      {NAV.map((item) => {
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm ${
              active ? "bg-white/15 font-medium" : "text-white/70 hover:bg-white/10"
            }`}
          >
            <span aria-hidden>{item.icon}</span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
