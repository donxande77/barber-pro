# Barber Pro

Plataforma de gestão para redes de barbearias: site público com agendamento, painel por função, remuneração mista, financeiro por unidade e consolidado, relatórios e personalização visual.

**Stack:** React 19 + Vite + Tailwind 4 + React Router + React Hook Form + Zod + Recharts (frontend) · Node.js 22 + Express 5 + Prisma 7 + PostgreSQL 16 + Zod (backend) · Vitest + Supertest (testes).

> **Status:** Fase 1 de 10 concluída (estrutura, banco completo, autenticação e permissões). Veja `docs/05-roadmap-e-rastreabilidade.md`.

## Estrutura

```
barber-pro/
├─ backend/            API Express (ES Modules)
│  ├─ prisma/          schema.prisma, migrações e seed
│  ├─ scripts/         utilitários (reset do banco de teste)
│  └─ src/             config, db, routes, controllers, services, middlewares, validators, utils, tests
├─ frontend/           React + Vite + Tailwind
├─ docs/               visão, arquitetura, segurança/LGPD, API, roadmap
├─ docker/             script de criação do banco de teste
└─ docker-compose.yml  PostgreSQL local
```

## Pré-requisitos (Windows)

- Node.js 22 LTS (`node -v` deve mostrar v22.12 ou maior)
- PostgreSQL 16 — via Docker Desktop (recomendado) **ou** instalador oficial
- Git

## Instalação — passo a passo (PowerShell)

1. **Banco de dados (Docker):**
   ```powershell
   docker compose up -d
   ```
   Sem Docker: crie no PostgreSQL o usuário `barber` e os bancos `barberpro` e `barberpro_test` (dono `barber`).

2. **Backend:**
   ```powershell
   cd backend
   npm install
   Copy-Item .env.example .env
   Copy-Item .env.test.example .env.test
   ```
   Edite `.env` e `.env.test` (senha do banco e dados do primeiro proprietário em `SEED_*`).

3. **Migrações e seed:**
   ```powershell
   npx prisma migrate dev
   npm run db:seed
   ```
   O seed cria apenas a empresa, o proprietário e categorias financeiras padrão — nenhum dado fictício.

4. **Testes do backend:**
   ```powershell
   npm test
   ```
   Os testes recriam o banco `barberpro_test` do zero (o nome precisa terminar em `_test`).

5. **Rodar a API:** `npm run dev` → http://localhost:3333/api/health

6. **Frontend** (outro terminal):
   ```powershell
   cd frontend
   npm install
   npm run dev
   ```
   Acesse http://localhost:5173/entrar e entre com o e-mail e senha definidos em `SEED_OWNER_*`.

## Scripts úteis (backend)

| Comando | O que faz |
|---|---|
| `npm run dev` | API com recarga automática |
| `npm test` | Testes (Vitest + Supertest) |
| `npm run db:migrate` | Cria/aplica migrações em desenvolvimento |
| `npm run db:deploy` | Aplica migrações em produção |
| `npm run db:seed` | Cria empresa e proprietário iniciais |

## Documentação

- `docs/01-visao-e-requisitos.md`
- `docs/02-arquitetura.md` (inclui ADRs)
- `docs/03-seguranca-e-lgpd.md`
- `docs/04-api.md`
- `docs/05-roadmap-e-rastreabilidade.md`

Manual administrativo, procedimentos de backup e instruções de implantação entram na Fase 10.
