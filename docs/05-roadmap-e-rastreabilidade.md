# 5. Roadmap e rastreabilidade

| Fase | Escopo | Status |
|---|---|---|
| 1 | Estrutura, banco completo, autenticação e permissões | ✅ Concluída — 65 testes passando |
| 2 | Unidades (CRUD, horários, contatos, políticas), contas financeiras iniciais, configurações globais | Próxima |
| 3 | Site público + personalização visual (rascunho, publicação, versões) | Pendente |
| 4 | Clientes, barbeiros (vínculos, escalas, folgas), serviços, produtos e estoque | Pendente |
| 5 | Agenda pública e interna (disponibilidade, conflitos, remarcação) | Pendente |
| 6 | Atendimentos, vendas, pagamentos parciais e estornos | Pendente |
| 7 | Remuneração mista e financeiro individual | Pendente |
| 8 | Caixa, despesas, contas, transferências, fechamento e consolidado | Pendente |
| 9 | Dashboards, relatórios A4, PDF, CSV e Excel | Pendente |
| 10 | Endurecimento de segurança, implantação, backup e manuais | Pendente |

## Matriz requisito → teste (Fase 1)

| Requisito | Testes |
|---|---|
| RF01 Login/sessão | `integration/auth.test.js` → login, sessão, CSRF e origem |
| RF02 Perfis | `unit/permissions.test.js`; `integration/authorization.test.js` → gestão de usuários |
| RF03 Escopo por unidade | `integration/authorization.test.js` → escopo de unidades |
| RF04 Usuários | `integration/authorization.test.js` → gestão de usuários |
| RF05 Auditoria | `auth.test.js` (bloqueio auditado); `authorization.test.js` → auditoria |
| RN02 Conflito de agenda | `integration/db-constraints.test.js` → agenda (inclui 8 requisições simultâneas) |
| RNF02 Dinheiro | `unit/money.test.js`; `db-constraints.test.js` → DECIMAL exato |
| RNF08 Imutabilidade | `db-constraints.test.js` → um estorno por movimentação |
