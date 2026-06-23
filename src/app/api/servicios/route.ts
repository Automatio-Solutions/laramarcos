import { NextResponse } from "next/server";
import { listServicios } from "@/lib/repos/catalogo";

// Catálogo de servicios vigente, para consumo de M2 (presupuestación con IA).
// Devuelve siempre la versión más reciente desde la BBDD central (AC-10).
export async function GET() {
  try {
    const servicios = await listServicios();
    return NextResponse.json({
      servicios: servicios
        .filter((s) => s.activo)
        .map((s) => ({
          id: s.id,
          nombre: s.nombre,
          categoria: s.categoria,
          precio_base: s.precio_base,
          condiciones_default: s.condiciones_default,
        })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "error" },
      { status: 500 },
    );
  }
}
