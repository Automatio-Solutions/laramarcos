// Aplica migraciones de supabase/migrations/ contra SUPABASE_DB_URL, con tracking
// idempotente (tabla _migrations) — no re-aplica las ya ejecutadas.
// No requiere Docker ni psql. Uso: npm run db:apply
import { config } from "dotenv";
config({ path: ".env.local" });
config(); // fallback a .env
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "..", "supabase", "migrations");

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("✗ Falta SUPABASE_DB_URL en .env.local (connection string del proyecto Supabase).");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();

try {
  await client.connect();
  await client.query(
    `create table if not exists public._migrations (name text primary key, applied_at timestamptz default now())`,
  );

  // Baseline: si el esquema 0001 ya existe pero no está registrado, lo damos por aplicado.
  const applied = new Set(
    (await client.query(`select name from public._migrations`)).rows.map((r) => r.name),
  );
  if (!applied.has(files[0])) {
    const exists = await client.query(`select to_regclass('public.clientes') as t`);
    if (exists.rows[0].t) {
      await client.query(`insert into public._migrations(name) values ($1) on conflict do nothing`, [files[0]]);
      applied.add(files[0]);
      console.log(`↺ ${files[0]} ya aplicada (baseline) — registrada sin re-ejecutar.`);
    }
  }

  let count = 0;
  for (const f of files) {
    if (applied.has(f)) { console.log(`· ${f} (ya aplicada)`); continue; }
    const sql = readFileSync(join(MIGRATIONS_DIR, f), "utf8");
    process.stdout.write(`→ aplicando ${f} ... `);
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query(`insert into public._migrations(name) values ($1)`, [f]);
      await client.query("commit");
      console.log("ok");
      count++;
    } catch (e) {
      await client.query("rollback");
      throw e;
    }
  }
  console.log(`\n✓ ${count} migración(es) nueva(s) aplicada(s).`);
} catch (err) {
  console.error("\n✗ Error aplicando migración:", err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
