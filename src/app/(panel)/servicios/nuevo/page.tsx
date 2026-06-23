import Link from "next/link";
import { ServicioForm } from "@/components/ServicioForm";
import { createServicioAction } from "../actions";

export default function NuevoServicioPage() {
  return (
    <div className="space-y-6 p-8">
      <header>
        <Link href="/servicios" className="text-sm text-fg-muted hover:underline">← Servicios</Link>
        <h1 className="mt-1 text-2xl font-bold text-primary">Nuevo servicio</h1>
      </header>
      <ServicioForm action={createServicioAction} />
    </div>
  );
}
