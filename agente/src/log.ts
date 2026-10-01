// Registro de actividad: logs\agente-AAAA-MM-DD.log (uno por día, se guardan 60).
// También sale por pantalla, que el servicio de Windows (WinSW) recoge.
import { appendFileSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const DIAS_GUARDADOS = 60;

export type Nivel = "INFO" | "AVISO" | "ERROR";
export interface Log {
  info(msg: string): void;
  aviso(msg: string): void;
  error(msg: string): void;
}

const hoy = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function crearLog(dir: string, { silencioso = false } = {}): Log {
  const carpeta = join(dir, "logs");
  mkdirSync(carpeta, { recursive: true });
  let diaLimpieza = "";

  function escribir(nivel: Nivel, msg: string) {
    const ahora = new Date();
    const linea = `${ahora.toISOString()} ${nivel.padEnd(5)} ${msg}`;
    if (!silencioso) (nivel === "ERROR" ? console.error : console.log)(linea);
    try {
      appendFileSync(join(carpeta, `agente-${hoy(ahora)}.log`), linea + "\n");
      if (diaLimpieza !== hoy(ahora)) {
        diaLimpieza = hoy(ahora);
        const limite = hoy(new Date(ahora.getTime() - DIAS_GUARDADOS * 86_400_000));
        for (const f of readdirSync(carpeta)) {
          const d = /^agente-(\d{4}-\d{2}-\d{2})\.log$/.exec(f)?.[1];
          if (d && d < limite) unlinkSync(join(carpeta, f));
        }
      }
    } catch {
      // Sin disco no hay registro, pero el agente sigue.
    }
  }

  return {
    info: (m) => escribir("INFO", m),
    aviso: (m) => escribir("AVISO", m),
    error: (m) => escribir("ERROR", m),
  };
}
