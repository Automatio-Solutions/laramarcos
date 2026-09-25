import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import {
  semaforo, inferirCuotaIva, filaAplifisa, COLUMNAS_APLIFISA, esExportable,
  trimestreDe, rangoTrimestre, resolverClienteCarpeta, resolverClienteRuta, esCarpetaDePeriodo,
  type FacturaDatos, type ClienteCarpeta,
} from "../../src/lib/ocr/core.ts";
import { mimeFactura, esFicheroOculto } from "../../src/lib/ocr/subida.ts";
import { generarExcelAplifisa, type FacturaExcel } from "../../src/lib/ocr/aplifisa.ts";

const VACIA: FacturaDatos = {
  fecha: null, numero_factura: null, proveedor_nombre: null, proveedor_cif: null, concepto: null,
  base_imponible: null, iva_tipo: null, iva_cuota: null,
  retencion_base: null, retencion_tipo: null, retencion_cuota: null, total: null,
  subcuenta: null, subcuenta_motivo: null, subcuenta_origen: null,
};

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

test("COLUMNAS_APLIFISA: las 12 del MODELO LIBRO FACTURAS, en su orden", () => {
  assert.deepEqual([...COLUMNAS_APLIFISA], [
    "Fecha Expedición *", "Nº Factura *", "Nombre *", "NIF", "Subcuenta", "Base Imponible",
    "% IVA", "Cuota IVA", "Base Retencion", "% Retencion", "Cuota retencion", "Total Factura",
  ]);
});

test("filaAplifisa: orden, fecha como Date, % en tanto por uno, cuota y total inferidos", () => {
  const fila = filaAplifisa({
    ...VACIA, fecha: "2026-03-01", numero_factura: "F-2026/0012", proveedor_nombre: "Endesa",
    proveedor_cif: "A28023430", base_imponible: 1000, iva_tipo: 21, subcuenta: "628",
  });
  assert.equal(fila.length, COLUMNAS_APLIFISA.length);
  assert.deepEqual(fila[0], new Date(Date.UTC(2026, 2, 1)));
  assert.equal(fila[1], "F-2026/0012");
  assert.equal(fila[2], "Endesa");
  assert.equal(fila[4], "628");
  assert.equal(fila[5], 1000);
  assert.equal(fila[6], 0.21);   // % IVA en tanto por uno
  assert.equal(fila[7], 210);    // cuota inferida
  assert.equal(fila[8], "");     // sin retención
  assert.equal(fila[11], 1210);  // total inferido
});

test("filaAplifisa: retención de IRPF resta del total", () => {
  const fila = filaAplifisa({ ...VACIA, base_imponible: 1000, iva_tipo: 21, retencion_tipo: 15 });
  assert.equal(fila[8], 1000);   // base retención = base imponible
  assert.equal(fila[9], 0.15);
  assert.equal(fila[10], 150);
  assert.equal(fila[11], 1060);  // 1000 + 210 − 150
});

test("filaAplifisa: el total leído de la factura manda sobre el calculado", () => {
  const fila = filaAplifisa({ ...VACIA, base_imponible: 1000, iva_tipo: 21, total: 1209.99 });
  assert.equal(fila[11], 1209.99);
});

test("esExportable: revisadas o verdes", () => {
  assert.equal(esExportable({ revisada: false, confianza: 95 }), true);
  assert.equal(esExportable({ revisada: true, confianza: 30 }), true);
  assert.equal(esExportable({ revisada: false, confianza: 75 }), false);
});

test("trimestres", () => {
  assert.equal(trimestreDe("2026-01-15"), "2026-1T");
  assert.equal(trimestreDe("2026-09-30"), "2026-3T");
  assert.equal(trimestreDe("2026-10-01"), "2026-4T");
  assert.deepEqual(rangoTrimestre("2026-1T"), { desde: "2026-01-01", hasta: "2026-03-31" });
  assert.deepEqual(rangoTrimestre("2024-1T")?.hasta, "2024-03-31");
  assert.deepEqual(rangoTrimestre("2026-4T"), { desde: "2026-10-01", hasta: "2026-12-31" });
  assert.equal(rangoTrimestre("2026-5T"), null);
  assert.equal(rangoTrimestre("2026-03-01'),x"), null); // no se cuela en el filtro de la consulta
});

const CLIENTES: ClienteCarpeta[] = [
  { id: "a", codigo: "2034", cif: "12345678Z", razon_social: "PÉREZ GÓMEZ, JUAN", oficina: "Don Benito" },
  { id: "b", codigo: "1001", cif: "B06123456", razon_social: "Talleres Vegas S.L.", oficina: "Badajoz" },
  { id: "c", codigo: "2035", cif: "87654321X", razon_social: "PEREZ GOMEZ, ANA", oficina: "Don Benito" },
];

test("resolverClienteCarpeta: por código, NIF o nombre (en cualquier orden)", () => {
  assert.equal(resolverClienteCarpeta("2034 - PEREZ GOMEZ JUAN", "DON BENITO", CLIENTES)?.id, "a");
  assert.equal(resolverClienteCarpeta("12345678-Z", "Don Benito", CLIENTES)?.id, "a");
  assert.equal(resolverClienteCarpeta("Juan Pérez Gómez", "Don Benito", CLIENTES)?.id, "a");
  assert.equal(resolverClienteCarpeta("TALLERES VEGAS SL", "Badajoz", CLIENTES)?.id, "b");
});

test("resolverClienteCarpeta: ante la duda, ninguno", () => {
  // Código de otra oficina: no se asigna a un cliente de Don Benito.
  assert.equal(resolverClienteCarpeta("1001", "Don Benito", CLIENTES), null);
  // Solo apellidos: coinciden dos clientes.
  assert.equal(resolverClienteCarpeta("PEREZ GOMEZ", "Don Benito", CLIENTES), null);
  assert.equal(resolverClienteCarpeta("Varios", "Don Benito", CLIENTES), null);
});

const OFIS = ["Badajoz", "Castuera", "Don Benito", "Orellana"];

test("esCarpetaDePeriodo: años y trimestres no son clientes", () => {
  for (const p of ["2026", "3T", "T3", "2026-3T", "3º Trimestre", "1er trimestre", "4T 2025"]) {
    assert.equal(esCarpetaDePeriodo(p), true, p);
  }
  for (const p of ["2034 - PEREZ", "Facturas recibidas", "12345678Z"]) {
    assert.equal(esCarpetaDePeriodo(p), false, p);
  }
});

test("resolverClienteRuta: carpeta subida desde la oficina, el cliente o más abajo", () => {
  const conCodigo2026: ClienteCarpeta[] = [
    ...CLIENTES,
    { id: "d", codigo: "2026", cif: "11111111H", razon_social: "OTRO", oficina: "Don Benito" },
  ];
  assert.equal(resolverClienteRuta(["Don Benito", "2034 - PEREZ GOMEZ JUAN", "Facturas", "2026"], conCodigo2026, OFIS)?.id, "a");
  assert.equal(resolverClienteRuta(["2034 - PEREZ GOMEZ JUAN", "2026"], conCodigo2026, OFIS)?.id, "a");
  // Desde dentro del cliente: "2026" es un año, no el cliente 2026.
  assert.equal(resolverClienteRuta(["Facturas recibidas", "2026", "3T"], conCodigo2026, OFIS), null);
  assert.equal(resolverClienteRuta([], conCodigo2026, OFIS), null);
});

test("mimeFactura: PDF e imágenes, por extensión aunque el navegador no dé tipo", () => {
  assert.equal(mimeFactura("F1.PDF", ""), "application/pdf");
  assert.equal(mimeFactura("foto.jpg", ""), "image/jpeg");
  assert.equal(mimeFactura("scan", "image/png"), "image/png");
  assert.equal(mimeFactura("foto.heic", "image/heic"), null);
  assert.equal(mimeFactura("modelo.xlsx", ""), null);
  assert.equal(esFicheroOculto("Thumbs.db"), true);
  assert.equal(esFicheroOculto(".DS_Store"), true);
  assert.equal(esFicheroOculto("factura.pdf"), false);
});

test("generarExcelAplifisa: hoja importable + pendientes aparte", async () => {
  const base: FacturaExcel = { ...VACIA, revisada: false, confianza: 95, archivo_nombre: "a.pdf" };
  const buf = await generarExcelAplifisa([
    { ...base, fecha: "2026-08-02", numero_factura: "2", proveedor_nombre: "B", base_imponible: 100, iva_tipo: 21 },
    { ...base, fecha: "2026-07-10", numero_factura: "1", proveedor_nombre: "A", base_imponible: 50, iva_tipo: 10 },
    { ...base, fecha: "2026-07-11", numero_factura: "3", confianza: 40 },
  ]);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);

  const libro = wb.getWorksheet("Libro de Facturas")!;
  assert.deepEqual((libro.getRow(1).values as unknown[]).slice(1), [...COLUMNAS_APLIFISA]);
  assert.equal(libro.rowCount, 3);                        // cabecera + 2 verdes
  assert.equal(libro.getCell("B2").value, "1");           // ordenadas por fecha
  assert.equal(libro.getCell("A2").numFmt, "dd/mm/yyyy");
  assert.equal(libro.getCell("G2").value, 0.1);
  assert.equal(libro.getCell("L3").value, 121);

  const pend = wb.getWorksheet("Pendientes de revisar")!;
  assert.equal(pend.rowCount, 2);
  assert.equal(pend.getCell("B2").value, "3");
});
