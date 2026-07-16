// Siembra un dataset de demo realista (limpia el contenido primero).
// Uso: node scripts/seed-demo.mjs
import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("✗ Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }
const a = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const today = new Date();
const d = (offset) => { const x = new Date(today); x.setDate(x.getDate() + offset); return x.toISOString().slice(0, 10); };

// CIF válido (letra B + 7 dígitos + dígito de control)
function genCif() {
  const digits = Array.from({ length: 7 }, () => Math.floor(Math.random() * 10)).join("");
  let odd = 0, even = 0;
  for (let i = 0; i < 7; i++) { const n = +digits[i]; if (i % 2 === 0) { const x = n * 2; odd += Math.floor(x / 10) + (x % 10); } else even += n; }
  return "B" + digits + ((10 - ((odd + even) % 10)) % 10);
}

async function ensureUser(email, nombre, rol, oficina = null) {
  let id;
  const { data, error } = await a.auth.admin.createUser({ email, password: "laramarcos2026", email_confirm: true });
  if (error && !/already/i.test(error.message)) throw error;
  id = data?.user?.id;
  if (!id) { const { data: list } = await a.auth.admin.listUsers(); id = list.users.find((u) => u.email === email)?.id; }
  await a.from("usuarios").upsert({ id, email, nombre, rol, oficina, activo: true });
  return id;
}

async function wipe() {
  const tablas = ["notificaciones", "newsletters", "publicaciones", "ingesta_log", "facturas_ocr", "lineas_factura",
    "adjuntos", "presupuestos_recurrentes", "presupuestos", "comentarios", "tiempos", "dependencias_tarea",
    "subtareas", "tareas", "plantillas_subtareas", "cliente_servicio_cuotas", "cliente_servicios",
    "cliente_cuentas", "cliente_sectores", "clientes", "proveedores", "sectores"];
  for (const t of tablas) await a.from(t).delete().neq("id", "00000000-0000-0000-0000-000000000000");

  // OJO: `servicios` NO se vacía entera. El tarifario real del despacho (los que
  // tienen código: FSCL-*, LBRL-*, RSTS-*) se carga con scripts/cargar-catalogo.mjs
  // y sembrar la demo NO puede destruirlo. Solo se borran los servicios de demo.
  await a.from("servicios").delete().is("codigo", null);
}

async function main() {
  console.log("→ limpiando contenido…");
  await wipe();

  console.log("→ usuarios (login: <email> / laramarcos2026)…");
  // Cada asesor pertenece a una sede: solo verá la cartera de su oficina.
  const resp = await ensureUser("admin@laramarcos.es", "Responsable LaraMarcos", "responsable", "Badajoz");
  const ana = await ensureUser("ana@laramarcos.es", "Ana Belén Cordero", "asesor", "Badajoz");
  const carlos = await ensureUser("carlos@laramarcos.es", "Carlos Núñez", "asesor", "Don Benito");
  const lucia = await ensureUser("lucia@laramarcos.es", "Lucía Ferrer", "asesor", "Castuera");
  await ensureUser("marta@laramarcos.es", "Marta Gil (admin)", "admin", "Badajoz");

  console.log("→ sectores…");
  const sectoresNom = ["Hostelería", "Construcción", "Agricultura", "Comercio", "Transporte", "Salud"];
  const sectores = {};
  for (const n of sectoresNom) {
    const { data } = await a.from("sectores").insert({ nombre: n }).select("id").single();
    sectores[n] = data.id;
  }

  // Servicios de demo (SIN código). El tarifario real del despacho vive aparte
  // (scripts/cargar-catalogo.mjs) y ese script los desactiva al final para que la
  // IA presupueste solo con tarifas reales. Estos existen porque la demo necesita
  // cuotas mensuales (contabilidad, nóminas) que el tarifario real NO contempla.
  console.log("→ servicios de demo + plantillas…");
  const servicios = {};
  const servDefs = [
    ["Constitución de SL", "Mercantil", 350], ["Declaración trimestral de IVA", "Fiscal", 90],
    ["Declaración de la Renta", "Fiscal", 120], ["Nóminas mensuales", "Laboral", 200],
    ["Alta de autónomo", "Laboral", 60], ["Plan de viabilidad", "Consultoría", 350],
    ["Contabilidad mensual", "Contable", 180],
  ];
  for (const [nombre, categoria, precio] of servDefs) {
    const { data } = await a.from("servicios").insert({ nombre, categoria, precio_base: precio }).select("id").single();
    servicios[nombre] = data.id;
  }
  await a.from("plantillas_subtareas").insert([
    { servicio_id: servicios["Constitución de SL"], pasos: [
      { orden: 1, nombre: "Notaría", plazo_relativo_dias: 0 }, { orden: 2, nombre: "Alta censal AEAT", plazo_relativo_dias: 3 },
      { orden: 3, nombre: "Alta en Seguridad Social", plazo_relativo_dias: 5 }, { orden: 4, nombre: "Registro Mercantil", plazo_relativo_dias: 10 }] },
    { servicio_id: servicios["Plan de viabilidad"], pasos: [
      { orden: 1, nombre: "Recopilación de datos", plazo_relativo_dias: 0 }, { orden: 2, nombre: "Modelo financiero", plazo_relativo_dias: 5 },
      { orden: 3, nombre: "Revisión", plazo_relativo_dias: 8 }, { orden: 4, nombre: "Entrega", plazo_relativo_dias: 10 }] },
  ]);

  console.log("→ proveedores…");
  const provDefs = [["Endesa Energía", "628", 21], ["Movistar", "629", 21], ["Amazon Business", "600", 21], ["Mapfre Seguros", "625", 0], ["Iberdrola", "628", 21]];
  for (const [nombre, sub, iva] of provDefs) await a.from("proveedores").insert({ cif: genCif(), nombre, subcuenta_habitual: sub, iva_default: iva });
  const { data: provs } = await a.from("proveedores").select("id, cif, nombre");

  console.log("→ clientes + segmentación…");
  const cliDefs = [
    ["Bar La Plaza SL", "Hostelería", ana], ["Restaurante El Olivo SL", "Hostelería", ana],
    ["Construcciones Extremeñas SL", "Construcción", carlos], ["Reformas Guadiana SL", "Construcción", carlos],
    ["Agrícola Vegas Altas SL", "Agricultura", lucia], ["Ganadería Sierra Norte SL", "Agricultura", lucia],
    ["Comercial Badajoz SL", "Comercio", ana], ["Transportes Mérida SL", "Transporte", carlos],
    ["Clínica Dental Cáceres SL", "Salud", lucia], ["Ferretería Centro SL", "Comercio", resp],
  ];
  // La oficina del cliente sigue a la de su asesor (así cada asesor ve su cartera).
  const oficinaDe = { [ana]: "Badajoz", [carlos]: "Don Benito", [lucia]: "Castuera", [resp]: "Badajoz" };
  const clientes = [];
  for (const [razon, sector, asesor] of cliDefs) {
    const cif = genCif();
    const slug = razon.split(" ")[0].toLowerCase();
    const { data } = await a.from("clientes").insert({
      cif, razon_social: razon, asesor_id: asesor, direccion: "Extremadura",
      email: `info@${slug}.es`,
      oficina: oficinaDe[asesor],
      carpeta_url: `smb://servidor-laramarcos/clientes/${slug}`,
    }).select("id").single();
    await a.from("cliente_sectores").insert({ cliente_id: data.id, sector_id: sectores[sector] });

    // Cuentas bancarias: algunos clientes tienen varias.
    const cuentas = [{ cliente_id: data.id, iban: "ES9121000418450200051332", descripcion: "Cuenta principal" }];
    if (["Bar La Plaza SL", "Transportes Mérida SL"].includes(razon)) {
      cuentas.push({ cliente_id: data.id, iban: "ES7100302053091234567895", descripcion: "Cuenta de nóminas" });
    }
    await a.from("cliente_cuentas").insert(cuentas);

    clientes.push({ id: data.id, razon, asesor, sector });
  }

  console.log("→ servicios contratados + evolución de cuota…");
  // [cliente, servicio, meses desde el alta, cuota inicial, subida (importe, meses atrás)]
  const contratos = [
    [clientes[0], "Contabilidad mensual", 24, 150, [180, 12]],
    [clientes[0], "Declaración trimestral de IVA", 24, 80, null],
    [clientes[1], "Nóminas mensuales", 18, 190, [210, 6]],
    [clientes[2], "Contabilidad mensual", 36, 200, [240, 14]],
    [clientes[3], "Declaración trimestral de IVA", 12, 90, null],
    [clientes[4], "Contabilidad mensual", 30, 170, [185, 8]],
    [clientes[6], "Nóminas mensuales", 9, 200, null],
    [clientes[7], "Contabilidad mensual", 15, 180, [195, 3]],
    [clientes[8], "Declaración de la Renta", 6, 120, null],
  ];
  const mesesAtras = (m) => { const x = new Date(); x.setMonth(x.getMonth() - m); return x.toISOString().slice(0, 10); };
  for (const [cli, servicio, mesesAlta, cuotaIni, subida] of contratos) {
    const fecha_inicio = mesesAtras(mesesAlta);
    const { data: cs } = await a.from("cliente_servicios")
      .insert({ cliente_id: cli.id, servicio_id: servicios[servicio], fecha_inicio })
      .select("id").single();
    const cuotas = [{ cliente_servicio_id: cs.id, importe: cuotaIni, fecha_efecto: fecha_inicio, nota: "Cuota inicial" }];
    if (subida) {
      cuotas.push({ cliente_servicio_id: cs.id, importe: subida[0], fecha_efecto: mesesAtras(subida[1]), nota: "Revisión anual de tarifas" });
    }
    await a.from("cliente_servicio_cuotas").insert(cuotas);
  }

  console.log("→ tareas + subtareas…");
  const tareasDefs = [
    ["Cierre trimestral IVA 2T", clientes[0], -2, "completada", "Fiscal"],
    ["Constitución SL nuevo socio", clientes[2], 7, "en_curso", "Mercantil"],
    ["Nóminas junio", clientes[3], 2, "pendiente", "Laboral"],
    ["Plan de viabilidad apertura local", clientes[1], 12, "en_curso", "Consultoría"],
    ["Renta 2025 socios", clientes[8], 20, "pendiente", "Fiscal"],
    ["Alta autónomo nuevo empleado", clientes[7], -1, "completada", "Laboral"],
    ["Contabilidad mayo", clientes[6], 5, "en_curso", "Contable"],
    ["Subvención hostelería DOE", clientes[0], 3, "pendiente", "Subvenciones"],
    ["Declaración IVA mensual", clientes[4], -5, "completada", "Fiscal"],
    ["Revisión contrato alquiler", clientes[9], 9, "en_curso", "Mercantil"],
  ];
  const tareas = [];
  for (const [titulo, cli, venc, estado, cat] of tareasDefs) {
    const { data } = await a.from("tareas").insert({
      titulo, cliente_id: cli.id, responsable_id: cli.asesor, vencimiento: d(venc),
      estado, categoria: cat, completada_at: estado === "completada" ? new Date().toISOString() : null,
      bloqueada: false, motivo_bloqueo: null,
    }).select("id").single();
    tareas.push({ id: data.id, cli, estado });
  }
  // Subtareas para la de constitución
  await a.from("subtareas").insert([
    { tarea_id: tareas[1].id, titulo: "Notaría", asignado_id: tareas[1].cli.asesor, plazo: d(0), estado: "completada", orden: 1 },
    { tarea_id: tareas[1].id, titulo: "Alta censal AEAT", asignado_id: tareas[1].cli.asesor, plazo: d(3), estado: "en_curso", orden: 2 },
    { tarea_id: tareas[1].id, titulo: "Alta en Seguridad Social", plazo: d(5), estado: "pendiente", orden: 3 },
    { tarea_id: tareas[3].id, titulo: "Recopilación de datos", asignado_id: tareas[3].cli.asesor, plazo: d(0), estado: "completada", orden: 1 },
    { tarea_id: tareas[3].id, titulo: "Modelo financiero", asignado_id: tareas[3].cli.asesor, plazo: d(5), estado: "en_curso", orden: 2 },
    // Subtarea VENCIDA sin completar → bloqueo automático ("Bloqueada por: …")
    { tarea_id: tareas[6].id, titulo: "Conciliación bancaria mayo", asignado_id: tareas[6].cli.asesor, plazo: d(-3), estado: "en_curso", orden: 1 },
    { tarea_id: tareas[6].id, titulo: "Asientos de amortización", asignado_id: tareas[6].cli.asesor, plazo: d(2), estado: "pendiente", orden: 2 },
  ]);
  // Líneas de factura para las completadas
  for (const t of tareas.filter((x) => x.estado === "completada")) {
    await a.from("lineas_factura").insert({ tarea_id: t.id, cliente_id: t.cli.id, concepto: "Gestión completada", importe: [90, 60, 90][Math.floor(Math.random() * 3)], facturada: false });
  }
  // Tiempo + comentario en una tarea
  await a.from("tiempos").insert({ tarea_id: tareas[1].id, usuario_id: tareas[1].cli.asesor, segundos: 5400, nota: "Preparación documentación" });
  await a.from("comentarios").insert({ tarea_id: tareas[1].id, autor_id: resp, texto: "Recordad subir la escritura cuando esté.", menciones: [] });

  console.log("→ presupuestos…");
  const presDefs = [
    [clientes[1], "Plan de viabilidad", "borrador", [{ concepto: "Plan de viabilidad", cantidad: 1, precio: 350, descuento: 10 }]],
    [clientes[3], "Constitución de SL", "enviado", [{ concepto: "Constitución de SL", cantidad: 1, precio: 350, descuento: 0 }]],
    [clientes[6], "Contabilidad mensual", "aceptado", [{ concepto: "Contabilidad mensual", cantidad: 12, precio: 180, descuento: 0 }]],
    [clientes[8], "Declaración de la Renta", "rechazado", [{ concepto: "Renta", cantidad: 3, precio: 120, descuento: 0 }]],
    [clientes[0], "Declaración trimestral de IVA", "borrador", [{ concepto: "IVA trimestral", cantidad: 4, precio: 90, descuento: 0 }]],
  ];
  for (const [cli, serv, estado, lineas] of presDefs) {
    const total = lineas.reduce((s, l) => s + l.cantidad * l.precio * (1 - l.descuento / 100), 0);
    await a.from("presupuestos").insert({
      cliente_id: cli.id, servicio_id: servicios[serv], estado, lineas, total: Math.round(total * 100) / 100,
      creado_por: cli.asesor, condiciones: "Validez 30 días. Pago 50% al inicio.",
      enviado_at: estado !== "borrador" ? new Date().toISOString() : null,
      aceptado_at: estado === "aceptado" ? new Date().toISOString() : null,
    });
  }

  console.log("→ facturas OCR (semáforo)…");
  const facDefs = [
    [provs[0], clientes[0], 1200, 21, "628", 96], [provs[1], clientes[2], 89.9, 21, "629", 72],
    [provs[2], clientes[6], 340.5, 21, "600", 88], [provs[3], clientes[8], 450, 0, "625", 41],
    [provs[4], clientes[3], 780.25, 21, "628", 94],
  ];
  for (const [prov, cli, base, iva, sub, conf] of facDefs) {
    await a.from("facturas_ocr").insert({
      cliente_id: cli.id, proveedor_cif: prov.cif, proveedor_nombre: prov.nombre, fecha: d(-Math.floor(Math.random() * 20)),
      concepto: "Suministro/servicio", base_imponible: base, iva_tipo: iva, iva_cuota: Math.round(base * iva / 100 * 100) / 100,
      total: Math.round(base * (1 + iva / 100) * 100) / 100, subcuenta: sub, confianza: conf, subido_por: resp, archivo_nombre: `factura-${prov.nombre.split(" ")[0]}.pdf`, archivo_path: "demo/factura.pdf",
    });
  }

  console.log("→ vigilancia DOE/BOE (publicaciones + newsletters + tarea urgente)…");
  const pubs = [
    ["DOE", "Ayudas para bares y restaurantes de Extremadura, plazo de solicitud abierto", "Hostelería", true],
    ["BOE", "Nueva obligación de registro para el sector de la construcción", "Construcción", true],
    ["DOE", "Convocatoria de subvenciones agrarias y de ganadería 2026", "Agricultura", true],
    ["BOE", "Información general sobre el calendario fiscal", null, false],
  ];
  let pi = 0;
  for (const [bol, titulo, sector, urg] of pubs) {
    const sid = sector ? sectores[sector] : null;
    await a.from("publicaciones").insert({ boletin: bol, fecha: d(0), titulo, resumen: titulo + (urg ? " — Acción requerida: revisa el plazo." : ""), enlace: `https://${bol.toLowerCase()}.es/demo-${pi++}`, sector_id: sid, urgente: urg });
    if (sid) {
      const { count } = await a.from("cliente_sectores").select("cliente_id", { count: "exact", head: true }).eq("sector_id", sid);
      await a.from("newsletters").insert({ sector_id: sid, fecha: d(0), asunto: `Novedades normativas — ${sector} (${d(0)})`, contenido: `• ${titulo}`, destinatarios: count ?? 0 });
    }
  }
  // tarea urgente para clientes de hostelería
  for (const c of clientes.filter((x) => x.sector === "Hostelería")) {
    await a.from("tareas").insert({ titulo: "[Urgente DOE/BOE] Ayudas hostelería — revisar plazo", cliente_id: c.id, responsable_id: c.asesor, origen: "doe_boe", categoria: "Normativa", vencimiento: d(5) });
  }

  console.log("→ notificaciones (campanita)…");
  await a.from("notificaciones").insert([
    { usuario_id: resp, tipo: "alerta_7d", mensaje: "Vence en 7 días: Plan de viabilidad apertura local", enlace: "/tareas" },
    { usuario_id: resp, tipo: "mencion", mensaje: "Te han mencionado en una tarea", enlace: "/tareas" },
    { usuario_id: resp, tipo: "resumen_diario", mensaje: "Buenos días: 6 tareas abiertas, 2 vencen hoy o antes.", enlace: "/tareas" },
  ]);

  console.log("\n✓ Demo sembrada. Entra con admin@laramarcos.es / laramarcos2026 (o ana@/carlos@/lucia@).");
}

main().catch((e) => { console.error("✗", e.message); process.exit(1); });
