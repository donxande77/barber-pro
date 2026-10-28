# Changelog

## [1.2.0] — 2026-10-28

### Adicionado
- Planos mensais (assinaturas): planos com mensalidade, serviços e limite por mês, válidos em todas as unidades ou em uma; assinaturas com cópia do plano na contratação; mensalidades com vencimento no dia da contratação, geração idempotente, recebimento, cancelamento e estorno pelo financeiro (a mensalidade volta a ficar em aberto).
- Cobertura automática no atendimento: serviços do plano saem por R$ 0,00 com o valor coberto registrado; limite mensal, plano de outra unidade e atraso acima de 5 dias são verificados; "Cobrar normalmente" e "Usar plano" por item; comissão sobre o preço de tabela (configurável por plano).
- Indicadores: mensalidades recebidas no financeiro, painel, consolidado e relatórios; assinantes ativos, mensalidades contratadas, vencidas e serviços cobertos.
- Site: seção "Planos mensais" com "Quero assinar" pelo WhatsApp da unidade; link "Planos" no menu.
- Painel: tela Planos mensais (Assinantes, Mensalidades, Planos) e planos na ficha do cliente.
- 23 testes novos (191 no total: 159 backend, 32 frontend).

### Alterado
- "Área da equipe" fica visível no topo do site em todos os tamanhos de tela (ícone no celular), além do menu e do rodapé.

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
