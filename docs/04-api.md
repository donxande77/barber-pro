# 4. Documentação da API

Base: `/api`. JSON em UTF-8. Valores monetários trafegam como **string decimal** (`"50.00"`), nunca como número de ponto flutuante. Datas em ISO 8601 (UTC); filtros de período usam `from`/`to` no formato `AAAA-MM-DD` (dia local da unidade).

**Autenticação:** cookie `bp_session` (HttpOnly). **CSRF:** toda alteração (POST/PUT/PATCH/DELETE) com sessão exige o cabeçalho `X-CSRF-Token` recebido no login e em `/auth/me`. O corpo deve ser JSON.

**Erros** — sempre no formato:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Verifique os dados informados.", "fields": [{ "path": "email", "message": "E-mail inválido." }] } }
```

| Código | Quando |
|---|---|
| 400 | Validação (`VALIDATION_ERROR`) ou regra de negócio (mensagem explica o motivo) |
| 401 | Não logado / credenciais inválidas |
| 403 | Sem permissão, unidade fora do escopo, CSRF ou origem inválidos |
| 404 | Não existe **ou** pertence a outra empresa (não revelamos qual) |
| 409 | Duplicidade, horário já ocupado (`SCHEDULE_CONFLICT` / `SLOT_UNAVAILABLE`) |
| 413 / 415 | Corpo grande demais / não-JSON |
| 423 | Conta bloqueada temporariamente |
| 429 | Excesso de tentativas |

## Site público (sem login)

| Método | Rota | Descrição |
|---|---|---|
| GET | `/public/site` | Configuração visual publicada + unidades ativas (endereço, horários, contatos, política) |
| GET | `/public/units/:unitId/catalog` | Serviços (com promoção vigente), barbeiros, produtos e avaliações aprovadas da unidade |
| GET | `/public/availability?unitId&date&serviceIds=a,b&barberId?` | Horários livres (antecedência mínima de 30 min) |
| POST | `/public/appointments` | Agendar: `{ unitId, serviceIds[], barberId?, startsAt, client{ name, phone, email? }, notes?, consent: true }` → `{ manageToken, manageUrl, ... }` |
| GET | `/public/appointments/:token` | Consultar agendamento pelo link do cliente |
| POST | `/public/appointments/:token/cancel` | Cancelar (respeita o prazo da unidade) |
| GET / POST | `/public/reviews/:token` | Ver / enviar avaliação de um atendimento concluído (`{ rating 1–5, comment? }`) |

## Autenticação e usuários

| Método | Rota | Permissão | Descrição |
|---|---|---|---|
| POST | `/auth/login` | pública (rate limit) | `{ email, password }` |
| POST | `/auth/logout` | logado | Revoga a sessão |
| GET | `/auth/me` | logado | Usuário, empresa, unidades, permissões, token CSRF |
| POST | `/auth/change-password` | logado | `{ currentPassword, newPassword }` — encerra as outras sessões |
| GET/POST | `/users` | `users:read` / `users:manage` | Lista / cria (gerente só cria recepcionistas das suas unidades) |
| GET/PATCH | `/users/:id` | `users:read` / `users:manage` | Detalhe / altera nome, função, situação, unidades |
| GET | `/audit?entity&limit` | `audit:read` | Trilha de auditoria |

## Empresa, unidades e personalização

| Método | Rota | Permissão |
|---|---|---|
| GET / PATCH | `/company` | logado / `company:manage` |
| GET / POST | `/units` | `units:read` / `units:create` — POST cria horários e a conta "Caixa" com saldo inicial |
| GET / PATCH | `/units/:unitId` | `units:read` / `units:update` (gerente só nas suas) |
| GET | `/site/published`, `/site/versions`, `/site/versions/:id`, `/site/draft` | `site:manage` |
| PUT | `/site/draft` | `site:manage` — `{ data: SiteConfig, note? }` |
| DELETE | `/site/draft` | `site:manage` — descarta o rascunho |
| POST | `/site/publish` | `site:manage` — publica o rascunho; a versão anterior fica arquivada |
| POST | `/site/versions/:id/restore` | `site:manage` — copia a versão para um novo rascunho |
| POST | `/uploads` | `catalog:manage` — `{ dataBase64 }` PNG/JPG/WEBP até 5 MB → `{ url }` |

## Cadastros

| Método | Rota | Permissão |
|---|---|---|
| GET/POST | `/clients?search&page` | `clients:read` / `clients:manage` |
| GET/PATCH | `/clients/:id` | `clients:read` / `clients:manage` |
| POST | `/clients/:id/anonymize` | `company:manage` (LGPD) |
| GET/POST | `/barbers?unitId` | `appointments:manage` / `barbers:manage` |
| GET/PATCH | `/barbers/:id` | idem — `units[]` com `compensationModel`, `serviceIds[]` |
| PUT/DELETE | `/barbers/:id/login` | `barbers:manage` — cria/redefine ou desativa o acesso do barbeiro |
| PUT | `/barbers/:id/schedules/:unitId` | `barbers:manage` — `{ days: [{ weekday, startMin, endMin, breakStartMin?, breakEndMin? }] }` |
| POST / DELETE | `/barbers/:id/time-offs[/:timeOffId]` | `barbers:manage` |
| GET/POST/PATCH/DELETE | `/service-categories[/:id]` | logado / `company:manage` |
| GET/POST | `/services?unitId` | logado / `company:manage` |
| GET/PATCH | `/services/:id` | logado / `catalog:manage` (gerente: só ofertas das suas unidades) |
| GET/POST | `/products?unitId` | logado / `company:manage` |
| PATCH | `/products/:id` | `company:manage` |
| POST | `/products/:id/stock` | `stock:manage` — `{ unitId, type: IN|OUT|ADJUSTMENT, quantity, ... }` |
| POST | `/products/:id/stock-transfer` | `stock:manage` — `{ fromUnitId, toUnitId, quantity }` |
| GET | `/products/:id/movements?unitId` | `stock:manage` |

## Agenda

| Método | Rota | Permissão |
|---|---|---|
| GET | `/availability?unitId&date&serviceIds&barberId?` | `appointments:manage` |
| GET | `/appointments?unitId&from&to?&barberId?&status?` | `appointments:read` (barbeiro: só os próprios) |
| POST | `/appointments` | `appointments:manage` — `{ unitId, serviceIds, barberId?, startsAt, clientId \| client }` |
| GET | `/appointments/:id` | `appointments:read` |
| PATCH | `/appointments/:id/reschedule` | `appointments:manage` — `{ startsAt, barberId? }` |
| PATCH | `/appointments/:id/status` | `appointments:manage` — `{ status: CONFIRMED|CHECKED_IN|NO_SHOW|CANCELLED, reason? }` |

## Atendimentos, vendas e pagamentos

| Método | Rota | Descrição |
|---|---|---|
| GET | `/sales?unitId&from&to&status?&barberId?` | Lista com `paidAmount`, `balanceDue`, `paymentStatus` |
| POST | `/sales` | `{ unitId, appointmentId? , clientId?, items[]? }` — com agendamento, copia os serviços e o preço combinado |
| POST / PATCH / DELETE | `/sales/:id/items[/:itemId]` | Itens (só com a venda aberta) |
| POST | `/sales/:id/close` | Fecha: baixa estoque, calcula comissões (snapshot), conclui o agendamento |
| POST | `/sales/:id/payments` | `{ accountId, method, amount, idempotencyKey? }` — parcial permitido |
| POST | `/payments/:id/reverse` | `{ reason }` — estorno auditável (`finance:unit:manage`) |
| POST | `/sales/:id/cancel` | `{ reason }` — exige estorno prévio dos pagamentos |

Permissão: `sales:manage` (recepção, gerente, proprietário).

## Remuneração

| Método | Rota | Permissão |
|---|---|---|
| GET / POST | `/compensation/rules` | `payouts:manage` / `compensation:manage` |
| PATCH | `/compensation/rules/:id/end` | `compensation:manage` — `{ validTo }` |
| POST | `/compensation/periodic` | `payouts:manage` — `{ unitId, month: "AAAA-MM" }` gera fixos e aluguéis (idempotente) |
| GET / POST | `/compensation/obligations` | `payouts:manage` — bônus e ajustes manuais |
| POST | `/compensation/obligations/:id/cancel` | `payouts:manage` |
| GET / POST | `/compensation/payouts` | `payouts:manage` — pagamento ao barbeiro ou recebimento do aluguel |
| GET | `/compensation/statement?barberId&unitId&from&to` | `reports:barber` (barbeiro: só o próprio) |

## Financeiro, dashboards e relatórios

| Método | Rota | Permissão |
|---|---|---|
| GET / POST / PATCH | `/finance/accounts[/:id]` | `finance:unit:read` / `finance:unit:manage` |
| GET | `/finance/accounts/options?unitId` | `sales:manage` (contas para receber pagamentos) |
| GET / POST | `/finance/categories` | `finance:unit:read` / `company:manage` |
| GET / POST | `/finance/transactions` | `finance:unit:read` / `finance:unit:manage` — receita, despesa, ajuste |
| POST | `/finance/transactions/:id/reverse` | `finance:unit:manage` |
| GET / POST | `/finance/bills`, `POST /finance/bills/:id/pay`, `POST /finance/bills/:id/cancel` | contas a pagar e receber |
| GET / POST | `/finance/transfers`, `POST /finance/transfers/:id/reverse` | entre unidades: só proprietário |
| GET / POST | `/finance/closings` | fechamento e conciliação de caixa |
| GET | `/finance/summary?unitId&from&to&method?` | `finance:unit:read` |
| GET | `/finance/consolidated?from&to&method?` | `finance:consolidated:read` |
| GET | `/dashboard/owner`, `/dashboard/manager`, `/dashboard/barber` | por função |
| GET | `/reports/barber`, `/reports/unit`, `/reports/consolidated` + `&format=json|csv|xlsx|pdf` | `reports:*` |
| GET / PATCH | `/reviews`, `/reviews/:id` | `reviews:moderate` |

A matriz de permissões fica em `backend/src/services/permissions.js`.
