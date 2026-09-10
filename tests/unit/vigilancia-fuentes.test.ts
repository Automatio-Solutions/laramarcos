import { test } from "node:test";
import assert from "node:assert/strict";
import { parsearRssDoe, extraerItemsBoe, dedupe, limpiarTexto } from "../../src/lib/vigilancia/parsear.ts";

// Fixture con la forma real del RSS del DOE (CDATA, pubDate ISO, enlace al PDF).
const RSS_DOE = `<?xml version="1.0" encoding="iso-8859-1"?>
<rss version="2.0"><channel>
  <title>OTRAS RESOLUCIONES. Diario Oficial de Extremadura</title>
  <item>
    <title><![CDATA[Resolución de 2 de septiembre de 2026 por la que se convocan ayudas a la hostelería]]></title>
    <link>http://doe.juntaex.es/pdfs/doe/2026/1750o/26062285.pdf</link>
    <description><![CDATA[CONSEJERÍA DE ECONOMÍA. Subvenciones.- Ayudas para bares y restaurantes.]]></description>
    <pubDate>2026-09-10</pubDate>
  </item>
  <item>
    <title><![CDATA[Anuncio de 28 de julio de 2026 sobre información pública de una instalación]]></title>
    <link>http://doe.juntaex.es/pdfs/doe/2026/1740o/26061111.pdf</link>
    <description><![CDATA[Industria.]]></description>
    <pubDate>2026-09-08</pubDate>
  </item>
</channel></rss>`;

test("parsearRssDoe extrae título, enlace y resumen", () => {
  const items = parsearRssDoe(RSS_DOE);
  assert.equal(items.length, 2);
  assert.equal(items[0].boletin, "DOE");
  assert.match(items[0].titulo, /ayudas a la hostelería/);
  assert.equal(items[0].enlace, "http://doe.juntaex.es/pdfs/doe/2026/1750o/26062285.pdf");
  assert.match(items[0].resumen ?? "", /Subvenciones/);
});

test("parsearRssDoe filtra por fecha: el feed arrastra días anteriores", () => {
  const items = parsearRssDoe(RSS_DOE, "2026-09-10");
  assert.equal(items.length, 1);
  assert.match(items[0].titulo, /hostelería/);
});

test("parsearRssDoe con un feed vacío no revienta", () => {
  const vacio = `<?xml version="1.0"?><rss><channel><title>Sin nada</title></channel></rss>`;
  assert.deepEqual(parsearRssDoe(vacio), []);
});

test("limpiarTexto quita CDATA, etiquetas y entidades", () => {
  assert.equal(limpiarTexto("<![CDATA[Ayudas &amp; subvenciones]]>"), "Ayudas & subvenciones");
  assert.equal(limpiarTexto("  varios   espacios\n y saltos "), "varios espacios y saltos");
});

test("extraerItemsBoe recorre el JSON anidado del sumario", () => {
  const sumario = {
    data: {
      sumario: {
        diario: [
          {
            seccion: [
              {
                item: [
                  { titulo: "Orden por la que se regula el registro de jornada", url_html: "https://boe.es/a1" },
                  { titulo: "Resolución sobre cotización de autónomos", url_pdf: { texto: "https://boe.es/a2.pdf" } },
                ],
              },
            ],
          },
        ],
      },
    },
  };
  const items = extraerItemsBoe(sumario);
  assert.equal(items.length, 2);
  assert.equal(items[0].boletin, "BOE");
  assert.equal(items[0].enlace, "https://boe.es/a1");
  assert.equal(items[1].enlace, "https://boe.es/a2.pdf");
});

test("extraerItemsBoe ignora títulos demasiado cortos para ser disposiciones", () => {
  assert.deepEqual(extraerItemsBoe({ titulo: "BOE" }), []);
});

test("dedupe elimina repetidos por enlace y respeta el tope", () => {
  const items = [
    { boletin: "DOE", titulo: "Uno", enlace: "https://a" },
    { boletin: "DOE", titulo: "Uno otra vez", enlace: "https://a" },
    { boletin: "BOE", titulo: "Dos", enlace: "https://b" },
    { boletin: "BOE", titulo: "Tres", enlace: "https://c" },
  ];
  assert.equal(dedupe(items, 10).length, 3);
  assert.equal(dedupe(items, 2).length, 2);
});

test("dedupe distingue publicaciones del mismo enlace en boletines distintos", () => {
  const items = [
    { boletin: "DOE", titulo: "Uno", enlace: "https://a" },
    { boletin: "BOE", titulo: "Uno", enlace: "https://a" },
  ];
  assert.equal(dedupe(items, 10).length, 2);
});
