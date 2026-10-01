// Recorrido de las carpetas del despacho. Estructura (por NOMBRE, no por número):
//   <raiz>\LARAMARCOS_<OFICINA>\01. CLIENTES\<CLIENTE>\0x. CONTABILIDAD\
//       AÑO 2026\4º TRIMESTRE\GASTOS|INGRESOS\…facturas…
// El agente lee las facturas y crea, si falta, la carpeta del trimestre en curso.
// Nunca mueve, cambia ni borra nada que no sea suyo.
import { mkdirSync, readdirSync, statSync, type Dirent } from "node:fs";
import { join, relative, sep } from "node:path";
import { OFICINAS } from "../../src/lib/types";
import {
  anioDeCarpeta, esCarpetaClientes, esCarpetaContabilidad, mismoNombre, normalizaTexto,
  oficinaDeCarpeta, resolverClienteCarpeta, trimestreDeCarpeta, type ClienteCarpeta, type TipoFactura,
} from "../../src/lib/ocr/core";
import { esFicheroOculto, mimeFactura } from "../../src/lib/ocr/subida";

export interface CarpetaCliente {
  oficina: string;
  /** Nombre de la carpeta del cliente (su razón social). */
  nombre: string;
  ruta: string;
  /** Carpeta CONTABILIDAD (06, 07… según el cliente). null si no tiene. */
  contabilidad: string | null;
}

export interface FicheroFactura {
  /** Ruta completa. */
  ruta: string;
  /** Ruta relativa a la raíz con "/": así la reconoce la app. */
  rel: string;
  nombre: string;
  tipo: TipoFactura;
  trimestre: string;
  tam: number;
  mtimeMs: number;
}

const leer = (dir: string): Dirent[] => {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
};
const subcarpetas = (dir: string) => leer(dir).filter((d) => d.isDirectory());

/** Clientes del servidor (todas las oficinas), filtrados por la lista del piloto si la hay. */
export function clientesDelServidor(raiz: string, filtro: string[]): CarpetaCliente[] {
  const out: CarpetaCliente[] = [];
  for (const of of subcarpetas(raiz)) {
    const oficina = oficinaDeCarpeta(of.name, OFICINAS);
    if (!oficina) continue;
    const dirOficina = join(raiz, of.name);
    const clientes = subcarpetas(dirOficina).find((d) => esCarpetaClientes(d.name));
    if (!clientes) continue;
    const dirClientes = join(dirOficina, clientes.name);
    for (const cli of subcarpetas(dirClientes)) {
      if (filtro.length && !filtro.some((f) => mismoNombre(f, cli.name))) continue;
      const ruta = join(dirClientes, cli.name);
      const cont = subcarpetas(ruta).find((d) => esCarpetaContabilidad(d.name));
      out.push({ oficina, nombre: cli.name, ruta, contabilidad: cont ? join(ruta, cont.name) : null });
    }
  }
  return out;
}

/** Busca (o crea, si `crear`) una subcarpeta reconocida por una función; si no existe, con `nombreNuevo`. */
function subcarpeta(dir: string, es: (nombre: string) => boolean, nombreNuevo: string, crear: boolean, creadas: string[]) {
  const ya = subcarpetas(dir).find((d) => es(d.name));
  if (ya) return join(dir, ya.name);
  if (!crear) return null;
  const nueva = join(dir, nombreNuevo);
  mkdirSync(nueva);
  creadas.push(nueva);
  return nueva;
}

/**
 * Carpeta del trimestre (`AÑO 2026\4º TRIMESTRE`) dentro de CONTABILIDAD, con
 * GASTOS e INGRESOS. Respeta las que ya existan aunque se llamen un poco
 * distinto ("2026", "4T"…): solo crea lo que falta. Devuelve la del trimestre.
 */
export function carpetaTrimestre(
  contabilidad: string,
  anio: number,
  q: number,
  { crear, conLibros = true }: { crear: boolean; conLibros?: boolean },
): { ruta: string | null; creadas: string[] } {
  const creadas: string[] = [];
  const dirAnio = subcarpeta(contabilidad, (n) => anioDeCarpeta(n) === anio, `AÑO ${anio}`, crear, creadas);
  if (!dirAnio) return { ruta: null, creadas };
  const dirTrim = subcarpeta(dirAnio, (n) => trimestreDeCarpeta(n) === q, `${q}º TRIMESTRE`, crear, creadas);
  if (dirTrim && conLibros) {
    for (const libro of ["GASTOS", "INGRESOS"]) subcarpeta(dirTrim, (n) => normalizaTexto(n) === libro, libro, crear, creadas);
  }
  return { ruta: dirTrim, creadas };
}

/** Recorre una carpeta GASTOS/INGRESOS y sus subcarpetas (p. ej. "julio"). */
function* facturasEn(dir: string): Generator<{ ruta: string; nombre: string }> {
  for (const d of leer(dir)) {
    const ruta = join(dir, d.name);
    if (d.isDirectory()) yield* facturasEn(ruta);
    // "~$…" = fichero temporal de Office; ocultos y Thumbs.db fuera.
    else if (d.isFile() && !d.name.startsWith("~$") && !esFicheroOculto(d.name) && mimeFactura(d.name)) {
      yield { ruta, nombre: d.name };
    }
  }
}

/** Facturas de un cliente en los trimestres desde `desde` ("2026-4T") en adelante. */
export function facturasDelCliente(raiz: string, cli: CarpetaCliente, desde: string): FicheroFactura[] {
  if (!cli.contabilidad) return [];
  const out: FicheroFactura[] = [];
  for (const a of subcarpetas(cli.contabilidad)) {
    const anio = anioDeCarpeta(a.name);
    if (!anio) continue;
    const dirAnio = join(cli.contabilidad, a.name);
    for (const t of subcarpetas(dirAnio)) {
      const q = trimestreDeCarpeta(t.name);
      if (!q) continue;
      const trimestre = `${anio}-${q}T`;
      if (trimestre < desde) continue; // "2026-3T" < "2026-4T" < "2027-1T"
      const dirTrim = join(dirAnio, t.name);
      for (const l of subcarpetas(dirTrim)) {
        const libro = normalizaTexto(l.name);
        const tipo: TipoFactura | null = libro === "GASTOS" ? "gasto" : libro === "INGRESOS" ? "ingreso" : null;
        if (!tipo) continue;
        for (const f of facturasEn(join(dirTrim, l.name))) {
          let st;
          try { st = statSync(f.ruta); } catch { continue; }
          out.push({
            ruta: f.ruta, nombre: f.nombre, tipo, trimestre, tam: st.size, mtimeMs: st.mtimeMs,
            rel: relative(raiz, f.ruta).split(sep).join("/"),
          });
        }
      }
    }
  }
  return out;
}

/**
 * Empareja cada carpeta con su cliente activo de la app (por nombre, NIF o código,
 * dentro de su oficina). Devuelve también los clientes activos sin carpeta.
 */
export function emparejar(carpetas: CarpetaCliente[], activos: ClienteCarpeta[]) {
  const conCliente = new Map<CarpetaCliente, ClienteCarpeta>();
  const sinCliente: CarpetaCliente[] = [];
  for (const c of carpetas) {
    const cli = resolverClienteCarpeta(c.nombre, c.oficina, activos);
    if (cli) conCliente.set(c, cli);
    else sinCliente.push(c);
  }
  const usados = new Set([...conCliente.values()].map((c) => c.id));
  return { conCliente, sinCliente, sinCarpeta: activos.filter((a) => !usados.has(a.id)) };
}

/** Trimestre en curso: año y número. */
export const trimestreActual = (ahora: Date) => ({ anio: ahora.getFullYear(), q: Math.floor(ahora.getMonth() / 3) + 1 });
