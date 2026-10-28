import { env } from './config/env.js';
import { createApp } from './app.js';
import { prisma } from './db/prisma.js';

const app = createApp();
const server = app.listen(env.PORT, () => {
  console.log(`Barber Pro API ouvindo em http://localhost:${env.PORT} (${env.NODE_ENV})`);
});

async function shutdown(signal) {
  console.log(`${signal} recebido, encerrando…`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
