import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clasificarPorSector, esUrgente, resumenAccionable,
  modoTareaUrgente, UMBRAL_TAREA_UNICA, MAX_TAREAS_POR_EJECUCION,
} from "../../src/lib/vigilancia/clasificar.ts";

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

// --- Tareas urgentes: evitar inundar el tablero (UC-305) ---

test("modoTareaUrgente: sector pequeño reparte por cliente", () => {
  assert.equal(modoTareaUrgente(8), "por-cliente");
  assert.equal(modoTareaUrgente(UMBRAL_TAREA_UNICA), "por-cliente");
});

test("modoTareaUrgente: sector grande genera una sola tarea para el despacho", () => {
  // Los transversales tienen 384 y 210 clientes: sin esto, una publicación
  // urgente sobre el RETA crearía 384 tareas idénticas.
  assert.equal(modoTareaUrgente(UMBRAL_TAREA_UNICA + 1), "unica");
  assert.equal(modoTareaUrgente(384), "unica");
});

test("modoTareaUrgente: sin clientes en el sector no se crea nada", () => {
  assert.equal(modoTareaUrgente(0), "ninguna");
});

test("modoTareaUrgente: el tope por ejecución corta la acumulación", () => {
  // Varios sectores medianos el mismo día no pueden sumar cientos de tareas.
  assert.equal(modoTareaUrgente(25, 0), "por-cliente");
  assert.equal(modoTareaUrgente(25, MAX_TAREAS_POR_EJECUCION - 10), "unica");
});
