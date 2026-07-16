import { test } from "node:test";
import assert from "node:assert/strict";
import { semaforo, inferirCuotaIva, filaAplifisa, COLUMNAS_APLIFISA } from "../../src/lib/ocr/core.ts";

test("semaforo: umbrales verde/naranja/rojo", () => {
  assert.equal(semaforo(95), "verde");
  assert.equal(semaforo(90), "verde");
  assert.equal(semaforo(75), "naranja");
  assert.equal(semaforo(60), "naranja");
  assert.equal(semaforo(40), "rojo");
});

test("inferirCuotaIva: base * tipo", () => {
  assert.equal(inferirCuotaIva(1000, 21), 210);
  assert.equal(inferirCuotaIva(200, 10), 20);
  assert.equal(inferirCuotaIva(null, 21), null);
});

test("filaAplifisa: orden de columnas + total/cuota inferidos", () => {
  const fila = filaAplifisa({
    fecha: "2026-03-01", proveedor_nombre: "Endesa", proveedor_cif: "A28023430",
    concepto: "Suministro", base_imponible: 1000, iva_tipo: 21, iva_cuota: null,
    total: null, subcuenta: "628", subcuenta_motivo: null, subcuenta_origen: null,
  });
  assert.equal(fila.length, COLUMNAS_APLIFISA.length);
  assert.equal(fila[0], "2026-03-01");
  assert.equal(fila[4], 1000);  // base
  assert.equal(fila[6], 210);   // cuota inferida
  assert.equal(fila[7], 1210);  // total inferido
  assert.equal(fila[8], "628"); // subcuenta
});
