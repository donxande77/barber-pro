# 7. Implantação e backup

## Opção A — servidor próprio (VPS) com Docker (recomendado)

Requisitos: um servidor Linux com Docker, um domínio apontando para ele e HTTPS na frente (Caddy é o mais simples).

```bash
git clone <seu-repositório> /opt/barber-pro && cd /opt/barber-pro
cp .env.prod.example .env.prod      # edite a senha do banco e o endereço do site
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

O container aplica as migrações (`prisma migrate deploy`) e sobe a API, que também serve o site. Crie a empresa e o primeiro proprietário:

```bash
docker compose -f docker-compose.prod.yml exec \
  -e SEED_COMPANY_NAME="Minha Barbearia" -e SEED_COMPANY_SLUG=minha-barbearia \
  -e SEED_OWNER_NAME="Seu nome" -e SEED_OWNER_EMAIL=voce@exemplo.com -e SEED_OWNER_PASSWORD='SenhaForte2026' \
  app node prisma/seed.js
```

HTTPS com Caddy (`/etc/caddy/Caddyfile`):

```
www.suabarbearia.com.br {
  reverse_proxy 127.0.0.1:3333
}
```

Em produção os cookies são `Secure` (só HTTPS). `TRUST_PROXY=1` faz a API enxergar o IP real do visitante para o limite de tentativas.

## Opção B — plataformas gerenciadas (Render, Railway, Fly.io)

1. Crie um PostgreSQL 16 gerenciado e copie a URL de conexão.
2. Crie um serviço a partir do `Dockerfile` da raiz do repositório.
3. Variáveis: `DATABASE_URL`, `CORS_ORIGINS` e `PUBLIC_SITE_URL` (o endereço público com https), `TRUST_PROXY=1`, `NODE_ENV=production`.
4. Monte um disco persistente em `/data/uploads` (imagens enviadas pelo painel).
5. Rode o seed do proprietário uma vez pelo console da plataforma (`node prisma/seed.js` com as variáveis `SEED_*`).

## Atualizar uma versão

```bash
git pull
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

As migrações novas são aplicadas na subida. **Faça backup antes de atualizar.**

**Voltar à versão anterior (rollback):** `git checkout <commit-anterior>` e suba de novo. Se a versão nova tiver migração de banco, restaure o backup feito antes da atualização.

## Backup

| Ambiente | Comando |
|---|---|
| Windows (desenvolvimento) | `.\scripts\backup.ps1` (Docker) ou `.\scripts\backup.ps1 -Local` (pg_dump instalado) |
| Servidor | `./scripts/backup.sh` — copia o banco e as imagens; agende no cron diariamente |

Recomendações: backup diário, cópia fora do servidor (outro provedor ou armazenamento em nuvem), retenção de 30 dias e **teste de restauração mensal**.

### Restaurar

```bash
# Servidor: pare a aplicação, restaure e suba de novo
docker compose -f docker-compose.prod.yml stop app
docker compose -f docker-compose.prod.yml exec -T db dropdb -U barber barberpro
docker compose -f docker-compose.prod.yml exec -T db createdb -U barber barberpro
docker compose -f docker-compose.prod.yml exec -T db pg_restore -U barber -d barberpro --no-owner < backups/barberpro_AAAA-MM-DD_HHMM.dump
docker compose -f docker-compose.prod.yml start app
```

```powershell
# Windows com pg_restore instalado
dropdb -U barber -h localhost barberpro; createdb -U barber -h localhost barberpro
pg_restore -U barber -h localhost -d barberpro --no-owner backups\barberpro_AAAA-MM-DD_HHMM.dump
```

O ciclo backup → restauração foi testado: contagens de vendas, movimentações e somas de pagamentos idênticas após restaurar.

## Monitoramento

- `GET /api/health` responde `{"status":"ok"}` quando API e banco estão no ar (usado pelo `HEALTHCHECK` do Docker).
- Erros internos são registrados no log do container (`docker compose logs app`), sem senhas ou tokens.
