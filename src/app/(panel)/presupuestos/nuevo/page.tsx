import Link from "next/link";
import { GeneradorPresupuesto } from "@/components/GeneradorPresupuesto";
import { listClientes } from "@/lib/repos/clientes";
import { listServicios } from "@/lib/repos/catalogo";

export default async function NuevoPresupuestoPage() {
  const [clientes, servicios] = await Promise.all([listClientes(), listServicios()]);
  return (
    <div className="space-y-6 p-8">
      <header>
        <Link href="/presupuestos" className="text-sm text-fg-muted hover:underline">← Presupuestos</Link>
        <h1 className="mt-1 text-2xl font-bold text-primary">Nuevo presupuesto</h1>
      </header>
      <GeneradorPresupuesto clientes={clientes} servicios={servicios} />
    </div>
  );
}
