import { test } from "node:test";
import assert from "node:assert/strict";
import { emailPresupuesto, emailCircular, escapar } from "../../src/lib/email/plantillas.ts";
import { trocear, MAX_DESTINATARIOS } from "../../src/lib/email/core.ts";

test("el correo de presupuesto lleva el enlace de aceptación y el importe", () => {
  const { asunto, html } = emailPresupuesto({
    cliente: "Bar Manolo SL",
    total: 1210,
    validezDias: 30,
    enlace: "https://crm.laramarcosasesores.es/p/abc-123",
  });
  // es-ES no agrupa millares hasta 5 cifras (minimumGroupingDigits=2 en CLDR).
  assert.match(asunto, /1210,00/);
  assert.ok(html.includes("https://crm.laramarcosasesores.es/p/abc-123"));
  assert.ok(html.includes("Bar Manolo SL"));
  assert.match(html, /30 días/);
});

test("los importes grandes salen con separador de millares español", () => {
  const { asunto } = emailPresupuesto({
    cliente: "Agrícola del Guadiana SL",
    total: 12100,
    validezDias: 30,
    enlace: "https://ejemplo.es/p/1",
  });
  assert.match(asunto, /12\.100,00/);
});

test("el nombre del cliente no puede romper el HTML del correo", () => {
  const { html } = emailPresupuesto({
    cliente: '<script>alert("x")</script>',
    total: 100,
    validezDias: 15,
    enlace: "https://ejemplo.es/p/1",
  });
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
});

test("escapar neutraliza los caracteres peligrosos", () => {
  assert.equal(escapar('a & b < c > d "e"'), "a &amp; b &lt; c &gt; d &quot;e&quot;");
});

test("la circular convierte las viñetas del contenido en lista", () => {
  const { asunto, html } = emailCircular({
    sector: "Hostelería",
    fecha: "2026-09-10",
    contenido: "• Ayudas para bares\n• Nueva obligación de registro",
  });
  assert.match(asunto, /Hostelería/);
  assert.match(asunto, /2026-09-10/);
  assert.equal((html.match(/<li/g) ?? []).length, 2);
  assert.ok(html.includes("Ayudas para bares"));
  assert.ok(!html.includes("•")); // la viñeta la pone el <ul>, no el texto
});

test("la circular ignora las líneas vacías del contenido", () => {
  const { html } = emailCircular({
    sector: "Agricultura",
    fecha: "2026-09-10",
    contenido: "• Una cosa\n\n\n• Otra cosa\n",
  });
  assert.equal((html.match(/<li/g) ?? []).length, 2);
});

test("los destinatarios se trocean al límite de Resend", () => {
  const correos = Array.from({ length: 130 }, (_, i) => `c${i}@ejemplo.es`);
  const tandas = trocear(correos);
  assert.equal(tandas.length, 3);
  assert.equal(tandas[0].length, MAX_DESTINATARIOS);
  assert.equal(tandas[2].length, 30);
  assert.equal(tandas.flat().length, 130);
});

test("trocear con lista vacía no genera tandas", () => {
  assert.deepEqual(trocear([]), []);
});
