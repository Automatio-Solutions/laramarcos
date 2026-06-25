import { isValidEmail } from "./identity";
import { ROLES, OFICINAS, type UsuarioInput } from "@/lib/types";

export type UsuarioFieldErrors = Partial<Record<keyof UsuarioInput, string>>;

/** Valida el formulario de usuario. Devuelve errores por campo (vacío = válido). */
export function validateUsuario(input: Partial<UsuarioInput>): UsuarioFieldErrors {
  const errors: UsuarioFieldErrors = {};

  if (!input.nombre?.trim()) {
    errors.nombre = "El nombre es obligatorio.";
  }

  if (!input.email?.trim()) {
    errors.email = "El email es obligatorio.";
  } else if (!isValidEmail(input.email)) {
    errors.email = "Email inválido.";
  }

  if (!input.rol || !ROLES.includes(input.rol)) {
    errors.rol = "Selecciona un rol válido.";
  }

  if (input.oficina && !OFICINAS.includes(input.oficina)) {
    errors.oficina = "Oficina no válida.";
  }

  return errors;
}

export function hasUsuarioErrors(errors: UsuarioFieldErrors): boolean {
  return Object.keys(errors).length > 0;
}
