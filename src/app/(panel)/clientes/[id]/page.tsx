import Link from "next/link";
import { notFound } from "next/navigation";
import { ClienteForm } from "@/components/ClienteForm";
import { getCliente, listSectores, listAsesores } from "@/lib/repos/clientes";
import { updateClienteAction } from "../actions";

export default async function EditarClientePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [cliente, sectores, asesores] = await Promise.all([
    getCliente(id),
    listSectores(),
    listAsesores(),
  ]);

  if (!cliente) notFound();

  const action = updateClienteAction.bind(null, id);

  return (
    <div className="space-y-6 p-8">
      <header>
        <Link href="/clientes" className="text-sm text-fg-muted hover:underline">
          ← Clientes
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-primary">{cliente.razon_social}</h1>
        <p className="font-mono text-xs text-fg-muted">{cliente.cif}</p>
      </header>
      <ClienteForm action={action} sectores={sectores} asesores={asesores} cliente={cliente} />
    </div>
  );
}
