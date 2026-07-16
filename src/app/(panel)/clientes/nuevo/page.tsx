import Link from "next/link";
import { ClienteForm } from "@/components/ClienteForm";
import { listSectores, listAsesores, getMiOficina } from "@/lib/repos/clientes";
import { createClienteAction } from "../actions";

export default async function NuevoClientePage() {
  const [sectores, asesores, miOficina] = await Promise.all([listSectores(), listAsesores(), getMiOficina()]);

  return (
    <div className="space-y-6 p-8">
      <header>
        <Link href="/clientes" className="text-sm text-fg-muted hover:underline">
          ← Clientes
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-primary">Nuevo cliente</h1>
      </header>
      <ClienteForm action={createClienteAction} sectores={sectores} asesores={asesores} miOficina={miOficina} />
    </div>
  );
}
