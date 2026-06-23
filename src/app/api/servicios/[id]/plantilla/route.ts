import { NextResponse, type NextRequest } from "next/server";
import { getPasos, instanciar } from "@/lib/repos/plantillas";

// AC-16: instancia la plantilla de subtareas de un servicio devolviendo las
// subtareas con sus fechas límite calculadas a partir de ?inicio=YYYY-MM-DD.
// Lo consume M2 al aceptar un presupuesto para crear la tarea en M1.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const inicioParam = request.nextUrl.searchParams.get("inicio");
  const inicio = inicioParam ? new Date(inicioParam) : new Date();
  if (Number.isNaN(inicio.getTime())) {
    return NextResponse.json({ error: "Parámetro 'inicio' inválido." }, { status: 400 });
  }

  try {
    const pasos = await getPasos(id);
    const subtareas = instanciar(pasos, inicio);
    return NextResponse.json({
      servicio_id: id,
      inicio: inicio.toISOString().slice(0, 10),
      subtareas,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "error" },
      { status: 500 },
    );
  }
}
