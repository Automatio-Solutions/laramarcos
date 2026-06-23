import Link from "next/link";
import { TareaForm } from "@/components/TareaForm";
import { listClientes, listAsesores } from "@/lib/repos/clientes";

export default async function NuevaTareaPage() {
  const [clientes, asesores] = await Promise.all([listClientes(), listAsesores()]);
  return (
    <div className="space-y-6 p-8">
      <header>
        <Link href="/tareas" className="text-sm text-fg-muted hover:underline">← Tareas</Link>
        <h1 className="mt-1 text-2xl font-bold text-primary">Nueva tarea</h1>
      </header>
      <TareaForm clientes={clientes} asesores={asesores} />
    </div>
  );
}
