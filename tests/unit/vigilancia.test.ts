import { test } from "node:test";
import assert from "node:assert/strict";
import { clasificarPorSector, esUrgente, resumenAccionable } from "../../src/lib/vigilancia/clasificar.ts";

// Los nombres son los que carga scripts/cargar-sectores.mjs en la tabla
// `sectores`: los sinónimos del clasificador se indexan por ellos.
const sectores = [
  { id: "sec-host", nombre: "Hostelería y turismo" },
  { id: "sec-const", nombre: "Construcción y reformas" },
  { id: "sec-agri", nombre: "Agricultura y ganadería" },
];

const transversales = [
  { id: "sec-auto", nombre: "Autónomos (RETA)" },
  { id: "sec-soc", nombre: "Sociedades" },
];

test("clasificarPorSector: por nombre y por sinónimo", () => {
  assert.equal(clasificarPorSector({ titulo: "Ayudas para bares y restaurantes de la región" }, sectores), "sec-host");
  assert.equal(clasificarPorSector({ titulo: "Nueva normativa de edificación y obra" }, sectores), "sec-const");
  assert.equal(clasificarPorSector({ titulo: "Subvenciones al sector agrario y ganadería" }, sectores), "sec-agri");
  assert.equal(clasificarPorSector({ titulo: "Algo sin relación con ningún sector" }, sectores), null);
});

test("clasificarPorSector: sectores transversales por forma jurídica", () => {
  // La mayoría de la cartera son autónomos: la normativa de RETA es la que
  // más lectores tiene, y no depende de la actividad del cliente.
  assert.equal(
    clasificarPorSector({ titulo: "Nuevas bases de cotización para el trabajador por cuenta propia" }, transversales),
    "sec-auto",
  );
  assert.equal(
    clasificarPorSector({ titulo: "Se aprueba el modelo del impuesto sobre sociedades" }, transversales),
    "sec-soc",
  );
});

test("esUrgente: detecta plazos/ayudas/obligaciones", () => {
  assert.ok(esUrgente({ titulo: "Abierto el plazo de solicitud de la subvención" }));
  assert.ok(esUrgente({ titulo: "Nueva obligación de registro" }));
  assert.ok(!esUrgente({ titulo: "Información general sin acciones" }));
});

test("resumenAccionable incluye aviso si es urgente y el enlace", () => {
  const r = resumenAccionable({ titulo: "Ayuda hostelería", enlace: "https://doe.es/x" });
  assert.ok(r.includes("Acción requerida"));
  assert.ok(r.includes("https://doe.es/x"));
});
