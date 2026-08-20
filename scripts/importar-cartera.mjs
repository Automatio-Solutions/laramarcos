// Importa la cartera real de LaraMarcos (4 oficinas) y los empleados a la BBDD.
// Fuente: doc/Envio Asesoria/ (enviado por el despacho, 2026-07).
//
// Cada oficina mandó su Excel con columnas DISTINTAS:
//   · Badajoz (1000): dirección desglosada + cuenta partida en 4 (CCC → IBAN).
//   · Don Benito (2000) y Orellana (3000): dirección única + IBAN completo.
//   · Castuera (4000): + columna ENLACE (carpeta del cliente en el servidor).
//
// Uso:
//   node scripts/importar-cartera.mjs --dry-run   → NO toca la BBDD, solo valida y cuenta
//   node scripts/importar-cartera.mjs             → importa de verdad (idempotente por código)
//
// Idempotente: upsert de clientes por `codigo`; las cuentas se reemplazan.

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const DRY = process.argv.includes("--dry-run");
const DIR = "doc/Envio Asesoria";

// ---------------------------------------------------------------------------
// Los .xlsx se leen con un ayudante en Python (openpyxl) que emite JSON por
// stdout: Node no trae lector de xlsx y no quiero añadir dependencias pesadas.
// ---------------------------------------------------------------------------
function leerXlsx(ruta) {
  const py = `
import openpyxl, json, sys
wb = openpyxl.load_workbook(sys.argv[1], data_only=True)
ws = wb.active
rows = [[ (c if c is not None else None) for c in r ] for r in ws.iter_rows(values_only=True)]
# hipervínculos de la 1ª hoja (para el ENLACE de Castuera)
links = {}
for row in ws.iter_rows():
    for cell in row:
        if cell.hyperlink: links[f"{cell.row},{cell.column}"] = cell.hyperlink.target
print(json.dumps({"rows": rows, "links": links}, default=str))
`;
  const out = execFileSync("python3", ["-c", py, ruta], { maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(out.toString());
}

const limpiar = (v) => (v == null ? null : String(v).trim() || null);
const cp5 = (v) => { const d = String(v ?? "").replace(/\D/g, ""); return d ? d.padStart(5, "0") : null; };

// CCC (20 dígitos) → IBAN español, con dígitos de control calculados (mód. 97).
function cccAIban(entidad, oficina, dc, cuenta) {
  const parts = [[entidad, 4], [oficina, 4], [dc, 2], [cuenta, 10]];
  if (parts.some(([p]) => p == null || String(p).trim() === "" || String(p).trim() === "---")) return null;
  const ccc = parts.map(([p, n]) => String(p).replace(/\D/g, "").padStart(n, "0")).join("");
  if (ccc.length !== 20) return null;
  // "ES00" al final → E=14, S=28
  const resto = Number(BigInt(ccc + "142800") % 97n);
  const dcIban = String(98 - resto).padStart(2, "0");
  const iban = `ES${dcIban}${ccc}`;
  return ibanValido(iban) ? iban : null;
}
function ibanValido(iban) {
  const s = iban.replace(/\s/g, "").toUpperCase();
  if (!/^ES\d{22}$/.test(s)) return false;
  const r = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, (c) => c.charCodeAt(0) - 55);
  return BigInt(r) % 97n === 1n;
}
const normIban = (v) => { const s = String(v ?? "").replace(/\s/g, "").toUpperCase(); return ibanValido(s) ? s : null; };

// ---------------------------------------------------------------------------
// Un mapeador por oficina: convierte una fila del Excel en un cliente + cuenta.
// ---------------------------------------------------------------------------
const OFICINAS = [
  {
    fichero: "1000-CLIENTES BADAJOZ.xlsx", oficina: "Badajoz",
    map: (r, h) => {
      const dir = [r[h["Tipo Via"]], r[h["Dirección Fiscal"]], r[h["Número"]], r[h["Planta"]], r[h["Puerta"]]]
        .map(limpiar).filter(Boolean).join(" ");
      return {
        codigo: limpiar(r[h["Código"]]), cif: limpiar(r[h["NIF"]]), razon_social: limpiar(r[h["Razón Social"]]),
        email: limpiar(r[h["Email"]]), telefono: limpiar(r[h["Teléfono 1"]]) ?? limpiar(r[h["Teléfono 2"]]),
        direccion: dir || null, ciudad: limpiar(r[h["Municipio"]]), codigo_postal: cp5(r[h["Cód. Postal"]]),
        carpeta_url: null,
        iban: cccAIban(r[h["Entidad"]], r[h["Oficina"]], r[h["DC"]], r[h["Numero Cuenta"]]),
      };
    },
  },
  {
    fichero: "2000-CLIENTES DON BENITO.xlsx", oficina: "Don Benito",
    map: (r, h) => baseComun(r, h),
  },
  {
    fichero: "3000-CLIENTES ORELLANA.xlsx", oficina: "Orellana",
    map: (r, h) => baseComun(r, h),
  },
  {
    fichero: "4000-CLIENTES CASTUERA.xlsx", oficina: "Castuera",
    map: (r, h, links, rowNum) => ({
      ...baseComun(r, h),
      // El ENLACE es un hipervínculo relativo a la carpeta del cliente en el servidor.
      carpeta_url: links[`${rowNum},${(h["ENLACE"] ?? -1) + 1}`] ?? null,
    }),
  },
];

// Layout común de Don Benito / Orellana / Castuera.
function baseComun(r, h) {
  return {
    codigo: limpiar(r[h["CODIGO"]]), cif: limpiar(r[h["NIF"]]), razon_social: limpiar(r[h["RAZON SOCIAL"]]),
    email: limpiar(r[h["CORREO ELECTRONICO"]]), telefono: limpiar(r[h["TELEFONO 1"]]) ?? limpiar(r[h["TELEFONO 2"]]),
    direccion: limpiar(r[h["DIRECCION"]]), ciudad: limpiar(r[h["MUNICIPIO"]]), codigo_postal: cp5(r[h["COD. POSTAL"]]),
    iban: normIban(r[h["NUMERO DE CUENTA"]]), carpeta_url: null,
  };
}

// ---------------------------------------------------------------------------
// Parseo de toda la cartera (sin tocar la BBDD).
// ---------------------------------------------------------------------------
function parsearClientes() {
  const clientes = [];
  for (const of of OFICINAS) {
    const { rows, links } = leerXlsx(`${DIR}/${of.fichero}`);
    const hdr = rows[0];
    const h = Object.fromEntries(hdr.map((c, i) => [String(c).trim(), i]));
    rows.slice(1).forEach((r, i) => {
      if (!r[0]) return; // fila vacía
      const c = of.map(r, h, links, i + 2); // +2: fila real en el Excel (1-based + cabecera)
      if (!c.codigo || !c.razon_social) return;
      clientes.push({ ...c, oficina: of.oficina });
    });
  }
  return clientes;
}

// Empleados: cargo → rol de la app. Correo personal (no los buzones compartidos).
const CARGO_A_ROL = (cargo) => {
  const c = (cargo ?? "").toUpperCase();
  if (c.includes("SOCIO") || c.includes("DIRECCION GENERAL")) return "responsable";
  return "asesor"; // técnicos, administrativos, auxiliares y directores de oficina
};
// El "correo que gestiona" mezcla buzones compartidos (fiscal@, laboral2@…) con el
// personal. El login es el personal: el que contiene el nombre de pila.
function correoPersonal(nombre, correos) {
  const lista = String(correos ?? "").split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
  const pila = (nombre ?? "").toLowerCase().split(/\s+/)[0];
  return lista.find((e) => e.toLowerCase().includes(pila)) ?? lista.find((e) => !/^\d|fiscal|laboral|contab|notific/.test(e.split("@")[0])) ?? lista[0] ?? null;
}
const OFICINA_EMP = { BADAJOZ: "Badajoz", "DON BENITO": "Don Benito", ORELLANA: "Orellana", CASTUERA: "Castuera" };

function parsearEmpleados() {
  const { rows } = leerXlsx(`${DIR}/Lista de empleados por centro de trabajo.xlsx`);
  const h = Object.fromEntries(rows[1].map((c, i) => [String(c).trim().toUpperCase(), i]));
  const out = [];
  for (const r of rows.slice(2)) {
    const nombre = limpiar(r[h["EMPLEADO"]]);
    if (!nombre) continue;
    out.push({
      nombre,
      oficina: OFICINA_EMP[String(r[h["OFICINA"]]).trim().toUpperCase()] ?? null,
      cargo: limpiar(r[h["CARGO"]]),
      rol: CARGO_A_ROL(r[h["CARGO"]]),
      email: correoPersonal(nombre, r[h["CORREOS QUE GESTIONA"]]),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Informe de validación (siempre se imprime, también en importación real).
// ---------------------------------------------------------------------------
function informe(clientes, empleados) {
  const porOf = {};
  for (const c of clientes) porOf[c.oficina] = (porOf[c.oficina] ?? 0) + 1;
  const conIban = clientes.filter((c) => c.iban).length;
  const sinEmail = clientes.filter((c) => !c.email).length;
  const conCarpeta = clientes.filter((c) => c.carpeta_url).length;

  // CIF duplicados (misma persona/empresa en dos oficinas → chocaría con el unique)
  const porCif = {};
  for (const c of clientes) if (c.cif) (porCif[c.cif] ??= []).push(c.codigo);
  const dupCif = Object.entries(porCif).filter(([, v]) => v.length > 1);

  console.log(`\n=== CLIENTES: ${clientes.length} ===`);
  for (const [o, n] of Object.entries(porOf)) console.log(`   ${o.padEnd(12)} ${n}`);
  console.log(`   con IBAN: ${conIban} · sin email: ${sinEmail} · con carpeta servidor: ${conCarpeta}`);
  if (dupCif.length) {
    console.log(`   ⚠ ${dupCif.length} CIF/NIF repetidos en varias oficinas (chocan con el índice único):`);
    for (const [cif, cods] of dupCif.slice(0, 10)) console.log(`      ${cif} → códigos ${cods.join(", ")}`);
  }
  console.log(`\n=== EMPLEADOS: ${empleados.length} ===`);
  for (const e of empleados) console.log(`   ${e.nombre.padEnd(26)} ${(e.oficina ?? "?").padEnd(11)} ${e.rol.padEnd(11)} ${e.email}`);
  const sinEmailEmp = empleados.filter((e) => !e.email);
  if (sinEmailEmp.length) console.log(`   ⚠ ${sinEmailEmp.length} empleados sin correo detectado`);
  return { dupCif };
}

// ---------------------------------------------------------------------------
// Escritura en la BBDD (solo en modo real).
// ---------------------------------------------------------------------------
async function importar(clientes, empleados) {
  const { createClient } = await import("@supabase/supabase-js");
  const env = Object.fromEntries(
    readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("="))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
  );
  const a = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  console.log("\n→ empleados…");
  for (const e of empleados) {
    if (!e.email) continue;
    let id;
    const { data, error } = await a.auth.admin.createUser({ email: e.email, password: "laramarcos2026", email_confirm: true });
    if (error && !/already/i.test(error.message)) { console.error(`   ✗ ${e.email}: ${error.message}`); continue; }
    id = data?.user?.id;
    if (!id) { const { data: l } = await a.auth.admin.listUsers(); id = l.users.find((u) => u.email === e.email)?.id; }
    await a.from("usuarios").upsert({ id, email: e.email, nombre: e.nombre, rol: e.rol, oficina: e.oficina, activo: true });
  }

  console.log("→ clientes…");
  let ok = 0, err = 0;
  for (const c of clientes) {
    const { data: existe } = await a.from("clientes").select("id").eq("codigo", c.codigo).maybeSingle();
    const fields = {
      codigo: c.codigo, cif: (c.cif ?? "").toUpperCase(), razon_social: c.razon_social,
      direccion: c.direccion, ciudad: c.ciudad, codigo_postal: c.codigo_postal,
      email: c.email, telefono: c.telefono, oficina: c.oficina, carpeta_url: c.carpeta_url, activo: true,
    };
    let clienteId = existe?.id;
    if (existe) {
      const { error } = await a.from("clientes").update(fields).eq("id", existe.id);
      if (error) { err++; console.error(`   ✗ ${c.codigo}: ${error.message}`); continue; }
    } else {
      const { data, error } = await a.from("clientes").insert(fields).select("id").single();
      if (error) { err++; console.error(`   ✗ ${c.codigo}: ${error.message}`); continue; }
      clienteId = data.id;
    }
    // Cuenta bancaria (se reemplaza el juego actual)
    await a.from("cliente_cuentas").delete().eq("cliente_id", clienteId);
    if (c.iban) await a.from("cliente_cuentas").insert({ cliente_id: clienteId, iban: c.iban, descripcion: "Cuenta principal" });
    ok++;
  }
  console.log(`✓ ${ok} clientes importados, ${err} errores.`);
}

// ---------------------------------------------------------------------------
const main = async () => {
  console.log(DRY ? "MODO DRY-RUN (no se toca la BBDD)\n" : "IMPORTACIÓN REAL\n");
  const clientes = parsearClientes();
  const empleados = parsearEmpleados();
  informe(clientes, empleados);
  if (!DRY) await importar(clientes, empleados);
  else console.log("\n(dry-run: nada escrito. Ejecuta sin --dry-run para importar.)");
};
main().catch((e) => { console.error(e); process.exit(1); });
