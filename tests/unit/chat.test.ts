import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MENSAJES_POR_PAGINA,
  agrupaPorDia,
  buscaMencionActiva,
  coincideMencion,
  mencionCompletada,
  resuelveMencionesComentario,
  detectaEnlaces,
  insertaMencion,
  mencionesVigentes,
  refsUnicas,
  textoAvisoMencion,
  trocearTexto,
  etiquetaDia,
  filtraDirectorio,
  formatoHoraMensaje,
  mezclaMensajes,
  normalizaBusqueda,
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

// ---------------------------------------------------------------------------
// Fase 2 — menciones (UC-605) y enlaces (UC-608)
// ---------------------------------------------------------------------------

const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";
const T1 = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const C1 = "0f0e0d0c-0b0a-4908-8706-050403020100";

test("buscaMencionActiva: detecta la @ en curso y su consulta", () => {
  assert.deepEqual(buscaMencionActiva("hola @Ma", 8), { inicio: 5, consulta: "Ma" });
  assert.deepEqual(buscaMencionActiva("@", 1), { inicio: 0, consulta: "" });
  assert.deepEqual(buscaMencionActiva("hola @María Ló", 14), { inicio: 5, consulta: "María Ló" });
  // cursor antes de la @ o sin @
  assert.equal(buscaMencionActiva("hola @Ma", 4), null);
  assert.equal(buscaMencionActiva("hola", 4), null);
  // un correo no abre el selector
  assert.equal(buscaMencionActiva("ana@laramarcos.es", 17), null);
  // salto de línea o espacio inicial cierran la mención
  assert.equal(buscaMencionActiva("@Ma\nhola", 8), null);
  assert.equal(buscaMencionActiva("@ Ma", 4), null);
  // tras un paréntesis sí
  assert.deepEqual(buscaMencionActiva("(@jo", 4), { inicio: 1, consulta: "jo" });
});

test("insertaMencion: sustituye la consulta por @Nombre y deja el cursor tras el espacio", () => {
  assert.deepEqual(insertaMencion("hola @Ma", 5, 8, "María López"), {
    texto: "hola @María López ",
    cursor: 18,
  });
  // conserva lo que hay detrás del cursor sin duplicar el espacio
  assert.deepEqual(insertaMencion("@jo que tal", 0, 3, "José"), { texto: "@José que tal", cursor: 6 });
});

test("mencionesVigentes: solo nombres presentes, sin autor ni repetidos", () => {
  const cand = [
    { id: U1, nombre: "María López" },
    { id: U2, nombre: "Ana" },
    { id: U1, nombre: "María López" },
  ];
  assert.deepEqual(mencionesVigentes("hola @María López y @Ana", cand, null), [U1, U2]);
  // borrado del texto → fuera
  assert.deepEqual(mencionesVigentes("hola @María López", cand, null), [U1]);
  // "@Anabel" no menciona a "Ana"
  assert.deepEqual(mencionesVigentes("hola @Anabel", cand, null), []);
  // el autor no se menciona a sí mismo
  assert.deepEqual(mencionesVigentes("@Ana @María López", cand, U2), [U1]);
  // sin distinguir mayúsculas, seguido de puntuación
  assert.deepEqual(mencionesVigentes("@maría lópez, mira esto", cand, null), [U1]);
});

test("textoAvisoMencion: según el tipo de conversación", () => {
  assert.equal(textoAvisoMencion("Ana", { tipo: "general", nombre: "General" }), "Ana te ha mencionado en el canal General");
  assert.equal(
    textoAvisoMencion("Ana", { tipo: "oficina", nombre: "Badajoz", oficina: "Badajoz" }),
    "Ana te ha mencionado en el canal de Badajoz",
  );
  assert.equal(
    textoAvisoMencion("Ana", { tipo: "cliente", nombre: null }, "Talleres Pérez SL"),
    "Ana te ha mencionado en la conversación de Talleres Pérez SL",
  );
  assert.equal(textoAvisoMencion("Ana", { tipo: "directo", nombre: null }), "Ana te ha mencionado en un mensaje directo");
});

test("detectaEnlaces: absolutos en cualquier host y relativos; puntuación final fuera", () => {
  const txt = `mira https://app.laramarcos.es/tareas/${T1}. y /clientes/${C1}?tab=1, gracias`;
  const e = detectaEnlaces(txt);
  assert.equal(e.length, 2);
  assert.deepEqual(
    e.map((x) => [x.tipo, x.id, x.url, x.ruta]),
    [
      ["tarea", T1, `https://app.laramarcos.es/tareas/${T1}`, `/tareas/${T1}`],
      ["cliente", C1, `/clientes/${C1}?tab=1`, `/clientes/${C1}`],
    ],
  );
  assert.equal(txt.slice(e[0].inicio, e[0].fin), e[0].url);
  assert.equal(txt.slice(e[1].inicio, e[1].fin), e[1].url);
  // al inicio del texto y con mayúsculas en el uuid
  assert.equal(detectaEnlaces(`/tareas/${T1.toUpperCase()}`)[0]?.id, T1);
  // no son enlaces: uuid incompleto, otra sección, pegado a otra palabra, uuid más largo
  assert.equal(detectaEnlaces("/tareas/123").length, 0);
  assert.equal(detectaEnlaces(`/facturas/${T1}`).length, 0);
  assert.equal(detectaEnlaces(`foo/tareas/${T1}`).length, 0);
  assert.equal(detectaEnlaces(`/tareas/${T1}0`).length, 0);
  // subruta
  assert.equal(detectaEnlaces(`(ver /tareas/${T1}/editar)`)[0]?.url, `/tareas/${T1}/editar`);
});

test("refsUnicas: deduplica por tipo e id", () => {
  assert.deepEqual(
    refsUnicas([
      { tipo: "tarea", id: T1 },
      { tipo: "tarea", id: T1 },
      { tipo: "cliente", id: T1 },
    ]),
    [
      { tipo: "tarea", id: T1 },
      { tipo: "cliente", id: T1 },
    ],
  );
});

test("trocearTexto: texto, menciones y enlaces en orden, sin perder caracteres", () => {
  const txt = `Hola @María López, revisa /tareas/${T1} con @Ana`;
  const t = trocearTexto(txt, [
    { id: U2, nombre: "Ana" },
    { id: U1, nombre: "María López" },
  ]);
  assert.deepEqual(
    t.map((x) => x.tipo),
    ["texto", "mencion", "texto", "enlace", "texto", "mencion"],
  );
  assert.equal(t.map((x) => x.texto).join(""), txt);
  assert.equal(t[1].tipo === "mencion" && t[1].id, U1);
  assert.equal(t[5].tipo === "mencion" && t[5].id, U2);
  // sin menciones ni enlaces → un único trozo; texto vacío → ninguno
  assert.deepEqual(trocearTexto("hola", []), [{ tipo: "texto", texto: "hola" }]);
  assert.deepEqual(trocearTexto("", []), []);
  // nombres que se solapan: gana el más largo
  const s = trocearTexto("@Ana María", [
    { id: U2, nombre: "Ana" },
    { id: U1, nombre: "Ana María" },
  ]);
  assert.deepEqual(s, [{ tipo: "mencion", texto: "@Ana María", id: U1 }]);
  // una mención sin nombre en el texto no se resalta
  assert.deepEqual(trocearTexto("hola", [{ id: U1, nombre: "María" }]), [{ tipo: "texto", texto: "hola" }]);
});

test("coincideMencion: solo al inicio de una palabra, sin mayúsculas ni tildes", () => {
  assert.equal(coincideMencion("ana", "Ana María López"), true);
  assert.equal(coincideMencion("ana", "Luisa Ana"), true);
  assert.equal(coincideMencion("ana", "Mariana"), false);
  assert.equal(coincideMencion("ana", "Juana"), false);
  assert.equal(coincideMencion("ANA", "ana maría"), true);
  assert.equal(coincideMencion("maria", "Ana María López"), true);
  assert.equal(coincideMencion("Jos", "José Ángel"), true);
  assert.equal(coincideMencion("angel", "José Ángel"), true);
  assert.equal(coincideMencion("lopez", "Ana María-López"), true);
  assert.equal(coincideMencion("", "Ana"), false);
});

test("resuelveMencionesComentario: inicio de palabra, sin autor ni repetidos", () => {
  const cands = [
    { id: "a", nombre: "Ana María López" },
    { id: "b", nombre: "Luisa Ana" },
    { id: "c", nombre: "Mariana" },
    { id: "d", nombre: "Juana" },
    { id: "e", nombre: "José Ángel" },
  ];
  assert.deepEqual(resuelveMencionesComentario("hola @ana", cands, null), ["a", "b"]);
  assert.deepEqual(resuelveMencionesComentario("hola @ana", cands, "a"), ["b"]);
  assert.deepEqual(resuelveMencionesComentario("@Ángel y @ana @ana", cands, null), ["a", "b", "e"]);
  assert.deepEqual(resuelveMencionesComentario("sin menciones", cands, null), []);
  assert.deepEqual(resuelveMencionesComentario("@xyz", cands, null), []);
});

test("mencionCompletada: no reabre el selector sobre una mención ya elegida", () => {
  const el = [{ nombre: "Bruno Pérez" }];
  // tras elegir, insertaMencion deja "@Bruno Pérez " → consulta "Bruno Pérez "
  const r = insertaMencion("gracias @bru", 8, 12, "Bruno Pérez");
  const c = buscaMencionActiva(r.texto, r.cursor);
  assert.equal(c?.consulta, "Bruno Pérez ");
  assert.equal(mencionCompletada(c!.consulta, el), true);
  assert.equal(mencionCompletada("Bruno Pérez", el), true);
  assert.equal(mencionCompletada("bruno pérez y más", el), true);
  assert.equal(mencionCompletada("Bruno", el), false);
  assert.equal(mencionCompletada("Bruno Pérezz", el), false);
  assert.equal(mencionCompletada("Bruno Pérez", []), false);
});
