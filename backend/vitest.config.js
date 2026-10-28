import { defineConfig } from 'vitest/config';
import { config } from 'dotenv';

const testEnv = config({ path: '.env.test', processEnv: {} }).parsed ?? {};

export default defineConfig({
  test: {
    env: { ...testEnv, NODE_ENV: 'test' },
    globalSetup: ['./src/tests/helpers/global-setup.js'],
    include: ['src/tests/**/*.test.js'],
    // Um único banco de teste compartilhado: arquivos rodam em sequência.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
