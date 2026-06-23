// Aplica la(s) migración(es) de supabase/migrations/ contra la BBDD indicada en
// SUPABASE_DB_URL (.env.local). No requiere Docker ni psql — usa node-postgres.
//
// Uso: npm run db:apply
import { config } from 'dotenv';
config({ path: '.env.local' });
config(); // fallback a .env
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', 'supabase', 'migrations');

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error('✗ Falta SUPABASE_DB_URL en .env.local (connection string del proyecto Supabase).');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();

try {
  await client.connect();
  for (const f of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf8');
    process.stdout.write(`→ aplicando ${f} ... `);
    await client.query(sql);
    console.log('ok');
  }
  console.log(`\n✓ ${files.length} migración(es) aplicada(s) correctamente.`);
} catch (err) {
  console.error('\n✗ Error aplicando migración:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
