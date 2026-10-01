// LaraMarcos OCR — agente del servidor del despacho.
//
//   LaraMarcosOCR.exe               servicio: revisa las carpetas cada `intervaloSegundos`
//   LaraMarcosOCR.exe --comprobar   revisa configuración, carpetas, permisos y conexión (no envía nada)
//   LaraMarcosOCR.exe --una-vez     una sola pasada y termina
//   LaraMarcosOCR.exe --version
//
// Lee config.json de su misma carpeta y escribe allí logs\ y datos\.
import { mkdirSync, rmdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { crearApi, ErrorApi } from "./api";
import { carpetaTrimestre, clientesDelServidor, emparejar, trimestreActual } from "./carpetas";
import { cargarConfig, claveOculta, dentroDeHorario, type Config } from "./config";
import { Almacen } from "./estado";
import { crearLog, type Log } from "./log";
import { escribirSinCliente, pasada, type Ctx } from "./pasada";
import { mismoNombre } from "../../src/lib/ocr/core";

export const VERSION = "1.0.0";

/** Carpeta del programa: la del .exe una vez empaquetado; la actual en desarrollo. */
const dirPrograma = () =>
  process.env.AGENTE_DIR ?? ((process as { pkg?: unknown }).pkg ? dirname(process.execPath) : process.cwd());

/** Revisión previa a la instalación (y en cualquier momento). Devuelve true si todo está bien. */
export async function comprobar(cfg: Config, log: Log, dir?: string): Promise<boolean> {
  let ok = true;
  const mal = (m: string) => { ok = false; log.error(`✗ ${m}`); };
  const bien = (m: string) => log.info(`✓ ${m}`);

  log.info(`LaraMarcos OCR ${VERSION} · raíz ${cfg.raiz} · app ${cfg.api} · clave ${claveOculta(cfg.clave)}`);
  log.info(`Desde ${cfg.desde} · cada ${cfg.intervaloSegundos} s · ${cfg.enParalelo} a la vez · crear carpetas: ${cfg.crearCarpetas ? "sí" : "no"}${cfg.horario ? ` · horario ${cfg.horario.desde}-${cfg.horario.hasta}` : ""}`);

  if (!existsSync(cfg.raiz)) {
    mal(`No existe o no se puede leer la raíz ${cfg.raiz}`);
    return false;
  }
  const clientes = clientesDelServidor(cfg.raiz, cfg.clientes);
  if (cfg.clientes.length) {
    for (const nombre of cfg.clientes) {
      const c = clientes.find((x) => mismoNombre(x.nombre, nombre));
      if (!c) mal(`Cliente "${nombre}": no encuentro su carpeta`);
      else if (!c.contabilidad) mal(`Cliente "${c.nombre}" (${c.oficina}): no tiene carpeta de CONTABILIDAD`);
      else bien(`Cliente "${c.nombre}" (${c.oficina}) → ${c.contabilidad}`);
    }
  } else {
    // Todos: cuántas carpetas emparejan con clientes activos de la app, por oficina.
    try {
      const activos = await crearApi(cfg.api, cfg.clave, { timeoutMs: 30_000 }).clientes();
      const { conCliente, sinCliente, sinCarpeta } = emparejar(clientes, activos);
      for (const of of [...new Set(clientes.map((c) => c.oficina))].sort()) {
        const n = (xs: { oficina: string | null }[]) => xs.filter((x) => x.oficina === of).length;
        log.info(`  ${of}: ${n([...conCliente.keys()])} carpetas con su cliente · ${n(sinCliente)} sin cliente activo · ${n(sinCarpeta)} clientes activos sin carpeta`);
      }
      bien(`${conCliente.size} de ${clientes.length} carpetas emparejadas con un cliente activo (solo en esas se crean carpetas)`);
      log.info(`  ${clientes.filter((c) => !c.contabilidad).length} carpetas de cliente sin CONTABILIDAD`);
      if (sinCliente.length && dir) {
        escribirSinCliente(dir, sinCliente);
        log.info(`  Lista de carpetas sin cliente activo: ${join(dir, "datos", "carpetas-sin-cliente.txt")}`);
      }
      if (sinCarpeta.length) {
        log.info(`  Clientes activos sin carpeta en el servidor: ${sinCarpeta.slice(0, 15).map((c) => c.razon_social).join(" · ")}${sinCarpeta.length > 15 ? " …" : ""}`);
      }
    } catch (e) {
      mal(`No se pudo pedir la lista de clientes a la app: ${(e as Error).message}`);
    }
  }

  // Permiso de escritura donde va a crear carpetas y dejar el Excel.
  const prueba = clientes.find((c) => c.contabilidad);
  if (prueba?.contabilidad) {
    const dir = join(prueba.contabilidad, `~prueba-agente-${process.pid}`);
    try {
      mkdirSync(dir);
      rmdirSync(dir);
      bien(`Permiso de escritura en ${prueba.contabilidad}`);
    } catch (e) {
      mal(`Sin permiso de escritura en ${prueba.contabilidad}: ${(e as Error).message}`);
    }
    const { anio, q } = trimestreActual(new Date());
    const { ruta } = carpetaTrimestre(prueba.contabilidad, anio, q, { crear: false });
    log.info(`  Carpeta del trimestre en curso en "${prueba.nombre}": ${ruta ?? "todavía no existe (la creará el agente)"}`);
  }

  try {
    await crearApi(cfg.api, cfg.clave, { timeoutMs: 20_000 }).cambios(new Date().toISOString());
    bien(`Conexión con ${cfg.api} y clave aceptada`);
  } catch (e) {
    mal(e instanceof ErrorApi && e.estado === 401 ? `La app rechaza la clave: revisa 'clave' en config.json` : `Sin conexión con la app: ${(e as Error).message}`);
  }
  log.info(ok ? "Todo correcto." : "Hay problemas: revisa los ✗.");
  return ok;
}

async function servicio(ctx: Ctx, unaVez: boolean) {
  const { cfg, log } = ctx;
  let despertar: (() => void) | null = null;
  const dormir = (s: number) => new Promise<void>((ok) => {
    const t = setTimeout(ok, s * 1000);
    despertar = () => { clearTimeout(t); ok(); };
  });
  const detener = () => {
    if (ctx.parar.valor) return;
    ctx.parar.valor = true;
    log.info("Parada solicitada: termino lo que estoy haciendo.");
    despertar?.();
  };
  process.on("SIGINT", detener);
  process.on("SIGTERM", detener);
  process.on("SIGBREAK", detener);

  log.info(`LaraMarcos OCR ${VERSION} arrancado. Raíz ${cfg.raiz}${cfg.clientes.length ? ` · piloto: ${cfg.clientes.join(", ")}` : ""}.`);
  while (!ctx.parar.valor) {
    let espera = cfg.intervaloSegundos;
    if (dentroDeHorario(cfg, new Date())) {
      try {
        const b = await pasada(ctx);
        if (b.enviados || b.reintentar || b.excel || b.carpetasCreadas) {
          log.info(`Pasada: ${b.enviados} fichero(s) enviado(s), ${b.reintentar} por reintentar, ${b.excel} Excel, ${b.carpetasCreadas} carpeta(s) creada(s).`);
        }
      } catch (e) {
        if (e instanceof ErrorApi && e.estado === 401) {
          log.error("La app rechaza la clave del agente (401). Revisa 'clave' en config.json. Reintento en 30 min.");
          espera = 1800;
        } else {
          log.error(`Fallo en la pasada: ${(e as Error).stack ?? e}`);
        }
      }
    }
    if (unaVez) break;
    await dormir(espera);
  }
  log.info("Agente detenido.");
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has("--version")) {
    console.log(VERSION);
    return;
  }
  const dir = dirPrograma();
  const log = crearLog(dir);
  let cfg: Config;
  try {
    cfg = cargarConfig(dir);
  } catch (e) {
    log.error((e as Error).message);
    process.exitCode = 2;
    return;
  }
  if (args.has("--comprobar")) {
    new Almacen(dir); // crea datos\ para la lista de carpetas sin cliente
    process.exitCode = (await comprobar(cfg, log, dir)) ? 0 : 1;
    return;
  }
  const ctx: Ctx = {
    cfg, log, api: crearApi(cfg.api, cfg.clave), almacen: new Almacen(dir), parar: { valor: false }, avisados: new Set(), dir,
  };
  await servicio(ctx, args.has("--una-vez"));
}

if (process.env.AGENTE_NO_ARRANCAR !== "1") {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
