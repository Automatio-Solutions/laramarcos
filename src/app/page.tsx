import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// La raíz no muestra pantalla de bienvenida: manda directo al login (o al panel
// si ya hay sesión). El middleware no corre en "/", así que la sesión se comprueba aquí.
export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  redirect(user ? "/clientes" : "/login");
}
