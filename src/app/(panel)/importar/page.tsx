import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ImportarForm } from "@/components/ImportarForm";

/** La importación masiva de cartera es una acción de administración: solo staff. */
export default async function ImportarPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: me } = user ? await supabase.from("usuarios").select("rol").eq("id", user.id).maybeSingle() : { data: null };
  if (!me || (me.rol !== "responsable" && me.rol !== "admin")) redirect("/dashboard");

  return <ImportarForm />;
}
