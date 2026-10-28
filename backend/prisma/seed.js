// Seed de implantação: cria a empresa, o primeiro proprietário e configurações-base.
// NÃO cria clientes, barbeiros, vendas ou qualquer dado fictício.
// Idempotente: pode ser executado mais de uma vez.
import 'dotenv/config';
import { z } from 'zod';
import { prisma } from '../src/db/prisma.js';
import { hashPassword } from '../src/utils/crypto.js';
import { password as passwordRule } from '../src/validators/common.js';
import { DEFAULT_SITE_CONFIG } from '../src/services/site-defaults.js';

const input = z
  .object({
    SEED_COMPANY_NAME: z.string().min(2),
    SEED_COMPANY_SLUG: z.string().regex(/^[a-z0-9-]+$/, 'Use letras minúsculas, números e hífen.'),
    SEED_OWNER_NAME: z.string().min(2),
    SEED_OWNER_EMAIL: z.email(),
    SEED_OWNER_PASSWORD: passwordRule,
  })
  .parse(process.env);

const DEFAULT_CATEGORIES = [
  ['INCOME', 'Serviços'],
  ['INCOME', 'Produtos'],
  ['INCOME', 'Aluguel de cadeira'],
  ['INCOME', 'Outras receitas'],
  ['EXPENSE', 'Aluguel do imóvel'],
  ['EXPENSE', 'Energia, água e internet'],
  ['EXPENSE', 'Compra de produtos'],
  ['EXPENSE', 'Materiais e insumos'],
  ['EXPENSE', 'Remuneração de profissionais'],
  ['EXPENSE', 'Impostos e taxas'],
  ['EXPENSE', 'Marketing'],
  ['EXPENSE', 'Manutenção'],
  ['EXPENSE', 'Outras despesas'],
];

async function main() {
  const company = await prisma.company.upsert({
    where: { slug: input.SEED_COMPANY_SLUG },
    update: {},
    create: { name: input.SEED_COMPANY_NAME, slug: input.SEED_COMPANY_SLUG },
  });

  const email = input.SEED_OWNER_EMAIL.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) {
    await prisma.user.create({
      data: {
        companyId: company.id,
        name: input.SEED_OWNER_NAME,
        email,
        passwordHash: await hashPassword(input.SEED_OWNER_PASSWORD),
        role: 'OWNER',
      },
    });
    console.log(`Proprietário criado: ${email}`);
  } else {
    console.log(`Proprietário já existe: ${email} (senha não alterada)`);
  }

  for (const [kind, name] of DEFAULT_CATEGORIES) {
    await prisma.financialCategory.upsert({
      where: { companyId_kind_name: { companyId: company.id, kind, name } },
      update: {},
      create: { companyId: company.id, kind, name },
    });
  }

  const hasConfig = await prisma.siteConfigVersion.count({ where: { companyId: company.id } });
  if (!hasConfig) {
    await prisma.siteConfigVersion.create({
      data: {
        companyId: company.id,
        version: 1,
        status: 'PUBLISHED',
        publishedAt: new Date(),
        note: 'Configuração inicial',
        data: { ...DEFAULT_SITE_CONFIG, brand: { ...DEFAULT_SITE_CONFIG.brand, name: company.name } },
      },
    });
  }
  console.log(`Empresa pronta: ${company.name} (${company.slug})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
