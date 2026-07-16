"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Field } from "@/components/ui/Field";
import { isValidNifCif, isValidIban, isValidEmail } from "@/lib/validators/identity";
import { crearSectorAction, type ClienteFormState } from "@/app/(panel)/clientes/actions";
import { OFICINAS, type ClienteConRelaciones, type Oficina, type Sector, type Usuario } from "@/lib/types";

const initial: ClienteFormState = { ok: false, errors: {} };

type ClientErrors = Record<string, string>;

/** Fila de cuenta en edición (key solo para React). */
interface CuentaFila {
  key: string;
  iban: string;
  descripcion: string;
}

let cuentaSeq = 0;
const nuevaFila = (iban = "", descripcion = ""): CuentaFila => ({ key: `c${cuentaSeq++}`, iban, descripcion });

export function ClienteForm({
  action,
  sectores,
  asesores,
  cliente,
  miOficina,
}: {
  action: (prev: ClienteFormState, fd: FormData) => Promise<ClienteFormState>;
  sectores: Sector[];
  asesores: Usuario[];
  cliente?: ClienteConRelaciones;
  miOficina?: Oficina | null;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  const [clientErrors, setClientErrors] = useState<ClientErrors>({});
  const errors = { ...clientErrors, ...state.errors };

  // Cuentas bancarias: el cliente puede tener varias (una fila vacía si no hay).
  const [cuentas, setCuentas] = useState<CuentaFila[]>(() =>
    cliente?.cuentas.length
      ? cliente.cuentas.map((c) => nuevaFila(c.iban, c.descripcion ?? ""))
      : [nuevaFila()],
  );

  function setCuenta(key: string, campo: "iban" | "descripcion", valor: string) {
    setCuentas((prev) => prev.map((c) => (c.key === key ? { ...c, [campo]: valor } : c)));
  }

  function validateField(name: string, value: string) {
    let msg = "";
    if (name === "cif") {
      if (!value.trim()) msg = "El CIF/NIF es obligatorio.";
      else if (!isValidNifCif(value)) msg = "CIF/NIF inválido (dígito de control incorrecto).";
    } else if (name === "email" && value.trim() && !isValidEmail(value)) {
      msg = "Email inválido.";
    }
    setClientErrors((prev) => {
      const next = { ...prev };
      if (msg) next[name] = msg;
      else delete next[name];
      return next;
    });
  }

  const onBlur: React.FocusEventHandler<HTMLInputElement> = (e) =>
    validateField(e.target.name, e.target.value);

  const [allSectores, setAllSectores] = useState<Sector[]>(sectores);
  const [checkedSectores, setCheckedSectores] = useState<Set<string>>(
    () => new Set(cliente?.sectores.map((s) => s.id)),
  );
  const [nuevoSector, setNuevoSector] = useState("");
  const [sectorError, setSectorError] = useState("");
  const [addingSector, setAddingSector] = useState(false);

  function toggleSector(id: string, checked: boolean) {
    setCheckedSectores((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function addSector() {
    const nombre = nuevoSector.trim();
    if (!nombre || addingSector) return;
    setSectorError("");
    setAddingSector(true);
    const res = await crearSectorAction(nombre);
    setAddingSector(false);
    if (!res.ok) {
      setSectorError(res.error);
      return;
    }
    setAllSectores((prev) =>
      prev.some((s) => s.id === res.sector.id) ? prev : [...prev, res.sector],
    );
    setCheckedSectores((prev) => new Set(prev).add(res.sector.id));
    setNuevoSector("");
  }

  return (
    <form action={formAction} className="max-w-2xl space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="CIF / NIF" name="cif" required defaultValue={cliente?.cif} error={errors.cif} onBlur={onBlur} placeholder="B12345678" />
        <Field label="Razón social" name="razon_social" required defaultValue={cliente?.razon_social} error={errors.razon_social} onBlur={onBlur} />
        <Field label="Email" name="email" type="email" defaultValue={cliente?.email} error={errors.email} onBlur={onBlur} />
        <Field label="Teléfono" name="telefono" defaultValue={cliente?.telefono} onBlur={onBlur} />
      </div>

      {/* Cuentas bancarias — un cliente puede tener varias */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-fg">Cuentas bancarias</legend>
        <div className="space-y-2">
          {cuentas.map((c, i) => (
            <div key={c.key} className="flex items-center gap-2">
              <input
                name="cuenta_iban"
                value={c.iban}
                onChange={(e) => setCuenta(c.key, "iban", e.target.value)}
                placeholder="ES91 2100 0418 4502 0005 1332"
                className={`flex-1 rounded-md border bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-primary ${
                  c.iban.trim() && !isValidIban(c.iban) ? "border-error" : "border-border"
                }`}
              />
              <input
                name="cuenta_descripcion"
                value={c.descripcion}
                onChange={(e) => setCuenta(c.key, "descripcion", e.target.value)}
                placeholder="Nombre (ej: Santander nóminas)"
                className="w-64 rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={() => setCuentas((prev) => (prev.length === 1 ? [nuevaFila()] : prev.filter((x) => x.key !== c.key)))}
                className="rounded p-1.5 text-error hover:bg-error/10"
                title={cuentas.length === 1 ? "Vaciar cuenta" : "Quitar cuenta"}
                aria-label={`Quitar cuenta ${i + 1}`}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-4 w-4">
                  <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setCuentas((prev) => [...prev, nuevaFila()])}
          className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-fg hover:bg-surface-raised"
        >
          + Añadir cuenta
        </button>
        {errors.cuentas && <p className="text-sm text-error" role="alert">{errors.cuentas}</p>}
      </fieldset>

      <Field label="Dirección" name="direccion" defaultValue={cliente?.direccion} onBlur={onBlur} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Ciudad" name="ciudad" defaultValue={cliente?.ciudad} onBlur={onBlur} />
        <Field label="Código postal" name="codigo_postal" defaultValue={cliente?.codigo_postal} onBlur={onBlur} placeholder="06001" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-sm font-medium text-fg">Asesor asignado</span>
          <select
            name="asesor_id"
            defaultValue={cliente?.asesor_id ?? ""}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-fg outline-none focus:border-primary"
          >
            <option value="">— Yo (por defecto) —</option>
            {asesores.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre} ({a.rol})
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-fg">Oficina</span>
          <select
            name="oficina"
            defaultValue={cliente?.oficina ?? miOficina ?? ""}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-fg outline-none focus:border-primary"
          >
            <option value="">— Sin oficina —</option>
            {OFICINAS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <span className="block text-xs text-fg-muted">Los asesores solo ven la cartera de su oficina.</span>
        </label>
      </div>

      <Field
        label="Carpeta del cliente en el servidor"
        name="carpeta_url"
        defaultValue={cliente?.carpeta_url}
        onBlur={onBlur}
        placeholder="smb://servidor/clientes/… o https://…"
      />

      <label className="block space-y-1">
        <span className="text-sm font-medium text-fg">Fecha de finalización</span>
        <input
          type="date"
          name="fecha_baja"
          defaultValue={cliente?.fecha_baja ?? ""}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-fg outline-none focus:border-primary sm:w-56"
        />
        <span className="block text-xs text-fg-muted">Solo para clientes que dejan el servicio. Al ponerla, el cliente pasa a inactivo.</span>
      </label>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-fg">Sectores</legend>
        <div className="flex flex-wrap gap-2">
          {allSectores.map((s) => (
            <label key={s.id} className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-fg has-checked:border-primary has-checked:bg-primary-subtle">
              <input
                type="checkbox"
                name="sector_ids"
                value={s.id}
                checked={checkedSectores.has(s.id)}
                onChange={(e) => toggleSector(s.id, e.target.checked)}
              />
              {s.nombre}
            </label>
          ))}
        </div>

        <div className="flex gap-2 pt-1">
          <input
            value={nuevoSector}
            onChange={(e) => setNuevoSector(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addSector();
              }
            }}
            placeholder="Añadir sector nuevo…"
            className="w-56 rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-fg outline-none focus:border-primary"
          />
          <button
            type="button"
            onClick={addSector}
            disabled={addingSector || !nuevoSector.trim()}
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-fg hover:bg-surface-raised disabled:opacity-60"
          >
            {addingSector ? "Añadiendo…" : "+ Añadir"}
          </button>
        </div>
        {sectorError && (
          <p className="text-sm text-error" role="alert">{sectorError}</p>
        )}
      </fieldset>

      {state.message && (
        <p className="text-sm text-error" role="alert">{state.message}</p>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-primary px-5 py-2 font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-60"
        >
          {pending ? "Guardando…" : "Guardar"}
        </button>
        <Link href="/clientes" className="rounded-md border border-border px-5 py-2 font-medium text-fg hover:bg-surface-raised">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
