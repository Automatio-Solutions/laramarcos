import Link from "next/link";
import { redirect } from "next/navigation";
import { UsuarioForm } from "@/components/UsuarioForm";
import { getMiRol } from "@/lib/repos/usuarios";
import { crearUsuarioAction } from "../actions";

export default async function NuevoUsuarioPage() {
  const rol = await getMiRol();
  if (rol !== "responsable" && rol !== "admin") redirect("/dashboard");

  return (
    <div className="space-y-6 p-8">
      <header>
        <Link href="/usuarios" className="text-sm text-fg-muted hover:underline">
          ← Usuarios
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-primary">Nuevo usuario</h1>
      </header>
      <UsuarioForm action={crearUsuarioAction} />
    </div>
  );
}
