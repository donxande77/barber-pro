# 3. Segurança e LGPD

## Modelagem de ameaças (STRIDE)

| Ameaça | Exemplo | Mitigação implementada | Status |
|---|---|---|---|
| **S**poofing | Roubo de sessão, força bruta | Argon2id (m=19 MiB, t=2); cookie HttpOnly/SameSite; bloqueio após 5 erros (15 min); rate limit por IP+e-mail; mesma mensagem para e-mail inexistente/senha errada com tempo igualado | ✅ Fase 1 |
| **T**ampering | Alterar valores de comissão pelo navegador | Cálculos só no backend (Fase 7); validação Zod; CHECKs no banco; snapshot das regras | ✅ base / Fase 7 |
| **R**epudiation | "Não fui eu que estornei" | `AuditLog` com usuário, IP, antes/depois (sem senhas/tokens) | ✅ Fase 1 |
| **I**nformation disclosure | Gerente vendo outra unidade; barbeiro vendo comissão alheia | Permissões no backend + escopo de unidade por requisição; 404 para recursos de outra empresa; erros sem stack | ✅ Fase 1 (testado) |
| **D**enial of service | Inundar o login ou payloads gigantes | Rate limit; limite de 200 kB no JSON; senha máx. 128 caracteres | ✅ Fase 1 |
| **E**levation of privilege | Gerente criando proprietário | `MANAGEABLE_ROLES`; ninguém altera a própria função; testes de escalada | ✅ Fase 1 (testado) |

## Achados da revisão — Fase 1

| Severidade | Achado | Situação |
|---|---|---|
| Média | Rate limit em memória não é compartilhado entre múltiplas instâncias | Aceito para instância única; para escalar, trocar o store por Redis (Fase 10) |
| Baixa | Proteção CSRF do login depende de Origin + SameSite + JSON (não há sessão antes do login) | Aceito — padrão recomendado |
| Baixa | Sem MFA | Backlog (opcional para proprietário) |

Nenhum achado Crítico ou Alto em aberto.

## LGPD

| Item | Decisão |
|---|---|
| Dados pessoais tratados | Equipe (nome, e-mail), clientes (nome, telefone, e-mail opcional, data de nascimento opcional) |
| Base legal | Execução de contrato (agendamento/atendimento); consentimento para marketing |
| Minimização | Telefone e nome obrigatórios; demais campos opcionais |
| Registro de aceite | `Client.consentAt` (preenchido no agendamento público — Fase 5) |
| Direito de eliminação | `Client.anonymizedAt`: anonimiza dados pessoais mantendo registros financeiros obrigatórios (Fase 4) |
| Classificação | Financeiro e dados de clientes = **confidencial**; senhas/tokens = **secreto** (nunca expostos nem logados) |
| Retenção | Auditoria e movimentações financeiras: mínimo de 5 anos (validar com contador) |

> Recomenda-se validar a política de privacidade e os prazos de retenção com um profissional jurídico/contábil.
