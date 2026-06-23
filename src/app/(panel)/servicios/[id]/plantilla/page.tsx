import Link from "next/link";
import { notFound } from "next/navigation";
import { getServicio } from "@/lib/repos/catalogo";
import { getPasos } from "@/lib/repos/plantillas";
import { PlantillaEditor } from "@/components/PlantillaEditor";
import { savePlantillaAction } from "./actions";

export default async function PlantillaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [servicio, pasos] = await Promise.all([getServicio(id), getPasos(id)]);
  if (!servicio) notFound();

  return (
    <div className="space-y-6 p-8">
      <header>
        <Link href="/servicios" className="text-sm text-fg-muted hover:underline">← Servicios</Link>
        <h1 className="mt-1 text-2xl font-bold text-primary">Plantilla de subtareas</h1>
        <p className="text-sm text-fg-muted">
          {servicio.nombre} · pasos y plazos relativos (días desde el inicio). Se instancian al aceptar un presupuesto (M2).
        </p>
      </header>
      <PlantillaEditor servicioId={id} pasosIniciales={pasos} action={savePlantillaAction} />
    </div>
  );
}
