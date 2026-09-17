# Módulo: Editais

> **Contrato do módulo.** Este arquivo deve bastar para implementar ou refatorar o módulo Editais sem reler o codebase. Se faltou algo, o defeito é deste doc — corrija-o junto com o código. Ver [`../../00-indice.md`](../../00-indice.md).

## Identidade

| | |
|---|---|
| **`id`** em `src/lib/modulos.ts` | `editais` |
| **Nome na UI** | Editais |
| **Papéis com acesso** | `superadmin`, `admin` — **não** coordenador |
| **Rota de entrada** | `/editais` (fixa, sem variação por papel) |
| **`prefixosRota`** | `['/editais']` |
| **`navLinks`** | um só: Editais → `/editais` (`showFor: ['admin','superadmin']`) |
| **Ícone** | `ScrollText` (lucide) |

Módulo criado em 2026-07-24 pelo tema "Editais como entidade" ([`../../../analises/concluidos/roadmap-editais.yaml`](../../../analises/concluidos/roadmap-editais.yaml)). Nasceu como link no header de *Aplicação de Provas* e **virou módulo próprio no mesmo tema**, por ajuste pedido no smoke — o card fica no hub, ao lado de Aplicação de Provas.

## O que o módulo é

O **edital** é o concurso: o documento sob o qual uma ou mais provas são aplicadas. Antes de 2026-07-24 ele não era entidade — era `provas.prova_edital`, um `CHAR(30)` de texto livre digitado a cada prova.

O **edital** é o **documento normativo do certame**, montado por capítulos dentro do sistema — e é também o registro sob o qual as provas são criadas.

> 🔵 **MUDOU em 2026-09-16, com a fatia 1 da v3.** Este parágrafo dizia: *"o edital é um MODELO, não uma fonte de verdade operacional. Ele carrega os valores que sugerem como uma prova nasce."* Era verdade enquanto o edital tinha 5 campos e servia só para sugerir o cabeçalho de uma prova. **Deixou de ser a descrição completa:** ele agora carrega metadados do certame e a estrutura do documento (`edital_capitulos`), e o alvo da v3 é gerar o edital publicável. Ver [`../../../analises/roadmap-editais-espinha-do-documento.yaml`](../../../analises/roadmap-editais-espinha-do-documento.yaml) e o índice das 12 fatias em [`../../../modulo_editais/00-Plano-v3.md`](../../../modulo_editais/00-Plano-v3.md).
>
> 🔴 **O que NÃO mudou, e não pode mudar:** a relação edital → prova continua sendo **sugestão, não fonte ao vivo**. Depois de criada, a prova é dona dos seus valores e o edital não a alcança mais. Quem "melhorar" isso fazendo a prova ler o edital ao vivo vai reescrever cabeçalhos de PDF de provas passadas retroativamente — ver a fronteira no fim deste arquivo, que segue valendo inteira.

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/pages/Editais.tsx` (~150 l.) | A página. **Não guarda a si mesma** desde 2026-07-26 — o papel é declarado na rota (`RequireAcesso papeis={["admin"]}`). Grid de `Card`s, um por edital, com ações editar/excluir e `AlertDialog` de confirmação de exclusão |
| `src/components/EditalDialog.tsx` (~180 l.) | Form de criação/edição (react-hook-form + Zod). Serve aos dois modos, distinguidos por `edital` ser passado ou não |
| `src/hooks/useEditais.tsx` (144 l.) | React Query: `editais`, `create`, `update`, `delete` + os `isXxx` de pending. Interfaces `Edital`, `EditalInsert`, `EditalUpdate` |
| `supabase/migrations/20260724170000_create_editais_and_prova_edital_fk.sql` | O schema original — tabela, índice único, RLS, trigger, e a FK em `provas` |
| `supabase/migrations/20260916173801_editais_metadados_e_capitulos.sql` | 🔵 **v3 fatia 1** — os metadados do certame em `editais` e a tabela `edital_capitulos` |
| `src/pages/EditalStudio.tsx` | 🔵 **v3** — a tela de autoria, rota `/editais/:editalId`, três painéis |
| `src/hooks/useEdital.tsx` | 🔵 **v3** — um edital + seus capítulos; grava capítulo por **upsert** |
| `src/lib/edital-capitulos.ts` | 🔵 **v3** — o catálogo canônico: 19 elementos, dos quais **17 numerados** |
| `src/lib/edital-numeracao.ts` | 🔵 **v3** — função pura: numeração de CAPÍTULO e referência por `chave` |
| `src/lib/edital-itens.ts` | 🔵 **v3** — função pura: numeração de ITEM e referência por âncora |
| `src/lib/edital-cotas.ts` | 🔵 **v3 fatia 2** — função pura: a reserva de PCD e cotas raciais |
| `src/lib/edital-cronograma.ts` | 🔵 **v3 fatia 3** — função pura: etapas, precedência e fim de semana |
| `src/lib/edital-acoes-afirmativas.ts` | 🔵 **v3 fatia 4** — função pura: a data de corte DERIVADA |
| `src/lib/edital-prova.ts` | 🔵 **v3 fatia 5** — função pura: soma das questões e nota de corte |
| `src/hooks/useProvaObjetiva.tsx` · `src/components/MatrizDaProva.tsx` | 🔵 **v3 fatia 5** |
| `supabase/migrations/20260916194709_editais_prova_objetiva.sql` | 🔵 **v3 fatia 5** — matriz, disciplinas e vista |
| `src/hooks/useAcoesAfirmativas.tsx` · `src/components/AcoesAfirmativas.tsx` | 🔵 **v3 fatia 4** |
| `supabase/migrations/20260916193309_editais_acoes_afirmativas.sql` | 🔵 **v3 fatia 4** — PCD, cotas e lactantes |
| `src/hooks/useCronograma.tsx` · `src/components/CronogramaEtapas.tsx` | 🔵 **v3 fatia 3** |
| `supabase/migrations/20260916191028_editais_cronograma_etapas.sql` | 🔵 **v3 fatia 3** — `cronograma_etapas` |
| `src/hooks/useEditalCargos.tsx` | 🔵 **v3 fatia 2** — o Quadro I; escreve em `edital_cargos` |
| `src/components/QuadroDeCargos.tsx` | 🔵 **v3 fatia 2** — o primeiro capítulo com parâmetro estruturado |
| `supabase/migrations/20260916184254_editais_cargos_vagas_e_cg001_por_nome.sql` | 🔵 **v3 fatia 2** — `edital_cargos`, as colunas de `cargos`, e a CG001 estreitada |
| `src/lib/edital-linter.ts` | 🔵 **v3** — função pura: as regras determinísticas, sem LLM |

Não há Edge Function nem view neste módulo: é CRUD direto via PostgREST, contido pela RLS. 🔵 **Nem RPC** — e isso foi decidido na implementação, contra o que o roadmap previa: ver "A linha de capítulo é um override" abaixo.

## 🔴 O documento: capítulos e numeração calculada (v3, 2026-09-16)

**O número de um capítulo NUNCA é guardado.** Capítulo condicional que não entra não ocupa número, e todos abaixo sobem. Medido nos três editais reais da FEVRE:

| | capítulos | territorialidade | títulos | PCD cai em |
|---|---|---|---|---|
| Edital 002/2026 | 16 | não | sim | **7** |
| Edital 003/2026 | 15 | não | não | **7** |
| Edital 004/2026 | 16 | **sim** | não | **8** |

O mesmo capítulo em três posições. O catálogo tem **19 elementos — 17 numerados** mais o preâmbulo e os anexos, que entram no documento e não recebem número (⚠️ contá-los daria 19, e ignorá-los daria 18: os dois erros já foram cometidos no planejamento).

O Edital 002 publicado carrega o resíduo de numerar à mão: uma linha solta **`"10. e seus subitens"`** dentro do capítulo 7. Por isso **referência cruzada aponta para a `chave`** (`{{cap:vagas_pcd}}`), e o número é resolvido na renderização. Referência que não resolve vira marcador visível `[?chave]` — nunca some, nunca inventa número.

**O catálogo vive em CÓDIGO**, não no banco: versionado, revisável em diff, testável como dado puro.

### 🔴 O ITEM também é numerado pelo sistema — e é ele que as referências usam

**Medido nos três editais reais em 2026-09-16, e o resultado inverteu a prioridade:**

| | referências a item/subitem | referências a capítulo |
|---|---|---|
| Edital 002/2026 | 32 | **0** |
| Edital 003/2026 | 29 | **0** |
| Edital 004/2026 | 34 | **0** |

**95 referências cruzadas, nenhuma para capítulo.** Todas para item (*"nos termos do subitem 10.13"*). E o resíduo que originou o módulo — `"10. e seus subitens"` no Edital 002 — é uma referência **de item**. Numerar só o capítulo resolveria o caso que não acontece.

Volume: ~270 a 330 itens por edital, em até 3 níveis, mais alíneas em letra.

🔵 **MUDOU em 2026-09-16 (migration `20260916225307`).** Este trecho dizia: *"o capítulo continua sendo **um campo de texto**, escrito como lista… sem tabela nova, sem editor de árvore"*. **Cada artigo virou um registro em `edital_itens`**, com input próprio na tela. A medição acima **continua valendo** — é ela que justifica numerar item — e a numeração continua calculada. Mudou só **onde o artigo mora**, e com isso três coisas que o texto corrido não permitia:

| | |
|---|---|
| **O banco garante** | âncora única por edital (`edital_itens_ancora_key`), em vez de uma regra de linter que valia só para quem passasse pela tela |
| **O linter aponta o ARTIGO** | *"o item 12.4 tem data não preenchida"*, e não *"o capítulo Do Cronograma tem…"* — que é exatamente onde o defeito do Edital 004 está |
| **A tabela cabe no documento** | um artigo `tipo = 'quadro'` aponta para o dado estruturado que renderiza ali (ver a seção própria abaixo) |

**Como se escreve.** Um input por artigo; quem redige **não digita número**. Os botões `↑ ↓ → ←` movem e aninham. Num capítulo 7 a lista vira `7.1`, `7.2`, `7.2.1`, alínea `a)`, `7.3`. **Inserir artigo no meio renumera tudo abaixo sozinho** — e a referência `{{item:laudo}}` acompanha, porque aponta para a âncora, não para o número.

Três tipos de artigo, e os três existem nos editais reais:

| `tipo` | | numerado? |
|---|---|---|
| `item` | o artigo comum | ✅ |
| `prosa` | parágrafo sem número — o Edital 002 tem um entre o 6.6 e o 6.7 | ❌ |
| `quadro` | a tabela gerada; `texto` é só a legenda | ✅ (o Quadro I é o item **2.1** no Edital 002) |

⚠️ **Só `**negrito**` é formatação.** Medido: 265 marcadores no Edital 004 e **nenhum outro recurso** nos três. `src/lib/edital-texto.ts` devolve **segmentos**, não HTML — assim o React escapa tudo e não há sanitização para alguém esquecer.

⚠️ **Colar vários artigos de uma vez** existe porque um edital real tem de 270 a 330 artigos. O parser de sempre (`parsearCapitulo`) deixou de numerar e virou só essa porta de entrada — a numeração passou a ter um dono só, `numerarItens`.

⚠️ **A indentação da colagem é tolerante** (3 espaços contam como 1 nível), de propósito: perder um artigo por um espaço a mais seria pior que o nível errado, que a lista mostra na hora.

**As duas resoluções de referência convivem:** `{{cap:chave}}` para capítulo e `{{item:ancora}}` para artigo. As duas viram marcador visível (`[?…]`) quando não resolvem — nunca somem, nunca inventam número. Ver `src/lib/edital-itens.ts`.

### 🔴 Nenhuma tabela se digita — e isso foi medido

Levantadas **todas** as tabelas dos três editais de referência em 2026-09-16:

| Tabela | Onde | Dono estruturado |
|---|---|---|
| **Quadro I** — cargos, vagas, habilitação, CH, vencimento | 002, 003, 004 | `edital_cargos` (fatia 2) |
| **Quadro II** de provas — composição da prova | 002, 004 | `provas_disciplinas` (fatia 5) |
| **Quadros III/IV** — títulos por cargo | 002 | `titulos_itens` (fatia 6) |
| **Quadro II** — vagas de ACS por UBSF | 004 | `edital_cargo_unidades` (fatia 7) |
| **Anexo I do 004** — 843 logradouros por unidade | 004 | `territorialidade_abrangencia` (fatia 7) |
| Cronograma | os três | `cronograma_etapas` (fatia 3) |
| Conteúdo programático (Anexo I no 002/003, **Anexo II no 004**) | os três | fatia 10 |

**Nenhuma é de forma livre.** Por isso o artigo `tipo = 'quadro'` só **aponta** (`quadro_fonte`), e a CHECK `chk_edital_item_quadro_fonte` fecha o domínio no banco. Uma grade digitável reintroduziria a classe de defeito que o módulo existe para matar: a *"Certidão Nada Consta do COREN"* exigida de Agente Comunitário de Saúde no Edital 004 é copia-e-cola de tabela.

🔵 **Desde 17/09 as CINCO fontes têm capítulo que as parametriza** — não há mais fonte pendente, e o campo `pronto` de `QUADRO_FONTES` saiu por ter virado constante `true`. ⚠️ **Tabela nova continua exigindo fatia nova:** acrescentar um valor ao domínio de `chk_edital_item_quadro_fonte` sem renderizá-lo faz o artigo cair no ramo "fonte desconhecida", que **diz isso na cara** em vez de devolver espaço em branco.

⚠️ **E eu tinha trocado os anexos nesta tabela, até 17/09.** Ela dizia *"Anexo II — 963 linhas de ruas"* e *"Anexo I — conteúdo programático"*. No Edital 004 é o **inverso** do 002 e do 003: Anexo I são as áreas de abrangência, Anexo II é o conteúdo programático. E são **843** logradouros, não 963. Foi essa inversão entre editais que produziu o engano — conferir o anexo pelo número, sem abrir, não vale.

### 🔵 O Quadro I, e a regra de cotas que foi MEDIDA (fatia 2, 2026-09-16)

O capítulo `quadro_de_cargos` é o **primeiro com parâmetro estruturado**: em vez de texto livre, um formulário — e é o padrão que as fatias seguintes repetem.

**A regra das cotas não foi estimada.** Contei as vagas declaradas nos Editais 002 e 003 — 11 cargos, 22 valores — e ela saiu do dado:

```
total = AC + PD + CN          (a base é o TOTAL, não o AC)
PD    = arredonda(total × 0,10)     arredondamento COMUM, meio para cima
CN    = arredonda(total × 0,20)     sem piso de 1 vaga
AC    = total − PD − CN
```

Cada grupo de dados descarta uma hipótese: **não é teto** (Arte tem 1 vaga e declara zero PCD), **não é piso** (Ed. Física tem 8 e declara 1), **é meio-para-cima e não meio-para-o-par** (Docente II: 0,5 → 1), e **a base é o total** (Matemática declara 2, que é 10% de 17 e não de 12).

🔴 **Na tela, quem preenche digita o TOTAL** e o sistema propõe as três colunas. Inverter daria 11 de PCD onde o Edital 003 publica 16.

🔵 **Os 10% e 20% são PADRÃO, não constante da regra (corrigido em 2026-09-16).** Até então `sugerirCotas` usava os dois fixos, enquanto o `percentual_reserva` declarado nos capítulos [8] e [9] era gravado, exibido e **nunca lido pelo cálculo**. Um edital podia declarar 15% no texto e publicar o Quadro I com números de 10% — divergência silenciosa dentro do mesmo documento, que é a classe de defeito deste módulo. Hoje o capítulo manda no cálculo, e os valores fixos só valem enquanto nada foi declarado.

⚠️ **E a direção importa: o percentual é a ENTRADA, o número absoluto é a SAÍDA.** Não dá para recuperar um do outro — com 10% declarado, os editais reais produzem 10,32% (Téc. Enfermagem), 12,50% (Ed. Física), 11,76% (Matemática) e 0% (Geografia), porque o arredondamento destrói a informação. Quem propuser derivar o percentual dos números vai publicar "reserva de 0% a 12,5%" onde a lei fixa um número só.

🔴 **CORRIGIDA em 2026-09-17, e a correção é o melhor exemplo de "medir muda o desenho" deste módulo.** A regra acima saiu de **22 valores** dos Editais 002 e 003 e estava certa para os 22 — mas **nenhum cargo daqueles dois editais tem 3 vagas**, então aqueles dados não podiam decidir esse caso. O **Quadro II do Edital 004** distribui as 80 vagas de ACS por 39 UBSF e trouxe 5 totais distintos, inclusive o 3:

| total | unidades | publicado (AC, PD, CN) | arredondamento comum |
|---|---|---|---|
| 1 | 20 | (1, 0, 0) | ✅ igual |
| 2 | 7 | (2, 0, 0) | ✅ igual |
| **3** | **4** | **(3, 0, 0)** | 🔴 dava (2, 0, 1) |
| 4 | 7 | (3, 0, 1) | ✅ igual |
| 6 | 1 | (4, 1, 1) | ✅ igual |

As 4 unidades de 3 vagas concordam **entre si**, então é regra da FEVRE, não erro de digitação. Daí `MINIMO_DE_VAGAS_PARA_COTA_RACIAL = 4`: **abaixo de 4 vagas não se reserva para cotas raciais.** O efeito prático era real — antes disso, um cargo de 3 vagas recebia a sugestão `(2, 0, 1)`, um split que a FEVRE nunca publicou. ⚠️ E nenhum dos 31 testes de cotas cobria o caso, que é o próprio sintoma: dado que não existe não vira teste.

⚠️ **É a prática da FEVRE medida, não o texto da lei** — a Lei 12.990/2014 manda reservar a partir de **3** vagas, e o município não o faz. Cargo pequeno não reserva vaga nenhuma. Se uma norma passar a valer, muda em `src/lib/edital-cotas.ts` e os **61** valores medidos acusam a diferença.

**As vagas são GRAVADAS, não recalculadas na leitura.** Um edital publica números; recalcular faria um edital antigo mudar sozinho se a regra mudasse. A `CHECK chk_edital_cargo_vagas_somam` garante que o total é a soma das partes — no banco, não só na tela.

### 🔵 A matriz da prova é POR CARGO, e a soma tem de fechar (fatia 5)

Os editais dizem *"A Prova Objetiva **para os candidatos às vagas de `<cargo>`** constará de…"*, então a configuração pende de `edital_cargos`. Medido:

| edital | total | composição |
|---|---|---|
| 002 Docente I | 50 | 10 Português + 15 Pedagógicos + 25 Específicos |
| 003 Enfermeiro | 70 | 10 Português + 10 Legislação do SUS + 50 Específicos |
| 004 ACS | 50 | 10 Português + 10 Matemática + 30 Específicos |

🔴 **A soma das disciplinas × o total declarado NÃO é CHECK**, e é escolha: não dá para expressar agregação de outra tabela numa CHECK, e um trigger recusaria a digitação no meio do caminho — quem monta a matriz preenche uma disciplina por vez. Grava-se sempre; quem barra a **publicação** é o linter.

⚠️ **O índice de disciplina normaliza caixa e espaço, NÃO acento.** `lingua portuguesa` e `Língua Portuguesa` são disciplinas distintas para ele. É o mesmo comportamento de `cargos_nome_chave_key` — dobrar acento aqui seria identidade, não busca, e poderia fundir nomes legitimamente diferentes. Documentado no CASO 2a da bateria, porque a primeira versão do caso **afirmava a proteção que não existe**.

⚠️ Os três editais exigem *"sem contudo zerar em qualquer uma das áreas"* — conferido nos três depois de eu ter afirmado errado que o 004 não tinha a cláusula (era linha truncada num grep). `permite_zerar_disciplina` segue como parâmetro, mas hoje os três concordam.

### 🔵 O desempate — uma lista ordenada, e o sistema NÃO desempata (fatia 11, 2026-09-17)

🔴 **A fronteira vem primeiro, e está escrita na tela:** o capítulo descreve a ordem que sai publicada; **quem compara candidatos é a correção da prova**, que é outro módulo e não existe. Desempate é a parte do edital que mais vira processo judicial.

As três ordens publicadas, medidas — e elas **diferem de verdade**:

| | 002 (Docente I e II) | 003 (Enf. e Téc.) | 004 (ACS e ACE) |
|---|---|---|---|
| 1º | Conh. Específicos | Conh. Específicos | Conh. Específicos |
| 2º | Conh. Pedagógicos | Legislação do SUS | Língua Portuguesa |
| 3º | Língua Portuguesa | Língua Portuguesa | Matemática |
| 4º | **Prova de Títulos** | Maior Idade | Maior Idade |
| 5º | Maior Idade | — | — |

Antes da lista, os três trazem as mesmas duas preferências legais: **idade ≥ 60 anos** (Lei 10.741/2003) e **função de jurado** (CPP art. 440). Depois, uma lista separada só para **PCD**, idêntica nos três (Leis Municipais 3.113/94 e 3.221/95): arrimo de família · mais dependentes até 21 anos · nenhuma fonte de renda.

#### 🔴 UMA tabela com discriminador, não duas

O esboço propunha `criterios_desempate` e `criterios_desempate_pcd`. São a mesma coisa — **uma lista ordenada de critérios** —, e duas tabelas duplicariam RLS, índices, a regra de ordem e a tela. A única diferença real é *quais tipos cada lista admite*, e isso a CHECK `chk_desempate_tipo_da_lista` expressa melhor que um nome de tabela.

⚠️ **E o item 14.8 do Edital 002 mostra que as duas se encadeiam:** *"esgotados os critérios estabelecidos para as pessoas com deficiência, serão adotados os mesmos critérios para os candidatos à ampla concorrência"*. São dois trechos de um mesmo procedimento.

🔴 **"Arrimo de família" na lista geral seria a regra de PCD aplicada a todo mundo** — e ninguém notaria, porque as duas saem em parágrafos diferentes do mesmo capítulo. É o que aquela CHECK impede.

#### As duas armadilhas do roadmap, atendidas no banco

| | como |
|---|---|
| Dois critérios na mesma posição — *um desempate que empata* | **dois** índices únicos parciais. Um `UNIQUE` comum deixaria passar: nos três editais `cargo_id` é nulo, e nulos são distintos em Postgres |
| Critério "maior pontuação em ___" sem a disciplina | `chk_desempate_disciplina`, **bicondicional** — disciplina num critério que não a usa também é recusada |

⚠️ **O que o banco NÃO garante, e o linter pega:** a ordem com **buraco**. O índice impede duas na mesma posição, não impede `1º, 2º, 4º` — e um degrau na ordem publicada faz quem lê supor que um critério foi omitido.

#### ⚠️ A hora de nascimento NÃO é modelada, e é decisão

Os três têm a mesma regra de último recurso: quem não apresentar a certidão *"terá considerada como hora de nascimento, 23 horas 59 minutos e 59 segundos"*. Não virou coluna porque **o dado o sistema não tem e não vai ter**, e o parâmetro é **idêntico nos três** — coluna que ninguém varia é coluna em que alguém confia sem motivo. Fica como artigo do capítulo, escrito à mão.

⚠️ **E mover um critério troca DUAS posições**, em três passos com uma posição temporária alta: trocar A(1)↔B(2) direto falharia no índice único. **Não virou RPC** — a lista tem 4 a 7 itens e a troca é entre dois vizinhos; uma falha no meio deixa um critério na posição 9999, visível na tela. Na fatia 1 eram 300 artigos e a reescrita era da lista inteira, o que justificava a transação.

### 🎯 O conteúdo programático, e o SEGUNDO defeito publicado que o módulo acha (fatia 10, 2026-09-17)

No **Edital 003/2026**:

| onde | como está escrito | ocorrências |
|---|---|---|
| corpo (itens 11.2, 11.3, 13.5.1) | `Legislação do SUS` | 3 |
| Anexo I | `LESGISLAÇÃO DO SUS` | 2 |

**A prova cobra uma disciplina e o anexo descreve outra, de nome diferente.** E o erro aparece **duas** vezes no anexo porque o bloco foi copiado de um cargo para o outro — o mesmo mecanismo do COREN na fatia 8, agora num nome de disciplina.

🔴 **Por isso a regra central é o cruzamento com `provas_disciplinas`, nas duas direções.** Disciplina na prova sem ementa e ementa sem disciplina na prova aparecem em **par**, e o par é a assinatura do erro de digitação.

⚠️ **A comparação ignora acento, caixa e espaço.** Se comparasse cru, o `LESGISLAÇÃO` ainda seria pego — a letra a mais sobrevive a qualquer normalização —, mas `Legislação` × `LEGISLACAO`, que é a divergência mais comum entre corpo e anexo de um PDF, encheria o painel de falso positivo. ⚠️ É o oposto da escolha dos índices do banco, onde a normalização é só de caixa e espaço: **lá é identidade, aqui é busca.**

#### Por que `nome_disciplina` é TEXTO e não FK

`provas_disciplinas` pende de `edital_cargo_id` — cada cargo tem a sua linha de "Língua Portuguesa". Uma FK obrigaria toda ementa a pertencer a um cargo, e **a ementa comum não pertence a nenhum**: o Edital 002 escreve no título *"LÍNGUA PORTUGUESA (COMUM A TODOS OS CARGOS)"*. Um catálogo de disciplinas resolveria, ao custo de migrar a fatia 5 — mesmo cálculo do e-mail duplicado da fatia 9, mesma conclusão. O CASO 5 da bateria prova que o banco **aceita** o nome divergente.

#### A repetição do 003 é redundância, não conteúdo

Medido: Língua Portuguesa e Legislação do SUS são **idênticas byte a byte** entre os dois cargos (1.049 e 619 caracteres). Só Conhecimentos Específicos difere. **Os 6 blocos publicados são 4 informações** — e foi a repetição que propagou o `LESGISLAÇÃO` duas vezes.

Os dois editais dizem o mesmo de formas diferentes: o **002** escreve uma vez e rotula *"comum a todos"*; o **003** repete o texto idêntico sob cada cargo. `aplica_a_todos_os_cargos` cobre os dois.

⚠️ **E o anexo não tem o mesmo número nos três:** é o Anexo I no 002 e no 003, e o **Anexo II no 004** — que inverte, porque lá o Anexo I são as áreas de abrangência.

#### 🔴 Aqui NÃO há paginação, e é medição — não descuido

O roadmap mandava conferir o teto de 1.000 linhas do PostgREST *"como na fatia 7"*. Medido: **~11 ementas** no Anexo I do 002, **6** no do 003 — duas ordens de grandeza abaixo do teto. Ementas são **poucas e longas**, não muitas e curtas. O contraste com a fatia 7 (843 logradouros, 84% do teto) é o que mostra que a regra é **medir**, não aplicar o padrão por reflexo.

⚠️ **Ementa vazia é recusada pelo banco**, e isso difere da fatia 1 de propósito: lá o artigo em branco é aceito porque "Adicionar artigo" cria a linha. Aqui, uma disciplina no anexo sem ementa é uma seção com título e nada embaixo — o candidato não tem o que estudar.

### 🔵 A taxa é por CARGO, e a correlação com o nível é SUGESTÃO (fatia 9, 2026-09-17)

Os 6 valores publicados, medidos:

| | R$ 100,00 | R$ 80,00 |
|---|---|---|
| **002** | Docente I | Docente II |
| **003** | Enfermeiro | Técnico em Enfermagem |
| **004** | — | ACS e ACE |

A correlação com a escolaridade é **perfeita** — 100 para superior, 80 para médio/técnico —, inclusive no caso que quase a derruba: o Docente II, cuja habilitação mínima é *"Curso Normal de Nível **Médio**"*.

🔴 **Mesmo assim o recorte não é por nível.** São 6 pontos com 2 valores distintos: correlação observada, não regra declarada. Os três publicam uma **lista nominal por cargo** (*"A) Docente I – R$ 100,00"*). Modelar por escolaridade obrigaria o edital a obedecer a uma regra que nunca escreveu, e quebraria no dia em que dois cargos superiores tivessem taxas diferentes.

➜ A correlação virou **sugestão** (botão *"sugerir R$ 100"*) e **aviso** (taxas divergentes no mesmo nível), no mesmo desenho de `sugerirCotas`. O CASO 2 da bateria prova que o banco **não** impõe a correlação.

🔵 **E é COLUNA em `edital_cargos`, não tabela.** A relação é 1:1 com o cargo do edital, que já carrega `vencimento_base` e as vagas — uma `taxas_inscricao` de duas colunas seria uma junção a mais para sempre. ⚠️ `NUMERIC(10,2)`, nunca `float`: é dinheiro, e `float` não representa 0,10 exatamente.

#### Os critérios de isenção são TRÊS, e os três editais os escrevem iguais

| | critério | lei |
|---|---|---|
| A | CadÚnico + família de baixa renda | Lei 8.112/90 art. 11; Dec. 6.593/2008 e 11.016/2022 |
| B | Doador regular de sangue **ou** cadastrado no REDOME | Lei Municipal 5.989/2022 |
| C | Prestou serviço à Justiça Eleitoral | Lei Municipal 6.359/2024 |

⚠️ **O item B junta as duas situações numa alínea só.** O esboço do roadmap propunha quatro critérios, separando sangue de medula; o 003 chega a escrever *"de acordo com sua opção (REDOME ou Doador de Sangue)"*. Separá-los publicaria uma alínea que o documento não tem, e daria a mesma lei a dois critérios.

**O que varia de verdade entre os três:** a carteira do REDOME *"emitida no ano vigente"* (003 e 004 exigem; **002 não**), e se a documentação de isenção vale para um cargo só (003 e 004 exigem procedimentos independentes; **002 não tem a cláusula**). O mínimo de **3 doações em 12 meses** é igual nos três.

⚠️ **E `meses_atualizacao_cadunico` NÃO existe.** O roadmap afirmava *"CadÚnico atualizado nos últimos 24 meses"*; `"24 meses"` tem **zero** ocorrências nos três editais. É a quarta coluna proposta que a medição derruba nesta v3.

🔴 **Nada aqui defere isenção.** O capítulo descreve a regra que sai no edital; quem analisa o pedido do candidato é a banca. Isenção é a porta de fraude mais visada de um concurso, e não há validação automática nenhuma neste módulo.

#### O canal é o MEIO, e a finalidade é texto

Medido: **um** endereço presencial (a sede da FEVRE, Rua 154 nº 783) e **dois** e-mails, em três editais. O endereço se repete **quatro vezes só no Edital 002** — entrega de isenção, de laudo PCD, de autodeclaração e de títulos. É duplicação real no documento publicado, e é ela que paga a tabela.

⚠️ **`tipo_canal` é `PORTAL_WEB | EMAIL | TELEFONE | POSTO_PRESENCIAL`.** O esboço propunha `EMAIL_IMPUGNACAO` e `EMAIL_VISTA_PROVA`, misturando meio com finalidade — e o dado mostra por que não dá: o mesmo posto serve a quatro finalidades. A finalidade vai em `rotulo`.

⚠️ **A repetição continua permitida** (CASO 5b). O ganho não é impedir que o endereço apareça duas vezes: é que seja **uma linha referenciada** em vez de quatro textos digitados à mão que podem divergir.

🔴 **O risco do canal duplicado se materializou, e está mitigado, não resolvido.** O roadmap avisava que, se a fatia 5 viesse antes desta, criaria `regras_vista_prova.email_solicitacao` solto. Veio, e criou. A coluna **não foi migrada** — ela tem CHECK própria, e remodelar tabela entregue custa mais que a duplicação de um campo. A regra `email-da-vista-fora-dos-canais` torna a divergência **visível** em vez de silenciosa.

### 🎯 O checklist de investidura — onde o defeito de abertura do módulo morre (fatia 8, 2026-09-17)

O item **15.8-L do Edital 004 publicado** exige *"Certidão Nada Consta do COREN"* de Agente Comunitário de Saúde, cargo de nível médio sem conselho de classe. É o defeito que abre este documento.

🔴 **E a medição fechou o diagnóstico.** O Edital 003 (Enfermagem) tem **dois** documentos de COREN — `K) Registro Ativo…` e `N) Certidão Nada Consta…` — e o 004 herdou **só o segundo**, com o mesmo texto entre parênteses. Não é erro sistemático de geração: é uma linha copiada à mão de um documento para o outro.

**A defesa é em duas camadas, e a ordem importa (§2):**

| | onde | o que alcança |
|---|---|---|
| 1 | trigger **`IN001`** em `documentos_investidura` | `conselho_exigido` que nenhum cargo do edital exige. Exato, e vale por psql, PostgREST e script |
| 2 | `conferirInvestidura` | a sigla escrita no **texto livre**, que o trigger não vê |

⚠️ **A camada 2 é heurística de propósito.** Nome de documento varia demais (`COREN`, `Coren-RJ`, `Conselho Regional de Enfermagem`) para virar barreira de banco sem recusar o legítimo. Ela **acusa**; quem **impede** é a camada 1. O CASO 3e da bateria prova que o banco aceita o texto livre, para que ninguém tome a brecha por descuido.

🔴 **O trigger vale para o admin também** (CASO 8b): é `SECURITY INVOKER` e roda depois da RLS. Papel não é salvo-conduto para publicar um edital incoerente.

⚠️ **Na tela, o botão do conselho NÃO EXISTE quando nenhum cargo o exige.** O material de referência propunha *"desabilitados ou ocultos"* — desabilitado ainda é oferecido, e vira habilitado no dia em que alguém "melhorar" a UX.

#### 🔴 Três estados, não dois — e foi uma coluna ÓRFÃ até 17/09

`cargos.conselho_classe_obrigatorio` distingue:

| valor | significa | o linter |
|---|---|---|
| `null` | **não declarado** | acusa `cargo-sem-conselho-declarado` |
| `'NENHUM'` | declarado: o cargo não exige | silêncio — é resposta válida |
| `'COREN'`… | exige | o documento do conselho passa a ser oferecido |

⚠️ **A coluna existia desde 16/09 e era órfã:** nenhuma tela a escrevia, nenhum código a lia, e o cabeçalho do `QuadroDeCargos` afirmava haver ali uma *"trava de conselho de classe"* que não existia. A fatia 8 pagou essa dívida — os campos entraram no `CargoDialog`, que é o catálogo global, e não no editor do edital, porque escolaridade e conselho são propriedades do **cargo**.

🔴 **Ler `null` como "não exige" faria a regra degradar em silêncio:** o documento do conselho nunca seria oferecido, e quem redige descobriria com o edital já publicado sem ele.

#### O que o checklist pré-preenche, e o que NÃO pré-preenche

Dez documentos, medidos como comuns aos três editais. ⚠️ **Ficam de fora, de propósito:** o **ASO**, que é documento só no 002 (nos outros dois está na frase de abertura, *"julgado APTO no exame médico admissional"*), e o **diploma**, que os três escrevem diferente — *"do Curso exigido para o cargo a que concorre"* (002), um por cargo (003), *"do Ensino Médio"* (004). Pré-marcar qualquer um seria pôr na boca do edital o que ele não diz.

⚠️ **E não existe coluna `aplica_apenas_sexo`.** O reservista é o único item condicionado a sexo nos três — mas não é o único condicional: *"de filhos menores de 14 anos"* e *"caso declare"* estão na mesma lista, e os três editais exprimem **todas** as condições dentro do texto do documento. Uma coluna de sexo serviria a 1 linha de 12 e deixaria as outras duas em texto.

🔴 **`aplica_a_todos_os_cargos` existe para desambiguar o nulo.** Sem ele, *"vale para todos"* e *"esqueci de escolher"* seriam o mesmo estado, e o linter não conseguiria acusar documento órfão. A CHECK `chk_doc_inv_escopo` (`(cargo_id IS NULL) = aplica_a_todos_os_cargos`) obriga a escolha explícita.

### 🔵 Territorialidade — a opção de inscrição É a unidade (fatia 7, 2026-09-17)

Só o **Edital 004** é territorializado, e nem ele por inteiro. Medido:

| | vagas | forma |
|---|---|---|
| **ACS** (Quadro II) | 80 | **39 unidades**, cota calculada em cada uma, código próprio (DN-1 a DN-39) |
| **ACE** (Quadro III) | 143 | linha única — **não é territorializado** |

🔴 **Os dois convivem no mesmo documento, e é isso que prova que a territorialização é parâmetro do CARGO, não do edital.** O material de referência intitulava este passo *"(Exclusivo ACS/Polos)"* em dois arquivos; foi recusado pelo mesmo motivo do Magistério na fatia 6 — o ACS é o caso conhecido, não uma condição.

🔴 **O candidato não se inscreve para "ACS": inscreve-se para "ACS na UBSF Belmonte".** Cada unidade tem código de inscrição próprio, e por isso a cota é calculada **por unidade** — foi essa medição que corrigiu a regra de cotas da fatia 2 (ver a seção do Quadro I).

⚠️ **O Quadro I do 004 NÃO TEM coluna de vagas** — publica só cargo, habilitação, carga horária e vencimento, e o item 2.2 manda ao Quadro II. Num edital territorializado o total do cargo é **derivado** da distribuição, e não há número declarado para conferir contra. Por isso `conferirDistribuicao` só acusa divergência quando os **dois** existem: cobrar a igualdade contra um `null` acusaria todo edital desse tipo.

#### 🔴 P1 respondida: catálogo separado de `unidades_prova`

A pergunta do roadmap supunha que os dois catálogos podem apontar para os mesmos prédios. **Medido: a interseção é zero** — 12 escolas, faculdade e a sede da FEVRE de um lado; 39 UBS/UBSF do outro. Somado a isso, `unidades_prova` tem só nome e sigla (nem endereço) e carrega `sala_prova`, que não significa nada para um posto de saúde.

⚠️ **O risco original não sumiu, encolheu:** se um prédio um dia servir às duas coisas, serão duas linhas, e quem renomear renomeia nas duas. É mais barato que um discriminador `tipo` que toda consulta teria de filtrar para sempre.

#### 🔴 A abrangência é por EDITAL; a unidade, do município

`unidades_lotacao` é catálogo global — o posto existe. `territorialidade_abrangencia` tem `edital_id` porque **limite territorial muda com o tempo**, e guardá-lo no catálogo faria um edital novo reescrever, em silêncio, o anexo de um edital já publicado. É o mesmo corte de `cargos` e `edital_cargos`.

#### ⚠️ O logradouro entra CRU, e isso foi medido

O Anexo I lista nome de logradouro e nada mais. Das 843 linhas, 104 têm algo que *parece* faixa — e cada uma é de um tipo diferente: `ALAMEDAS 1 A 7`, `KM 7501 A 8500`, `DO N 03 ATÉ O N 9201`, `RUA 1, 2, 3 e 4 (CONDOMÍNIO VISTA BELA)`, `RUA 552`. Quebrar isso em `numero_inicial`/`numero_final` seria adivinhar. Vale a decisão de 01/08: **dado inválido entra cru; valide na leitura**.

⚠️ **A estrutura do anexo é irregular:** das 28 seções, 12 listam as ruas direto sob a unidade e as outras desdobram por bairro. Por isso `bairro` é anulável, e `agruparPorBairro` mantém a seção nula **onde ela apareceu** — jogá-la num balde no fim mudaria a ordem do documento publicado.

⚠️ **A cobertura é parcial:** 39 unidades no Quadro II, **14** com lista publicada. A tela diz isso — ausência que não se explica parece carregamento pela metade.

🔴 **843 linhas são 84% do teto de 1.000 do PostgREST, que corta sem erro.** Toda leitura completa passa por `buscar-em-fatias`, com ordem estável (`ordem`, depois `id`). Sem o desempate único, o laço repete uma linha e pula outra — também calado. O sintoma seria uma rua sumindo do anexo publicado.

### 🔵 A prova de títulos, e a única tabela do módulo que NÃO reproduz o publicado (fatia 6, 2026-09-17)

Só o **Edital 002** tem esta etapa entre os três. Os Quadros III e IV dele, medidos item a item:

| | Quadro III — Docente I | Quadro IV — Docente II |
|---|---|---|
| Mestrado Profissional | Área do Componente Curricular — **5** | Docência na Educação Básica — **5** |
| Lato sensu, 360h | Tecnologias Digitais na Educação — **4** | Alfabetização e Letramento — **4** |
| Lato sensu, 360h | Educação Inclusiva — **3** | Educação Inclusiva — **3** |
| | **12** | **12** |

🔴 **A configuração se divide em DUAS chaves, e isso difere da fatia 5 de propósito.** Lá cada edital diz *"a Prova Objetiva **para os candidatos às vagas de `<cargo>`**…"* e tudo pende do cargo. Aqui o item 13.4 declara o teto **uma vez**, para os dois quadros: `titulos_config` é por **edital**, `titulos_itens` é por **cargo**.

🔵 **A aplicabilidade não tem coluna, e é de propósito.** O item 13.2 restringe os títulos a Docente I e Docente II, e é o que acontece sozinho quando um cargo não tem nenhuma linha em `titulos_itens`. Um campo `tem_titulos` seria um segundo lugar dizendo a mesma coisa, livre para divergir do primeiro.

🔴 **O prazo de conclusão é DERIVADO, e não há campo para digitá-lo.** O item 13.17 diz *"concluídos até 30 dias antes do prazo previsto no subitem 5.4"*, e o 5.4 é o fim das inscrições (08/06/2026) — logo, 09/05/2026. Guarda-se o **intervalo**; a data sai de `dataLimiteDeConclusao(fimDasInscricoes, dias)`. Gravar a data resolvida criaria a segunda cópia que envelhece calada quando o cronograma muda — que é o `"dia XX/xx/2026"` do Edital 004 em outra roupa.

⚠️ **As DUAS colunas de pontuação são do documento**, não invenção: o quadro publica *"Pontuação Mínima por Título"* e *"Pontuação Máxima por Título"* lado a lado. **Nos 6 itens reais elas são iguais**, então a diferença entre as duas não é exercitada por dado nenhum que temos — a tela edita as duas com um campo só, e o banco as guarda separadas para o dia em que um edital as diferencie (CASO 3b da bateria).

⚠️ **O que o esboço previa e a medição derrubou:** `pontos_por_item` e `limite_itens_aceitos`. Não há conceito de quantidade de títulos por categoria no Edital 002 — cada um vale um valor fixo e conta uma vez. Campo que ninguém preenche vira, com o tempo, campo em que alguém confia.

#### 🔴 O quadro gerado NÃO agrupa cargos — e isso vale para dois quadros, não um

O Quadro III junta os 8 cargos de Docente I numa linha só (*"Docente I (Arte, Ciências, …)"*); o gerado lista **um cargo por linha**. É **decisão do usuário em 2026-09-16**, tomada com a medição na mão — não descuido. As duas alternativas recusadas estão em [`roadmap-editais-prova-de-titulos.yaml`](../../../analises/roadmap-editais-prova-de-titulos.yaml), para que ninguém as reabra achando que são novas.

⚠️ **E o mesmo vale para o Quadro II de provas (fatia 5), que eu havia afirmado o contrário.** Medido em 2026-09-17: o Quadro II publicado do Edital 002 tem **2 linhas** (`Docente I`, `Docente II`) para **9 cargos**, e as disciplinas são **colunas**; o `MatrizGerada` renderiza **uma linha por cargo × disciplina**, com as disciplinas em linhas. Os dois quadros gerados, então, divergem da forma publicada da mesma maneira — não há exceção, há um padrão:

| | publicado no 002 | gerado hoje |
|---|---|---|
| Quadro II (provas) | 2 linhas, disciplinas em colunas | 1 linha por cargo × disciplina |
| Quadros III/IV (títulos) | 2 tabelas, 8 cargos numa linha | 1 linha por cargo × título |

🔵 O Edital 003 **não** agrupa (1 linha por cargo, e são 2 cargos), então o gerado o reproduz exatamente. O agrupamento do 002 é rótulo de família de cargo escrito à mão por quem redigiu — não é derivável da configuração, porque no 002 as duas famílias têm **números idênticos** (50 = 10+15+25 nas duas) e mesmo assim são linhas separadas. É por isso que derivar o agrupamento foi recusado, e declará-lo ficou fora de escopo.

🔴 **FRONTEIRA: conferir o teto NÃO é respeitar o teto.** Validar que a soma das categorias cabe nos 12 pontos não garante que a pontuação de um candidato os respeite. Isso é **correção de prova**, que é outro módulo e não existe. Sem esta linha alguém vai supor que o sistema já limita a nota de alguém.

⚠️ **Uma regra que quase entrou e não entrou:** *"lato sensu tem de declarar carga horária"*. Nos 4 itens lato sensu reais ela está sempre lá (360h) e o mestrado nunca a declara — mas 4 casos do mesmo edital são costume da FEVRE, não regra. Ela acusaria o primeiro edital que fizesse diferente, e é assim que um painel perde a confiança de quem o lê.

⚠️ **NÃO implementado, e registrado para que ninguém suponha a garantia:** *"título que serve de requisito de investidura não pontua"*. Cruza tabelas (depende da escolaridade exigida do cargo, fatia 2) e, como barreira, seria **trigger** — nunca um `if` no hook (§2).

### 🔴 A data de corte da lactante é DERIVADA — e o porquê é um defeito real (fatia 4)

O item 10.10 do **Edital 003/2026 publicado** diz:

> *"desde que o lactente tenha nascido a partir do dia 16 de março de 2026, considerando o limite de até 6 (seis) meses de idade na data de realização da prova **(16 de setembro de 2026)**"*

Mas o cronograma do mesmo edital marca a prova em **20/09/2026**. O 16/09 é a data do **comprovante de local de prova**.

🔴 **Com a prova em 20/09, o corte correto é 20 de março.** Uma candidata cujo bebê nasceu em 18/03 seria recusada por engano — e isso se discute em juízo.

Por isso **não existe coluna `data_limite_nascimento`**: guarda-se `idade_maxima_lactente_meses`, e a data sai da etapa `prova_objetiva` do cronograma, na renderização. Mesmo princípio da numeração de capítulo — **o que é derivado não se persiste, senão envelhece em silêncio**.

⚠️ As **datas de perícia** seguem a mesma lógica pelo outro lado: elas moram no cronograma, como etapa do tipo `ALTERNATIVAS`, e não em `regras_pcd`. Duplicá-las criaria duas fontes.

⚠️ Os presets recomendados (compensação de 30 min, laudo indeterminado das Leis RJ) são **aviso**, nunca trava: o Edital 002 não compensa tempo e é válido. O modelo precisa reproduzir os três editais sem caso especial — e a bateria prova isso.

### 🔵 O cronograma, e as TRÊS formas de data (fatia 3, 2026-09-16)

🔵 **Três etapas entraram com a fatia 6, em 2026-09-17:** `entrega_titulos`, `resultado_titulos` e `recurso_titulos`. Faltavam, e a falta era concreta — o Edital 002 publica as três, e sem o fim das inscrições ligado a elas o prazo do item 13.17 não tinha de onde ser derivado. ⚠️ A entrega é **ALTERNATIVAS**, não INTERVALO: *"no dia 22/07/2026 ou no dia 23/07/2026"* são dois dias à escolha do candidato; como intervalo, o documento passaria a dizer "de 22 a 23", que é outra coisa.

🎯 **É aqui que o `"dia XX/xx/2026"` do Edital 004 deixa de ser possível.** Enquanto a data é texto corrido, "vazio" não é estado. Vinda de `cronograma_etapas`, etapa sem data aparece no painel antes de alguém publicar.

⚠️ **Gravar etapa sem data é ESTADO VÁLIDO; publicar não é.** O par é deliberado: travar a gravação travaria a redação.

**O modelo tem três formas, e isso foi medido no cronograma real do Edital 003:**

| forma | exemplo real |
|---|---|
| `DATA_UNICA` | Prova objetiva — `20/09/2026` |
| `INTERVALO` | Inscrições — `29/06/2026 a 27/07/2026` |
| `ALTERNATIVAS` | Retirada do atestado — `06/07, 09/07, 13/07, 16/07 ou 20/07` |

🔴 **Espremer as ALTERNATIVAS num intervalo publicaria um edital FALSO** — o candidato leria que pode ir de 06/07 a 20/07, quando só cinco dias são oferecidos. A CHECK `chk_cronograma_cardinalidade` garante que a quantidade de datas combina com o tipo.

**Não há calendário de feriados, e não é omissão.** Medido: a data é escrita e "1 dia útil" é texto descritivo ao lado dela (*"terá 01 (um) dia útil (21/09/2026) para recorrer"*). O sistema **confere, não calcula** — precedência é comparação de datas, e fim de semana sai do dia da semana.

⚠️ **A exceção de fim de semana é a DATA DA PROVA, não a etapa.** O gabarito do Edital 003 é divulgado no mesmo domingo do exame. Das 16 datas do documento, só essa cai em fim de semana.

⚠️ **Cada precedência declara qual PONTA comparar.** "Isenção até o fim das inscrições" compara fim × fim; "inscrições antes da prova" compara fim × início. Comparar sempre fim × início acusa erro em edital válido — foi o que a primeira versão fez com o Edital 003.

### 🔴 A CG001 foi estreitada pela SEGUNDA vez

`cargos` é do módulo Candidatos e é a fonte de verdade (decisão D2) — não se duplica. Mas o trigger `cargos_recusa_alterar_com_inscritos` barrava **qualquer** UPDATE num cargo com inscritos, sem olhar a coluna. Com isso, o autor do edital não conseguiria definir `conselho_classe_obrigatorio` em nenhum cargo reaproveitado de um certame anterior.

Desde a migration `20260916184254`, **só a troca do NOME tranca** — que é o que a regra realmente protege. A mensagem mudou de *"não pode ser alterado"* para *"não pode ser RENOMEADO"*.

⚠️ Foi a segunda vez: a primeira, em 01/08, tirou `cargo_apelidos` da contagem. O padrão se repete — a regra nasce larga e se estreita conforme o uso mostra onde ela precisa morder.

⚠️ **Conferido antes de liberar:** `cargos.ativo` não tem consumidor nenhum, então liberá-la não esconde dado. Se um dia passar a filtrar alguma listagem, revisitar o caso 4b.3 de `docs/bateria-cargos.sql`.

### A linha de capítulo é um OVERRIDE, não um registro obrigatório

🔵 **Decidido na implementação, contra o roadmap.** Ele previa uma RPC `criar_edital_com_capitulos` que semeasse os 19 capítulos em transação. Se a RPC também conhecesse a lista, o catálogo existiria em **dois lugares** — e divergiriam no dia em que um capítulo novo entrasse.

Então: **capítulo sem linha vale pelo padrão do catálogo.** A linha só nasce quando alguém desliga ou reordena o capítulo — um UPSERT, operação de um passo. (🔵 Até 16/09 escrever texto também a criava; hoje o texto são os artigos, que têm tabela própria.) Sumiu a semeadura, sumiu a transação de vários passos, sumiu o estado pela metade.

Dois efeitos que valem registro: os **3 editais de produção ganharam estrutura de documento sem backfill**, e capítulo novo no catálogo vale para todos eles **sem migration de dados**.

### Todo capítulo é desligável

Decisão do usuário em 2026-09-16. O catálogo diz quais **nascem** ligados (15 dos 17 numerados) e quais nascem desligados (territorialidade e prova de títulos) — mas **qualquer um** pode ser desligado.

⚠️ **"Condicional" NÃO quer dizer "condicional a uma carreira".** Um edital de ACS pode ter prova de títulos; um de enfermagem pode ter territorialidade. O material de referência propunha um mapa carreira → funcionalidade, e ele foi **recusado**. A carreira pode no máximo pré-marcar; nunca determinar, impedir ou esconder.

O preço combinado: desligar um capítulo **padrão** gera **aviso** do linter — permitido, mas incomum.

**Cobertura de testes** (ver [`../../transversais/testes.md`](../../transversais/testes.md)): o módulo é o mais bem coberto do sistema. `useEditais.test.tsx` (14) cobre a listagem, as traduções de `23505`/`23503` e a invalidação dupla; `EditalDialog.test.ts` (8) o schema isolado; `EditalDialog.ui.test.tsx` (11) a interação. O lado da prova está em `ProvaDialog.ui.test.tsx` (10), que guarda a herança e o bloqueio sem edital. E o **guard da rota** está em `pages/guards.test.tsx`: `/editais` recusa deslogado, colaborador e coordenador — foi justamente quebrando este guard de propósito que a bateria foi falsificada antes de ser aceita.

🔵 **A v3 trouxe 276 casos de LÓGICA PURA (2026-09-16 e 17),** em 14 arquivos: `edital-cotas` (36) · `edital-itens` (29) · `edital-linter` (26) · `edital-territorialidade` (24) · `edital-inscricao` (22) · `edital-numeracao` (20) · `edital-investidura` (19) · `edital-cronograma` (18) · `edital-desempate` (17) · `edital-conteudo` (15) · `edital-titulos` (15) · `edital-acoes-afirmativas` (13) · `edital-prova` (13) · `edital-texto` (9). Mais **15 de interação** em `ArtigosDoCapitulo.ui.test.tsx`.

⚠️ **E 12 baterias SQL**, que é onde mora tudo que a suíte não alcança: `edital-capitulos` · `edital-itens` · `edital-cargos` · `edital-cronograma` · `edital-acoes-afirmativas` · `edital-prova-objetiva` · `edital-titulos` · `edital-territorialidade` · `edital-investidura` · `edital-inscricao` · `edital-conteudo` · `edital-desempate`. Nenhuma é alcançada por `npm test` nem por `npm run docs:conferir` — **rodá-las é passo manual**, e uma delas já apodreceu verde neste módulo (ver abaixo).

⭐ **O controle positivo são os editais REAIS**, não fixtures inventadas: os três dão três numerações de capítulo diferentes a partir do mesmo catálogo, e o **capítulo 6 do Edital 002** (Da Isenção) exercita os três tipos de linha de uma vez — 17 itens, alíneas em letra sob o 6.1 e o 6.6, e o parágrafo sem número do envelope entre o 6.6 e o 6.7.

Falsificações que passaram: fixar a numeração de capítulo derruba 7 casos (⚠️ e **o Edital 004 sobrevive ao defeito** — é por isso que três fixtures valem mais que uma); fixar a de artigo derruba 9; tirar o reinício de contador ao descer de nível derruba 1; tirar a ordenação de `ancorasDoDocumento` derruba 1.

⚠️ **Duas asserções minhas estavam erradas e o dado real as corrigiu:** o teste de "âncora fora de ordem" usava três artigos com a âncora **no meio**, e passava com ou sem a ordenação; e a primeira regra `nivel-fora-de-sequencia` acusaria a **alínea direto sob o item** — que é a forma normal, com 64 a 74 ocorrências por edital. Ela virou `subitem-sem-item`, que acusa só o caso que gera saída quebrada (`7.0.1`).

O banco é `docs/bateria-edital-capitulos.sql` e `docs/bateria-edital-itens.sql` (29 casos). ⚠️ Em ambos, o caso da FK RESTRICT precisou de um edital **criado na hora**: com um edital existente quem barrava era `provas_edital_id_fkey`, e o caso passava sem exercitar a regra nova.

🔵 **A PÁGINA ganhou bateria própria em 2026-08-02** (`pages/Editais.ui.test.tsx`, 5 casos), e a razão é a mudança do card: o número exibido deixou de ser um campo da linha e passou a vir da contagem real de inscritos, que é de **outro módulo**. Ela guarda os três textos (contando · nenhum importado · N importados), que a contagem case com o **edital certo** quando há mais de um na tela, e que **"0" nunca apareça**. Falsificada: com o card voltando a `?? 0`, caem exatamente os dois casos que tratam de ausência de lista.

## Modelo de dados

```
editais
  id                uuid PK
  nome              text NOT NULL      -- único case/space-insensitive (ver abaixo)
  n_candidatos      integer NULL       -- 🔵 ÓRFÃ desde 02/08: ninguém lê nem escreve (ver abaixo)
  cabecalho_linha1  text DEFAULT 'FUNDAÇÃO EDUCACIONAL DE VOLTA REDONDA'
  cabecalho_linha2  text DEFAULT 'Coordenação de Concursos e Processos Seletivos'
  created_at / updated_at  timestamptz   -- updated_at por trigger update_updated_at_column
  created_by        uuid → auth.users(id)

  -- 🔵 v3 fatia 1 (migration 20260916173801). TODAS ANULÁVEIS: produção tem 3 editais
  -- sem nenhum destes dados, e o seed carrega DEPOIS das migrations — um NOT NULL aqui
  -- quebraria o `db reset`, a mesma armadilha que deixou `provas.edital_id` nullable.
  numero_edital     text       -- ⚠️ SEM CHECK de formato: "002/2026-SMA" é real
  ano               integer
  natureza_juridica text       -- CHECK: CONCURSO_PUBLICO | PROCESSO_SELETIVO
  orgao_demandante / entidade_executora / decreto_autorizador / regime_trabalho  text
  prazo_validade_anos integer  -- CHECK > 0
  prorrogavel       boolean

edital_capitulos                       -- 🔵 v3 fatia 1
  id                uuid PK
  edital_id         uuid → editais(id) ON DELETE RESTRICT
  chave             text       -- slug do catálogo; é por ela que a referência aponta
  ordem             integer    -- CHECK >= 0
  incluido          boolean
  UNIQUE (edital_id, chave)
  -- 🔵 A coluna `texto` foi DROPADA em 20260916225307: o conteúdo virou um registro por
  -- artigo em `edital_itens`. Um capítulo é só posição, inclusão e título.
  -- 🔴 NÃO há coluna `numero`. O número é calculado — ver a seção do documento acima.

edital_itens                           -- 🔵 um registro por ARTIGO (20260916225307)
  id                uuid PK
  edital_id         uuid → editais(id) ON DELETE RESTRICT
  capitulo_chave    text       -- 🔴 TEXT, NÃO FK: ver abaixo
  ordem             integer    -- CHECK >= 0; sem UNIQUE, desempate por created_at
  nivel             smallint   -- CHECK 0..2: item · subitem · alínea
  tipo              text       -- CHECK: item | prosa | quadro
  texto             text       -- ⚠️ pode ser VAZIO: artigo vazio é achado do LINTER
  ancora            text       -- CHECK ^[a-z0-9_]+$
  quadro_fonte      text       -- CHECK: cargos|disciplinas|titulos|vagas_por_area|cronograma
  CHECK ((tipo = 'quadro') = (quadro_fonte IS NOT NULL))
  UNIQUE (edital_id, ancora) WHERE ancora IS NOT NULL   -- índice PARCIAL
  -- 🔴 NÃO há coluna `numero`, nem aqui nem no capítulo.
```

🔴 **`edital_itens.capitulo_chave` é TEXT e não FK, e isso é escolha.** Uma FK composta para `edital_capitulos(edital_id, chave)` **forçaria a linha de capítulo a existir** — e ela é um override opcional (ver a seção abaixo). O CASO 1d de `docs/bateria-edital-itens.sql` é o que guarda isso: artigo em capítulo sem linha de override.

🔴 **O índice da âncora é PARCIAL** (`WHERE ancora IS NOT NULL`), e o CASO 2c da bateria é o que guarda: a esmagadora maioria dos artigos não tem âncora, e um índice íntegro quebraria o uso normal, não o excepcional. ⚠️ Ele aposentou a regra `ancora-duplicada` do linter — deixou de ser detectada porque deixou de ser possível.

⚠️ **Reordenar vai pela RPC `reordenar_itens_do_capitulo`**, nunca por `update` solto: reescrever a ordem é operação de vários passos (§2). Ela é `SECURITY INVOKER` — a autorização são as policies, e um `DEFINER` criaria uma segunda cópia da regra. Recusa com `EI001` (id de outro capítulo) e `EI002` (lista incompleta, que deixaria buraco).

⚠️ **Apagar a linha de capítulo NÃO leva os artigos junto** (CASO 14 da bateria). Não há FK entre eles de propósito: desligar um capítulo não pode destruir texto redigido.

```
titulos_config                         -- 🔵 v3 fatia 6 (20260916234302)
  edital_id         uuid PK → editais(id) ON DELETE RESTRICT
  teto_maximo_pontos             numeric(6,2)  -- CHECK > 0
  carater_classificatorio        boolean       -- 13.1: é PARÂMETRO, não constante
  exige_historico_escolar        boolean       -- 13.5
  exige_reconhecimento_mec_cne   boolean       -- 13.7
  exige_traducao_juramentada     boolean       -- 13.11
  exige_revalidacao_diploma_estrangeiro boolean -- 13.10
  dias_conclusao_antes_fim_inscricoes integer  -- 13.17; CHECK >= 0
  -- 🔴 INTERVALO, nunca data: a data deriva do fim das inscrições (fatia 3).

titulos_itens                          -- 🔵 um título aferível por linha, por CARGO
  id                uuid PK
  edital_cargo_id   uuid → edital_cargos(id) ON DELETE RESTRICT
  ordem             integer    -- CHECK >= 0
  nivel             text       -- CHECK: DOUTORADO | MESTRADO_ACADEMICO
                               --      | MESTRADO_PROFISSIONAL | ESPECIALIZACAO_LATO_SENSU
  descricao         text       -- a coluna "Títulos Aferíveis" do quadro; CHECK não-vazia
  area_exigida      text
  carga_horaria_minima_horas integer  -- CHECK > 0; NULL é legítimo (mestrado não declara)
  pontos_minimo     numeric(6,2)  -- as DUAS colunas do quadro publicado
  pontos_maximo     numeric(6,2)  -- CHECK ambos > 0 e minimo <= maximo
```

```
unidades_lotacao                       -- 🔵 v3 fatia 7 (20260917082732). GLOBAL, sem edital_id
  id                uuid PK
  nome              text NOT NULL   -- UNIQUE funcional lower(btrim()); CHECK não-vazio
  sigla / endereco / bairro  text
  -- 🔴 Separada de `unidades_prova`: a interseção medida entre as duas é ZERO.

edital_cargo_unidades                  -- 🔵 o Quadro II: vagas por unidade
  id                uuid PK
  edital_cargo_id   uuid → edital_cargos(id) ON DELETE RESTRICT
  unidade_lotacao_id uuid → unidades_lotacao(id) ON DELETE RESTRICT
  codigo_inscricao  text       -- ⚠️ SEM índice único: ver abaixo
  ordem             integer    -- CHECK >= 0
  vagas_ampla_concorrencia / vagas_pcd / vagas_negros  integer  -- CHECK >= 0
  UNIQUE (edital_cargo_id, unidade_lotacao_id)

territorialidade_abrangencia           -- 🔵 o Anexo I do Edital 004
  id                uuid PK
  edital_id         uuid → editais(id) ON DELETE RESTRICT
  unidade_lotacao_id uuid → unidades_lotacao(id) ON DELETE RESTRICT
  bairro            text       -- ANULÁVEL: 12 das 28 seções não desdobram por bairro
  logradouro        text NOT NULL  -- COMO PUBLICADO, sem parsing; CHECK não-vazio
  ordem             integer    -- CHECK >= 0
  INDEX (edital_id, unidade_lotacao_id, ordem)
```

```
documentos_investidura                 -- 🔵 v3 fatia 8 (20260917093000)
  id                uuid PK
  edital_id         uuid → editais(id) ON DELETE RESTRICT
  cargo_id          uuid → cargos(id) ON DELETE RESTRICT   -- NULL = todos os cargos
  aplica_a_todos_os_cargos  boolean NOT NULL
  nome_documento    text NOT NULL   -- CHECK não-vazio
  conselho_exigido  text       -- CHECK: o domínio de cargos, SEM 'NENHUM'
  obrigatorio       boolean NOT NULL DEFAULT true
  observacao        text
  ordem             integer    -- CHECK >= 0
  CHECK ((cargo_id IS NULL) = aplica_a_todos_os_cargos)   -- chk_doc_inv_escopo
  TRIGGER check_documento_conselho  -- IN001, em INSERT e UPDATE
```

```
edital_cargos.taxa_inscricao           -- 🔵 v3 fatia 9: COLUNA, não tabela
  numeric(10,2)   -- CHECK >= 0 (taxa zero é concurso sem taxa, decisão legítima)

regras_isencao                         -- 🔵 v3 fatia 9 (20260917104500)
  id, edital_id → editais(id) RESTRICT
  tipo_criterio   text  -- CHECK: CADUNICO | DOADOR_SANGUE_OU_MEDULA | SERVICO_ELEITORAL
  lei_referencia  text
  minimo_doacoes_sangue_12m  integer   -- CHECK > 0; nulo nos outros dois critérios
  redome_exige_ano_vigente   boolean   -- o parâmetro que mais varia entre os três
  UNIQUE (edital_id, tipo_criterio)

inscricao_config                       -- 🔵 parâmetros do EDITAL
  edital_id uuid PK → editais(id) RESTRICT
  documentacao_isencao_vale_para_um_cargo  boolean
  limite_envelopes_por_candidato           integer  -- CHECK > 0

edital_canais_atendimento              -- 🔵 um canal, citado por vários capítulos
  id, edital_id → editais(id) RESTRICT
  tipo_canal  text  -- CHECK: PORTAL_WEB | EMAIL | TELEFONE | POSTO_PRESENCIAL (o MEIO)
  rotulo      text NOT NULL   -- a FINALIDADE, texto livre; CHECK não-vazio
  endereco / horario_funcionamento / observacao  text
  ordem       integer  -- CHECK >= 0
```

```
conteudo_programatico                  -- 🔵 v3 fatia 10 (20260917115000)
  id, edital_id → editais(id) RESTRICT
  cargo_id      uuid → cargos(id) RESTRICT   -- NULL = comum a todos
  aplica_a_todos_os_cargos  boolean NOT NULL
  nome_disciplina  text NOT NULL   -- TEXTO, não FK; CHECK não-vazio
  texto_ementa     text NOT NULL   -- 🔴 CHECK não-vazio, diferente do artigo da fatia 1
  ordem            integer         -- CHECK >= 0
  CHECK ((cargo_id IS NULL) = aplica_a_todos_os_cargos)

  UNIQUE (edital_id, lower(btrim(nome_disciplina)))            WHERE cargo_id IS NULL
  UNIQUE (edital_id, cargo_id, lower(btrim(nome_disciplina)))  WHERE cargo_id IS NOT NULL
```

```
criterios_desempate                    -- 🔵 v3 fatia 11 (20260917130000)
  id, edital_id → editais(id) RESTRICT
  cargo_id  uuid → cargos(id) RESTRICT   -- NULL = todos (é o caso dos três editais)
  aplica_a_todos_os_cargos  boolean NOT NULL
  lista             text     -- CHECK: GERAL | PCD
  ordem_prioridade  integer  -- CHECK >= 1
  criterio_tipo     text     -- CHECK: o tipo tem de pertencer à lista
  disciplina_referencia  text  -- TEXTO, não FK
  CHECK ((cargo_id IS NULL) = aplica_a_todos_os_cargos)
  CHECK ((criterio_tipo = 'PONTUACAO_DISCIPLINA') = (disciplina_referencia IS NOT NULL))

  UNIQUE (edital_id, lista, ordem_prioridade)            WHERE cargo_id IS NULL
  UNIQUE (edital_id, lista, cargo_id, ordem_prioridade)  WHERE cargo_id IS NOT NULL
```

Tipos de `GERAL`: `IDADE_60_MAIS` · `FUNCAO_JURADO` · `PONTUACAO_DISCIPLINA` · `MAIOR_PONTOS_TITULOS` · `MAIOR_IDADE`. De `PCD`: `ARRIMO_FAMILIA` · `MAIS_DEPENDENTES_ATE_21` · `SEM_FONTE_DE_RENDA`.

⚠️ **`disciplina_referencia` é texto pela mesma razão da fatia 10:** `provas_disciplinas` pende de `edital_cargo_id`, e o critério vale para todos os cargos. O CASO 6 prova que o banco aceita nome fora da matriz; quem acusa é o linter.

🔴 **Dois índices parciais, não um.** Em Postgres nulos são **distintos**, então um `UNIQUE (edital_id, cargo_id, nome)` deixaria passar duas ementas de "Língua Portuguesa" marcadas como comuns — que é o caso mais provável de digitação duplicada. Mesmo padrão do índice de âncora de `edital_itens`.

⚠️ **Comum e específica com o MESMO nome convivem** (CASO 2d), e é legítimo: o Edital 002 tem *"LÍNGUA PORTUGUESA (comum a todos)"* e também *"DOCENTE I – LÍNGUA PORTUGUESA"*, que é a específica daquele cargo.

⚠️ **`endereco` não tem CHECK de formato, nem para e-mail.** É a decisão de 01/08 (*"dado inválido entra cru; valide na leitura"*), que removeu 4 CHECKs de formato deste repo. O CASO 5e prova que o banco aceita `'isto nao e um email'`; quem acusa é o linter.

🔴 **`IN001` cruza três tabelas** (`documentos_investidura` → `edital_cargos` → `cargos`), e por isso é trigger e não CHECK — CHECK não enxerga outra tabela (§2). ⚠️ Ele cobre **INSERT e UPDATE**: validar só o INSERT deixaria aberto o caminho óbvio de inserir com a coluna nula e preenchê-la depois (CASO 3b).

⚠️ **Ele pergunta sobre o EDITAL, não sobre a linha.** Um edital com Enfermeiro e ACS pode exigir o COREN num documento que vale para todos — é o que o 003 faz, listando o registro uma vez para os dois cargos de enfermagem.

⚠️ **`chk_doc_inv_conselho` é quase inalcançável, e não é redundante.** Para chegar nela, o valor precisa passar pelo trigger — isto é, algum cargo do edital tem de declará-lo — e `cargos` só admite o mesmo domínio mais `'NENHUM'`. O **único** valor que a exercita é `'NENHUM'`, e é ela que o segura. (É o §8 outra vez: regra nova ofusca regra antiga, e a primeira versão do CASO 6 da bateria afirmava o contrário.)

🔴 **`edital_cargo_unidades` é um nível ABAIXO do cargo, e TEM de ser:** `edital_cargos` tem `UNIQUE (edital_id, cargo_id)`, então o ACS só cabe uma vez lá — as 39 unidades não caberiam como 39 linhas de cargo.

⚠️ **`codigo_inscricao` NÃO tem índice único, de propósito.** Metade dos 39 códigos fica `NULL` enquanto se digita, e um índice barraria o meio do caminho. Quem acusa repetição é `edital-territorialidade.ts`, e o **CASO 2c da bateria prova a ausência**: o banco aceita. Se alguém puser o índice um dia, aquele caso avisa. (⚠️ E o próprio Edital 004 é incoerente aqui: o ACE tem código `AE 4` no Quadro I e `AE 66` no Quadro III.)

⚠️ **A mesma rua pode estar em DUAS unidades** — o item 5.1.5 do Edital 004 fala em áreas limítrofes de propósito. Um índice único por `(edital, logradouro)` impediria o que o documento prevê; o CASO 6b guarda isso.

⚠️ **`DOUTORADO` e `MESTRADO_ACADEMICO` não aparecem em nenhum dos três editais.** Entram no domínio porque recusá-los barraria título corriqueiro, e o custo de um valor a mais é zero. O CASO 4b da bateria é o que guarda isso: sem ele, alguém estreitaria o domínio aos 2 valores medidos e o primeiro edital com doutorado bateria num muro.

⚠️ **A soma dos pontos contra o teto NÃO é CHECK**, pela mesma razão da fatia 5: agregação de outra tabela não cabe numa CHECK, e um trigger recusaria a digitação no meio do caminho — 5 pontos num teto de 12 é estado intermediário legítimo. O **CASO 9 da bateria prova a ausência**: a soma acima do teto entra no banco. Se alguém puser um trigger para "resolver" isso, aquele caso acusa.

⚠️ **`numero_edital` é `text` sem CHECK de formato, de propósito.** Este repo removeu 4 CHECKs de formato em 2026-08-01 ("dado inválido entra cru; valide na leitura"), e o formato varia no mundo real — o próprio Edital 002 se chama `002/2026-SMA`. Quem valida é a tela e o linter.

🔴 **As FKs de `edital_capitulos` e `edital_itens` são RESTRICT, não CASCADE** (§2). O artigo carrega **texto redigido**: é conteúdo com valor próprio, não anotação descartável. São o **terceiro e o quarto** dependentes RESTRICT de `editais`, junto de `provas` e `candidatos`.

**Unicidade do nome:** `CREATE UNIQUE INDEX editais_nome_key ON editais (lower(btrim(nome)))` — índice **funcional**, mesmo padrão de `colab_email`. Isso aposentou de propósito o antigo `CHAR(30)`, cujo *padding* de espaços era a origem dos ~15 `.trim()` espalhados pelo front. Não troque por um `UNIQUE (nome)` comum: voltariam a conviver `Edital 001` e `edital 001 `.

**Relação com `provas`:** `provas.edital_id uuid REFERENCES editais(id) ON DELETE RESTRICT`. **1 edital → N provas.**

**Relação com `candidatos`** (desde 2026-07-27): `candidatos.edital_id uuid NOT NULL REFERENCES editais(id) ON DELETE RESTRICT`. **1 edital → N inscritos.** São **dois dependentes com RESTRICT**, e o de candidatos é o que mais barra na prática — ver a nota na exclusão, abaixo. O módulo é [`../candidatos/00-modulo.md`](../candidatos/00-modulo.md).

## Permissões

| Operação | RLS |
|---|---|
| SELECT | `USING (true)` — **qualquer autenticado lê** |
| INSERT / UPDATE / DELETE | `has_role(auth.uid(), 'admin')` |

Espelha exatamente a política de `provas`: leitura ampla (a prova precisa exibir o nome do edital para coordenadores), escrita só de admin.

✅ **Isto já foi armadilha, e deixou de ser em 2026-07-25.** Este parágrafo afirmava que `has_role` era match literal sem hierarquia, e que um superadmin sem linha `admin` passaria pelo guard da página mas levaria erro do banco ao salvar. **Era verdade até 25/07**; a migration `20260725195530_superadmin_implica_admin_em_has_role.sql` pôs a implicação `superadmin ⇒ admin` dentro do `has_role`, então RLS e UI voltaram a concordar. Corrigido na auditoria de 2026-07-26.

⚠️ **O que continua valendo é a regra que aquilo ensinou:** papel para **autorizar** sai do `has_role`, nunca de `SELECT` literal em `user_roles` — a hierarquia mora lá dentro. A mesma falha ainda apareceu depois na EF `create-coordenador` (terceira ocorrência, corrigida em 2026-07-26). Ver [`../../transversais/auth-e-permissoes.md`](../../transversais/auth-e-permissoes.md).

A tabela herda os `GRANT`s do `ALTER DEFAULT PRIVILEGES` da migration `20260712010000` — sem eles o PostgREST nem chegaria a avaliar a RLS (ver [`../../transversais/desenvolvimento-local.md`](../../transversais/desenvolvimento-local.md)).

## Regras de negócio

**Quantos inscritos o edital tem — 🔴 não é campo deste módulo (desde 2026-08-02).** O card de `/editais` mostra a **contagem real de `candidatos`** (`useContagemCandidatosPorEdital`), com três textos e nenhum "0": *"Contando inscritos…"* enquanto carrega, *"Nenhum inscrito importado"* sem lista, e *"N inscrito(s) importado(s)"* com lista. O número digitado à mão **saiu do formulário**, e a coluna `n_candidatos` ficou órfã — não foi dropada porque o dump (`seed.local.sql`) e o backfill do `seed.pos.sql` a listam, e dropar quebraria o `db reset` local. A decisão e o seu limite estão em [`../candidatos/00-modulo.md`](../candidatos/00-modulo.md).

**Criação/edição (`EditalDialog`):**
- Só `nome` é obrigatório (`z.string().min(1)`); é `.trim()`ado no submit.
- As duas linhas de cabeçalho **nascem pré-preenchidas com os textos da FEVRE** em edital novo; em edição, carregam o valor salvo. String vazia vira `null`.
- O bloco de cabeçalho traz, na própria UI, a frase que explica o modelo: *"Sugestão herdada ao cadastrar uma prova sob este edital. Cada prova pode ajustar a sua."*

**Erros traduzidos** — os dois casos que o usuário realmente encontra:
- **`23505`** (ou match de `editais_nome_key` na mensagem) → *"Já existe um edital com esse nome."* (`mensagemErroEdital` no hook).
- **`23503`** na exclusão → mensagem acionável em vez de erro cru do Postgres. ⚠️ **Desde 2026-07-27 há DOIS textos, escolhidos pelo nome da constraint na mensagem:** se veio `candidatos_edital_id_fkey`, *"Há candidatos importados neste edital. Remova os inscritos (Candidatos → Limpar edital) antes de excluí-lo."*; caso contrário, *"Há provas vinculadas a este edital…"*. Não volte a um texto só: candidatos é o dependente que mais barra (milhares de inscritos contra poucas provas), e culpar "provas" mandaria o usuário procurar no lugar errado.

**Invalidação de cache:** `update` invalida `["editais"]` **e `["provas"]`**. Necessário porque o nome da prova na UI vem de join com editais — sem isso, renomear um edital deixaria a tela de provas mostrando o nome velho.

## Fronteira do módulo — o que NÃO é daqui

**A herança edital → prova é de UI, e só de UI.** Não há trigger, view nem default no banco que propague valores do edital para a prova.

Ao criar uma prova **nova**, `ProvaDialog.handleEditalChange` copia **as duas linhas de cabeçalho** do edital para os campos do formulário, como **sugestão editável**. A partir do save, `provas.prova_cabecalho_linha1/2` são da prova. Consequências que precisam sobreviver:

- **Editar o cabeçalho de um edital não altera os PDFs de provas já criadas.** É intencional: um documento emitido não deve mudar retroativamente.
- 🔵 **E o vínculo em si não muda mais (`PE001`, 02/08):** o edital de uma prova é escolhido na criação e é **imutável** depois — trigger `check_prova_edital_imutavel`. É a mesma proteção do item acima levada à conclusão: antes, trocar o edital de uma prova antiga deixava o cabeçalho dela apontando para um concurso que não é o dela. A regra mora no módulo Aplicação de Provas; ver [`../aplicacao-provas/provas-e-unidades.md`](../aplicacao-provas/provas-e-unidades.md).
- 🔵 **A alocação NÃO lê mais número digitado (02/08).** Este item dizia *"a alocação lê `prova_n_candidatos`, não `edital.n_candidatos`; não troque a fonte"* — e era um aviso que guardava um defeito: o número da prova dizia **200** onde o edital tinha **7.231** inscritos, e o painel pintava a prova de coberta faltando 7.031 lugares. Hoje `GerenciarProva` conta os inscritos reais do edital da prova. Ver [`../candidatos/00-modulo.md`](../candidatos/00-modulo.md).
- **`n_candidatos` saiu da herança junto com o campo.** Herdar previsão para um número que ninguém lê só espalharia cópia desatualizada. O que se herda hoje é **cabeçalho**, e nada mais.
- **Os PDFs leem o cabeçalho da prova.** O que o PDF pega do edital é **só o nome**, via join `prova.editais.nome` (ver [`../aplicacao-provas/documentos-e-relatorios.md`](../aplicacao-provas/documentos-e-relatorios.md)).

Tudo que consome edital do lado da prova — o seletor no `ProvaDialog`, o join que exibe o nome, o ciclo de vida da prova — pertence ao módulo **Aplicação de Provas**: ver [`../aplicacao-provas/provas-e-unidades.md`](../aplicacao-provas/provas-e-unidades.md).

**Dependência dura na direção contrária:** `ProvaDialog` **bloqueia a criação de prova quando não há nenhum edital cadastrado**, com um link "Cadastrar Edital" para `/editais`. Um coordenador, que não tem acesso a este módulo, não consegue destravar isso sozinho — precisa de um admin.

## Dívida de transição em aberto

**A coluna `provas.prova_edital` (CHAR(30)) ainda existe** e continua sendo escrita pelo `ProvaDialog` como cópia denormalizada (`(edital?.nome ?? "").slice(0, 30)`), só para satisfazer seu `NOT NULL`.

Ela não foi dropada porque o backfill em `supabase/seed.pos.sql` **lê dela** para reconstruir os editais a cada `db reset` do dump do v1 — dropar a coluna quebraria o ambiente local. Consequência a não esquecer: **o nome do edital existe em dois lugares**, e o truncamento em 30 caracteres torna a cópia potencialmente diferente do original. **A fonte de verdade é `edital_id` + join.** Nenhum código novo deve ler `prova_edital`.

Por motivo aparentado, **`edital_id` é `NULLABLE` no banco**: um `NOT NULL` seria validado no instante da migration, antes de o seed rodar o backfill, e quebraria o `db reset`. A obrigatoriedade vive no app (`z.string().min(1, "Selecione um edital")`). Quem for endurecer isso precisa resolver a ordem migration→seed primeiro.
