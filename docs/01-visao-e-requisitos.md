# 1. Visão e requisitos

## Visão (Product Owner)

**Problema.** Redes de barbearias com várias unidades costumam usar planilhas e aplicativos soltos para agenda, comissões e caixa. Isso gera agendamentos duplicados, comissões calculadas à mão, caixa que não fecha e nenhuma visão consolidada da empresa.

**Proposta.** Uma plataforma única: site público com agendamento, painel por função, remuneração mista calculada no servidor e financeiro por unidade com consolidado sem dupla contagem.

**Público.** Proprietário (visão geral), gerente (operação da unidade), recepcionista (agenda e caixa do dia), barbeiro (agenda e ganhos próprios) e cliente final (agendamento).

**Métricas de sucesso**

| Métrica | Meta |
|---|---|
| Agendamentos duplicados para o mesmo barbeiro | 0 (garantido pelo banco) |
| Diferença entre comissão calculada e conferência manual | R$ 0,00 |
| Tempo para o cliente concluir um agendamento | < 2 min |
| Fechamento de caixa diário | < 5 min por unidade |
| Acesso indevido entre unidades/empresas | 0 (testes automatizados) |

## Requisitos funcionais (resumo numerado)

| RF | Descrição | Fase |
|---|---|---|
| RF01 | Login, logout, sessão segura, troca de senha | 1 ✅ |
| RF02 | Perfis Proprietário, Gerente, Recepcionista, Barbeiro com permissões no backend | 1 ✅ |
| RF03 | Escopo por unidade (gerente/recepcionista só nas autorizadas; barbeiro pelos vínculos) | 1 ✅ |
| RF04 | Gestão de usuários da equipe | 1 ✅ |
| RF05 | Trilha de auditoria | 1 ✅ |
| RF06 | Cadastro de unidades, horários, contatos, políticas | 2 ✅ |
| RF07 | Site público alimentado pela API | 3 ✅ |
| RF08 | Personalização visual com rascunho, publicação e restauração de versões | 3 ✅ |
| RF09 | Clientes, barbeiros (vínculos, escalas, folgas), serviços, produtos, estoque | 4 ✅ |
| RF10 | Agendamento público e interno com prevenção de conflitos | 5 ✅ |
| RF11 | Atendimentos, vendas, pagamentos parciais e estornos | 6 ✅ |
| RF12 | Remuneração mista com vigência e snapshot das regras | 7 ✅ |
| RF13 | Financeiro individual do barbeiro (calculado, devido, pago, pendente) | 7 ✅ |
| RF14 | Caixa, contas, despesas, contas a pagar/receber, transferências, fechamento | 8 ✅ |
| RF15 | Consolidado sem duplicar transferências internas | 8 ✅ |
| RF16 | Dashboards por função com Recharts | 9 ✅ |
| RF17 | Relatórios A4, PDF, CSV e Excel | 9 ✅ |
| RF18 | Avaliações vinculadas a atendimentos concluídos | 6/9 ✅ |

## Requisitos não funcionais

| RNF | Descrição |
|---|---|
| RNF01 | JavaScript (ES Modules) no frontend e backend; sem Python |
| RNF02 | Dinheiro em `DECIMAL(12,2)` no banco e `decimal.js` no código |
| RNF03 | Datas em `timestamptz`; exibição no fuso da unidade |
| RNF04 | Senhas com Argon2id; sessão com cookie HttpOnly/SameSite; CSRF; rate limit; Helmet; CORS restrito |
| RNF05 | Responsivo (celular, tablet, desktop) e acessível (rótulos, foco visível, contraste) |
| RNF06 | Testes automatizados (Vitest + Supertest) contra banco de teste isolado |
| RNF07 | Migrações versionadas; nada de editar banco "na mão" em produção |
| RNF08 | Movimentações financeiras confirmadas são imutáveis (correção por estorno) |

## Regras de negócio principais

- **RN01** Um agendamento não é receita: receita só existe com pagamento confirmado.
- **RN02** Dois agendamentos ativos do mesmo barbeiro não podem se sobrepor (restrição `EXCLUDE` no PostgreSQL).
- **RN03** Itens de venda guardam cópia de preço, custo e regra de comissão do momento da venda.
- **RN04** Alterar uma comissão cria nova regra com vigência; períodos anteriores não são recalculados.
- **RN05** Combinações de remuneração só são aceitas se compatíveis com o modelo do vínculo (ex.: aluguel de cadeira + comissão exige o modelo `CHAIR_RENTAL_PLUS_COMMISSION`).
- **RN06** Transferências internas geram par OUT/IN ligado por `transferId` e são excluídas do consolidado.
- **RN07** Gerente não cria proprietários nem gerentes e só concede acesso às próprias unidades.
- **RN08** Avaliação pública só existe ligada a um atendimento concluído.

## Fora do escopo do MVP

Pagamento online (gateway), emissão de nota fiscal, app nativo, envio automático de WhatsApp/SMS (o site terá link para WhatsApp), programa de fidelidade.
