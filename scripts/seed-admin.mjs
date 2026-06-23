// Crea (o actualiza) un usuario responsable de prueba para poder entrar al panel.
// Uso: node scripts/seed-admin.mjs <email> <password> "<nombre>"
import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("✗ Faltan NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}

const [email, password, nombre] = [
  process.argv[2] ?? "admin@laramarcos.es",
  process.argv[3] ?? "laramarcos2026",
  process.argv[4] ?? "Responsable",
];

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

const { data, error } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});
if (error && !/already/i.test(error.message)) {
  console.error("✗ Error creando usuario:", error.message);
  process.exit(1);
}

// Resolver el id (recién creado o existente)
let userId = data?.user?.id;
if (!userId) {
  const { data: list } = await admin.auth.admin.listUsers();
  userId = list.users.find((u) => u.email === email)?.id;
}

const { error: upErr } = await admin
  .from("usuarios")
  .upsert({ id: userId, email, nombre, rol: "responsable", activo: true });
if (upErr) {
  console.error("✗ Error en tabla usuarios:", upErr.message);
  process.exit(1);
}

console.log(`✓ Usuario responsable listo: ${email} (id ${userId})`);
