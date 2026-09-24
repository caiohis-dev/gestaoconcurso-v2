# Colaboradores

> Documento de área do módulo **Aplicação de Provas** — comece pelo contrato em [`00-modulo.md`](./00-modulo.md). Não confundir "colaboradores" (a staff sendo gerenciada — fiscais, coordenadores, apoio) com "usuários" (contas com role de sistema — `superadmin`/`admin`/`coordenador`/`user`, tabela `profiles`+`user_roles`, geridas em `/gerenciar-usuarios`). São dois conceitos e duas tabelas diferentes; um colaborador só vira também um "usuário" se explicitamente promovido a coordenador (ver [`auth-e-permissoes.md`](../../transversais/auth-e-permissoes.md)).

## Entidade `colaboradores`

Ver interface `Colaborador` em `src/hooks/useColaboradores.tsx`. Campos principais: `colab_matricula`, `colab_nome_completo`, `colab_cpf` (chave natural, único), `colab_data_nascimento`, `colab_pis`, endereço (`colab_rua`/`numero_casa`/`bairro`/`cidade`/`cep`/`complemento_endereco`), `colab_estado_civil`/`colab_raca`/`colab_grau_instrucao` (códigos numéricos mapeados em `src/lib/constants.ts`), dados bancários (`codigo_banco`, `agencia`, `agencia_dv`, `conta`, `conta_dv`, `tipo_conta`, `colab_chave_pix`, `tipo_chave_pix`), e `colab_ultimo_acesso`. **A coluna `colab_codigo_acesso` foi removida na 2D** (migration `20260715131321_*`, junto com o CHECK `colab_codigo_acesso_format`): era a credencial do login por código de 4 dígitos, aposentado em 2A–2C. Não existe mais.

🔵 **`colab_ultimo_acesso` VOLTOU A SER ESCRITA em 2026-09-20** (migration `20260921002249_carimbar_ultimo_acesso_no_login.sql`): o trigger de login `on_auth_user_signin` → `vincular_colaborador_no_signin` passou a carimbar `colab_ultimo_acesso = NEW.last_sign_in_at`, num **bloco `EXCEPTION` próprio** — separado do bloco do vínculo, porque fundi-los faz a exceção do carimbo **desfazer o vínculo junto** (falsificado: é o caso 14 de `docs/bateria-vinculo-colaborador.sql`). ⚠️ **Esta linha dizia que a coluna NÃO TINHA ESCRITOR desde 2026-07-15**, e era verdade: os dois que existiam (`register_colaborador_session` e `update_colaborador_session_activity`, do portal de código de 4 dígitos) foram dropados na migration `20260715125720_*`, a leitura ficou, e ninguém notou porque a coluna continuou existindo **com dado dentro**. Medido em produção em 20/09: das **274** contas vinculadas, **263** haviam entrado de verdade e **as 263** estavam descritas errado — 71 como *"Nunca acessou"*, 192 com data congelada de junho/julho. 🔴 **O PASSADO NÃO FOI CORRIGIDO, por decisão do usuário** — não houve backfill; cada pessoa se corrige sozinha no primeiro login seguinte, e até lá os 192 seguem exibindo a data velha. Ver [`../../../analises/analise-ultimo-acesso-e-convite.md`](../../../analises/analise-ultimo-acesso-e-convite.md).

### Unicidade: CPF, PIS, e — desde 2026-07-14 — e-mail e chave PIX

Além de `colab_cpf` e `colab_pis` (que já eram `UNIQUE` de origem), `colab_email` e `colab_chave_pix` passaram a ser únicos na migration `20260714163506_*`. **Mas não como `UNIQUE (coluna)`:** são **índices funcionais sobre `lower(trim(...))`**.

*Por quê:* um `UNIQUE` comum é sensível a caixa e a espaço, e deixaria conviver `Joao@x.com` com `joao@x.com` — que o Supabase Auth trata como **o mesmo usuário**. Isso reabriria o problema que a limpeza dos e-mails duplicados fechou, já que a reivindicação de cadastro usa o e-mail como prova de identidade. Indexando a forma normalizada, a comparação acontece na hora, sem reescrever o dado gravado: os **12 e-mails com maiúscula continuam como estão**.

> **Atualização de 2026-07-25:** este parágrafo dizia também que "os 22 com espaço em volta continuam gravados como estão". **Não continuam** — foram normalizados com `trim` no dump quando a CHECK `chk_colab_email_formato` entrou (ver [`../../transversais/desenvolvimento-local.md`](../../transversais/desenvolvimento-local.md), correção 3). Hoje são **0** e-mails com espaço sobrando. **As 21 chaves PIX com espaço, essas sim, seguem intactas** — não há constraint de formato sobre elas, e mexer em dado bancário é o item de backlog do saneamento do PIX.

**Múltiplos NULLs seguem permitidos** (`lower(trim(NULL))` é `NULL`, e o Postgres não considera NULLs iguais entre si): os 254 sem e-mail e os 206 sem chave PIX convivem sem conflito.

⚠️ **Não pode existir string vazia nessas colunas.** Duas linhas com `''` colidiriam no índice. Hoje todos os caminhos de escrita convertem `''` em `NULL` — `ColaboradorDialog` e `public-create-colaborador` no código, e a RPC `update_colaborador_data_full` via `NULLIF`. Um caminho novo que grave `''` quebra o salvamento do **segundo** cadastro vazio: converta na origem, não afrouxe o índice.

### Formato: o que o banco passou a exigir (2026-07-25)

Unicidade responde "esse valor já existe?". **Formato** é outra pergunta, e até 2026-07-25 o banco não a fazia. Agora faz — `chk_colab_nome_preenchido`, `chk_colab_cpf_numerico`, `chk_colab_telefone_positivo`, `chk_colab_numero_casa_nao_negativo`, `chk_colab_email_formato` (migration `20260725202722_*`).

⚠️ **O CPF é o caso que mais surpreende:** o Zod usa `.length(11)`, que conta **caracteres**, não dígitos — `'abcdefghijk'` passava na validação do formulário. E a coluna é `CHAR(11)`, que também aceitava. Ou seja, **nem o front nem o banco garantiam que um CPF fosse numérico**. Hoje o banco exige `^[0-9]{11}$`. O dígito verificador continua sem checagem em lugar nenhum — é algoritmo, não formato, e ficou fora de escopo.

O e-mail exige um formato mínimo (`algo@algo.algo`, sem espaços) e **ausência é `NULL`, nunca `''`** — o que conversa com o aviso do índice acima.

### 🔵 `colab_nome_completo` é `text` desde 2026-09-15 — e NÃO tem teto em lugar nenhum

Era `varchar(40)`, herança do schema do dashboard do Lovable. Migration `20260915221737_nome_colaborador_para_text.sql`.

**O que motivou:** medição, não estética. Das 771 linhas, **7 estavam exatamente em 40 caracteres**, e o fim delas denuncia corte no meio da palavra (`…BATISTA DE O`, `…S. F. DE ALM`) ou espaço sobrando (`…ELLO BREVES `). O teto estava perdendo nome de gente — e o `CadastroLote` ainda cortava em silêncio.

⚠️ **O teto saiu de TODOS os caminhos de escrita, de propósito** — não existe mais número 40 em lugar nenhum deste fluxo:

| Onde havia teto | O que ficou |
|---|---|
| a coluna, `varchar(40)` | `text` |
| `ColaboradorDialog` — Zod `.max(40)`, `maxLength={40}`, contador "/40" | só `.min(1)`; sem `maxLength`, sem contador |
| `PerfilColaborador` — `maxLength={40}` e contador (não usa Zod) | nada; quem responde é a CHECK de não-vazio e o `NULLIF(TRIM(...))` da RPC |
| `CadastroLote` — `LIMITES_COLUNAS` + `CAMPOS_TRUNCAR` | a chave saiu das duas: o nome não é truncado nem rejeitado |
| EF `public-create-colaborador` — Zod `.max(40)` | `.min(1)` — **era a única barreira de servidor** |

**Não há CHECK de teto, e é decisão consciente.** Diverge do precedente de `candidatos.n_inscricao` (que virou `text` **+ CHECK nomeada de 12**): lá o teto era regra do edital, aqui nome de pessoa não tem teto natural. As outras colunas de nome do repo — `candidatos.nome`, `cargos.nome`, `editais.nome` — já são `text` sem CHECK. O `maxLength` no input foi recusado justamente porque **corta colagem em silêncio**.

**O que continua valendo:** `NOT NULL` e `chk_colab_nome_preenchido` (`length(trim(...)) > 0`), mais o trigger `tr_uppercase_colab_nome_completo`, que grava tudo em **CAIXA ALTA**. Prova executável em [`../../../../docs/bateria-nome-colaborador-text.sql`](../../../../docs/bateria-nome-colaborador-text.sql) — 6 casos, com **controle positivo** (nome de 100 caracteres entra e volta inteiro), falsificada devolvendo o `varchar(40)` em transação: os controles negativos seguiram passando e só o positivo reprovou.

🔴 **A consequência que sobrou, aceita com o risco à vista:** a folha de assinatura em PDF **corta nome longo em silêncio** — ver [`documentos-e-relatorios.md`](./documentos-e-relatorios.md).

⚠️ **O `CadastroLote` teve de mudar junto, e o motivo importa.** A importação gravava os textos crus da planilha, sem `trim` — e planilha traz espaço nas pontas o tempo todo. Foi assim que os 22 e-mails com espaço entraram. Enquanto não havia constraint, isso era cosmético; com `chk_colab_email_formato`, a **linha inteira falharia na importação**. O `CadastroLote` passou a normalizar todo campo textual (`trim`, e vazio vira `NULL`) e a traduzir violação de CHECK em erro legível ("E-mail com formato inválido" em vez de "Outros"). **Lição para constraint futura:** antes de apertar o banco, olhe quem escreve nele *sem* passar pelo formulário — no caso, a importação em lote e as Edge Functions.

**O que o índice do PIX não resolve (dívida consciente):** a mesma chave escrita em formatos diferentes ainda passa — `127.139.687-47` e `12713968747` são a mesma chave no arranjo do BACEN e valores distintos aqui. Das 565 chaves preenchidas, **94 estão em formatos mistos** (CPF pontuado, telefone com parênteses, espaços internos) e **uma tem 21 dígitos** — não é chave válida de tipo nenhum. Normalizar isso é mexer em dado bancário de 565 pessoas e ficou fora de escopo.

Consequência no app: salvar cadastro agora pode falhar com `23505`. `PerfilColaborador` traduz o erro (mensagem específica para e-mail e para chave PIX) e o `CadastroLote` classifica as linhas recusadas como "E-mail duplicado" / "Chave PIX duplicada".

### `tipo_chave_pix` — nasce vazia, e não por descuido

Também da migration `20260714163506_*`: `text`, anulável, com `CHECK` restrito aos 5 tipos do arranjo PIX — `cpf`, `cnpj`, `email`, `telefone`, `aleatoria`. Texto minúsculo validado por `CHECK`, no mesmo formato que `tipo_conta` (`'corrente'`/`'poupanca'`) já usa nesta tabela, em vez de código numérico com mapa no frontend (o padrão de `colab_estado_civil`/`colab_raca`/`colab_grau_instrucao`).

**Está `NULL` nas 771 linhas, e o preenchimento não deve ser adivinhado.** O tipo **não é inferível** do valor gravado: 397 chaves têm 11 dígitos, e 11 dígitos é ao mesmo tempo o formato de CPF e o de celular com DDD. Cruzando com os dados da própria pessoa, 193 batem com o CPF dela e 188 com o telefone dela — e o restante não bate com nenhum dos dois. **Adivinhar o tipo errado de uma chave PIX é errar o destino de um pagamento**, então a coluna só se preenche quando alguém confirmar o tipo.

Por isso também **não há `CHECK` amarrando "se tem chave, tem tipo"**: isso invalidaria de imediato as 565 linhas que já têm chave e não têm tipo. Essa amarração só pode existir depois que a base estiver preenchida.

### `user_id` — o elo com `auth.users` (novo em 2026-07-14)

Criada pela migration `20260714162029_*`: `user_id uuid`, **`UNIQUE`**, FK para `auth.users(id)` com **`ON DELETE SET NULL`**. Antes dela não havia elo nenhum entre `colaboradores` e `auth.users` — o único vínculo era a coincidência de texto do e-mail.

**Hoje ela está preenchida em 12 das 771 linhas** — a cúpula (2 admins + 10 coordenadores), que já tinha conta no Auth antes da refatoração e foi vinculada pelo **backfill** do `supabase/seed.pos.sql` (que também lhes concedeu o papel `colaborador`). As outras 759 são NULL e passam a ser preenchidas quando cada colaborador reivindicar o próprio cadastro (etapa 2 da refatoração — ver [`../analises/roadmap-auth-colaborador.md`](../../../analises/concluidos/roadmap-auth-colaborador.md)).

**Nenhum código ainda lê ou escreve essa coluna.** Ela é a fundação: é ela que vai permitir que RLS e RPCs resolvam o colaborador por `auth.uid()`, em vez de confiar no `p_colaborador_id` que hoje vem do cliente.

Três decisões embutidas no schema, que valem entender antes de mexer:

- **Nula por padrão, e assim fica.** A premissa não é "todo colaborador vira usuário", e sim "todo colaborador *pode* virar usuário". Quem nunca se cadastrar continua existindo normalmente como linha de dados.
- **`UNIQUE`** impede que uma mesma pessoa acabe dona de dois registros de colaborador (risco real: a base tinha e-mails repetidos entre pares). Como o Postgres admite múltiplos NULLs num `UNIQUE`, isso convive com as 771 linhas não-vinculadas.
- **`ON DELETE SET NULL`**: apagar a conta de acesso **não** apaga a pessoa. A linha de `colaboradores` é o cadastro funcional (dados bancários, alocações, histórico) e sobrevive ao fim do usuário — apenas volta a ficar não-vinculada, e portanto reivindicável de novo. `CASCADE` aqui destruiria folha de pagamento.

Existia também `colaboradores_backup_20260701` (snapshot manual pontual, criado em `20260701211430_adcc92ea-*.sql`) — removida via `DROP TABLE` em `20260711230647_drop_colaboradores_backup_20260701.sql` por não ter mais uso. A migration original que a criava foi mantida (não reescrevemos histórico de migration); a remoção é uma migration nova, então só faz efeito depois que o banco (local ou remoto) rodar essa migration.

## Três fluxos de cadastro

1. **`/cadastro`** (`Cadastro.tsx`) — admin/coordenador logado abre `ColaboradorDialog` diretamente; fecha o dialog → volta para `/`.
2. **`/cadastro-publico`** (`CadastroPublico.tsx`) — fluxo sem login, para o próprio colaborador se auto-cadastrar (reescrito na subetapa 2C):
   - Passo 1: informa CPF, **validado por `cpfValido` ANTES de sair da tela** (🔵 02/08), e então checado via Edge Function `check-cpf-colaborador` (devolve só `{exists}`, sem expor a tabela nem o e-mail). Duas mensagens distintas: *"Digite os 11 dígitos"* para quem não terminou, *"CPF inválido — confira os dígitos"* para quem terminou e errou.
     - ⚠️ **A validação da tela NÃO é barreira** — quem quer sondar chama a EF direto. O ganho é poupar a ida ao servidor e dizer o que corrigir. A barreira é a própria EF, que devolve só o booleano.
     - 🔴 **A EF tinha um defeito real, corrigido em 02/08:** ela fazia `.padStart(11, '0')` **antes** de conferir `length !== 11`, então entrada CURTA nunca falhava — 6 dígitos viravam `00000123456` e ela consultava **o CPF de outra pessoa**. Se esse existisse, o usuário caía no fluxo *"você já tem cadastro"* sobre registro de terceiro. É a mesma classe de defeito que o `cpf.ts` documenta como o bug original do `ColaboradorDialog`.
   - **Se já existe, converge para a reivindicação:** o `ReivindicarAcessoCard` é mostrado ali mesmo, com o CPF pré-preenchido (a pessoa recebe o link no e-mail do cadastro). Não recomeça um cadastro.
   - Se não existe, abre `ColaboradorDialog` em `publicMode`. **Não há mais código de 4 dígitos**; o e-mail é obrigatório. O insert passa pela Edge Function `public-create-colaborador`, que após criar a linha **dispara o link de acesso** para o e-mail via o helper `_shared/enviar-link-acesso.ts` (🔵 `invite` ou `recovery`, conforme o e-mail já ter conta — era invite fixo até 2026-09-19, e quem se cadastrasse com um e-mail que já tinha conta não recebia nada). A conta é vinculada pelos triggers de `auth.users` (ver [`auth-e-permissoes.md`](../../transversais/auth-e-permissoes.md)). O sucesso instrui a pessoa a abrir o e-mail e criar a senha.
3. **`/cadastro-lote`** (`CadastroLote.tsx`) — importação em massa via planilha Excel (`xlsx`/SheetJS), com auto-mapeamento de colunas e sanitização linha a linha detalhados em [`cadastro-lote.md`](./cadastro-lote.md).

   > 🔵 **Corrigido em 2026-07-31.** Este item dizia que aquele doc *"está atualizado e deve ser a referência ao mexer nesse fluxo, **não este arquivo**"* — e ele apontava para `docs/features/`, fora da pasta do módulo. Duas coisas estavam erradas: o doc **não** estava atualizado (cinco afirmações divergiam do código, entre elas negar que o CPF é validado por dígito verificador, o que **este** arquivo já dizia certo na seção de CPF abaixo), e o ponteiro mandava confiar nele em vez do doc do módulo.
   >
   > ⚠️ **A lição, que vale para qualquer referência cruzada:** **um doc não deve atestar que outro está atualizado.** Ele não tem como saber, e a garantia sobrevive à validade do que garante — vira autoridade emprestada a um texto errado.

## `useColaboradores.tsx` — regras de negócio no CRUD

- **Três hooks, com papéis distintos desde 2026-09-10** — e trocar um pelo outro traz de volta o defeito que a separação resolveu:

  | Hook | Quem usa | O que faz |
  |---|---|---|
  | `useBuscarColaboradores` | `/colaboradores` (`ColaboradoresList`) | busca **sob demanda**, paginada, filtro e ordenação no servidor |
  | `useBuscarColaboradoresParaAlocacao` | os pickers de `GerenciarColaboradoresProva` e `OcorrenciasProva` | busca no servidor pela RPC `buscar_colaboradores_para_alocacao`, que já devolve **em que unidade da prova a pessoa está alocada** |
  | `useColaboradoresMutations` | `ColaboradorDialog` | só as escritas, **sem consulta nenhuma** |

  🔵 **`useColaboradores` — a listagem INTEIRA — deixou de existir em 2026-09-12.** Ela baixava todos os colaboradores (com CPF, telefone e chave PIX) para um `<Select>` de nomes, e sem `.range()` batia no teto `max_rows` do PostgREST: **771 linhas contra 1000**, e o corte é silencioso. O ramo `isCoordenador` saiu junto — fazia `get_coordenador_colaboradores` e depois `.in('id', ids)` com a lista inteira na URL. O recorte do coordenador agora é a **RLS**, respeitada porque a RPC nova é `SECURITY INVOKER`.

- 🔴 **`/colaboradores` NÃO carrega nada ao abrir.** A tela exige critério (nome, matrícula ou CPF) e só consulta no clique em **Buscar** — critério vazio é recusado, e a barreira é o `enabled` do hook, não o botão desabilitado. **Medido antes de mudar:** a versão anterior baixava `select('*')` de todos os colaboradores a cada montagem *e a cada volta de foco da janela* (o `QueryClient` do `App.tsx` nasce sem `staleTime`) — **707 kB**, 33 colunas × 771 linhas, incluindo CPF, PIS, agência, conta e chave PIX de todo mundo, para exibir 7 campos. Hoje uma página de 50 custa **13 kB**.

  🔵 **A busca IGNORA ACENTO: "jose" acha "José".** ⚠️ Esta linha já disse o contrário — a busca server-side nasceu sensível a acento, e isso foi corrigido no mesmo dia, a pedido do usuário. **Como funciona, e é um PAR:** a migration `20260911011204` cria `colab_nome_busca`, uma **coluna computada do PostgREST** (função sobre a linha) que devolve o nome em minúsculas e sem acento; `src/lib/texto.ts#removerAcentos` faz o mesmo com o termo digitado. **Mexer num lado sem o outro faz a busca parar de achar, sem erro nenhum** — medido: enviar "josé ribeiro" cru contra a coluna normalizada devolve lista vazia. Há um teste (`src/lib/texto.test.ts`) que lê a migration e compara os dois mapas, falsificado nos dois sentidos.

  **Por que `translate()` e não a extensão `unaccent`:** `unaccent()` não é `IMMUTABLE` e o caminho usual é marcá-la assim à força — afirmação falsa que o planejador passa a acreditar. Aqui não foi preciso: os acentos do domínio são conjunto pequeno e conhecido (medido: `á â ã ç é ê í ó ô õ ú`, em **97 dos 771** nomes), e `translate` + `lower` são imutáveis de verdade.

  **Por que coluna COMPUTADA e não GERADA:** coluna gerada seria indexável, mas acrescentaria coluna a `colaboradores` — e coluna nova toca o **dump**, a parte frágil do repo. A computada não armazena nada. 🔵 **Sem índice, e isso é medição:** 771 linhas em 528 kB, num banco de 14 MB que cabe inteiro nos 224 MB de cache; `ilike '%x%'` não usaria índice btree de qualquer forma.

  ⚠️ **Só o NOME ignora acento.** Matrícula e CPF são comparados como estão — não têm acento, e normalizá-los seria trabalho sem efeito.

  ⚠️ A **ordenação também vai ao servidor** (`.order()` dinâmico + desempate por `id`, e `nullsFirst: false` para "nunca acessou" cair no fim). Ordenar só a página visível pareceria ordenar tudo — e mentiria.

  🔵 **Ordenar por "Último Acesso" voltou a funcionar em 2026-09-20**, quando a coluna ganhou escritor de novo (ver o aviso no topo). ⚠️ Esta linha dizia que a ordenação *"não acha quem nunca entrou"* — valia, e deixou de valer. **Mas só para frente:** quem não logou desde 20/09 ainda ordena pela data velha, porque não houve backfill.

  🔵 **O cabeçalho clicável (seta asc/desc) virou componente compartilhado em 2026-09-24** — `SortableTableHead` (`src/components/SortableTableHead.tsx`), extraído desta tela para `/ocorrencias-prova` também usar. Lá a ordenação é NO CLIENTE (a lista inteira já está carregada, sem paginação) — só o componente visual é compartilhado, não a estratégia de onde ordenar. Ver [`ocorrencias.md`](./ocorrencias.md).

- ⚠️ **O recorte por papel NO CLIENTE não existe mais, e nunca chegou a valer.** Esta linha já disse que *"`coordenador` vê só os colaboradores retornados pela RPC `get_coordenador_colaboradores`"*; depois passou a explicar que o ramo existia mas era curto-circuitado por `fetchAll`. 🔵 **Em 2026-09-12 o ramo inteiro saiu com o hook.** O que vale, e sempre valeu, é a RLS: `admin OR coordenador OR user_id = auth.uid()` — **coordenador vê todos**, decisão do usuário em 2026-09-10. **A barreira real é a policy**, nunca foi o cliente.
- **⛔ Colaborador com histórico não se exclui (2026-07-26).** As FKs que apontavam para `colaboradores` eram CASCADE. O cliente recusava se houvesse alocação — mas **não checava ocorrência**, então quem tinha histórico sem alocação era excluído *pela própria tela*, levando o histórico junto: **18 das 19 ocorrências** do banco estavam nessa situação. `colaboradores_prova`, `ocorrencias_colaborador.colaborador_id` e `.substituto_id` viraram **RESTRICT** (migration `20260726210000`); 553 dos 771 passaram a ser inexcluíveis. O pré-check client-side foi **removido**, não estendido — era "leio e então decido", uma corrida. ⚠️ **Exceção consciente:** `email_atualizacao_log` continua CASCADE — é log de entrega, não histórico de participação, e bloquear ali criaria beco sem saída (não há tela para limpá-lo, e `colaborador_id` é NOT NULL, então SET NULL não era opção). Custo medido: 4 colaboradores.
- **RLS de verdade em `colaboradores` (subetapa 2D, 2026-07-15):** a policy de SELECT deixou de ser `USING (true)`. Agora só **admin/coordenador** (via `has_role`) veem a tabela inteira; **qualquer outra conta autenticada — inclusive um colaborador comum, que desde a 2A loga pelo Auth — vê apenas a própria linha** (`user_id = auth.uid()`), e `anon` não vê nada. Fecha o vazamento em que todo `authenticated` lia as 771 linhas (CPF, PIS, PIX, banco). Migration `20260715073500_rls_colaboradores_por_auth_uid.sql`. O colaborador continua lendo/gravando o próprio cadastro pelas RPCs SECURITY DEFINER (`get_meu_colaborador` etc.), que contornam RLS — então o `/perfil-colaborador` não muda.
- **A trava de edição concorrente foi removida (subetapa 2D, 2026-07-15).** Até então, o UPDATE era bloqueado se o colaborador estivesse "logado no portal", via `AND NOT is_colaborador_logged_in(id)` na policy + um pré-check no `useColaboradores`. O mecanismo já não protegia nada desde a 2A (ninguém mais escrevia em `colaborador_sessions`, então a função devolvia sempre `false`). Migration `20260715130603_*`: recriou a policy de UPDATE **só com `has_role(admin) OR has_role(coordenador)`**, e dropou `is_colaborador_logged_in` e a tabela `colaborador_sessions`. O pré-check saiu do `useColaboradores`. **A proteção contra edição concorrente deixou de existir — é dívida assumida** (last-write-wins; ver [`../analises/roadmap-auth-colaborador.md`](../../../analises/concluidos/roadmap-auth-colaborador.md)). A face de UI dela já saíra na 2A.
- **Delete é bloqueado se o colaborador estiver vinculado a alguma prova** (`colaboradores_prova`) — erro `COLABORADOR_VINCULADO_PROVA`. Para excluir, é preciso primeiro desalocar de todas as provas.
- **`colab_email` não é editável em linha já reivindicada (Etapa 1, 2026-07-16).** O tipo `Colaborador` agora declara **`user_id`** (a coluna já vinha nos `select('*')`; faltava no tipo), e `ColaboradorInsert` a **exclui** — quem preenche `user_id` são os **triggers** de `auth.users` (🔵 dois desde 2026-09-19: `handle_new_user`, no nascimento, e `vincular_colaborador_no_signin`, no login), nunca o cliente. Com `user_id` à mão, o `ColaboradorDialog` trava `colab_email` como read-only quando a linha é vinculada, e o campo sai do payload do update. **Isso não é preciosismo de UI:** em linha vinculada aquele e-mail é o login, e um UPDATE daqui não alcança `auth.users` — editá-lo só dessincroniza. A regra inteira, os três estados e o limite (trava só de UI, sem trigger no banco) estão em [`auth-e-permissoes.md`](../../transversais/auth-e-permissoes.md).
### CPF: validado por dígito verificador desde 2026-07-26

`src/lib/cpf.ts` (`cpfValido`) implementa o módulo 11 — 11 dígitos, blacklist de repetidos, os dois DVs. É o **único** validador de CPF do repo, usado pelo `ColaboradorDialog`, pelo `CadastroLote` e — desde 🔵 **2026-08-02** — pelo `CadastroPublico`, que era a última porta fora dele **e a única aberta ao público**.

⚠️ **A Edge Function `check-cpf-colaborador` NÃO usa `cpfValido`** — ela confere só o tamanho (11 dígitos), do lado do Deno. Duplicar o módulo 11 lá criaria um segundo validador que pode divergir do de `src/lib/`, e o que a EF precisa garantir é não consultar a linha errada, o que o tamanho resolve. Se um dia a validação completa for necessária no servidor, a decisão é **compartilhar o módulo**, não copiá-lo.

🔴 **O defeito do `padStart` sobreviveu em 3 outras Edge Functions até 2026-09-21.** O conserto de 02/08 tocou só a `check-cpf-colaborador`: `reivindicar-acesso`, `incluir-email-cadastro` e `public-create-colaborador` reimplementavam a mesma checagem, cada uma com `padStart(11,'0')` **antes** de conferir o tamanho — exatamente o padrão que preenche entrada curta com zeros até virar o CPF de OUTRA PESSOA. Medido antes do conserto: **275 dos 821 colaboradores (33%) têm CPF começando em zero**, então a colisão não era hipotética.

- **`reivindicar-acesso`** — a mais grave das três: entrada curta encontrava o cadastro de um estranho e **revelava o e-mail mascarado dele**, ou disparava um **invite para a caixa dele**. Bloqueada pelo front (que já exige 11 dígitos antes de chamar a EF), mas a EF é pública e alcançável direto.
- **`incluir-email-cadastro`** — a mais séria: é a porta que **grava** `colab_email` sem prova de posse (dívida já aceita, `dividas-auth-colaborador.md` §5), e a guarda ali era ainda mais fraca — o Zod (`min(11).max(14)`) conta **caracteres da string**, não dígitos, então uma entrada com pontuação e poucos dígitos reais também passava. Medido na população-alvo (sem e-mail, não vinculado): **88 dos 243 (36%)**.
- **`public-create-colaborador`** — risco menor (é `INSERT`, não busca cruzando identidade): CPF errado gravado como se fosse válido, contido pelo índice único (colisão vira `23505`).

**O conserto consolidou as quatro num módulo só**, `supabase/functions/_shared/cpf.ts` (`normalizarCpfOuNull`), com `cpf.test.ts` cobrindo a falsificação exata (entrada curta que o defeito antigo teria transformado no CPF real de um colaborador). Nenhuma das quatro reimplementa a checagem sozinha agora — é a mesma lição do parágrafo acima, aplicada: **compartilhar o módulo, não copiá-lo**, e desta vez para valer nos quatro lugares de uma vez.

⚠️ **A blacklist de repetidos é parte do algoritmo, não zelo extra.** `11111111111` **passa** na aritmética (S₁ = 54 → resto 10 → DV 1 ✓; S₂ = 65 → resto 10 → DV 1 ✓), e `00000000000` também (somas zero → DV 0). Quem implementar de novo sem ela reabre o buraco.

**A ordem importa mais que a regra.** O defeito corrigido não era falta de validação, era **validação tarde demais**: o payload passava por `onlyDigits(...).padStart(11, '0')` **antes** do `parse`, então todo CPF chegava ao Zod com 11 caracteres e o `.length(11)` nunca falhava — `"123456"` virava `00000123456` (o CPF de outra pessoa) e vazio virava `00000000000`. Hoje a checagem roda sobre os **dígitos digitados**. O `padStart` continua onde estava, como rede para CPF legítimo começado em zero.

**Na edição, só valida se o CPF mudou** — decisão de 2026-07-26. Dos 771 cadastros, **16 têm CPF inválido de origem** (14 DV errado, 2 repetidos); validar sempre impediria corrigir telefone ou e-mail deles. Alterar o CPF, aí sim, exige válido. Saneamento e eventual CHECK no banco são item do [`backlog.md`](../../../backlog.md).

### Por que o aviso do cadastro público mora DENTRO do diálogo

Ele já foi uma camada `fixed` renderizada **fora** do portal do Radix, e aquilo custou dois bugs:

1. **Visual:** o `DialogContent` do Radix vive num portal anexado ao `body`, *depois* daquele nó no DOM. Com z-index igual (`z-50`), o dialog pintava por cima e engolia o aviso — daí o `z-[60]`. E um dialog modal põe `pointer-events: none` no `<body>`, então só a camada dele recebia clique — daí o `pointer-events-auto`. **Só um dos dois dá bug pior que nenhum.**
2. **Acessibilidade (achado em 2026-07-26):** um dialog modal marca todo conteúdo **irmão** com `aria-hidden="true"`. O aviso ficava invisível para leitor de tela — a mensagem mais importante do fluxo público, num diálogo que no `publicMode` **não se deixa fechar**.

**A saída foi substituição, não empilhamento:** com `submitStatus` preenchido, o conteúdo do diálogo passa a ser o aviso e o formulário sai de cena. Dentro do portal, não há z-index a vencer nem `aria-hidden` a sofrer. **Não devolva o aviso para fora do portal** — os dois problemas voltam juntos.

🧪 **O `ColaboradorDialog` tem bateria de interação desde 2026-07-26** (24 testes), cobrindo os três comportamentos que só existem na tela: a **âncora de identidade** (linha vinculada tem `colab_email` somente-leitura e ele **sai do payload** do update), o **modo público** (fala direto com a EF, não se deixa fechar por Esc, e traduz "CPF já cadastrado"/"e-mail em uso") e a **normalização** do que é enviado. Os dois defeitos que saíram dali — o `padStart` do CPF rodando antes da validação e o aviso `aria-hidden` — **foram corrigidos no mesmo dia**, e estão explicados nas duas seções acima.

- **Quando o e-mail está errado e a pessoa nunca entrou, a saída é a EF `corrigir-email-acesso` (Etapa 2, 2026-07-16).** Um link sob o campo travado abre o `CorrigirEmailAcessoDialog`, que **renomeia** a conta pendente no Auth (não a apaga — apagar perderia papéis e perfil por CASCADE) e alinha `colab_email` + `profiles.email`. Só vale para conta **não-confirmada**; se já foi confirmada, recusa. Ver [`auth-e-permissoes.md`](../../transversais/auth-e-permissoes.md).

  🧪 **Coberto desde 2026-07-26** por `CorrigirEmailAcessoDialog.ui.test.tsx` (16 testes), que fixa a máquina de três estados — **A** (sem conta: edite no cadastro), **B** (pendente: o único corrigível, com o campo pré-preenchido pelo `colab_email` quando os dois divergem) e **C** (confirmada: a UI não oferece caminho nenhum). Vale lembrar que a recusa real é do servidor: o front **nunca lê o Auth**, e a EF responde 409 mesmo se alguém forçar a chamada.

  ⚠️ **Um defeito achado ali:** a EF recusa com **409/400** e o motivo no corpo, mas o diálogo faz `data?.error || <genérica>` — e em resposta não-2xx o `data` é `null`. As mensagens da EF (as mais bem escritas do repo) **nunca chegam ao usuário**, inclusive no caso provável de o e-mail já pertencer a outro cadastro. O `CoordenadoresProvaDialog` já desembrulha `error.context.body`; item no [`backlog.md`](../../../backlog.md) para extrair isso num helper compartilhado.
- 🔴 **Um escritor NOVO de `colab_email` nasceu em 2026-09-19: a própria pessoa.** A EF pública `incluir-email-cadastro` grava o e-mail num cadastro que está **sem e-mail** e **não vinculado**, pedindo só **CPF + e-mail**. É a saída dos 243 que antes dependiam do coordenador — e é **fragilidade aceita por decisão**, com trilha (`log_email_autoinformado`) e aviso aos admins como única detecção. Todas as guardas moram na RPC `registrar_email_do_proprio_cadastro`. ⚠️ Ver [`../../../analises/dividas-auth-colaborador.md`](../../../analises/dividas-auth-colaborador.md) §5 antes de mexer.
- 🔵 **O terceiro escritor de `colab_email` DEIXOU DE EXISTIR em 2026-09-12.** Era a Edge Function **`create-coordenador`**, que gravava a coluna ao criar a conta do coordenador — só quando nula (`.is("colab_email", null)`), o que a mantinha consistente com a regra. A EF inteira foi removida: o acesso de coordenador passou a usar a conta que o colaborador já tem, e nada no fluxo de coordenação escreve `colab_email`. ⚠️ Ela gravava o e-mail **depois** de criar a conta, então o `handle_new_user` não casava nada e a linha ficava vinculada a nada — ver [`../../transversais/auth-e-permissoes.md`](../../transversais/auth-e-permissoes.md).

## Perfis — dois componentes diferentes, não intercambiáveis

- **`Perfil.tsx`** — perfil do usuário admin (dados de `profiles`, autenticado via `useAuth`).
- **`PerfilColaborador.tsx`** — perfil do colaborador (dados de `colaboradores`). Desde a subetapa 2A é autenticado via **`useAuth`** (sessão do Supabase Auth): resolve-se por `isColaborador` + `auth.uid()`, e lê/grava pelas RPCs `get_meu_colaborador` / `update_meu_colaborador` / `update_meus_dados_bancarios`. Tem timer de inatividade de 5 minutos (`INACTIVITY_TIMEOUT`) que força logout. Salvar **não desloga mais** (confirma com toast e mantém a sessão). **Desde a Etapa 1 (2026-07-16), `colab_email` é read-only aqui — sempre**, porque quem abre esta página está logado e sua linha é, por definição, vinculada; a chamada da RPC ainda passa `p_email`, mas reescrevendo o valor carregado (no-op). Ver [`auth-e-permissoes.md`](../../transversais/auth-e-permissoes.md).

### Quem chega em cada um — e a troca de senha (2026-09-18)

**`/perfil-colaborador` deixou de ser tela de exceção e virou a porta de entrada da maioria.** Desde 18/09 todo colaborador **sem papel de gestão que abra porta** é mandado para lá no login (e devolvido para lá se digitar `/`): são **40 das 53 contas** com o papel, medido. Antes a condição era `role === null`, inalcançável — elas caíam no hub vazio. Ver [`auth-e-permissoes.md`](../../transversais/auth-e-permissoes.md).

Duas consequências que moram nesta página:

- 🔴 **Ela ganhou o card de troca de senha** (`AlterarSenhaCard`, o mesmo do `/perfil`). Sem ele a mudança seria regressão: a página **não monta o `Layout`**, logo não tem o menu do usuário nem o link "Alterar Cadastro" — que era como essas 40 pessoas trocavam a senha logadas. ⚠️ Ao mexer no chrome próprio desta página, lembre que ele é a única navegação que essa pessoa tem.
- 🔴 **O ramo "cadastro não localizado" era um beco sem saída** — só o texto "Dados não encontrados.", sem header e sem "Sair", e `/auth` rebate quem está logado: a única saída era o timeout de 5 min. Cai nele quem tem o papel `colaborador` **sem linha em `colaboradores`** (1 conta em 53). Hoje tem header, "Sair" e nomeia a providência. **A causa-raiz continua aberta:** o papel sobrevive à exclusão da linha e nada o revoga — está no backlog.

## `GerenciarUsuarios` ≠ gestão de colaboradores

`/gerenciar-usuarios` (`useUsers.tsx`) gerencia contas com role de sistema (`profiles` + `user_roles`). **Não concede mais acesso de coordenador** (saiu em 2026-07-26, dos dois lados): a coluna Coordenador é somente leitura, e conceder é exclusivo do `CoordenadoresProvaDialog`, que exige alocação real na prova.

🔵 **Deixou de ser ortogonal em 2026-09-24.** Esta seção dizia que a tela criava admins "via `create-admin`" e que um usuário criado ali não aparecia em `colaboradores`. Hoje a conta de sistema **nasce de colaborador**: o diálogo "Conceder acesso" escolhe um cadastro desta tabela e chama a EF `conceder-papel-sistema`, que usa o `colab_email` dele — convite se não houver conta, só o papel se houver. Colaborador **sem e-mail** aparece desabilitado: o e-mail tem de entrar no cadastro antes (por `/colaboradores` ou pela própria pessoa em `/auth`). Ver [`auth-e-permissoes.md`](../../transversais/auth-e-permissoes.md).
