import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import {
  semaforo, inferirCuotaIva, filasAplifisa, COLUMNAS_APLIFISA, esExportable,
  trimestreDe, rangoTrimestre, rangoPeriodo, resolverClienteCarpeta, resolverClienteRuta, esCarpetaDePeriodo,
  regimenDe, subcuenta8, cuentaSegunRegimen, avisosFactura, confianzaConAvisos,
  parsearRutaServidor, fechaContablePorCarpeta, fechaDelLibro, agruparPaginas, mismaFactura, normalizaNumeroFactura,
  type FacturaDatos, type ClienteCarpeta, type InfoPagina,
} from "../../src/lib/ocr/core.ts";
import { codigosDe, CONCEPTOS_GASTO, CONCEPTOS_INGRESO } from "../../src/lib/ocr/conceptos.ts";
import { mimeFactura, esFicheroOculto } from "../../src/lib/ocr/subida.ts";
import { generarExcelAplifisa, type FacturaExcel } from "../../src/lib/ocr/aplifisa.ts";
import { contarPaginas, extraerPaginas } from "../../src/lib/ocr/pdf.ts";
import { PDFDocument } from "pdf-lib";

const VACIA: FacturaDatos = {
  tipo: "gasto", fecha: null, fecha_contable: null, numero_factura: null, proveedor_nombre: null,
  proveedor_cif: null, concepto: null, base_imponible: null, iva_tipo: null, iva_cuota: null, lineas_iva: [],
  retencion_base: null, retencion_tipo: null, retencion_cuota: null, total: null,
  subcuenta: null, subcuenta_tercero: null, sujeto_pasivo: false, subcuenta_motivo: null, subcuenta_origen: null,
};
const OFIS = ["Badajoz", "Castuera", "Don Benito", "Orellana"];

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

test("COLUMNAS_APLIFISA: modelo del despacho + Subcuenta Gasto/Ingreso + Sujeto Pasivo", () => {
  assert.deepEqual([...COLUMNAS_APLIFISA], [
    "Fecha Expedición *", "Nº Factura *", "Nombre *", "NIF", "Subcuenta", "Subcuenta Gasto/Ingreso",
    "Base Imponible", "% IVA", "Cuota IVA", "Base Retencion", "% Retencion", "Cuota retencion",
    "Total Factura", "Sujeto Pasivo",
  ]);
});

test("filasAplifisa: orden, % como 21 (no 0,21), las dos subcuentas, cuota y total inferidos", () => {
  const [fila, ...resto] = filasAplifisa({
    ...VACIA, fecha: "2026-03-01", numero_factura: "F-2026/0012", proveedor_nombre: "Endesa",
    proveedor_cif: "A28023430", base_imponible: 1000, iva_tipo: 21, subcuenta: "62800000", subcuenta_tercero: "41000023",
  });
  assert.equal(resto.length, 0);
  assert.equal(fila.length, COLUMNAS_APLIFISA.length);
  assert.deepEqual(fila[0], new Date(Date.UTC(2026, 2, 1)));
  assert.equal(fila[1], "F-2026/0012");
  assert.equal(fila[4], "62800000");   // Subcuenta = gasto
  assert.equal(fila[5], "41000023");   // Subcuenta Gasto/Ingreso = la del proveedor
  assert.equal(fila[6], 1000);
  assert.equal(fila[7], 21);           // % IVA como 21
  assert.equal(fila[8], 210);
  assert.equal(fila[9], "");           // sin retención
  assert.equal(fila[12], 1210);
  assert.equal(fila[13], "");          // sin sujeto pasivo
});

test("filasAplifisa: retención de IRPF como 15 y restando del total", () => {
  const [fila] = filasAplifisa({ ...VACIA, base_imponible: 1000, iva_tipo: 21, retencion_tipo: 15 });
  assert.equal(fila[9], 1000);
  assert.equal(fila[10], 15);
  assert.equal(fila[11], 150);
  assert.equal(fila[12], 1060);
});

test("filasAplifisa: una fila por tipo de IVA, retención solo en la primera", () => {
  const filas = filasAplifisa({
    ...VACIA, numero_factura: "7", retencion_tipo: 15, retencion_base: 300, total: 406,
    lineas_iva: [{ base: 100, tipo: 21, cuota: 21 }, { base: 200, tipo: 10, cuota: 20 }],
  });
  assert.equal(filas.length, 2);
  assert.equal(filas[0][1], "7");
  assert.equal(filas[1][1], "7");      // mismos datos de cabecera
  assert.equal(filas[0][7], 21);
  assert.equal(filas[1][7], 10);
  assert.equal(filas[0][11], 45);      // retención en la primera
  assert.equal(filas[1][11], "");
  assert.equal(filas[0][12], 76);      // 100 + 21 − 45
  assert.equal(filas[1][12], 220);
});

test("filasAplifisa: sujeto pasivo con X; abono en negativo; el total leído manda", () => {
  const [sp] = filasAplifisa({ ...VACIA, base_imponible: 500, iva_tipo: 0, sujeto_pasivo: true });
  assert.equal(sp[13], "X");
  const [abono] = filasAplifisa({ ...VACIA, base_imponible: -390, iva_tipo: 21, total: -471.9 });
  assert.equal(abono[8], -81.9);
  assert.equal(abono[12], -471.9);
});

test("regimenDe: autónomos al programa fiscal, sociedades a partida doble", () => {
  assert.equal(regimenDe("12345678Z"), "fiscal");   // DNI
  assert.equal(regimenDe("X1234567L"), "fiscal");   // NIE
  assert.equal(regimenDe("E06123456"), "fiscal");   // C.B. (supuesto)
  assert.equal(regimenDe("B23899974"), "partida_doble");
  assert.equal(regimenDe("B23899974", "fiscal"), "fiscal"); // lo fijado por el despacho manda
});

test("cuentas: 8 dígitos con ceros en sociedades, código del listado en autónomos", () => {
  assert.equal(subcuenta8("627"), "62700000");
  assert.equal(subcuenta8("6280"), "62800000");
  assert.equal(subcuenta8("410000231"), "410000231"); // empresas antiguas con 9
  const codigos = codigosDe("gasto");
  assert.equal(cuentaSegunRegimen("627", "partida_doble", codigos), "62700000");
  assert.equal(cuentaSegunRegimen("62800000", "fiscal", codigos), "628");
  assert.equal(cuentaSegunRegimen("999", "fiscal", codigos), null);
});

test("conceptos: el listado de Aplifisa completo", () => {
  assert.equal(CONCEPTOS_GASTO.length, 56);
  assert.equal(CONCEPTOS_INGRESO.length, 9);
  assert.equal(CONCEPTOS_GASTO.filter((c) => c.codigo === "628").length, 5); // luz, agua, gas…
  assert.ok(codigosDe("ingreso").includes("705"));
});

test("avisos: importes que no cuadran y datos que faltan", () => {
  const buena = { ...VACIA, numero_factura: "1", fecha: "2026-10-02", proveedor_cif: "B1", subcuenta: "62700000", subcuenta_tercero: "41000001", base_imponible: 100, iva_tipo: 21, total: 121 };
  assert.deepEqual(avisosFactura(buena, "partida_doble"), []);

  // Suplido de 30 €: 100 + 21 ≠ 151 → rojo.
  const suplido = avisosFactura({ ...buena, total: 151 }, "partida_doble");
  assert.equal(suplido[0].codigo, "cuadre");
  assert.equal(confianzaConAvisos(98, suplido), 59);

  // Proveedor nuevo en una sociedad: falta su subcuenta → naranja (se pone una vez).
  const nuevo = avisosFactura({ ...buena, subcuenta_tercero: null }, "partida_doble");
  assert.deepEqual(nuevo.map((a) => a.codigo), ["sin_subcuenta_tercero"]);
  assert.equal(confianzaConAvisos(98, nuevo), 89);
  // En autónomos esa subcuenta no se usa.
  assert.deepEqual(avisosFactura({ ...buena, subcuenta_tercero: null, subcuenta: "627" }, "fiscal"), []);

  assert.ok(avisosFactura({ ...buena, numero_factura: null }, "partida_doble").some((a) => a.codigo === "sin_numero"));
});

test("periodos: trimestre o mes; la fecha contable manda", () => {
  assert.equal(trimestreDe("2026-01-15"), "2026-1T");
  assert.equal(trimestreDe("2026-10-01"), "2026-4T");
  assert.deepEqual(rangoTrimestre("2026-1T"), { desde: "2026-01-01", hasta: "2026-03-31" });
  assert.deepEqual(rangoPeriodo("2026-4T"), { desde: "2026-10-01", hasta: "2026-12-31" });
  assert.deepEqual(rangoPeriodo("2026-02"), { desde: "2026-02-01", hasta: "2026-02-28" });
  assert.deepEqual(rangoPeriodo("2024-02")?.hasta, "2024-02-29");
  assert.equal(rangoPeriodo("2026-5T"), null);
  assert.equal(rangoPeriodo("2026-13"), null);
  assert.equal(rangoPeriodo("2026-03-01'),x"), null); // no se cuela en el filtro de la consulta
  assert.equal(fechaDelLibro({ fecha: "2026-09-20", fecha_contable: "2026-10-01" }), "2026-10-01");
});

const RUTA = "LARAMARCOS_BADAJOZ/01. CLIENTES/KANTARADS DIGITAL, S.L./07. CONTABILIDAD/AÑO 2026/1º TRIMESTRE/GASTOS/fra.pdf";

test("parsearRutaServidor: la estructura real del despacho", () => {
  assert.deepEqual(parsearRutaServidor(RUTA, OFIS), {
    oficina: "Badajoz",
    carpetaCliente: "KANTARADS DIGITAL, S.L.",
    tipo: "gasto",
    trimestre: "2026-1T",
    carpetaTrimestre: "LARAMARCOS_BADAJOZ/01. CLIENTES/KANTARADS DIGITAL, S.L./07. CONTABILIDAD/AÑO 2026/1º TRIMESTRE",
  });
  const db = parsearRutaServidor("LARAMARCOS_DONBENITO\\01. CLIENTES\\X\\07. CONTABILIDAD\\AÑO 2026\\4º TRIMESTRE\\INGRESOS\\f.pdf", OFIS);
  assert.equal(db.oficina, "Don Benito");
  assert.equal(db.tipo, "ingreso");
  assert.equal(db.trimestre, "2026-4T");
});

test("parsearRutaServidor: el número delante de cada carpeta no importa, solo el nombre", () => {
  const r = parsearRutaServidor(
    "LARAMARCOS_ORELLANA/03. CLIENTES/AUTONOMO SL/11. CONTABILIDAD/AÑO 2027/2º TRIMESTRE/GASTOS/f.pdf", OFIS);
  assert.equal(r.oficina, "Orellana");
  assert.equal(r.carpetaCliente, "AUTONOMO SL");
  assert.equal(r.trimestre, "2027-2T");
  const sinNumero = parsearRutaServidor("LARAMARCOS_CASTUERA/CLIENTES/Y/CONTABILIDAD/AÑO 2026/3º TRIMESTRE/GASTOS/f.pdf", OFIS);
  assert.equal(sinNumero.carpetaCliente, "Y");
  assert.equal(sinNumero.trimestre, "2026-3T");
});

test("fechaContablePorCarpeta: factura atrasada, conserva su fecha y va al libro de la carpeta", () => {
  assert.equal(fechaContablePorCarpeta("2026-09-20", "2026-4T"), "2026-10-01");
  assert.equal(fechaContablePorCarpeta("2026-10-05", "2026-4T"), null);
  assert.equal(fechaContablePorCarpeta(null, "2026-4T"), null);
});

test("esExportable: revisadas o verdes", () => {
  assert.equal(esExportable({ revisada: false, confianza: 95 }), true);
  assert.equal(esExportable({ revisada: true, confianza: 30 }), true);
  assert.equal(esExportable({ revisada: false, confianza: 75 }), false);
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

test("esCarpetaDePeriodo: años y trimestres no son clientes", () => {
  for (const p of ["2026", "AÑO 2026", "3T", "T3", "2026-3T", "3º Trimestre", "1º TRIMESTRE", "1er trimestre", "4T 2025"]) {
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

test("resolverClienteRuta: estructura real del servidor (el cliente sigue a CLIENTES)", () => {
  const cartera: ClienteCarpeta[] = [
    ...CLIENTES,
    { id: "k", codigo: "1057", cif: "B23899974", razon_social: "KANTARADS DIGITAL, S.L.", oficina: "Badajoz" },
  ];
  const carpetas = RUTA.split("/").slice(0, -1);
  assert.equal(resolverClienteRuta(carpetas, cartera, OFIS)?.id, "k");
  // La oficina de la carpeta restringe: en Don Benito no hay ningún Kantarads.
  assert.equal(resolverClienteRuta(["LARAMARCOS_DONBENITO", "01. CLIENTES", "KANTARADS DIGITAL, S.L."], cartera, OFIS), null);
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
    // Atrasada: fecha de junio, contabilizada el 1 de julio → va la primera por fecha contable.
    { ...base, fecha: "2026-06-20", fecha_contable: "2026-07-01", numero_factura: "0", revisada: true,
      lineas_iva: [{ base: 10, tipo: 21, cuota: 2.1 }, { base: 20, tipo: 10, cuota: 2 }] },
  ]);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);

  const libro = wb.getWorksheet("Libro de Facturas")!;
  assert.deepEqual((libro.getRow(1).values as unknown[]).slice(1), [...COLUMNAS_APLIFISA]);
  assert.equal(libro.rowCount, 5);                        // cabecera + atrasada (2 filas de IVA) + 2 verdes
  assert.equal(libro.getCell("B2").value, "0");           // ordenadas por fecha contable
  assert.equal(libro.getCell("B3").value, "0");           // segunda línea de IVA de la misma factura
  assert.equal(libro.getCell("H3").value, 10);
  assert.equal(libro.getCell("B4").value, "1");
  assert.equal(libro.getCell("A4").numFmt, "dd/mm/yyyy");
  assert.equal(libro.getCell("H4").value, 10);            // % como 10, no 0,10
  assert.equal(libro.getCell("H4").numFmt, "0.00");
  assert.equal(libro.getCell("M5").value, 121);           // Total Factura

  // Pendientes: rótulo rojo arriba, cabecera en la fila 2, y el Excel se abre en esta hoja.
  const pend = wb.getWorksheet("Pendientes de revisar")!;
  assert.match(String(pend.getCell("A1").value), /FALTA 1 FACTURA POR REVISAR/);
  assert.equal(pend.getCell("A2").value, COLUMNAS_APLIFISA[0]);
  assert.equal(pend.getCell("B3").value, "3");
  assert.equal(wb.views[0].activeTab, 1);
  // El libro que se importa no lleva nada encima de la cabecera.
  assert.equal(libro.getCell("A1").value, COLUMNAS_APLIFISA[0]);
});

test("generarExcelAplifisa: sin pendientes, una sola hoja y sin aviso", async () => {
  const buf = await generarExcelAplifisa([{ ...VACIA, revisada: true, confianza: 100, archivo_nombre: null, numero_factura: "1" }]);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  assert.equal(wb.worksheets.length, 1);
});

// --- PDF con varias facturas ---------------------------------------------------

const pag = (pagina: number, tipo: InfoPagina["tipo"], numero: string | null = null, de: [number, number] | null = null): InfoPagina => ({
  pagina, tipo, numero_factura: numero, nif_emisor: numero ? "B11111111" : null, pagina_de: de ? { n: de[0], total: de[1] } : null,
});
const cortes = (ps: InfoPagina[]) => agruparPaginas(ps).map((g) => `${g.desde}-${g.hasta}${g.dudoso ? "?" : ""}`);

test("agruparPaginas: facturas de una y de varias páginas", () => {
  assert.deepEqual(cortes([
    pag(1, "inicio", "A1"),
    pag(2, "inicio", "A2", [1, 3]), pag(3, "continuacion", null, [2, 3]), pag(4, "continuacion", "A2", [3, 3]),
    pag(5, "inicio", "A3"),
  ]), ["1-1", "2-4", "5-5"]);
});

test("agruparPaginas: el mismo nº de factura une páginas aunque la IA diga 'inicio'", () => {
  // La IA ve una cabecera repetida en la página 2, pero es la misma factura: se une y se marca.
  assert.deepEqual(cortes([pag(1, "inicio", "F-7"), pag(2, "inicio", "F7"), pag(3, "inicio", "F8")]), ["1-2?", "3-3"]);
});

test("agruparPaginas: páginas en blanco fuera; continuación sin pistas → dudoso", () => {
  assert.deepEqual(cortes([pag(1, "inicio", "A1"), pag(2, "vacia"), pag(3, "inicio", "A2")]), ["1-1", "3-3"]);
  assert.deepEqual(cortes([pag(1, "inicio", "A1"), pag(2, "continuacion")]), ["1-2?"]);
  // Empieza a mitad de una factura (la primera página dice "2 de 2").
  assert.deepEqual(cortes([pag(1, "continuacion", null, [2, 2]), pag(2, "inicio", "B1")]), ["1-1?", "2-2"]);
  // Sin IA: cada página sola y todas dudosas.
  assert.deepEqual(cortes([{ ...pag(1, "inicio"), incierta: true }, { ...pag(2, "inicio"), incierta: true }]), ["1-1?", "2-2?"]);
});

test("duplicados: mismo NIF y nº aunque cambien los separadores", () => {
  assert.equal(normalizaNumeroFactura(" fa-2026/0012 "), "FA20260012");
  assert.ok(mismaFactura({ proveedor_cif: "B23899974", numero_factura: "FA-2026/12" }, { proveedor_cif: "b23899974", numero_factura: "FA2026 12" }));
  assert.ok(!mismaFactura({ proveedor_cif: "B23899974", numero_factura: "FA-12" }, { proveedor_cif: "A28023430", numero_factura: "FA-12" }));
  assert.ok(!mismaFactura({ proveedor_cif: "B23899974", numero_factura: null }, { proveedor_cif: "B23899974", numero_factura: null }));
});

test("pdf: cuenta y extrae páginas de un PDF combinado", async () => {
  const doc = await PDFDocument.create();
  for (let i = 1; i <= 5; i++) doc.addPage([200 + i, 300]); // cada página con un ancho distinto para reconocerla
  const pdf = await doc.save();
  assert.equal(await contarPaginas(pdf), 5);
  const trozo = await extraerPaginas(pdf, 2, 4);
  const leido = await PDFDocument.load(trozo);
  assert.equal(leido.getPageCount(), 3);
  assert.deepEqual(leido.getPages().map((p) => p.getWidth()), [202, 203, 204]);
  await assert.rejects(() => extraerPaginas(pdf, 4, 6), /fuera de rango/);
});
