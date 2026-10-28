import { config } from 'dotenv';
import { resetTestDatabase } from '../../../scripts/reset-test-db.js';

export default async function setup() {
  const env = config({ path: '.env.test', processEnv: {} }).parsed;
  if (!env?.DATABASE_URL) throw new Error('Crie o arquivo backend/.env.test (veja .env.test.example).');
  await resetTestDatabase(env.DATABASE_URL);
}
