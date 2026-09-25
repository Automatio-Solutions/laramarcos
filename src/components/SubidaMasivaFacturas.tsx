"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { esFicheroOculto, MAX_BYTES_FACTURA, mimeFactura } from "@/lib/ocr/subida";
import {
  prepararSubidaAction,
  procesarSubidaAction,
  refrescarPrecontabilizacionAction,
} from "@/app/(panel)/precontabilizacion/actions";

type Estado = "cola" | "subiendo" | "leyendo" | "ok" | "duplicada" | "error";

interface Item {
  key: string;
  file: File;
  ruta: string | null; // ruta relativa si viene de una carpeta
  estado: Estado;
  semaforo?: "verde" | "naranja" | "rojo";
  id?: string;
  cliente?: string | null;
  mensaje?: string;
}

// Cada factura tarda 10–30 s en leerse; 3 a la vez sin saturar la API de Claude.
const EN_PARALELO = 3;
const DETECTAR = "__carpeta";

const ETIQUETA: Record<Estado, string> = {
  cola: "En cola",
  subiendo: "Subiendo…",
  leyendo: "Leyendo con IA…",
  ok: "Leída",
  duplicada: "Ya estaba subida",
  error: "Error",
};
const PUNTO = { verde: "bg-success", naranja: "bg-warning", rojo: "bg-error" };

/** Recorre lo que se arrastra (archivos y carpetas, con subcarpetas). */
async function leerArrastre(dt: DataTransfer): Promise<{ file: File; ruta: string | null }[]> {
  const entradas = [...dt.items].map((i) => i.webkitGetAsEntry?.()).filter((e): e is FileSystemEntry => !!e);
  if (!entradas.length) return [...dt.files].map((file) => ({ file, ruta: null }));

  const out: { file: File; ruta: string | null }[] = [];
  async function visitar(e: FileSystemEntry, carpeta: string | null) {
    if (e.isFile) {
      const file = await new Promise<File>((ok, ko) => (e as FileSystemFileEntry).file(ok, ko));
      out.push({ file, ruta: carpeta ? `${carpeta}/${file.name}` : null });
    } else if (e.isDirectory) {
      const lector = (e as FileSystemDirectoryEntry).createReader();
      const ruta = carpeta ? `${carpeta}/${e.name}` : e.name;
      // readEntries devuelve por tandas: hay que llamarlo hasta que venga vacío.
      for (;;) {
        const tanda = await new Promise<FileSystemEntry[]>((ok, ko) => lector.readEntries(ok, ko));
        if (!tanda.length) break;
        for (const hijo of tanda) await visitar(hijo, ruta);
      }
    }
  }
  for (const e of entradas) await visitar(e, null);
  return out;
}

export function SubidaMasivaFacturas({ clientes }: { clientes: { id: string; razon_social: string }[] }) {
  const [items, setItems] = useState<Item[]>([]);
  const [ignorados, setIgnorados] = useState(0);
  const [cliente, setCliente] = useState("");
  const [enMarcha, setEnMarcha] = useState(false);
  const [encima, setEncima] = useState(false);
  const itemsRef = useRef<Item[]>([]);
  const carpetaRef = useRef<HTMLInputElement>(null);
  const archivosRef = useRef<HTMLInputElement>(null);

  // React no tipa webkitdirectory: se pone a mano.
  useEffect(() => carpetaRef.current?.setAttribute("webkitdirectory", ""), []);

  // Avisar antes de cerrar la pestaña con facturas a medias.
  useEffect(() => {
    if (!enMarcha) return;
    const aviso = (ev: BeforeUnloadEvent) => ev.preventDefault();
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [enMarcha]);

  const actualizar = (key: string, cambios: Partial<Item>) => {
    itemsRef.current = itemsRef.current.map((i) => (i.key === key ? { ...i, ...cambios } : i));
    setItems(itemsRef.current);
  };

  function anadir(nuevos: { file: File; ruta: string | null }[]) {
    const validos = nuevos.filter((n) => !esFicheroOculto(n.file.name));
    const facturas = validos.filter((n) => mimeFactura(n.file.name, n.file.type));
    setIgnorados((x) => x + validos.length - facturas.length);
    const ya = new Set(itemsRef.current.map((i) => i.ruta ?? i.file.name));
    const lista: Item[] = facturas
      .filter((n) => !ya.has(n.ruta ?? n.file.name))
      .map((n) => ({
        key: crypto.randomUUID(),
        file: n.file,
        ruta: n.ruta,
        ...(n.file.size > MAX_BYTES_FACTURA
          ? { estado: "error" as const, mensaje: "Demasiado grande (máx. 20 MB)." }
          : { estado: "cola" as const }),
      }));
    itemsRef.current = [...itemsRef.current, ...lista];
    setItems(itemsRef.current);
  }

  async function procesarUno(it: Item) {
    const supabase = createClient();
    try {
      actualizar(it.key, { estado: "subiendo", mensaje: undefined });
      const prep = await prepararSubidaAction(it.file.name, it.file.type, it.file.size);
      if ("error" in prep) return actualizar(it.key, { estado: "error", mensaje: prep.error });

      const { error } = await supabase.storage
        .from("facturas")
        .uploadToSignedUrl(prep.path, prep.token, it.file, { contentType: mimeFactura(it.file.name, it.file.type) ?? undefined });
      if (error) return actualizar(it.key, { estado: "error", mensaje: `Subida: ${error.message}` });

      actualizar(it.key, { estado: "leyendo" });
      const r = await procesarSubidaAction({
        path: prep.path,
        nombre: it.file.name,
        tipo: it.file.type,
        rutaRelativa: it.ruta,
        cliente_id: cliente && cliente !== DETECTAR ? cliente : null,
        detectarCliente: cliente === DETECTAR,
      });
      if (r.estado === "ok") actualizar(it.key, { estado: "ok", semaforo: r.semaforo, id: r.id, cliente: r.cliente });
      else if (r.estado === "duplicada") actualizar(it.key, { estado: "duplicada", id: r.id });
      else actualizar(it.key, { estado: "error", mensaje: r.mensaje });
    } catch (e) {
      actualizar(it.key, { estado: "error", mensaje: (e as Error).message || "Fallo de conexión." });
    }
  }

  async function procesar() {
    setEnMarcha(true);
    let hechas = 0;
    const siguiente = () => itemsRef.current.find((i) => i.estado === "cola");
    const trabajador = async () => {
      for (let it = siguiente(); it; it = siguiente()) {
        actualizar(it.key, { estado: "subiendo" }); // reservada: otro trabajador no la coge
        await procesarUno(it);
        if (++hechas % 20 === 0) void refrescarPrecontabilizacionAction();
      }
    };
    await Promise.all(Array.from({ length: EN_PARALELO }, trabajador));
    await refrescarPrecontabilizacionAction();
    setEnMarcha(false);
  }

  function reintentar() {
    itemsRef.current = itemsRef.current.map((i) =>
      i.estado === "error" && i.file.size <= MAX_BYTES_FACTURA ? { ...i, estado: "cola", mensaje: undefined } : i);
    setItems(itemsRef.current);
    void procesar();
  }

  function limpiar() {
    itemsRef.current = [];
    setItems([]);
    setIgnorados(0);
  }

  const cuenta = (e: Estado) => items.filter((i) => i.estado === e).length;
  const terminadas = cuenta("ok") + cuenta("duplicada") + cuenta("error");
  const enCola = cuenta("cola");
  const errores = cuenta("error");
  const hayCarpetas = items.some((i) => i.ruta);

  return (
    <section
      className={`space-y-4 rounded-lg border bg-surface p-4 text-sm ${encima ? "border-accent" : "border-border"}`}
      onDragOver={(e) => { e.preventDefault(); setEncima(true); }}
      onDragLeave={() => setEncima(false)}
      onDrop={async (e) => {
        e.preventDefault();
        setEncima(false);
        if (!enMarcha) anadir(await leerArrastre(e.dataTransfer));
      }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1">
          <span className="block text-fg-muted">Cliente</span>
          <select
            value={cliente}
            onChange={(e) => setCliente(e.target.value)}
            disabled={enMarcha}
            className="rounded-md border border-border bg-surface px-2 py-2 text-fg"
          >
            <option value="">— Sin cliente (asignar al revisar) —</option>
            <option value={DETECTAR}>📁 Detectar por nombre de carpeta</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.razon_social}</option>)}
          </select>
        </label>
        <input ref={archivosRef} type="file" multiple accept=".pdf,image/*" hidden
          onChange={(e) => { anadir([...(e.target.files ?? [])].map((file) => ({ file, ruta: null }))); e.target.value = ""; }} />
        <input ref={carpetaRef} type="file" hidden
          onChange={(e) => {
            anadir([...(e.target.files ?? [])].map((file) => ({ file, ruta: file.webkitRelativePath || null })));
            e.target.value = "";
          }} />
        <button type="button" disabled={enMarcha} onClick={() => archivosRef.current?.click()}
          className="rounded-md border border-border px-4 py-2 font-medium text-fg hover:bg-surface-raised disabled:opacity-50">
          📄 Elegir archivos
        </button>
        <button type="button" disabled={enMarcha} onClick={() => carpetaRef.current?.click()}
          className="rounded-md border border-border px-4 py-2 font-medium text-fg hover:bg-surface-raised disabled:opacity-50">
          📁 Elegir carpeta
        </button>
        <button type="button" disabled={enMarcha || enCola === 0} onClick={() => void procesar()}
          className="rounded-md bg-primary px-4 py-2 font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50">
          {enMarcha ? "Procesando…" : `Subir y procesar${enCola ? ` ${enCola}` : ""}`}
        </button>
      </div>

      {items.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-fg-muted">
          Arrastra aquí facturas o carpetas (PDF, JPG, PNG), o usa los botones.
        </p>
      ) : (
        <>
          <div className="space-y-1">
            <div className="flex flex-wrap justify-between gap-2 text-fg-muted">
              <span>
                {terminadas} de {items.length} · 🟢 {items.filter((i) => i.semaforo === "verde").length}
                {" "}🟠 {items.filter((i) => i.semaforo === "naranja").length}
                {" "}🔴 {items.filter((i) => i.semaforo === "rojo").length}
                {cuenta("duplicada") > 0 && ` · ${cuenta("duplicada")} ya subidas`}
                {errores > 0 && ` · ${errores} con error`}
                {ignorados > 0 && ` · ${ignorados} archivos ignorados (no son PDF ni imagen)`}
              </span>
              <span className="flex gap-3">
                {!enMarcha && errores > 0 && <button type="button" onClick={reintentar} className="text-accent hover:underline">Reintentar errores</button>}
                {!enMarcha && <button type="button" onClick={limpiar} className="text-fg-muted hover:underline">Vaciar lista</button>}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded bg-surface-raised">
              <div className="h-full bg-primary transition-all" style={{ width: `${(terminadas / items.length) * 100}%` }} />
            </div>
            {enMarcha && <p className="text-xs text-fg-muted">No cierres esta pestaña hasta que termine.</p>}
            {cliente === DETECTAR && !hayCarpetas && (
              <p className="text-xs text-warning">Para detectar el cliente hay que subir carpetas; estos archivos quedarán sin cliente.</p>
            )}
          </div>

          <ul className="max-h-80 divide-y divide-border overflow-y-auto rounded-md border border-border">
            {items.map((i) => (
              <li key={i.key} className="flex items-center gap-3 px-3 py-2">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${i.semaforo ? PUNTO[i.semaforo] : "bg-border"}`} />
                <span className="min-w-0 flex-1 truncate text-fg" title={i.ruta ?? i.file.name}>{i.ruta ?? i.file.name}</span>
                {i.cliente && <span className="hidden truncate text-xs text-fg-muted sm:inline">{i.cliente}</span>}
                <span className={`shrink-0 text-xs ${i.estado === "error" ? "text-error" : "text-fg-muted"}`} title={i.mensaje}>
                  {i.estado === "error" && i.mensaje ? i.mensaje : ETIQUETA[i.estado]}
                </span>
                {i.id && (
                  <Link href={`/precontabilizacion/${i.id}`} className="shrink-0 text-xs font-medium text-accent hover:underline">Ver</Link>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
