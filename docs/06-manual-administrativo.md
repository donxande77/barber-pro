# 6. Manual administrativo

Guia rápido para quem usa o painel (`/entrar`). O menu mostra só o que a sua função permite.

## Primeiros passos (proprietário)

1. **Unidades** → cadastre cada unidade com endereço, WhatsApp, horários de funcionamento, intervalo da agenda e prazo para cancelamento online. Ao criar, a conta "Caixa" já nasce com o saldo inicial informado.
2. **Serviços e preços** → crie as categorias (ex.: Cortes, Barba, Combos) e os serviços. Em cada serviço marque em quais unidades ele existe, com preço, duração e, se quiser, uma promoção com início e fim.
3. **Produtos e estoque** → cadastre preço de venda, custo e comissão padrão. Lance a entrada de estoque em cada unidade.
4. **Barbeiros** → cadastre foto, apresentação e especialidades; marque as unidades e o **modelo de remuneração** de cada vínculo; escolha os serviços que ele faz; defina a **escala** (dias, horário e intervalo) e, se quiser, crie o **acesso ao painel**.
5. **Remuneração → Regras** → informe os percentuais e valores (ver abaixo).
6. **Site e aparência** → marca, cores, textos, fotos, galeria e ordem das seções. Salve o rascunho, use **Pré-visualizar** e depois **Publicar**.
7. **Usuários** → crie gerentes e recepcionistas e escolha as unidades de cada um.

## Funções

| Função | Pode |
|---|---|
| Proprietário | Tudo, inclusive consolidado, regras de comissão, site, auditoria e transferências entre unidades |
| Gerente | Operação e financeiro das suas unidades, barbeiros, preços das suas unidades, pagamentos a profissionais, relatórios da unidade |
| Recepcionista | Agenda, clientes, atendimentos e recebimentos das suas unidades |
| Barbeiro | Própria agenda, próprios atendimentos e o próprio financeiro |

## Dia a dia na recepção

1. **Agenda** → escolha o dia. Clique no horário para confirmar presença, remarcar, marcar "não compareceu" ou cancelar (com motivo).
2. **Iniciar atendimento** abre a venda com os serviços e o preço combinados no agendamento. Adicione produtos ou outros serviços e, se houver, desconto por item.
3. **Fechar venda**: baixa o estoque e calcula as comissões com as regras válidas naquele momento. Fechar não é receber.
4. **Registrar recebimento**: escolha a forma (Pix, cartão, dinheiro…) e a conta. Pode ser parcial; o saldo a receber fica visível.
5. Envie ao cliente o **link de avaliação** que aparece na venda concluída.

Cliente que agenda pelo site recebe um link para consultar e cancelar até o prazo da unidade.

## Remuneração mista

**Modelos de vínculo** (no cadastro do barbeiro, por unidade):

| Modelo | Regras aceitas |
|---|---|
| Comissão | comissão em serviços e/ou produtos |
| Remuneração fixa | salário fixo |
| Fixo + comissão | fixo e comissões |
| Aluguel de cadeira | aluguel (o barbeiro paga à unidade) |
| Aluguel + comissão | aluguel e comissões — use quando as vendas do barbeiro passam pelo caixa da unidade e ele recebe a parte dele por comissão |

Combinações fora da tabela são recusadas: mude o modelo do vínculo primeiro.

**Regras** têm data de início. Para mudar um percentual, crie uma regra nova com a data a partir da qual vale: a anterior é encerrada automaticamente e as vendas antigas continuam com o valor antigo. A regra mais específica vence (serviço/produto + unidade > serviço/produto > unidade > geral). Sem regra do barbeiro, vale a comissão padrão do serviço ou produto.

**Fixos e aluguéis**: em Remuneração → Fixos e aluguéis, gere o mês. Pode repetir sem duplicar.

**Calculado × devido × pago × pendente**: toda comissão gerada é *calculada*; ela fica *devida* quando a venda está totalmente recebida; *pago* é o que já saiu para o barbeiro; *pendente* é o devido ainda não pago. Em **Pagamentos**, informe o valor: ele quita os lançamentos devidos do mais antigo para o mais novo e gera a saída no caixa. O recebimento do aluguel de cadeira é registrado no mesmo lugar.

## Financeiro

- **Resumo**: faturamento (vendas fechadas), recebimentos, outras receitas, despesas, resultado operacional, saldo disponível e obrigações.
- **Movimentações**: lance receitas, despesas e ajustes. Nada é apagado: para corrigir, use **Estornar** (fica registrado quem fez e o motivo).
- **Contas a pagar e receber**: cadastre com vencimento e dê baixa total ou parcial.
- **Transferências**: entre contas da mesma unidade (gerente) ou entre unidades (proprietário). Não contam como receita nem despesa e não duplicam o consolidado.
- **Fechamento de caixa**: informe o valor contado. O sistema mostra a diferença e pode lançar o ajuste de conciliação.
- **Consolidado** (proprietário): soma das unidades, comparativo e transferências internas eliminadas.

## Relatórios

Escolha o tipo (individual, unidade ou consolidado), o período e os filtros. A tela mostra o relatório em formato A4: use **Imprimir** ou exporte em **PDF**, **Excel** ou **CSV** (o CSV abre direto no Excel em português).

## Avaliações

Só clientes com atendimento concluído conseguem avaliar, pelo link gerado na venda. As avaliações ficam pendentes até alguém da gestão publicar em **Avaliações**.

## LGPD

O cliente aceita a política de privacidade ao agendar pelo site. A pedido do titular, o proprietário pode **anonimizar** o cliente (Clientes → abrir → Anonimizar): nome, telefone e e-mail são removidos de forma definitiva e o histórico de vendas fica sem identificação.
