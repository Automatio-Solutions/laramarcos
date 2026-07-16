import { isValidNifCif, isValidIban, isValidEmail } from "./identity";
import type { ClienteInput } from "@/lib/types";

export type FieldErrors = Partial<Record<keyof ClienteInput, string>>;

/** Valida el formulario de cliente. Devuelve errores por campo (vacío = válido). */
export function validateCliente(input: Partial<ClienteInput>): FieldErrors {
  const errors: FieldErrors = {};

  if (!input.cif?.trim()) {
    errors.cif = "El CIF/NIF es obligatorio.";
  } else if (!isValidNifCif(input.cif)) {
    errors.cif = "CIF/NIF inválido (dígito de control incorrecto).";
  }

  if (!input.razon_social?.trim()) {
    errors.razon_social = "La razón social es obligatoria.";
  }

  if (input.email && !isValidEmail(input.email)) {
    errors.email = "Email inválido.";
  }

  // Cada cuenta debe traer un IBAN válido. Se señala la primera que falle.
  const cuentas = input.cuentas ?? [];
  for (let i = 0; i < cuentas.length; i++) {
    const iban = cuentas[i].iban?.trim();
    if (!iban) continue; // las filas vacías se descartan al guardar
    if (!isValidIban(iban)) {
      errors.cuentas = `La cuenta ${i + 1} tiene un IBAN inválido (no supera la validación módulo 97).`;
      break;
    }
  }

  return errors;
}

export function hasErrors(errors: FieldErrors): boolean {
  return Object.keys(errors).length > 0;
}
