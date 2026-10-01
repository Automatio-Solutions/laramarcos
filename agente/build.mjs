// Genera la carpeta de instalación del agente para Windows Server (x64):
//   agente/dist/LaraMarcosOCR/
//     LaraMarcosOCR.exe            el agente (Node 22 dentro, no hay que instalar nada)
//     LaraMarcosOCR-servicio.exe   WinSW: lo registra como servicio de Windows
//     LaraMarcosOCR-servicio.xml   configuración del servicio
//     config.json                  a rellenar (copia de config.ejemplo.json)
//     INSTALAR.md                  guía paso a paso
//
//   npm run agente:build
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { copyFileSync, createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";

const AQUI = "agente";
const SALIDA = join(AQUI, "dist", "LaraMarcosOCR");
const WINSW = { version: "v2.12.0", url: "https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW-x64.exe" };
const CACHE_WINSW = join(AQUI, "dist", ".cache", `WinSW-x64-${WINSW.version}.exe`);

rmSync(SALIDA, { recursive: true, force: true });
mkdirSync(SALIDA, { recursive: true });

// 1) Todo el código (agente + lógica compartida con la app + pdf-lib) en un único fichero.
const bundle = join(AQUI, "dist", "agente.cjs");
await build({
  entryPoints: [join(AQUI, "src", "main.ts")],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  outfile: bundle,
  legalComments: "none",
  logLevel: "warning",
});

// 2) Ejecutable de Windows x64 con Node 22 dentro.
execFileSync("npx", ["pkg", bundle, "--targets", "node22-win-x64", "--output", join(SALIDA, "LaraMarcosOCR.exe"), "--no-bytecode", "--public"], {
  stdio: "inherit",
});

// 3) WinSW (servicio de Windows), descargado una vez y guardado en caché.
if (!existsSync(CACHE_WINSW)) {
  mkdirSync(join(AQUI, "dist", ".cache"), { recursive: true });
  const res = await fetch(WINSW.url);
  if (!res.ok) throw new Error(`No se pudo descargar WinSW: ${res.status}`);
  await pipeline(res.body, createWriteStream(CACHE_WINSW));
}
copyFileSync(CACHE_WINSW, join(SALIDA, "LaraMarcosOCR-servicio.exe"));
copyFileSync(join(AQUI, "servicio", "LaraMarcosOCR-servicio.xml"), join(SALIDA, "LaraMarcosOCR-servicio.xml"));
copyFileSync(join(AQUI, "config.ejemplo.json"), join(SALIDA, "config.json"));
copyFileSync(join(AQUI, "INSTALAR.md"), join(SALIDA, "INSTALAR.md"));

const sha = (f) => createHash("sha256").update(readFileSync(f)).digest("hex");
const huellas = ["LaraMarcosOCR.exe", "LaraMarcosOCR-servicio.exe"].map((f) => `${sha(join(SALIDA, f))}  ${f}`).join("\n");
writeFileSync(join(SALIDA, "SHA256.txt"), huellas + "\n");
console.log(`\n✓ ${SALIDA}\n${huellas}`);
