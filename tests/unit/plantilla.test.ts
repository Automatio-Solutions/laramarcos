import { test } from "node:test";
import assert from "node:assert/strict";
import { instanciar } from "../../src/lib/plantilla.ts";

test("instanciar: ordena pasos y calcula fechas relativas", () => {
  const pasos = [
    { orden: 2, nombre: "Alta censal", plazo_relativo_dias: 5 },
    { orden: 1, nombre: "Notaría", plazo_relativo_dias: 0 },
    { orden: 3, nombre: "Alta SS", plazo_relativo_dias: 10 },
  ];
  const subtareas = instanciar(pasos, new Date("2026-01-01"));
  assert.deepEqual(
    subtareas.map((s) => s.nombre),
    ["Notaría", "Alta censal", "Alta SS"],
  );
  assert.equal(subtareas[0].fecha_limite, "2026-01-01");
  assert.equal(subtareas[1].fecha_limite, "2026-01-06");
  assert.equal(subtareas[2].fecha_limite, "2026-01-11");
});
