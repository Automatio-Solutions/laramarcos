import { isValidNifCif } from "../validators/identity.ts";

export interface ParsedRow {
  cif: string;
  razon_social: string;
  email?: string;
  telefono?: string;
  direccion?: string;
}

export interface ImportReport {
  valid: ParsedRow[];
  rejected: { fila: number; cif: string; motivo: string }[];
}

/** Parser CSV mínimo: soporta comillas dobles y separador coma o punto y coma. */
export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];
  const sep = lines[0].includes(";") && !lines[0].includes(",") ? ";" : ",";

  const splitLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (c === sep && !inQuotes) {
        out.push(cur); cur = "";
      } else cur += c;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };

  const headers = splitLine(lines[0]).map((h) => h.toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = splitLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h] = cells[i] ?? ""));
    return row;
  });
}

/** Valida filas para import: CIF válido + duplicados (en el fichero y contra los existentes). */
export function validateImport(
  rows: Record<string, string>[],
  existingCifs: Set<string>,
): ImportReport {
  const valid: ParsedRow[] = [];
  const rejected: ImportReport["rejected"] = [];
  const seen = new Set<string>();

  rows.forEach((row, idx) => {
    const fila = idx + 2; // +1 header, +1 base-1
    const cif = (row.cif ?? "").toUpperCase().trim();
    const razon = (row.razon_social ?? row.razón_social ?? row.nombre ?? "").trim();

    if (!cif) return rejected.push({ fila, cif, motivo: "CIF vacío" });
    if (!isValidNifCif(cif)) return rejected.push({ fila, cif, motivo: "CIF/NIF inválido" });
    if (!razon) return rejected.push({ fila, cif, motivo: "Razón social vacía" });
    if (seen.has(cif)) return rejected.push({ fila, cif, motivo: "Duplicado en el fichero" });
    if (existingCifs.has(cif)) return rejected.push({ fila, cif, motivo: "Ya existe en la BBDD" });

    seen.add(cif);
    valid.push({
      cif,
      razon_social: razon,
      email: row.email || undefined,
      telefono: row.telefono || row["teléfono"] || undefined,
      direccion: row.direccion || row["dirección"] || undefined,
    });
  });

  return { valid, rejected };
}
