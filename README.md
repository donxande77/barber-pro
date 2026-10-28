# Barber Pro

Plataforma de gestão para redes de barbearias com várias unidades: site público responsivo com agendamento online, painel por função (proprietário, gerente, recepcionista e barbeiro), remuneração mista, financeiro por unidade e consolidado, relatórios em PDF/Excel/CSV e personalização visual sem mexer no código.

**Stack:** React 19 · Vite · Tailwind 4 · React Router · React Hook Form · Zod · Recharts · Lucide (frontend) — Node.js 22 · Express 5 · Prisma 7 · PostgreSQL 16 · Zod · Argon2id · PDFKit · ExcelJS (backend) — Vitest · Supertest (testes).

## O que tem

- **Site público** (celular primeiro): banner, serviços e preços em tabela de barbearia, promoções, barbeiros, galeria, produtos, avaliações reais, unidades com mapa/horários/WhatsApp, política de cancelamento. O cliente escolhe a unidade antes de ver serviços e horários.
- **Agendamento online** em etapas (unidade → serviços → profissional ou "primeiro disponível" → dia e horário → dados com consentimento LGPD) e link para o cliente consultar/cancelar.
- **Agenda interna**: por dia e por barbeiro, novo agendamento, confirmação, remarcação, não comparecimento, cancelamento com motivo. Conflitos barrados pelo banco, inclusive com pedidos simultâneos.
- **Atendimentos e vendas**: abre a partir do agendamento, adiciona serviços/produtos com desconto, fecha (baixa estoque e calcula comissões), recebimentos parciais, estornos auditáveis, cancelamento.
- **Remuneração mista**: comissão por serviço/produto, fixo, aluguel de cadeira, combinações por modelo de vínculo, bônus e ajustes, vigência das regras, cópia da regra em cada venda, calculado × devido × pago × pendente, pagamentos aos profissionais.
- **Financeiro**: contas, saldos, receitas/despesas, contas a pagar e receber, transferências (sem dupla contagem no consolidado), fechamento de caixa com conciliação.
- **Dashboards** por função e **relatórios** individual, por unidade e consolidado (impressão A4, PDF, Excel, CSV).
- **Mural de cortes**: a equipe publica cortes com antes e depois; o cliente filtra por estilo e toca em "Quero este corte" para agendar com os serviços, o barbeiro e a foto de referência já preenchidos. Barbeiros enviam os próprios cortes para aprovação.
- **Serviços do folder** prontos para importar (Kone hindu, Sobrancelhas, Barboterapia, Camuflagem, Limpeza de pele, Hidratação, Selagem, Alinhamento capilar e epilações) com descrição e imagem: `npm run db:seed-servicos`.
- **Personalização**: marca, logotipo, cores, fontes, banner, textos, galeria, redes, ordem das seções — rascunho, pré-visualização, publicação e restauração de versões.
- **Segurança**: sessões HttpOnly, CSRF, bloqueio de tentativas, permissões por função e unidade no backend, auditoria. Detalhes em `docs/03-seguranca-e-lgpd.md`.

## Estrutura

```
barber-pro/
├─ backend/              API Express (ES Modules)
│  ├─ prisma/            schema.prisma, migrações, seed (produção) e seed-demo
│  ├─ scripts/           reset do banco de teste
│  └─ src/               config, db, routes, controllers, services, middlewares, validators, utils, tests
├─ frontend/             React + Vite + Tailwind (site público e painel)
├─ docs/                 requisitos, arquitetura, segurança/LGPD, API, situação, manual, implantação e backup
├─ scripts/              backup (PowerShell e shell)
├─ Dockerfile            imagem única (API + site)
├─ docker-compose.yml    PostgreSQL para desenvolvimento e testes
└─ docker-compose.prod.yml
```

## Rodar no Windows (desenvolvimento)

Pré-requisitos: Node.js 22 LTS, Git e Docker Desktop (ou PostgreSQL 16 instalado).

```powershell
# 1. Banco de dados
docker compose up -d

# 2. Backend
cd backend
npm install
Copy-Item .env.example .env          # ajuste a senha do banco e os dados SEED_*
Copy-Item .env.test.example .env.test
npx prisma migrate dev               # aplica as migrações
npm run db:seed                      # cria sua empresa e o primeiro proprietário (sem dados fictícios)
npm run db:seed-servicos             # importa os serviços do folder (depois defina preços no painel)
npm run dev                          # http://localhost:3333/api/health

# 3. Frontend (outro terminal)
cd frontend
npm install
npm run dev                          # http://localhost:5173
```

Entre em http://localhost:5173/entrar com o e-mail e a senha de `SEED_OWNER_*`.

**Quer ver com dados de exemplo?** `npm run db:seed-demo` cria uma empresa separada e claramente fictícia ("Barbearia Demonstração", login `dono@demo.barberpro` / `Demo2026senha`). Para o site mostrar essa empresa, coloque `PUBLIC_COMPANY_SLUG=barbearia-demonstracao` no `.env`. Não use em produção.

## Testes

```powershell
cd backend;  npm test      # 140 testes de API e regras de negócio (recria o banco *_test)
cd frontend; npm test      # 28 testes (validações, todas as telas e o fluxo do mural)
npm run lint               # em cada pasta
```

## Implantação, backup e uso

- Implantação (VPS com Docker, ou Render/Railway), atualização, rollback e backup/restauração: `docs/07-implantacao-e-backup.md`
- Manual do painel: `docs/06-manual-administrativo.md`
- API: `docs/04-api.md`
- Situação das fases, rastreabilidade e limitações conhecidas: `docs/05-roadmap-e-rastreabilidade.md`
