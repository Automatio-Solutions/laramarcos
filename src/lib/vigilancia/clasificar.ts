// Clasificación de publicaciones DOE/BOE por sector + urgencia (UC-302/303).
// Respaldo determinista por palabras clave. La clasificación con Claude vive en
// ./clasificar-ia.ts (clasificarLote), que cae aquí si no hay clave o si falla.

export interface SectorRef { id: string; nombre: string; }
export interface PublicacionRaw { titulo: string; resumen?: string; enlace?: string; }

function norm(s: string): string {
  return (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Sinónimos por sector (clave = nombre del sector normalizado)
const SINONIMOS: Record<string, string[]> = {
  hosteleria: ["bar", "restaurante", "turismo", "hotel", "hospedaje"],
  construccion: ["obra", "edificacion", "reforma", "urbanismo"],
  agricultura: ["agrario", "ganaderia", "campo", "cultivo", "agroalimentari"],
  comercio: ["tienda", "minorista", "retail", "comerciante"],
  transporte: ["logistica", "mercancias", "vehiculo", "carretera"],
  salud: ["sanitari", "clinica", "farmacia", "asistencial"],
};

const PALABRAS_URGENTES = ["plazo", "obligaci", "obligatori", "ayuda", "subvenci", "convocatoria", "requerimiento", "vencimiento"];

/** Devuelve el id del sector que mejor encaja con el texto, o null. */
export function clasificarPorSector(pub: PublicacionRaw, sectores: SectorRef[]): string | null {
  const t = norm(`${pub.titulo} ${pub.resumen ?? ""}`);
  for (const s of sectores) {
    const base = norm(s.nombre);
    const claves = [base, ...base.split(/\s+/).filter((w) => w.length >= 4), ...(SINONIMOS[base] ?? [])];
    if (claves.some((k) => k && t.includes(k))) return s.id;
  }
  return null;
}

export function esUrgente(pub: PublicacionRaw): boolean {
  const t = norm(`${pub.titulo} ${pub.resumen ?? ""}`);
  return PALABRAS_URGENTES.some((k) => t.includes(k));
}

/** Resumen accionable simple (plantilla). Con Claude se redacta en lenguaje claro. */
export function resumenAccionable(pub: PublicacionRaw): string {
  const partes = [pub.titulo.trim()];
  if (esUrgente(pub)) partes.push("Acción requerida: revisa el plazo o la obligación indicada.");
  if (pub.enlace) partes.push(`Texto oficial: ${pub.enlace}`);
  return partes.join(" ");
}
