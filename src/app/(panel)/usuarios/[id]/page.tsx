import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { UsuarioForm } from "@/components/UsuarioForm";
import { ResetPassword } from "@/components/ResetPassword";
import { getUsuario, getMiRol } from "@/lib/repos/usuarios";
import { updateUsuarioAction } from "../actions";

export default async function EditarUsuarioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const rol = await getMiRol();
  if (rol !== "responsable" && rol !== "admin") redirect("/dashboard");

  const { id } = await params;
  const usuario = await getUsuario(id);
  if (!usuario) notFound();

  const action = updateUsuarioAction.bind(null, id);

  return (
    <div className="space-y-6 p-8">
      <header>
        <Link href="/usuarios" className="text-sm text-fg-muted hover:underline">
          ← Usuarios
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-primary">{usuario.nombre}</h1>
        <p className="text-xs text-fg-muted">
          {usuario.activo ? "Activo" : "De baja"}
        </p>
      </header>

      <UsuarioForm action={action} usuario={usuario} />

      <section className="max-w-2xl border-t border-border pt-6">
        <ResetPassword id={usuario.id} email={usuario.email} />
      </section>
    </div>
  );
}
