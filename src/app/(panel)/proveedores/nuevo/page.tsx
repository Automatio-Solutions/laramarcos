import Link from "next/link";
import { ProveedorForm } from "@/components/ProveedorForm";
import { createProveedorAction } from "../actions";

export default function NuevoProveedorPage() {
  return (
    <div className="space-y-6 p-8">
      <header>
        <Link href="/proveedores" className="text-sm text-fg-muted hover:underline">← Proveedores</Link>
        <h1 className="mt-1 text-2xl font-bold text-primary">Nuevo proveedor</h1>
      </header>
      <ProveedorForm action={createProveedorAction} />
    </div>
  );
}
