import { test } from "node:test";
import assert from "node:assert/strict";
import { generarDesdeTexto, calcularTotal } from "../../src/lib/presupuesto/core.ts";

const catalogo = [
  { id: "s1", nombre: "Constitución SL", precio_base: 350 },
  { id: "s2", nombre: "Declaración IVA trimestral", precio_base: 90 },
];

test("generarDesdeTexto: identifica servicios del catálogo", () => {
  const r = generarDesdeTexto("Necesito la constitucion de una SL con 3 socios", catalogo);
  assert.equal(r.aviso, null);
  assert.equal(r.lineas.length, 1);
  assert.equal(r.lineas[0].concepto, "Constitución SL");
  assert.equal(r.lineas[0].precio, 350);
});

test("generarDesdeTexto: ignora acentos y avisa si no hay match (AC-03)", () => {
  const r1 = generarDesdeTexto("declaracion de IVA del trimestre", catalogo);
  assert.equal(r1.lineas.length, 1);
  assert.equal(r1.lineas[0].concepto, "Declaración IVA trimestral");

  const r2 = generarDesdeTexto("algo totalmente ajeno xyz", catalogo);
  assert.equal(r2.lineas.length, 0);
  assert.ok(r2.aviso && r2.aviso.length > 0);
});

test("calcularTotal: descuentos por línea y global", () => {
  assert.deepEqual(calcularTotal([{ concepto: "x", cantidad: 2, precio: 100, descuento: 10 }], 0), { subtotal: 180, total: 180 });
  assert.deepEqual(calcularTotal([{ concepto: "x", cantidad: 1, precio: 100, descuento: 0 }], 10), { subtotal: 100, total: 90 });
});
