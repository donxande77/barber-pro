# Changelog

## [1.1.0] — 2026-10-28

### Adicionado
- Mural de cortes: publicações com 1 a 4 fotos (antes e depois), estilos, serviços, profissional e unidade; destaque; aprovação de envios dos barbeiros; seção na página inicial e página `/mural` com filtros.
- "Quero este corte": o agendamento abre com serviços, barbeiro e foto de referência; a referência fica gravada no agendamento e aparece na agenda; o painel mostra quantos agendamentos cada corte gerou.
- 10 serviços do folder com descrição e imagem (`npm run db:seed-servicos`), também incluídos na demonstração.
- 14 testes novos (168 no total).

## [1.0.0] — 2026-10-28

Plataforma completa (fases 1 a 10).

### Adicionado
- Unidades com endereço, contatos, horários, intervalo da agenda e prazo de cancelamento; conta "Caixa" criada com saldo inicial.
- Site público responsivo com seções configuráveis, preços em tabela de barbearia, promoções, barbeiros, galeria, produtos, avaliações reais, unidades e política de cancelamento.
- Personalização visual versionada: rascunho, pré-visualização, publicação e restauração; upload seguro de imagens.
- Clientes (busca, histórico, anonimização LGPD), barbeiros (vínculos com modelo de remuneração, escala, folgas, acesso ao painel), serviços com preço/duração/promoção por unidade, produtos e estoque com movimentações e transferências.
- Agenda pública e interna com cálculo de disponibilidade, proteção contra conflito no banco, remarcação, status e link de cancelamento para o cliente.
- Atendimentos e vendas com snapshot de preço/custo/regra, pagamentos parciais com idempotência, estornos e cancelamentos.
- Remuneração mista com vigência, regra mais específica, comissão padrão, modelos compatíveis, fixos e aluguéis mensais, bônus, ajustes e pagamentos; demonstrativo calculado/devido/pago/pendente.
- Financeiro: contas, lançamentos, contas a pagar/receber, transferências, fechamento e conciliação de caixa, resumo por unidade e consolidado sem transferências internas.
- Dashboards por função (Recharts) e relatórios individual, de unidade e consolidado em A4, PDF, Excel e CSV.
- Dockerfile, docker-compose de produção, CI, scripts de backup, seed de demonstração, manual administrativo e guia de implantação.
- 154 testes automatizados (129 backend, 25 frontend).

## [0.1.0] — 2026-10-28 — Fase 1
- Estrutura, modelo de dados, autenticação, sessões, CSRF, permissões por função e unidade, usuários e auditoria.
