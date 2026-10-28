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

## Controles adicionais (todas as fases)

- **Agendamento público:** limite por IP, consentimento obrigatório, validação no servidor de horário, expediente e duração; o cliente é identificado só pelo telefone e nunca vê dados de outros clientes. Links do cliente usam tokens aleatórios de 192 bits.
- **Uploads:** só PNG, JPEG e WEBP, detectados pelos bytes (SVG recusado por poder conter scripts), até 5 MB, nome aleatório, servidos com `nosniff` e CSP restritiva.
- **Relatórios CSV:** células que começam com `= + - @` são neutralizadas (injeção de fórmulas em planilhas).
- **Concorrência:** restrição `EXCLUDE` na agenda, `SELECT … FOR UPDATE` ao fechar venda, receber, pagar profissional e fechar caixa; chave de idempotência nos pagamentos; índice único de comissão por item e de estorno por movimentação.
- **Dinheiro:** `DECIMAL` no banco, `decimal.js` no código, valores trafegam como texto.
- **Site em produção:** CSP própria para o frontend (scripts só da própria origem, fontes do Google Fonts).

## Achados da revisão final

| Severidade | Achado | Situação |
|---|---|---|
| Média | Limite de tentativas em memória não é compartilhado entre várias instâncias | Aceito para instância única; trocar por Redis ao escalar |
| Baixa | Proteção CSRF do login e do agendamento público depende de Origin + SameSite + JSON (não há sessão antes) | Aceito — padrão recomendado |
| Baixa | Sem autenticação em dois fatores | Backlog (recomendado para o proprietário) |
| Baixa | Dependência `uuid` antiga dentro do `exceljs` (alerta moderado) | Corrigido com `overrides` para `uuid@11`; `npm audit` sem alertas |

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
