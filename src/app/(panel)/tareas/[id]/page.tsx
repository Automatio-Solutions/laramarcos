import { TareaDetalleView } from "@/components/TareaDetalleView";

export default async function TareaDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="mx-auto max-w-4xl p-8">
      <TareaDetalleView id={id} />
    </div>
  );
}
