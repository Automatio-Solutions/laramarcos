// Prueba del agente de punta a punta contra una API simulada y un árbol de
// carpetas como el del despacho. No toca la app real.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { Readable } from "node:stream";
import { mkdirSync, mkdtempSync, writeFileSync, existsSync, readdirSync, readFileSync, rmSync, copyFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { crearApi, ErrorApi } from "../src/api.ts";
import { Almacen } from "../src/estado.ts";
import { crearLog } from "../src/log.ts";
import { pasada, type Ctx } from "../src/pasada.ts";
import { cargarConfig, dentroDeHorario, type Config } from "../src/config.ts";

const CLAVE = "k".repeat(64);
const AHORA = new Date(Date.now() + 60_000);
const ANIO = AHORA.getFullYear();
const Q = Math.floor(AHORA.getMonth() / 3) + 1;
const ACTUAL = `${ANIO}-${Q}T`;
const ANTERIOR = Q === 1 ? `${ANIO - 1}-4T` : `${ANIO}-${Q - 1}T`;

// --- API simulada --------------------------------------------------------------
interface Envio { ruta: string; nombre: string; tam: number; desde?: string; hasta?: string; dudoso?: string; hashOrigen?: string }
const envios: Envio[] = [];
const fallarUnaVez = new Set<string>(); // nombres de fichero que responden 503 la primera vez
let librosCambiados: object[] = [];
// Clientes activos de la app (para el modo "todos").
const clientesActivos = [
  { id: "k", codigo: "1057", cif: "B23899974", razon_social: "KANTARADS DIGITAL, S.L.", oficina: "Badajoz" },
  { id: "g", codigo: "1001", cif: "J06670020", razon_social: "GARCIN Y REGO, S.C.", oficina: "Badajoz" },
  { id: "n", codigo: "1099", cif: "B00000000", razon_social: "ACTIVO SIN CARPETA, S.L.", oficina: "Badajoz" },
];
let clientesCaidos = false;
let srv: Server;
let base = "";

before(async () => {
  srv = createServer(async (req, res) => {
    const url = new URL(req.url!, "http://x");
    const r = new Request(url, { method: req.method, headers: req.headers as HeadersInit, body: req.method === "POST" ? (Readable.toWeb(req) as ReadableStream) : undefined, duplex: "half" } as RequestInit);
    const json = (status: number, cuerpo: unknown, extra: Record<string, string> = {}) => {
      res.writeHead(status, { "content-type": "application/json", ...extra });
      res.end(JSON.stringify(cuerpo));
    };
    if (req.headers.authorization !== `Bearer ${CLAVE}`) return json(401, { error: "No autorizado" });

    if (url.pathname === "/api/agente/facturas") {
      const form = await r.formData();
      const archivo = form.get("archivo") as File;
      if (fallarUnaVez.delete(archivo.name)) return json(503, { error: "de paso" });
      const e: Envio = {
        ruta: String(form.get("ruta")), nombre: archivo.name, tam: archivo.size,
        desde: form.get("pagina_desde")?.toString(), hasta: form.get("pagina_hasta")?.toString(),
        dudoso: form.get("corte_dudoso")?.toString(), hashOrigen: form.get("hash_origen")?.toString(),
      };
      const dup = envios.some((x) => x.ruta === e.ruta && x.desde === e.desde && x.tam === e.tam);
      envios.push(e);
      return json(200, { duplicada: dup, id: `f${envios.length}`, cliente_id: "c1" });
    }
    if (url.pathname === "/api/agente/describir-paginas") {
      // Ancho 301 = empieza factura, 302 = continúa la anterior.
      const form = await r.formData();
      const desde = Number(form.get("desde"));
      const pdf = await PDFDocument.load(await (form.get("archivo") as File).arrayBuffer());
      return json(200, {
        paginas: pdf.getPages().map((p, i) => ({
          pagina: desde + i, tipo: p.getWidth() === 301 ? "inicio" : "continuacion",
          numero_factura: p.getWidth() === 301 ? `F${desde + i}` : null, nif_emisor: "B11111111", pagina_de: null,
        })),
      });
    }
    if (url.pathname === "/api/agente/clientes") {
      if (clientesCaidos) return json(503, { error: "caída" });
      return json(200, { clientes: clientesActivos });
    }
    if (url.pathname === "/api/agente/cambios") {
      const libros = librosCambiados;
      librosCambiados = [];
      return json(200, { hasta: new Date().toISOString(), completo: true, libros });
    }
    if (url.pathname === "/api/agente/excel") {
      res.writeHead(200, { "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`GASTOS ${Q}T ${ANIO} - KANTARADS DIGITAL, S.L..xlsx`)}` });
      return res.end("XLSX-FALSO");
    }
    json(404, { error: "no" });
  });
  await new Promise<void>((ok) => srv.listen(0, ok));
  base = `http://127.0.0.1:${(srv.address() as { port: number }).port}`;
});
after(() => srv.close());

// --- Árbol de carpetas -----------------------------------------------------------
const dirPrograma = mkdtempSync(join(tmpdir(), "agente-prog-"));
const raiz = mkdtempSync(join(tmpdir(), "DocumentacionLM-"));
const CLI = join(raiz, "LARAMARCOS_BADAJOZ", "01. CLIENTES");
const KANT = join(CLI, "KANTARADS DIGITAL, S.L.", "06. CONTABILIDAD");   // 06, no 07
const GARCIN = join(CLI, "GARCIN & REGO, S.C.", "07. CONTABILIDAD");      // "&" en la carpeta
const OTRO = join(CLI, "OTRO CLIENTE, S.L.", "07. CONTABILIDAD");         // no está en el piloto
mkdirSync(KANT, { recursive: true });
mkdirSync(GARCIN, { recursive: true });
mkdirSync(OTRO, { recursive: true });
mkdirSync(join(CLI, "SIN CONTABILIDAD, S.L.", "01. ESCRITURAS"), { recursive: true });
mkdirSync(join(raiz, "LARAMARCOS_BADAJOZ", "02. GESTION INTERNA"), { recursive: true });

const trim = (cont: string, t = ACTUAL) => join(cont, `AÑO ${t.slice(0, 4)}`, `${t[5]}º TRIMESTRE`);
const rel = (p: string) => p.slice(raiz.length + 1).split(/[\\/]/).join("/");

/** Cada PDF de prueba es distinto (si no, el agente los toma por copias del mismo). */
async function pdf(anchos: number[]) {
  const d = await PDFDocument.create();
  d.setTitle(randomUUID());
  for (const w of anchos) d.addPage([w, 400]);
  return d.save();
}

const cfg = (extra: Partial<Config> = {}): Config => ({
  raiz, api: base, clave: CLAVE, clientes: ["KANTARADS DIGITAL, S.L.", "GARCIN Y REGO, S.C.", "SIN CONTABILIDAD, S.L.", "NO EXISTE, S.L."],
  desde: ACTUAL, intervaloSegundos: 60, horario: null, crearCarpetas: true, enParalelo: 2, segundosEstable: 0, ...extra,
});
const ctxDe = (c: Config): Ctx => ({
  cfg: c, api: crearApi(c.api, c.clave, { timeoutMs: 10_000 }), log: crearLog(dirPrograma, { silencioso: true }),
  almacen: new Almacen(dirPrograma), parar: { valor: false }, avisados: new Set(),
});

// Las pruebas van en orden: cada una parte del estado que deja la anterior.
let ctx: Ctx;

test("1ª pasada: crea las carpetas del trimestre solo en los clientes del piloto, respetando 06/07", async () => {
  ctx = ctxDe(cfg());
  const b = await pasada(ctx, AHORA);
  for (const cont of [KANT, GARCIN]) {
    assert.ok(existsSync(join(trim(cont), "GASTOS")), `GASTOS en ${cont}`);
    assert.ok(existsSync(join(trim(cont), "INGRESOS")), `INGRESOS en ${cont}`);
  }
  assert.ok(!existsSync(join(OTRO, `AÑO ${ANIO}`)), "no toca a quien no está en el piloto");
  assert.equal(b.clientes, 3); // Kantarads, Garcin y el que no tiene CONTABILIDAD
  assert.equal(b.carpetasCreadas, 8);
  assert.equal(envios.length, 0);
});

test("2ª pasada: manda sueltas, imágenes y separa el PDF combinado; ignora temporales y otros trimestres", async () => {
  const gastos = join(trim(KANT), "GASTOS");
  writeFileSync(join(gastos, "suelta.pdf"), await pdf([301]));
  writeFileSync(join(gastos, "combinado.pdf"), await pdf([301, 302, 301, 301, 302])); // 1-2, 3, 4-5
  writeFileSync(join(gastos, "foto.JPG"), Buffer.from("jpg"));
  writeFileSync(join(gastos, "~$borrador.pdf"), "x");
  writeFileSync(join(gastos, "notas.txt"), "x");
  mkdirSync(join(gastos, "julio"));
  writeFileSync(join(gastos, "julio", "en-subcarpeta.png"), Buffer.from("png"));
  writeFileSync(join(trim(GARCIN), "INGRESOS", "emitida.pdf"), await pdf([301]));
  const viejo = join(trim(KANT, ANTERIOR), "GASTOS");
  mkdirSync(viejo, { recursive: true });
  writeFileSync(join(viejo, "anterior.pdf"), await pdf([301]));

  const b = await pasada(ctx, AHORA);
  assert.equal(b.enviados, 5);
  const nombres = envios.map((e) => `${e.nombre}${e.desde ? `:${e.desde}-${e.hasta}` : ""}`).sort();
  assert.deepEqual(nombres, [
    "combinado.pdf:1-2", "combinado.pdf:3-3", "combinado.pdf:4-5", "emitida.pdf", "en-subcarpeta.png", "foto.JPG", "suelta.pdf",
  ]);
  const comb = envios.filter((e) => e.nombre === "combinado.pdf");
  assert.ok(comb.every((e) => e.hashOrigen && e.hashOrigen === comb[0].hashOrigen), "mismo hash de origen en todos los trozos");
  assert.equal(
    envios.find((e) => e.nombre === "emitida.pdf")!.ruta,
    `LARAMARCOS_BADAJOZ/01. CLIENTES/GARCIN & REGO, S.C./07. CONTABILIDAD/AÑO ${ANIO}/${Q}º TRIMESTRE/INGRESOS/emitida.pdf`,
  );
  assert.ok(!envios.some((e) => e.nombre === "anterior.pdf"), "el trimestre anterior a 'desde' no se toca");
});

test("3ª pasada: no repite nada; una copia con otro nombre tampoco se reenvía", async () => {
  const n = envios.length;
  copyFileSync(join(trim(KANT), "GASTOS", "suelta.pdf"), join(trim(KANT), "GASTOS", "suelta (copia).pdf"));
  await pasada(ctx, AHORA);
  assert.equal(envios.length, n);
  assert.match(ctx.almacen.estado.ficheros[rel(join(trim(KANT), "GASTOS", "suelta (copia).pdf"))].resultado, /mismo contenido/);
});

test("fichero a medio copiar: espera a que lleve un rato sin cambiar", async () => {
  const c2 = ctxDe(cfg({ segundosEstable: 3600 }));
  const f = join(trim(KANT), "GASTOS", "copiandose.pdf");
  writeFileSync(f, await pdf([301]));
  const n = envios.length;
  await pasada(c2, AHORA);
  assert.equal(envios.length, n);
  utimesSync(f, new Date(Date.now() - 2 * 3_600_000), new Date(Date.now() - 2 * 3_600_000));
  await pasada(ctx, AHORA);
  assert.ok(envios.some((e) => e.nombre === "copiandose.pdf"));
});

test("fallo temporal de la app: se reintenta más tarde y entonces entra", async () => {
  const f = join(trim(KANT), "GASTOS", "intermitente.pdf");
  writeFileSync(f, await pdf([301]));
  fallarUnaVez.add("intermitente.pdf");
  const b = await pasada(ctx, AHORA);
  assert.equal(b.reintentar, 1);
  const e = ctx.almacen.estado.ficheros[rel(f)];
  assert.equal(e.estado, "reintentar");
  assert.ok(e.siguienteIntento);
  await pasada(ctx, AHORA); // aún no toca
  assert.ok(!envios.some((x) => x.nombre === "intermitente.pdf"));
  await pasada(ctx, new Date(Date.now() + 3_600_000)); // ya sí
  assert.equal(ctx.almacen.estado.ficheros[rel(f)].estado, "hecho");
  assert.ok(envios.some((x) => x.nombre === "intermitente.pdf"));
});

test("factura de más de 4 MB: no se manda; queda anotado que hay que subirla desde la app", async () => {
  const f = join(trim(KANT), "GASTOS", "enorme.jpg");
  writeFileSync(f, Buffer.alloc(4_300_000, 1));
  await pasada(ctx, AHORA);
  assert.ok(!envios.some((x) => x.nombre === "enorme.jpg"));
  const e = ctx.almacen.estado.ficheros[rel(f)];
  assert.equal(e.estado, "hecho");
  assert.match(e.resultado, /súbela desde la app/);
});

test("Excel: se deja en la carpeta del trimestre; si está abierto, se reintenta en la siguiente pasada", async () => {
  const libro = { cliente_id: "c1", tipo: "gasto", periodo: ACTUAL, carpetaContabilidad: rel(KANT) };
  const destino = join(trim(KANT), `GASTOS ${Q}T ${ANIO} - KANTARADS DIGITAL, S.L..xlsx`);
  mkdirSync(destino); // simula el fichero bloqueado: no se puede sustituir
  librosCambiados = [libro];
  await pasada(ctx, AHORA);
  assert.equal(ctx.almacen.estado.excelPendientes.length, 1);
  rmSync(destino, { recursive: true });
  await pasada(ctx, AHORA); // la app ya no lo vuelve a decir: sale de pendientes
  assert.equal(ctx.almacen.estado.excelPendientes.length, 0);
  assert.ok(existsSync(destino));
  assert.ok(!readdirSync(trim(KANT)).some((n) => n.startsWith("~agente-")), "no quedan temporales");
});

test("Excel: nunca escribe fuera de la raíz aunque la app mande una ruta rara", async () => {
  librosCambiados = [{ cliente_id: "c1", tipo: "gasto", periodo: ACTUAL, carpetaContabilidad: "../../fuera" }];
  await pasada(ctx, AHORA);
  assert.equal(ctx.almacen.estado.excelPendientes.length, 0);
  assert.ok(!existsSync(join(raiz, "..", "..", "fuera")));
});

test("el estado sobrevive a un reinicio", async () => {
  const n = envios.length;
  const tras = ctxDe(cfg());
  await pasada(tras, AHORA);
  assert.equal(envios.length, n);
});

test("clave incorrecta: la pasada se detiene con 401", async () => {
  const mal = ctxDe(cfg({ clave: "x".repeat(64) }));
  writeFileSync(join(trim(KANT), "GASTOS", "otra.pdf"), await pdf([301]));
  await assert.rejects(() => pasada(mal, AHORA), (e) => e instanceof ErrorApi && e.estado === 401);
});

test("config.json: valida y aplica valores por defecto; horario que cruza medianoche", () => {
  const d = mkdtempSync(join(tmpdir(), "agente-cfg-"));
  writeFileSync(join(d, "config.json"), JSON.stringify({ raiz: "D:\\DocumentacionLM", clave: CLAVE }));
  const c = cargarConfig(d);
  assert.equal(c.desde, "2026-4T");
  assert.equal(c.crearCarpetas, true);
  writeFileSync(join(d, "config.json"), JSON.stringify({ raiz: "", clave: "corta", desde: "2026" }));
  assert.throws(() => cargarConfig(d), /raiz[\s\S]*clave[\s\S]*desde/);
  const noche = { horario: { desde: "22:00", hasta: "06:00" } };
  assert.equal(dentroDeHorario(noche, new Date(2026, 0, 1, 23, 0)), true);
  assert.equal(dentroDeHorario(noche, new Date(2026, 0, 1, 12, 0)), false);
});

test("--comprobar: detecta clientes, CONTABILIDAD, permisos y clave", async () => {
  process.env.AGENTE_NO_ARRANCAR = "1";
  const { comprobar } = await import("../src/main.ts");
  const lineas: string[] = [];
  const log = { info: (m: string) => lineas.push(m), aviso: (m: string) => lineas.push(m), error: (m: string) => lineas.push(m) };
  assert.equal(await comprobar(cfg({ clientes: ["KANTARADS DIGITAL, S.L.", "GARCIN Y REGO, S.C."] }), log), true);
  assert.ok(lineas.some((l) => /✓ Cliente "GARCIN & REGO, S.C."/.test(l)));
  assert.ok(lineas.some((l) => /✓ Permiso de escritura/.test(l)));
  assert.ok(lineas.some((l) => /✓ Conexión/.test(l)));
  assert.ok(!lineas.some((l) => l.includes(CLAVE)), "la clave nunca sale entera");

  lineas.length = 0;
  assert.equal(await comprobar(cfg({ clientes: ["NO EXISTE, S.L.", "SIN CONTABILIDAD, S.L."], clave: "z".repeat(64) }), log), false);
  assert.ok(lineas.some((l) => /✗ Cliente "NO EXISTE, S.L.": no encuentro/.test(l)));
  assert.ok(lineas.some((l) => /✗ .*SIN CONTABILIDAD.*no tiene carpeta de CONTABILIDAD/.test(l)));
  assert.ok(lineas.some((l) => /✗ La app rechaza la clave/.test(l)));
});

test("todos los clientes: solo crea carpetas en las que emparejan con un cliente activo y lista las demás", async () => {
  const r2 = mkdtempSync(join(tmpdir(), "DocumentacionLM-todos-"));
  const d2 = mkdtempSync(join(tmpdir(), "agente-todos-"));
  const cli = join(r2, "LARAMARCOS_BADAJOZ", "01. CLIENTES");
  const kant = join(cli, "KANTARADS DIGITAL, S.L.", "07. CONTABILIDAD");
  const garcin = join(cli, "GARCIN & REGO, S.C.", "06. CONTABILIDAD");
  const antiguo = join(cli, "ANTIGUO CLIENTE, S.L.", "07. CONTABILIDAD"); // ya no es cliente
  for (const d of [kant, garcin, antiguo]) mkdirSync(d, { recursive: true });
  const c: Config = { ...cfg(), raiz: r2, clientes: [] };
  const ctx2: Ctx = { ...ctxDe(c), almacen: new Almacen(d2), dir: d2 };

  // Si la app no da la lista, no se crea nada (mejor no crear que crear donde no toca).
  clientesCaidos = true;
  await pasada(ctx2, AHORA);
  assert.ok(!existsSync(join(kant, `AÑO ${ANIO}`)));
  clientesCaidos = false;
  ctx2.activos = undefined;

  await pasada(ctx2, AHORA);
  assert.ok(existsSync(join(trim(kant), "GASTOS")));
  assert.ok(existsSync(join(trim(garcin), "INGRESOS")));
  assert.ok(!existsSync(join(antiguo, `AÑO ${ANIO}`)), "no crea carpetas en antiguos clientes");
  const lista = readFileSync(join(d2, "datos", "carpetas-sin-cliente.txt"), "utf8");
  assert.match(lista, /Badajoz\tANTIGUO CLIENTE, S\.L\./);
  assert.doesNotMatch(lista, /KANTARADS/);

  // Una factura en la carpeta de un antiguo cliente no se pierde: se manda (entra "Sin cliente").
  const viejo = join(trim(antiguo), "GASTOS");
  mkdirSync(viejo, { recursive: true });
  writeFileSync(join(viejo, "suelta-antigua.pdf"), await pdf([301]));
  await pasada(ctx2, AHORA);
  assert.ok(envios.some((e) => e.nombre === "suelta-antigua.pdf"));
});

test("--comprobar con todos los clientes: cuenta emparejadas por oficina", async () => {
  const { comprobar } = await import("../src/main.ts");
  const r3 = mkdtempSync(join(tmpdir(), "DocumentacionLM-comp-"));
  const d3 = mkdtempSync(join(tmpdir(), "agente-comp-"));
  mkdirSync(join(d3, "datos"));
  mkdirSync(join(r3, "LARAMARCOS_BADAJOZ", "01. CLIENTES", "KANTARADS DIGITAL, S.L.", "07. CONTABILIDAD"), { recursive: true });
  mkdirSync(join(r3, "LARAMARCOS_BADAJOZ", "01. CLIENTES", "OTRO QUE YA NO ES, S.L.", "07. CONTABILIDAD"), { recursive: true });
  const lineas: string[] = [];
  const log = { info: (m: string) => lineas.push(m), aviso: (m: string) => lineas.push(m), error: (m: string) => lineas.push(m) };
  assert.equal(await comprobar({ ...cfg(), raiz: r3, clientes: [] }, log, d3), true);
  assert.ok(lineas.some((l) => /Badajoz: 1 carpetas con su cliente · 1 sin cliente activo · 2 clientes activos sin carpeta/.test(l)), lineas.join("\n"));
  assert.ok(existsSync(join(d3, "datos", "carpetas-sin-cliente.txt")));
});
