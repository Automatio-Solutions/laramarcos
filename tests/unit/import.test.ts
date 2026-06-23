import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, validateImport } from "../../src/lib/import/clientes-csv.ts";

test("parseCsv: cabecera + comillas + separador", () => {
  const rows = parseCsv('cif,razon_social,email\nB58818501,"Ejemplo, SL",info@x.es');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].cif, "B58818501");
  assert.equal(rows[0].razon_social, "Ejemplo, SL");
});

test("validateImport: válidos, CIF inválido, duplicados, existentes", () => {
  const rows = parseCsv(
    [
      "cif,razon_social",
      "B58818501,Empresa A",   // válido
      "12345678Z,Persona B",   // NIF válido
      "X1111111X,CIF malo",    // inválido (control)
      "B58818501,Repetido",    // duplicado en fichero
      "A58818501,Ya existe",   // existente en BBDD
      ",Sin cif",              // cif vacío
    ].join("\n"),
  );
  const report = validateImport(rows, new Set(["A58818501"]));
  assert.equal(report.valid.length, 2); // B58818501 + 12345678Z
  assert.equal(report.rejected.length, 4);
  const motivos = report.rejected.map((r) => r.motivo);
  assert.ok(motivos.includes("Duplicado en el fichero"));
  assert.ok(motivos.includes("Ya existe en la BBDD"));
  assert.ok(motivos.includes("CIF vacío"));
});
