import Link from "next/link";
import { logoutAction } from "@/app/login/actions";

const NAV = [
  { href: "/clientes", label: "Clientes", icon: "👥", active: true },
  { href: "#", label: "Servicios", icon: "📦" },
  { href: "#", label: "Proveedores", icon: "🏭" },
  { href: "#", label: "Sectores", icon: "🏷️" },
  { href: "#", label: "Auditoría", icon: "📋" },
];

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="flex w-64 flex-col bg-primary text-white">
        <div className="border-b border-white/10 px-6 py-5">
          <p className="text-lg font-bold">LaraMarcos</p>
          <p className="text-xs text-white/60">Asesores</p>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {NAV.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm ${
                item.active ? "bg-white/15 font-medium" : "text-white/70 hover:bg-white/10"
              }`}
            >
              <span aria-hidden>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
        <form action={logoutAction} className="border-t border-white/10 p-3">
          <button className="w-full rounded-md px-3 py-2 text-left text-sm text-white/70 hover:bg-white/10">
            Cerrar sesión
          </button>
        </form>
      </aside>
      <main className="flex-1 bg-surface-raised">{children}</main>
    </div>
  );
}
