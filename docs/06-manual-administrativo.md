# 6. Manual administrativo

Guia rápido para quem usa o painel. **Para entrar:** no site, toque em **Área da equipe** no topo da página (no celular é o ícone de pessoa ao lado de "Agendar"; também fica no menu ☰ e no rodapé) ou acesse direto o endereço do site seguido de `/entrar`. O menu do painel mostra só o que a sua função permite.

## Primeiros passos (proprietário)

1. **Unidades** → cadastre cada unidade com endereço, WhatsApp, horários de funcionamento, intervalo da agenda e prazo para cancelamento online. Ao criar, a conta "Caixa" já nasce com o saldo inicial informado.
2. **Serviços e preços** → crie as categorias (ex.: Cortes, Barba, Combos) e os serviços. Em cada serviço marque em quais unidades ele existe, com preço, duração e, se quiser, uma promoção com início e fim.
3. **Produtos e estoque** → cadastre preço de venda, custo e comissão padrão. Lance a entrada de estoque em cada unidade.
4. **Barbeiros** → cadastre foto, apresentação e especialidades; marque as unidades e o **modelo de remuneração** de cada vínculo; escolha os serviços que ele faz; defina a **escala** (dias, horário e intervalo) e, se quiser, crie o **acesso ao painel**.
5. **Remuneração → Regras** → informe os percentuais e valores (ver abaixo).
6. **Serviços do folder** → rode `npm run db:seed-servicos` (na pasta `backend`) para importar os 10 serviços do folder (Kone hindu, Sobrancelhas, Barboterapia, Camuflagem, Limpeza de pele, Hidratação, Selagem, Alinhamento capilar e as epilações) com descrição e imagem. Depois, em **Serviços e preços**, abra cada um, marque as unidades e informe preço e duração — sem preço o serviço não aparece no site.
7. **Mural de cortes** → publique trabalhos da equipe (ver abaixo).
8. **Planos mensais → Planos** → cadastre os planos de assinatura (ex.: Plano Corte, Plano Corte + Barba) com mensalidade, serviços e limite por mês (ver abaixo).
9. **Site e aparência** → marca, cores, textos, fotos, galeria e ordem das seções. Salve o rascunho, use **Pré-visualizar** e depois **Publicar**.
10. **Usuários** → crie gerentes e recepcionistas e escolha as unidades de cada um.

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

## Mural de cortes

O mural mostra no site os cortes feitos pela equipe. O cliente filtra por estilo (Degradê, Social, Barba…), vê o antes e depois e toca em **Quero este corte**: o agendamento abre com os serviços do corte já marcados, o barbeiro que fez já escolhido e a foto anexada como referência. Na agenda, o atendimento aparece marcado como "corte do mural" com a foto.

- **Publicar** (proprietário e gerente): Mural de cortes → Publicar corte. Envie de 1 a 4 fotos (com duas, a primeira é o "antes" e a segunda o "depois"), dê um nome, informe estilos, os serviços necessários, quem fez e em quais unidades aparece. "Destacar" coloca o corte no início.
- **Barbeiros** enviam os próprios cortes pelo painel; eles ficam **aguardando aprovação** até a gerência publicar. Se o barbeiro editar um corte publicado, ele volta para aprovação.
- **Ocultar** tira o corte do site sem apagar. Cada corte mostra quantos agendamentos já vieram dele.
- A seção aparece na página inicial e na página `/mural`; a posição é ajustada em Site e aparência → Seções.

## Planos mensais (assinaturas)

O cliente paga uma mensalidade e os serviços do plano saem **sem custo no atendimento**, até o limite do mês.

- **Cadastrar planos** (proprietário): Planos mensais → Planos → Novo plano. Informe nome, mensalidade, descrição (aparece no site) e marque os serviços incluídos com o limite por mês (deixe vazio para ilimitado). Escolha se o plano vale em todas as unidades ou em uma só, se é "mais escolhido" no site e se o barbeiro **comissiona sobre o preço de tabela** dos serviços cobertos (padrão) ou não recebe comissão nesses serviços. Alterar um plano vale para novas assinaturas; quem já assinou mantém preço e serviços contratados.
- **Assinar** (recepção, gerente, proprietário): Planos mensais → Assinantes → Nova assinatura. Escolha o cliente, o plano e, se ele já pagou, a forma e a conta. A mensalidade vence todo mês **no dia da contratação**.
- **Mensalidades**: a aba lista as em aberto e vencidas. **Receber** lança a entrada no caixa como "Mensalidade de plano". Use **Gerar mensalidades do mês** para criar as dos assinantes ativos (é seguro repetir: não duplica). Recebimento lançado por engano é estornado em Financeiro → Movimentações; a mensalidade volta a ficar em aberto.
- **No atendimento**: com o cliente identificado, os serviços do plano entram com valor R$ 0,00 e o selo do plano; o painel mostra o valor coberto. **Cobrar normalmente** tira o item do plano (ex.: o cliente prefere guardar o uso); **Usar plano** tenta aplicar de novo e explica quando não dá (limite do mês, plano de outra unidade, mensalidade atrasada).
- **Atraso**: até 5 dias depois do vencimento o plano continua valendo; depois disso, os serviços são cobrados normalmente até a mensalidade ser paga. O assinante aparece como "Bloqueada por atraso".
- **Pausar** interrompe a cobertura e as novas mensalidades; **Retomar** volta a cobrar a partir do mês atual. **Cancelar** pede motivo e cancela as mensalidades em aberto.
- **No site**: a seção "Planos mensais" mostra os planos ativos com o botão **Quero assinar**, que abre o WhatsApp da unidade com a mensagem pronta. Não há pagamento online: a assinatura é feita na barbearia. Se o seu site foi publicado antes desta versão, inclua a seção em Site e aparência → Seções.
- **Números**: Financeiro e Painel mostram mensalidades recebidas, assinantes ativos e mensalidades vencidas; os relatórios trazem também quantos serviços foram cobertos pelos planos e o valor de tabela correspondente.

## Avaliações

Só clientes com atendimento concluído conseguem avaliar, pelo link gerado na venda. As avaliações ficam pendentes até alguém da gestão publicar em **Avaliações**.

## LGPD

O cliente aceita a política de privacidade ao agendar pelo site. A pedido do titular, o proprietário pode **anonimizar** o cliente (Clientes → abrir → Anonimizar): nome, telefone e e-mail são removidos de forma definitiva e o histórico de vendas fica sem identificação.
