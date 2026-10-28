// Importa os serviços do folder (nome, descrição, categoria e imagem) para a sua empresa.
// Uso: npm run db:seed-servicos
// - Não cria preços: em "Serviços e preços", abra cada serviço, marque as unidades e informe preço e duração.
// - Pode rodar mais de uma vez: serviços com o mesmo nome não são duplicados.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from '../src/db/prisma.js';
import { env } from '../src/config/env.js';
import { FOLDER_CATEGORIES, FOLDER_SERVICES } from './servicos-folder.js';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Copia a imagem para a pasta de uploads e devolve a URL pública. */
export function installImage(file) {
  fs.mkdirSync(env.UPLOAD_DIR, { recursive: true });
  const name = `servico-${file}`;
  fs.copyFileSync(path.join(here, 'assets', 'servicos', file), path.join(env.UPLOAD_DIR, name));
  return `/uploads/${name}`;
}

export async function importFolderServices(companyId, { offers } = {}) {
  const categories = {};
  for (const c of FOLDER_CATEGORIES) {
    categories[c.name] = await prisma.serviceCategory.upsert({
      where: { companyId_name: { companyId, name: c.name } },
      update: {},
      create: { companyId, name: c.name, sortOrder: c.sortOrder },
    });
  }
  const created = [];
  for (const s of FOLDER_SERVICES) {
    const existing = await prisma.service.findFirst({ where: { companyId, name: { equals: s.name, mode: 'insensitive' } } });
    const imageUrl = installImage(s.image);
    if (existing) {
      await prisma.service.update({
        where: { id: existing.id },
        data: { imageUrl: existing.imageUrl ?? imageUrl, description: existing.description ?? s.description },
      });
      continue;
    }
    created.push(
      await prisma.service.create({
        data: {
          companyId,
          name: s.name,
          description: s.description,
          imageUrl,
          categoryId: categories[s.category].id,
          ...(offers ? { offers: { create: offers(s) } } : {}),
        },
      }),
    );
  }
  return created;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const company = process.env.SEED_COMPANY_SLUG
    ? await prisma.company.findUnique({ where: { slug: process.env.SEED_COMPANY_SLUG } })
    : await prisma.company.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!company) {
    console.error('Nenhuma empresa encontrada. Rode "npm run db:seed" antes.');
    process.exit(1);
  }
  const created = await importFolderServices(company.id);
  console.log(`${created.length} serviço(s) criado(s) em ${company.name}.`);
  console.log('Agora, no painel, abra cada serviço em "Serviços e preços" e informe as unidades, o preço e a duração.');
  console.log('Durações sugeridas:', FOLDER_SERVICES.map((s) => `${s.name} ${s.durationMin} min`).join(' · '));
  await prisma.$disconnect();
}
