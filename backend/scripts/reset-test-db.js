// Recria o banco de TESTE do zero aplicando, em ordem, os arquivos de prisma/migrations.
// Usado pelo globalSetup do Vitest. Recusa-se a rodar em bancos cujo nome não termine em "_test".
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function resetTestDatabase(url) {
  const dbName = new URL(url).pathname.slice(1);
  if (!dbName.endsWith('_test')) {
    throw new Error(`Por segurança, o reset só roda em bancos *_test (recebido: "${dbName}").`);
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
    const dir = path.join(root, 'prisma', 'migrations');
    const migrations = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    for (const m of migrations) {
      await client.query(fs.readFileSync(path.join(dir, m, 'migration.sql'), 'utf8'));
    }
    return migrations;
  } finally {
    await client.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { config } = await import('dotenv');
  config({ path: path.join(root, '.env.test') });
  const applied = await resetTestDatabase(process.env.DATABASE_URL);
  console.log('Migrações aplicadas no banco de teste:', applied.join(', '));
}
