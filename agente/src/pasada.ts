// Una pasada del agente: carpetas del trimestre → facturas nuevas → envío → Excel.
import type { Api } from "./api";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  carpetaTrimestre, clientesDelServidor, emparejar, facturasDelCliente, trimestreActual,
  type CarpetaCliente, type FicheroFactura,
} from "./carpetas";
import type { Config } from "./config";
import { esperaReintento, MAX_INTENTOS, type Almacen } from "./estado";
import { actualizarExcel } from "./excel";
import type { Log } from "./log";
import { procesarFichero } from "./procesar";
import { mismoNombre, type ClienteCarpeta } from "../../src/lib/ocr/core";

export interface Ctx {
  cfg: Config;
  api: Api;
  log: Log;
  almacen: Almacen;
  /** Se pone a true al parar el servicio: termina la factura en curso y sale. */
  parar: { valor: boolean };
  /** Avisos ya dados (para no repetirlos en cada pasada). */
  avisados: Set<string>;
  /** Carpeta del programa (para datos\carpetas-sin-cliente.txt). */
  dir?: string;
  /** Clientes activos de la app, refrescados cada hora. */
  activos?: { lista: ClienteCarpeta[]; hasta: number };
}

const UNA_HORA = 3_600_000;

/** Clientes activos de la app (caché de una hora). null si la app no responde: entonces no se crea nada. */
async function clientesActivos(ctx: Ctx, ahora: Date): Promise<ClienteCarpeta[] | null> {
  if (ctx.activos && ctx.activos.hasta > ahora.getTime()) return ctx.activos.lista;
  try {
    const lista = await ctx.api.clientes();
    ctx.activos = { lista, hasta: ahora.getTime() + UNA_HORA };
    return lista;
  } catch (e) {
    ctx.log.aviso(`No se pudo pedir la lista de clientes a la app (${(e as Error).message}); esta pasada no crea carpetas.`);
    return ctx.activos?.lista ?? null;
  }
}

/** Lista para el despacho: carpetas de cliente que no emparejan con ningún cliente activo. */
export function escribirSinCliente(dir: string, sinCliente: CarpetaCliente[]) {
  const lineas = sinCliente.map((c) => `${c.oficina}\t${c.nombre}`).sort();
  writeFileSync(
    join(dir, "datos", "carpetas-sin-cliente.txt"),
    "Carpetas de cliente que no coinciden con ningún cliente activo de la app (oficina, carpeta).\r\n" +
      "Si es un cliente activo, hay que corregir el nombre de la carpeta o el de la ficha en la app.\r\n\r\n" +
      lineas.join("\r\n") + "\r\n",
  );
}

export interface Balance {
  clientes: number;
  carpetasCreadas: number;
  enviados: number;
  reintentar: number;
  excel: number;
}

const avisarUnaVez = (ctx: Ctx, clave: string, msg: string) => {
  if (ctx.avisados.has(clave)) return;
  ctx.avisados.add(clave);
  ctx.log.aviso(msg);
};

/** ¿Hay que (re)procesar este fichero ahora? */
function toca(ctx: Ctx, f: FicheroFactura, ahora: Date): boolean {
  if (ahora.getTime() - f.mtimeMs < ctx.cfg.segundosEstable * 1000) return false; // a medio copiar
  const e = ctx.almacen.estado.ficheros[f.rel];
  if (!e) return true;
  if (e.tam !== f.tam || e.mtimeMs !== f.mtimeMs) return true; // lo han sustituido
  if (e.estado === "hecho") return false;
  return e.intentos < MAX_INTENTOS && (!e.siguienteIntento || e.siguienteIntento <= ahora.toISOString());
}

export async function pasada(ctx: Ctx, ahora = new Date()): Promise<Balance> {
  const { cfg, log, almacen } = ctx;
  const balance: Balance = { clientes: 0, carpetasCreadas: 0, enviados: 0, reintentar: 0, excel: 0 };

  // 1) Clientes y carpetas del trimestre en curso.
  const clientes = clientesDelServidor(cfg.raiz, cfg.clientes);
  balance.clientes = clientes.length;

  // Con todos los clientes, las carpetas solo se crean en las de clientes activos de la
  // app (no en las de antiguos clientes). Con lista de piloto, en las de la lista.
  let creaEn: Set<CarpetaCliente> = new Set(clientes);
  if (!cfg.clientes.length && cfg.crearCarpetas) {
    const activos = await clientesActivos(ctx, ahora);
    if (!activos) creaEn = new Set();
    else {
      const { conCliente, sinCliente } = emparejar(clientes, activos);
      creaEn = new Set(conCliente.keys());
      const clave = `sincli:${sinCliente.length}`;
      if (sinCliente.length && !ctx.avisados.has(clave)) {
        if (ctx.dir) escribirSinCliente(ctx.dir, sinCliente);
        avisarUnaVez(ctx, clave, `${sinCliente.length} carpeta(s) de cliente no coinciden con ningún cliente activo: no se les crean carpetas (lista en datos\\carpetas-sin-cliente.txt). Sus facturas, si las hay, entran "Sin cliente".`);
      }
    }
  }
  for (const nombre of cfg.clientes) {
    if (!clientes.some((c) => mismoNombre(c.nombre, nombre))) {
      avisarUnaVez(ctx, `falta:${nombre}`, `No encuentro la carpeta del cliente "${nombre}" en ${cfg.raiz}.`);
    }
  }
  const { anio, q } = trimestreActual(ahora);
  const actual = `${anio}-${q}T`;
  for (const c of clientes) {
    if (!c.contabilidad) {
      avisarUnaVez(ctx, `sincont:${c.ruta}`, `El cliente "${c.nombre}" (${c.oficina}) no tiene carpeta de CONTABILIDAD; se omite.`);
      continue;
    }
    if (cfg.crearCarpetas && actual >= cfg.desde && creaEn.has(c)) {
      try {
        const { creadas } = carpetaTrimestre(c.contabilidad, anio, q, { crear: true });
        for (const d of creadas) log.info(`Carpeta creada: ${d}`);
        balance.carpetasCreadas += creadas.length;
      } catch (e) {
        avisarUnaVez(ctx, `mkdir:${c.ruta}:${actual}`, `No se pudo crear la carpeta del trimestre de "${c.nombre}": ${(e as Error).message}`);
      }
    }
  }

  // 2) Facturas nuevas, cambiadas o por reintentar.
  const cola = clientes.flatMap((c) => facturasDelCliente(cfg.raiz, c, cfg.desde)).filter((f) => toca(ctx, f, ahora));
  if (cola.length) log.info(`${cola.length} fichero(s) por procesar.`);

  // 3) Envío, de `enParalelo` en `enParalelo`.
  const siguiente = () => (ctx.parar.valor ? undefined : cola.shift());
  const trabajador = async () => {
    for (let f = siguiente(); f; f = siguiente()) {
      const previo = almacen.estado.ficheros[f.rel];
      const intentos = previo && previo.tam === f.tam && previo.mtimeMs === f.mtimeMs ? previo.intentos + 1 : 1;
      const r = await procesarFichero(f, ctx.api, log, { enviadoComo: (h) => almacen.rutaConHash(h) });
      almacen.estado.ficheros[f.rel] = {
        tam: f.tam, mtimeMs: f.mtimeMs, hash: r.hash, estado: r.estado, intentos, resultado: r.resumen,
        actualizado: new Date().toISOString(),
        ...(r.estado === "reintentar" ? { siguienteIntento: esperaReintento(intentos, new Date()) } : {}),
      };
      almacen.guardar();
      if (r.estado === "hecho") {
        balance.enviados++;
        log.info(`${f.rel}: ${r.resumen}`);
      } else {
        balance.reintentar++;
        const ultimo = intentos >= MAX_INTENTOS;
        (ultimo ? log.error : log.aviso)(`${f.rel}: ${r.resumen}${ultimo ? " — sin más reintentos; revisar a mano" : ` (intento ${intentos})`}`);
      }
    }
  };
  await Promise.all(Array.from({ length: cfg.enParalelo }, trabajador));

  // 4) Excel de los libros que han cambiado.
  if (!ctx.parar.valor) {
    const x = await actualizarExcel({ raiz: cfg.raiz, crearCarpetas: cfg.crearCarpetas, api: ctx.api, log, almacen });
    balance.excel = x.escritos;
  }
  return balance;
}
