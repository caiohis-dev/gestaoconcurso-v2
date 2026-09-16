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
| **Quadros III/IV** — títulos por cargo | 002 | fatia 6 |
| **Quadros II/III** — vagas ACS/ACE por UBSF | 004 | fatia 7 |
| **Anexo II** — 963 linhas de ruas por área | 004 | fatia 7 |
| Cronograma | os três | `cronograma_etapas` (fatia 3) |
| Anexo I — conteúdo programático | os três | fatia 10 |

**Nenhuma é de forma livre.** Por isso o artigo `tipo = 'quadro'` só **aponta** (`quadro_fonte`), e a CHECK `chk_edital_item_quadro_fonte` fecha o domínio no banco. Uma grade digitável reintroduziria a classe de defeito que o módulo existe para matar: a *"Certidão Nada Consta do COREN"* exigida de Agente Comunitário de Saúde no Edital 004 é copia-e-cola de tabela.

⚠️ **Tabela nova exige FATIA nova.** `titulos` e `vagas_por_area` já estão no domínio, e o artigo que as referencia pode ser escrito hoje — o linter acusa `quadro-sem-dado` até a fatia existir, e a prévia mostra um bloco visível, nunca um espaço em branco.

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

⚠️ **É a prática da FEVRE medida, não o texto da lei.** Cargo pequeno não reserva vaga nenhuma. Se uma norma exigir piso de 1, muda em `src/lib/edital-cotas.ts` e os 22 valores acusam a diferença.

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

### 🔴 A data de corte da lactante é DERIVADA — e o porquê é um defeito real (fatia 4)

O item 10.10 do **Edital 003/2026 publicado** diz:

> *"desde que o lactente tenha nascido a partir do dia 16 de março de 2026, considerando o limite de até 6 (seis) meses de idade na data de realização da prova **(16 de setembro de 2026)**"*

Mas o cronograma do mesmo edital marca a prova em **20/09/2026**. O 16/09 é a data do **comprovante de local de prova**.

🔴 **Com a prova em 20/09, o corte correto é 20 de março.** Uma candidata cujo bebê nasceu em 18/03 seria recusada por engano — e isso se discute em juízo.

Por isso **não existe coluna `data_limite_nascimento`**: guarda-se `idade_maxima_lactente_meses`, e a data sai da etapa `prova_objetiva` do cronograma, na renderização. Mesmo princípio da numeração de capítulo — **o que é derivado não se persiste, senão envelhece em silêncio**.

⚠️ As **datas de perícia** seguem a mesma lógica pelo outro lado: elas moram no cronograma, como etapa do tipo `ALTERNATIVAS`, e não em `regras_pcd`. Duplicá-las criaria duas fontes.

⚠️ Os presets recomendados (compensação de 30 min, laudo indeterminado das Leis RJ) são **aviso**, nunca trava: o Edital 002 não compensa tempo e é válido. O modelo precisa reproduzir os três editais sem caso especial — e a bateria prova isso.

### 🔵 O cronograma, e as TRÊS formas de data (fatia 3, 2026-09-16)

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

🔵 **A v3 trouxe 159 casos de LÓGICA PURA (2026-09-16),** em oito arquivos: `edital-cotas` (31) · `edital-itens` (29) · `edital-linter` (26) · `edital-numeracao` (20) · `edital-cronograma` (18) · `edital-acoes-afirmativas` (13) · `edital-prova` (13) · `edital-texto` (9).

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
