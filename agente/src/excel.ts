// Excel Aplifisa en la carpeta del trimestre de cada cliente. Se regenera entero
// cada vez que la app dice que ese libro ha cambiado (factura nueva o corregida).
import { renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { ErrorApi, type Api, type Libro } from "./api";
import { carpetaTrimestre } from "./carpetas";
import type { Almacen, LibroPendiente } from "./estado";
import type { Log } from "./log";

/** Excel abierto por alguien (Windows lo bloquea) o sin permiso momentáneo. */
const BLOQUEADO = new Set(["EBUSY", "EPERM", "EACCES"]);

const clave = (l: { cliente_id: string; tipo: string; periodo: string }) => `${l.cliente_id}|${l.tipo}|${l.periodo}`;

/** Escribe el Excel sin dejarlo a medias: primero un temporal y luego se renombra encima. */
function escribirAtomico(dir: string, nombre: string, contenido: Uint8Array) {
  const tmp = join(dir, `~agente-${process.pid}-${Date.now()}.tmp`);
  writeFileSync(tmp, contenido);
  try {
    renameSync(tmp, join(dir, nombre));
  } catch (e) {
    try { unlinkSync(tmp); } catch { /* ya no está */ }
    throw e;
  }
}

/** La carpeta que manda la app tiene que estar dentro de la raíz: nunca se escribe fuera. */
function dentroDeRaiz(raiz: string, rel: string): string | null {
  const base = resolve(raiz);
  const ruta = resolve(base, ...rel.split("/"));
  return ruta === base || ruta.startsWith(base + sep) ? ruta : null;
}

export async function actualizarExcel(
  ctx: { raiz: string; crearCarpetas: boolean; api: Api; log: Log; almacen: Almacen },
): Promise<{ escritos: number; pendientes: number }> {
  const { api, log, almacen } = ctx;
  const e = almacen.estado;

  // 1) Libros que han cambiado desde la última vez (por lotes, si hay muchos).
  const porHacer = new Map<string, LibroPendiente>();
  for (const p of e.excelPendientes) porHacer.set(clave(p), p);
  for (let vuelta = 0; vuelta < 20; vuelta++) {
    const r = await api.cambios(e.cambiosDesde);
    for (const l of r.libros as Libro[]) {
      if (l.carpetaContabilidad) porHacer.set(clave(l), { ...l, carpetaContabilidad: l.carpetaContabilidad });
    }
    e.cambiosDesde = r.hasta;
    if (r.completo) break;
  }
  e.excelPendientes = [...porHacer.values()];
  almacen.guardar();

  // 2) Descargar y escribir cada uno.
  let escritos = 0;
  for (const l of [...porHacer.values()]) {
    const [anio, q] = [Number(l.periodo.slice(0, 4)), Number(l.periodo.slice(5, 6))];
    const cont = dentroDeRaiz(ctx.raiz, l.carpetaContabilidad);
    if (!cont || !anio || !q) {
      log.error(`Excel ${l.periodo}: carpeta no válida "${l.carpetaContabilidad}"; se descarta.`);
      porHacer.delete(clave(l));
      continue;
    }
    let dir: string | null;
    try {
      ({ ruta: dir } = carpetaTrimestre(cont, anio, q, { crear: ctx.crearCarpetas, conLibros: false }));
    } catch (err) {
      log.aviso(`Excel ${l.periodo} en ${l.carpetaContabilidad}: no se pudo crear la carpeta del trimestre (${(err as Error).message}).`);
      continue;
    }
    if (!dir) {
      log.aviso(`Excel ${l.periodo}: no existe la carpeta del trimestre en ${l.carpetaContabilidad}; se omite.`);
      porHacer.delete(clave(l));
      continue;
    }
    try {
      const x = await api.excel(l);
      escribirAtomico(dir, x.nombre, x.contenido);
      porHacer.delete(clave(l));
      escritos++;
      log.info(`Excel actualizado: ${l.carpetaContabilidad}/…/${x.nombre}`);
    } catch (err) {
      if (err instanceof ErrorApi && err.estado === 401) throw err; // clave mal: para todo
      const codigo = (err as NodeJS.ErrnoException).code;
      if (codigo && BLOQUEADO.has(codigo)) {
        log.aviso(`Excel de ${l.carpetaContabilidad} (${l.periodo}) está abierto o bloqueado; se reintentará.`);
      } else if (err instanceof ErrorApi && !err.temporal) {
        log.error(`Excel ${l.periodo} de ${l.carpetaContabilidad}: ${err.message}; se descarta.`);
        porHacer.delete(clave(l));
      } else {
        log.aviso(`Excel ${l.periodo} de ${l.carpetaContabilidad}: ${(err as Error).message}; se reintentará.`);
      }
    }
  }
  e.excelPendientes = [...porHacer.values()];
  almacen.guardar();
  return { escritos, pendientes: e.excelPendientes.length };
}
