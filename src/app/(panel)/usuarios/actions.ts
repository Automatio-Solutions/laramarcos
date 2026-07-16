"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  validateUsuario,
  hasUsuarioErrors,
  type UsuarioFieldErrors,
} from "@/lib/validators/usuario";
import { OFICINAS, ROLES, type Oficina, type Rol, type UsuarioInput } from "@/lib/types";

export interface UsuarioFormState {
  ok: boolean;
  errors: UsuarioFieldErrors;
  message?: string;
  /** Solo en alta: contraseña generada para entregar al trabajador (se muestra una vez). */
  password?: string;
}

export interface AccionSimpleResult {
  ok: boolean;
  message?: string;
  password?: string;
}

const PWD_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*?";

/** Genera una contraseña aleatoria robusta (16 caracteres). */
function generarPassword(len = 16): string {
  const bytes = new Uint32Array(len);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < len; i++) out += PWD_CHARSET[bytes[i] % PWD_CHARSET.length];
  return out;
}

function parseForm(formData: FormData): UsuarioInput {
  const oficinaRaw = String(formData.get("oficina") ?? "").trim();
  const rolRaw = String(formData.get("rol") ?? "").trim();
  return {
    nombre: String(formData.get("nombre") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    rol: (ROLES.includes(rolRaw as Rol) ? rolRaw : "asesor") as Rol,
    oficina: (OFICINAS.includes(oficinaRaw as Oficina) ? oficinaRaw : null) as Oficina | null,
  };
}

/** Verifica sesión y que el usuario es staff (responsable/admin). */
async function requireStaff() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sesión no válida." as const };
  const { data: me } = await supabase
    .from("usuarios")
    .select("rol")
    .eq("id", user.id)
    .maybeSingle();
  if (!me || (me.rol !== "responsable" && me.rol !== "admin")) {
    return { error: "No tienes permisos para gestionar usuarios." as const };
  }
  return { supabase, user };
}

export async function crearUsuarioAction(
  _prev: UsuarioFormState,
  formData: FormData,
): Promise<UsuarioFormState> {
  const input = parseForm(formData);
  const errors = validateUsuario(input);
  if (hasUsuarioErrors(errors)) return { ok: false, errors };

  const guard = await requireStaff();
  if ("error" in guard) return { ok: false, errors: {}, message: guard.error };
  const { supabase } = guard;

  const admin = createAdminClient();
  const password = generarPassword();

  // 1. Crear el usuario de auth con la contraseña generada.
  const { data: created, error: authErr } = await admin.auth.admin.createUser({
    email: input.email,
    password,
    email_confirm: true,
    user_metadata: { nombre: input.nombre },
  });
  if (authErr || !created?.user) {
    const msg = authErr?.message ?? "No se pudo crear el usuario.";
    if (/already|registered|exists/i.test(msg)) {
      return { ok: false, errors: { email: "Ya existe un usuario con ese email." } };
    }
    return { ok: false, errors: {}, message: msg };
  }

  // 2. Crear la fila de aplicación (mismo id que auth.users) con la sesión staff (RLS + auditoría).
  const { error: dbErr } = await supabase.from("usuarios").insert({
    id: created.user.id,
    email: input.email,
    nombre: input.nombre,
    rol: input.rol,
    oficina: input.oficina,
    activo: true,
  });
  if (dbErr) {
    // Rollback: borrar el auth user para no dejar huérfanos.
    await admin.auth.admin.deleteUser(created.user.id);
    if (dbErr.code === "23505") {
      return { ok: false, errors: { email: "Ya existe un usuario con ese email." } };
    }
    return { ok: false, errors: {}, message: dbErr.message };
  }

  revalidatePath("/usuarios");
  return { ok: true, errors: {}, password };
}

export async function updateUsuarioAction(
  id: string,
  _prev: UsuarioFormState,
  formData: FormData,
): Promise<UsuarioFormState> {
  const input = parseForm(formData);
  const errors = validateUsuario(input);
  if (hasUsuarioErrors(errors)) return { ok: false, errors };

  const guard = await requireStaff();
  if ("error" in guard) return { ok: false, errors: {}, message: guard.error };
  const { supabase } = guard;

  const admin = createAdminClient();

  // Sincronizar email en auth (idempotente; falla si lo usa otro usuario).
  const { error: authErr } = await admin.auth.admin.updateUserById(id, {
    email: input.email,
    email_confirm: true,
    user_metadata: { nombre: input.nombre },
  });
  if (authErr) {
    if (/already|registered|exists/i.test(authErr.message)) {
      return { ok: false, errors: { email: "Ya existe un usuario con ese email." } };
    }
    return { ok: false, errors: {}, message: authErr.message };
  }

  const { error: dbErr } = await supabase
    .from("usuarios")
    .update({
      nombre: input.nombre,
      email: input.email,
      rol: input.rol,
      oficina: input.oficina,
    })
    .eq("id", id);
  if (dbErr) {
    if (dbErr.code === "23505") {
      return { ok: false, errors: { email: "Ya existe un usuario con ese email." } };
    }
    return { ok: false, errors: {}, message: dbErr.message };
  }

  revalidatePath("/usuarios");
  redirect("/usuarios");
}

/** Alta/baja del trabajador: activa o desactiva la fila y banea/desbanea el login. */
export async function setUsuarioActivoAction(
  id: string,
  activo: boolean,
): Promise<AccionSimpleResult> {
  const guard = await requireStaff();
  if ("error" in guard) return { ok: false, message: guard.error };
  const { supabase, user } = guard;

  if (!activo && user.id === id) {
    return { ok: false, message: "No puedes darte de baja a ti mismo." };
  }

  const { error: dbErr } = await supabase.from("usuarios").update({ activo }).eq("id", id);
  if (dbErr) return { ok: false, message: dbErr.message };

  const admin = createAdminClient();
  const { error: authErr } = await admin.auth.admin.updateUserById(id, {
    ban_duration: activo ? "none" : "876000h", // ~100 años = bloqueo de acceso.
  });
  if (authErr) return { ok: false, message: authErr.message };

  revalidatePath("/usuarios");
  return { ok: true };
}

/** Genera una contraseña nueva para el usuario y la devuelve para entregarla. */
export async function resetPasswordAction(id: string): Promise<AccionSimpleResult> {
  const guard = await requireStaff();
  if ("error" in guard) return { ok: false, message: guard.error };

  const admin = createAdminClient();
  const password = generarPassword();
  const { error } = await admin.auth.admin.updateUserById(id, { password });
  if (error) return { ok: false, message: error.message };

  return { ok: true, password };
}
