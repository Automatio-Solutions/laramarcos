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

  if (input.iban && !isValidIban(input.iban)) {
    errors.iban = "IBAN inválido (no supera la validación módulo 97).";
  }

  return errors;
}

export function hasErrors(errors: FieldErrors): boolean {
  return Object.keys(errors).length > 0;
}
