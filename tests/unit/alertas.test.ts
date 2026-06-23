import { test } from "node:test";
import assert from "node:assert/strict";
import { computeAlertas, type TareaAlerta } from "../../src/lib/alertas.ts";

const base = (over: Partial<TareaAlerta>): TareaAlerta => ({
  id: "t", titulo: "T", vencimiento: null, estado: "pendiente", bloqueada: false, responsable_id: "R", ...over,
});

test("computeAlertas: 7d, 48h, escalado, y exclusiones", () => {
  const hoy = "2026-01-10";
  const tareas: TareaAlerta[] = [
    base({ id: "a", vencimiento: "2026-01-17", responsable_id: "U1" }),   // +7 → alerta_7d
    base({ id: "b", vencimiento: "2026-01-12", responsable_id: "U2" }),   // +2 → alerta_48h
    base({ id: "c", vencimiento: "2026-01-09" }),                          // vencida → escalado
    base({ id: "d", vencimiento: "2026-01-17", estado: "completada" }),    // excluida
    base({ id: "e", vencimiento: "2026-01-12", bloqueada: true }),         // excluida (bloqueada)
    base({ id: "f", vencimiento: null }),                                  // excluida (sin fecha)
  ];
  const avisos = computeAlertas(tareas, hoy, ["R1", "R2"]);

  assert.equal(avisos.filter((a) => a.tipo === "alerta_7d").length, 1);
  assert.equal(avisos.find((a) => a.tipo === "alerta_7d")?.usuario_id, "U1");
  assert.equal(avisos.filter((a) => a.tipo === "alerta_48h").length, 1);
  assert.equal(avisos.find((a) => a.tipo === "alerta_48h")?.usuario_id, "U2");
  // vencida → un escalado por cada responsable del despacho
  assert.equal(avisos.filter((a) => a.tipo === "escalado").length, 2);
  // total: 1 + 1 + 2 = 4 (las 3 excluidas no generan nada)
  assert.equal(avisos.length, 4);
});
