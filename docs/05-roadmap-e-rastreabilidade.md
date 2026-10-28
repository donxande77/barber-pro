# 5. Situação das fases e rastreabilidade

| Fase | Escopo | Situação |
|---|---|---|
| 1 | Estrutura, banco, autenticação e permissões | ✅ |
| 2 | Unidades e configurações globais | ✅ |
| 3 | Site público e personalização visual (rascunho, pré-visualização, publicação, versões) | ✅ |
| 4 | Clientes, barbeiros (vínculos, escalas, folgas, acesso), serviços, produtos e estoque | ✅ |
| 5 | Agenda pública e interna (disponibilidade, conflitos, remarcação, cancelamento pelo link) | ✅ |
| 6 | Atendimentos, vendas, pagamentos parciais, estornos e cancelamentos | ✅ |
| 7 | Remuneração mista e financeiro individual | ✅ |
| 8 | Caixa, despesas, contas, transferências, fechamento e consolidado | ✅ |
| 9 | Dashboards (Recharts), relatórios A4, PDF, Excel e CSV | ✅ |
| 10 | Testes, segurança, Docker, CI, backup e manuais | ✅ |

## Matriz requisito → teste

Testes em `backend/src/tests` (Vitest + Supertest contra PostgreSQL de teste isolado) e `frontend/src` (Vitest; telas renderizadas em jsdom com dados reais capturados da API).

| Requisito | Onde está testado |
|---|---|
| Login, sessão, CSRF, bloqueio, cabeçalhos | `integration/auth.test.js` |
| Permissões e isolamento de dados | `integration/authorization.test.js`, `sales-compensation.test.js` (isolamento do barbeiro), `finance-reports.test.js` (consolidado/escopo) |
| Conflitos de agenda (inclui pedidos simultâneos) | `integration/agenda.test.js`, `db-constraints.test.js` |
| Disponibilidade (expediente, intervalo, folga, outra unidade) | `integration/agenda.test.js` |
| Agendamento ≠ receita | `agenda.test.js`, `finance-reports.test.js` |
| Comissões e remuneração mista (vigência, especificidade, padrão, incompatibilidade, fixo, aluguel) | `integration/sales-compensation.test.js` |
| Pagamentos parciais | `sales-compensation.test.js`, `finance-reports.test.js` (contas a pagar) |
| Estornos (pagamento, movimentação, transferência) | `sales-compensation.test.js`, `finance-reports.test.js` |
| Prevenção de duplicidade (fechar 2×, pagamento idempotente, comissão por item, estorno único) | `sales-compensation.test.js`, `db-constraints.test.js` |
| Fechamento de caixa e conciliação | `finance-reports.test.js` |
| Transferências entre unidades e consolidação | `finance-reports.test.js` |
| Relatórios (JSON, CSV, Excel, PDF, injeção em CSV) | `finance-reports.test.js` |
| Persistência da personalização (rascunho, publicação, restauração, upload seguro) | `integration/site-public.test.js` |
| Cálculos monetários | `unit/money.test.js`, `db-constraints.test.js` |
| Avaliações reais com moderação | `site-public.test.js` |
| Estoque (entrada, inventário, transferência, insuficiente) | `site-public.test.js`, `sales-compensation.test.js` |
| LGPD (consentimento, anonimização) | `agenda.test.js`, `site-public.test.js` |
| Mural de cortes (aprovação, isolamento, referência no agendamento, preço estimado) | `integration/mural.test.js`, `smoke.test.jsx` (fluxo "Quero este corte") |
| Importação dos serviços do folder | `integration/mural.test.js` |
| Todas as telas abrem sem erro | `frontend/src/tests/smoke.test.jsx` |

## Limitações conhecidas

- As imagens dos serviços do folder foram recortadas de uma foto do folder impresso: servem para começar, mas vale trocar pelos arquivos originais em boa resolução (Serviços e preços → abrir o serviço → Trocar imagem).
- Imagens: o sistema não vem com fotos de banco de imagens. Até o proprietário enviar fotos (logotipo, banner, barbeiros, galeria), o site usa monogramas e a ilustração do poste de barbeiro.
- Envio automático de WhatsApp/SMS/e-mail não está incluído: os links (agendamento, avaliação) são copiados e enviados pela equipe; o site tem links diretos de WhatsApp.
- Pagamento online e emissão de nota fiscal estão fora do escopo.
- Fixo e aluguel mensais não são proporcionais a dias trabalhados: a regra vigente em qualquer dia do mês gera o valor do mês (semanal = por segunda-feira do mês). Ajustes podem ser lançados manualmente.
- O limite de tentativas usa memória do processo; para rodar várias instâncias, troque o armazenamento por Redis.
- A migração inicial foi gerada a partir do schema seguindo o padrão do Prisma, pois o ambiente de construção não acessava o servidor de binários do Prisma. A estrutura foi conferida contra o schema (diferença apenas na ordem de colunas). Na primeira execução local, `npx prisma migrate dev` confirma o estado e, se apontar diferença de formato, gera sozinho uma migração de ajuste.
