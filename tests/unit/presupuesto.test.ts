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

test("calcularTotal: descuentos por línea y global, con IVA desglosado", () => {
  // Los precios del catálogo son base imponible; el IVA (21%) se añade encima.
  assert.deepEqual(calcularTotal([{ concepto: "x", cantidad: 2, precio: 100, descuento: 10 }], 0), {
    subtotal: 180, base_imponible: 180, iva_cuota: 37.8, total: 217.8,
  });
  assert.deepEqual(calcularTotal([{ concepto: "x", cantidad: 1, precio: 100, descuento: 0 }], 10), {
    subtotal: 100, base_imponible: 90, iva_cuota: 18.9, total: 108.9,
  });
});

test("calcularTotal: base + cuota cuadra exactamente con el total (sin céntimo perdido)", () => {
  // Caso real del tarifario: FSCL-003 (45 €) → 54,45 € con IVA.
  const t = calcularTotal([{ concepto: "Certificado digital", cantidad: 1, precio: 45, descuento: 0 }], 0);
  assert.equal(t.total, 54.45);
  assert.equal(t.base_imponible + t.iva_cuota, t.total);
});

test("calcularTotal: tarifa horaria (FSCL-007, 55 €/hora x 3 horas)", () => {
  const t = calcularTotal([{ concepto: "Representación ante inspección AEAT", cantidad: 3, precio: 55, descuento: 0 }], 0);
  assert.equal(t.base_imponible, 165);
  assert.equal(t.iva_cuota, 34.65);
  assert.equal(t.total, 199.65);
});

test("calcularTotal: IVA configurable (por si algún servicio no va al 21%)", () => {
  const t = calcularTotal([{ concepto: "x", cantidad: 1, precio: 100, descuento: 0 }], 0, 10);
  assert.deepEqual(t, { subtotal: 100, base_imponible: 100, iva_cuota: 10, total: 110 });
});
