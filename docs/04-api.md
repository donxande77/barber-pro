# 4. API — Fase 1

Base: `/api`. Respostas em JSON. Erros sempre no formato:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Verifique os dados informados.", "fields": [{ "path": "email", "message": "E-mail inválido." }] } }
```

Métodos que alteram dados (POST/PATCH/PUT/DELETE) com sessão exigem o cabeçalho `X-CSRF-Token` (recebido no login e em `/auth/me`).

| Método | Rota | Permissão | Descrição |
|---|---|---|---|
| GET | `/health` | pública | Verifica API e banco |
| POST | `/auth/login` | pública (rate limit) | `{ email, password }` → define cookie e devolve `{ user, company, unitIds, permissions, csrfToken }` |
| POST | `/auth/logout` | logado | Revoga a sessão |
| GET | `/auth/me` | logado | Dados da sessão atual |
| POST | `/auth/change-password` | logado | `{ currentPassword, newPassword }`; encerra as outras sessões |
| GET | `/users?role=&unitId=` | `users:read` | Lista (gerente vê só recepcionistas das suas unidades) |
| POST | `/users` | `users:manage` | `{ name, email, password, role, unitIds }` |
| GET | `/users/:id` | `users:read` | Detalhe |
| PATCH | `/users/:id` | `users:manage` | `{ name?, role?, status?, unitIds? }` |
| GET | `/units` | `units:read` | Unidades no escopo do usuário |
| GET | `/units/:unitId` | `units:read` + escopo | Detalhe com horários |
| GET | `/audit?entity=&limit=` | `audit:read` | Trilha de auditoria da empresa |

## Códigos de status

| Código | Quando |
|---|---|
| 400 | Validação (`VALIDATION_ERROR`) ou regra de negócio |
| 401 | Não logado / credenciais inválidas |
| 403 | Sem permissão, unidade fora do escopo, CSRF inválido |
| 404 | Não existe **ou** pertence a outra empresa (não revelamos qual) |
| 409 | Duplicidade ou conflito de agenda |
| 415 | Corpo não-JSON |
| 423 | Conta bloqueada temporariamente |
| 429 | Excesso de tentativas |

A matriz completa de permissões está em `backend/src/services/permissions.js`.
