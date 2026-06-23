import Link from "next/link";
import { notFound } from "next/navigation";
import { ServicioForm } from "@/components/ServicioForm";
import { getServicio } from "@/lib/repos/catalogo";
import { updateServicioAction } from "../actions";

export default async function EditarServicioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const servicio = await getServicio(id);
  if (!servicio) notFound();
  const action = updateServicioAction.bind(null, id);

  return (
    <div className="space-y-6 p-8">
      <header>
        <Link href="/servicios" className="text-sm text-fg-muted hover:underline">← Servicios</Link>
        <h1 className="mt-1 text-2xl font-bold text-primary">{servicio.nombre}</h1>
      </header>
      <ServicioForm action={action} servicio={servicio} />
    </div>
  );
}
