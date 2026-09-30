import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MENSAJES_POR_PAGINA,
  agrupaPorDia,
  etiquetaDia,
  filtraDirectorio,
  formatoHoraMensaje,
  mezclaMensajes,
  normalizaBusqueda,
  parDirecto,
  totalNoLeidos,
  validaTextoMensaje,
} from "../../src/lib/chat/core.ts";

// "Ahora" fijo: miércoles 30-09-2026, 12:00 en Madrid (CEST, UTC+2).
const AHORA = new Date("2026-09-30T10:00:00Z");

test("normalizaBusqueda: minúsculas, sin tildes, espacios colapsados", () => {
  assert.equal(normalizaBusqueda("  José   ÁNGEL  Núñez "), "jose angel nunez");
  assert.equal(normalizaBusqueda(""), "");
  assert.equal(normalizaBusqueda("\t\n "), "");
});

test("filtraDirectorio: insensible a mayúsculas y tildes; vacío devuelve todo", () => {
  const lista = [
    { id: "1", nombre: "José Ángel Pérez" },
    { id: "2", nombre: "María López" },
    { id: "3", nombre: "Juanma Lara" },
  ];
  assert.deepEqual(filtraDirectorio(lista, "jose").map((x) => x.id), ["1"]);
  assert.deepEqual(filtraDirectorio(lista, "ANGEL").map((x) => x.id), ["1"]);
  assert.deepEqual(filtraDirectorio(lista, "lópez").map((x) => x.id), ["2"]);
  assert.deepEqual(filtraDirectorio(lista, "  maría   lopez ").map((x) => x.id), ["2"]);
  assert.deepEqual(filtraDirectorio(lista, "la").map((x) => x.id), ["3"]);
  assert.deepEqual(filtraDirectorio(lista, "zzz"), []);
  assert.deepEqual(filtraDirectorio(lista, ""), lista);
  assert.deepEqual(filtraDirectorio(lista, "   "), lista);
});

test("parDirecto: par ordenado independiente del orden; mismo id lanza", () => {
  const a = "0a1b2c3d-0000-4000-8000-000000000001";
  const b = "f0e1d2c3-0000-4000-8000-000000000002";
  assert.deepEqual(parDirecto(a, b), [a, b]);
  assert.deepEqual(parDirecto(b, a), [a, b]);
  // dígitos antes que letras, como en el orden de uuid de Postgres
  assert.deepEqual(parDirecto("aaaa", "9999"), ["9999", "aaaa"]);
  assert.throws(() => parDirecto(a, a));
});

test("formatoHoraMensaje: hoy, ayer, mismo año y otro año (Madrid)", () => {
  assert.equal(formatoHoraMensaje("2026-09-30T08:05:00Z", AHORA), "10:05");
  assert.equal(formatoHoraMensaje("2026-09-29T12:05:00Z", AHORA), "ayer 14:05");
  assert.equal(formatoHoraMensaje("2026-09-03T12:05:00Z", AHORA), "3 sep 14:05");
  assert.equal(formatoHoraMensaje("2026-01-15T13:05:00Z", AHORA), "15 ene 14:05"); // invierno, UTC+1
  assert.equal(formatoHoraMensaje("2025-09-03T12:05:00Z", AHORA), "3 sep 2025 14:05");
  // sin punto tras la abreviatura del mes
  assert.ok(!formatoHoraMensaje("2026-05-03T12:05:00Z", AHORA).includes("."));
});

test("formatoHoraMensaje: cruce de medianoche en Madrid (no en UTC)", () => {
  // 22:05 UTC del 29 = 00:05 del 30 en Madrid → hoy
  assert.equal(formatoHoraMensaje("2026-09-29T22:05:00Z", AHORA), "00:05");
  // 21:55 UTC del 29 = 23:55 del 29 en Madrid → ayer
  assert.equal(formatoHoraMensaje("2026-09-29T21:55:00Z", AHORA), "ayer 23:55");
  // "ahora" justo después de medianoche en Madrid: el mensaje de las 23:59 es "ayer"
  const pasadaMedianoche = new Date("2026-09-29T22:01:00Z"); // 00:01 del 30 en Madrid
  assert.equal(formatoHoraMensaje("2026-09-29T21:59:00Z", pasadaMedianoche), "ayer 23:59");
});

test("formatoHoraMensaje: cambio de hora de octubre (DST, 25-10-2026)", () => {
  // Antes del cambio (CEST, UTC+2): 22:30 UTC del 24 = 00:30 del 25
  const ahora25 = new Date("2026-10-25T12:00:00Z");
  assert.equal(formatoHoraMensaje("2026-10-24T22:30:00Z", ahora25), "00:30");
  // Tras el cambio (CET, UTC+1): 23:30 UTC del 25 = 00:30 del 26
  const ahora26 = new Date("2026-10-26T08:00:00Z");
  assert.equal(formatoHoraMensaje("2026-10-25T23:30:00Z", ahora26), "00:30");
  assert.equal(formatoHoraMensaje("2026-10-25T12:00:00Z", ahora26), "ayer 13:00");
  // La hora repetida (02:30 CEST y 02:30 CET) se muestra igual en ambos casos
  assert.equal(formatoHoraMensaje("2026-10-25T00:30:00Z", ahora25), "02:30");
  assert.equal(formatoHoraMensaje("2026-10-25T01:30:00Z", ahora25), "02:30");
});

test("agrupaPorDia: agrupa consecutivos por día de Madrid, conserva orden", () => {
  const msgs = [
    { id: "a", created_at: "2026-09-28T10:00:00Z" },
    { id: "b", created_at: "2026-09-28T21:59:00Z" }, // 23:59 del 28
    { id: "c", created_at: "2026-09-28T22:01:00Z" }, // 00:01 del 29 en Madrid
    { id: "d", created_at: "2026-09-29T15:00:00Z" },
    { id: "e", created_at: "2026-09-30T08:00:00Z" },
  ];
  const g = agrupaPorDia(msgs);
  assert.deepEqual(
    g.map((x) => [x.dia, x.mensajes.map((m) => m.id)]),
    [
      ["2026-09-28", ["a", "b"]],
      ["2026-09-29", ["c", "d"]],
      ["2026-09-30", ["e"]],
    ],
  );
  assert.deepEqual(agrupaPorDia([]), []);
});

test("etiquetaDia: Hoy, Ayer, fecha larga y año si no es el actual", () => {
  assert.equal(etiquetaDia("2026-09-30", AHORA), "Hoy");
  assert.equal(etiquetaDia("2026-09-29", AHORA), "Ayer");
  assert.equal(etiquetaDia("2026-09-01", AHORA), "martes, 1 de septiembre");
  assert.equal(etiquetaDia("2026-09-23", AHORA), "miércoles, 23 de septiembre");
  assert.equal(etiquetaDia("2025-09-03", AHORA), "miércoles, 3 de septiembre de 2025");
  // "hoy" se calcula en Madrid: a las 23:30 UTC del 29 ya es el 30 en Madrid
  assert.equal(etiquetaDia("2026-09-30", new Date("2026-09-29T23:30:00Z")), "Hoy");
});

test("mezclaMensajes: deduplica (gana el entrante) y ordena por fecha e id", () => {
  const actuales = [
    { id: "m2", created_at: "2026-09-30T10:00:00Z", texto: "viejo" },
    { id: "m3", created_at: "2026-09-30T11:00:00Z", texto: "tres" },
  ];
  const nuevos = [
    { id: "m2", created_at: "2026-09-30T10:00:00Z", texto: "editado" },
    { id: "m1", created_at: "2026-09-30T09:00:00Z", texto: "uno" }, // página anterior
    { id: "m0b", created_at: "2026-09-30T11:00:00Z", texto: "empate" },
  ];
  const r = mezclaMensajes(actuales, nuevos);
  assert.deepEqual(r.map((m) => m.id), ["m1", "m2", "m0b", "m3"]);
  assert.equal(r.find((m) => m.id === "m2")?.texto, "editado");
  assert.equal(r.length, 4);
  // no muta las entradas
  assert.equal(actuales[0].texto, "viejo");
  // formatos ISO distintos del mismo instante se ordenan por tiempo real
  const r2 = mezclaMensajes(
    [{ id: "x", created_at: "2026-09-30T12:00:00+02:00" }],
    [{ id: "y", created_at: "2026-09-30T09:30:00Z" }],
  );
  assert.deepEqual(r2.map((m) => m.id), ["y", "x"]);
});

test("validaTextoMensaje: vacío, espacios, límite 5000 y saltos de línea", () => {
  assert.deepEqual(validaTextoMensaje(""), { ok: false, error: "El mensaje está vacío." });
  assert.deepEqual(validaTextoMensaje("  \n\t "), { ok: false, error: "El mensaje está vacío." });
  assert.deepEqual(validaTextoMensaje("  hola\n\nqué tal  \n"), { ok: true, texto: "hola\n\nqué tal" });
  const exacto = "a".repeat(5000);
  assert.deepEqual(validaTextoMensaje(exacto), { ok: true, texto: exacto });
  assert.deepEqual(validaTextoMensaje("a".repeat(5001)), {
    ok: false,
    error: "El mensaje supera los 5000 caracteres.",
  });
  // el recorte se aplica antes de medir
  assert.equal(validaTextoMensaje(`  ${exacto}  `).ok, true);
});

test("totalNoLeidos y MENSAJES_POR_PAGINA", () => {
  assert.equal(totalNoLeidos([]), 0);
  assert.equal(totalNoLeidos([{ no_leidos: 3 }, { no_leidos: 0 }, { no_leidos: 7 }]), 10);
  assert.equal(MENSAJES_POR_PAGINA, 50);
});
