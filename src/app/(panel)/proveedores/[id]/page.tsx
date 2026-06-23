import Link from "next/link";
import { notFound } from "next/navigation";
import { ProveedorForm } from "@/components/ProveedorForm";
import { getProveedor } from "@/lib/repos/catalogo";
import { updateProveedorAction } from "../actions";

export default async function EditarProveedorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const proveedor = await getProveedor(id);
  if (!proveedor) notFound();
  const action = updateProveedorAction.bind(null, id);

  return (
    <div className="space-y-6 p-8">
      <header>
        <Link href="/proveedores" className="text-sm text-fg-muted hover:underline">← Proveedores</Link>
        <h1 className="mt-1 text-2xl font-bold text-primary">{proveedor.nombre}</h1>
        <p className="font-mono text-xs text-fg-muted">{proveedor.cif}</p>
      </header>
      <ProveedorForm action={action} proveedor={proveedor} />
    </div>
  );
}
