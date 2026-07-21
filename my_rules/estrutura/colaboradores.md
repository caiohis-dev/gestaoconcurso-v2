# Colaboradores

> Ver [`00-indice.md`](./00-indice.md). Não confundir "colaboradores" (a staff sendo gerenciada — fiscais, coordenadores, apoio) com "usuários" (contas com role de sistema — `superadmin`/`admin`/`coordenador`/`user`, tabela `profiles`+`user_roles`, geridas em `/gerenciar-usuarios`). São dois conceitos e duas tabelas diferentes; um colaborador só vira também um "usuário" se explicitamente promovido a coordenador (ver [`auth-e-permissoes.md`](./auth-e-permissoes.md)).

## Entidade `colaboradores`

Ver interface `Colaborador` em `src/hooks/useColaboradores.tsx`. Campos principais: `colab_matricula`, `colab_nome_completo`, `colab_cpf` (chave natural, único), `colab_data_nascimento`, `colab_pis`, endereço (`colab_rua`/`numero_casa`/`bairro`/`cidade`/`cep`/`complemento_endereco`), `colab_estado_civil`/`colab_raca`/`colab_grau_instrucao` (códigos numéricos mapeados em `src/lib/constants.ts`), dados bancários (`codigo_banco`, `agencia`, `agencia_dv`, `conta`, `conta_dv`, `tipo_conta`, `colab_chave_pix`, `tipo_chave_pix`), e `colab_ultimo_acesso`. **A coluna `colab_codigo_acesso` foi removida na 2D** (migration `20260715131321_*`, junto com o CHECK `colab_codigo_acesso_format`): era a credencial do login por código de 4 dígitos, aposentado em 2A–2C. Não existe mais.

### Unicidade: CPF, PIS, e — desde 2026-07-14 — e-mail e chave PIX

Além de `colab_cpf` e `colab_pis` (que já eram `UNIQUE` de origem), `colab_email` e `colab_chave_pix` passaram a ser únicos na migration `20260714163506_*`. **Mas não como `UNIQUE (coluna)`:** são **índices funcionais sobre `lower(trim(...))`**.

*Por quê:* um `UNIQUE` comum é sensível a caixa e a espaço, e deixaria conviver `Joao@x.com` com `joao@x.com` — que o Supabase Auth trata como **o mesmo usuário**. Isso reabriria o problema que a limpeza dos e-mails duplicados fechou, já que a reivindicação de cadastro usa o e-mail como prova de identidade. Indexando a forma normalizada, a comparação acontece na hora, e os **12 e-mails gravados com maiúscula e os 22 com espaço em volta continuam gravados como estão** — nenhum dado foi reescrito.

**Múltiplos NULLs seguem permitidos** (`lower(trim(NULL))` é `NULL`, e o Postgres não considera NULLs iguais entre si): os 254 sem e-mail e os 206 sem chave PIX convivem sem conflito.

⚠️ **Não pode existir string vazia nessas colunas.** Duas linhas com `''` colidiriam no índice. Hoje todos os caminhos de escrita convertem `''` em `NULL` — `ColaboradorDialog` e `public-create-colaborador` no código, e a RPC `update_colaborador_data_full` via `NULLIF`. Um caminho novo que grave `''` quebra o salvamento do **segundo** cadastro vazio: converta na origem, não afrouxe o índice.

**O que o índice do PIX não resolve (dívida consciente):** a mesma chave escrita em formatos diferentes ainda passa — `127.139.687-47` e `12713968747` são a mesma chave no arranjo do BACEN e valores distintos aqui. Das 565 chaves preenchidas, **94 estão em formatos mistos** (CPF pontuado, telefone com parênteses, espaços internos) e **uma tem 21 dígitos** — não é chave válida de tipo nenhum. Normalizar isso é mexer em dado bancário de 565 pessoas e ficou fora de escopo.

Consequência no app: salvar cadastro agora pode falhar com `23505`. `PerfilColaborador` traduz o erro (mensagem específica para e-mail e para chave PIX) e o `CadastroLote` classifica as linhas recusadas como "E-mail duplicado" / "Chave PIX duplicada".

### `tipo_chave_pix` — nasce vazia, e não por descuido

Também da migration `20260714163506_*`: `text`, anulável, com `CHECK` restrito aos 5 tipos do arranjo PIX — `cpf`, `cnpj`, `email`, `telefone`, `aleatoria`. Texto minúsculo validado por `CHECK`, no mesmo formato que `tipo_conta` (`'corrente'`/`'poupanca'`) já usa nesta tabela, em vez de código numérico com mapa no frontend (o padrão de `colab_estado_civil`/`colab_raca`/`colab_grau_instrucao`).

**Está `NULL` nas 771 linhas, e o preenchimento não deve ser adivinhado.** O tipo **não é inferível** do valor gravado: 397 chaves têm 11 dígitos, e 11 dígitos é ao mesmo tempo o formato de CPF e o de celular com DDD. Cruzando com os dados da própria pessoa, 193 batem com o CPF dela e 188 com o telefone dela — e o restante não bate com nenhum dos dois. **Adivinhar o tipo errado de uma chave PIX é errar o destino de um pagamento**, então a coluna só se preenche quando alguém confirmar o tipo.

Por isso também **não há `CHECK` amarrando "se tem chave, tem tipo"**: isso invalidaria de imediato as 565 linhas que já têm chave e não têm tipo. Essa amarração só pode existir depois que a base estiver preenchida.

### `user_id` — o elo com `auth.users` (novo em 2026-07-14)

Criada pela migration `20260714162029_*`: `user_id uuid`, **`UNIQUE`**, FK para `auth.users(id)` com **`ON DELETE SET NULL`**. Antes dela não havia elo nenhum entre `colaboradores` e `auth.users` — o único vínculo era a coincidência de texto do e-mail.

**Hoje ela está preenchida em 12 das 771 linhas** — a cúpula (2 admins + 10 coordenadores), que já tinha conta no Auth antes da refatoração e foi vinculada pelo **backfill** do `supabase/seed.pos.sql` (que também lhes concedeu o papel `colaborador`). As outras 759 são NULL e passam a ser preenchidas quando cada colaborador reivindicar o próprio cadastro (etapa 2 da refatoração — ver [`../analises/roadmap-auth-colaborador.md`](../analises/concluidos/roadmap-auth-colaborador.md)).

**Nenhum código ainda lê ou escreve essa coluna.** Ela é a fundação: é ela que vai permitir que RLS e RPCs resolvam o colaborador por `auth.uid()`, em vez de confiar no `p_colaborador_id` que hoje vem do cliente.

Três decisões embutidas no schema, que valem entender antes de mexer:

- **Nula por padrão, e assim fica.** A premissa não é "todo colaborador vira usuário", e sim "todo colaborador *pode* virar usuário". Quem nunca se cadastrar continua existindo normalmente como linha de dados.
- **`UNIQUE`** impede que uma mesma pessoa acabe dona de dois registros de colaborador (risco real: a base tinha e-mails repetidos entre pares). Como o Postgres admite múltiplos NULLs num `UNIQUE`, isso convive com as 771 linhas não-vinculadas.
- **`ON DELETE SET NULL`**: apagar a conta de acesso **não** apaga a pessoa. A linha de `colaboradores` é o cadastro funcional (dados bancários, alocações, histórico) e sobrevive ao fim do usuário — apenas volta a ficar não-vinculada, e portanto reivindicável de novo. `CASCADE` aqui destruiria folha de pagamento.

Existia também `colaboradores_backup_20260701` (snapshot manual pontual, criado em `20260701211430_adcc92ea-*.sql`) — removida via `DROP TABLE` em `20260711230647_drop_colaboradores_backup_20260701.sql` por não ter mais uso. A migration original que a criava foi mantida (não reescrevemos histórico de migration); a remoção é uma migration nova, então só faz efeito depois que o banco (local ou remoto) rodar essa migration.

## Três fluxos de cadastro

1. **`/cadastro`** (`Cadastro.tsx`) — admin/coordenador logado abre `ColaboradorDialog` diretamente; fecha o dialog → volta para `/`.
2. **`/cadastro-publico`** (`CadastroPublico.tsx`) — fluxo sem login, para o próprio colaborador se auto-cadastrar (reescrito na subetapa 2C):
   - Passo 1: informa CPF, checado via Edge Function `check-cpf-colaborador` (devolve só `{exists}`, sem expor a tabela nem o e-mail).
   - **Se já existe, converge para a reivindicação:** o `ReivindicarAcessoCard` é mostrado ali mesmo, com o CPF pré-preenchido (a pessoa recebe o link no e-mail do cadastro). Não recomeça um cadastro.
   - Se não existe, abre `ColaboradorDialog` em `publicMode`. **Não há mais código de 4 dígitos**; o e-mail é obrigatório. O insert passa pela Edge Function `public-create-colaborador`, que após criar a linha **dispara o link de acesso** (invite) para o e-mail via o helper `_shared/enviar-link-acesso.ts`. A conta é vinculada pelo trigger `handle_new_user` (ver [`auth-e-permissoes.md`](./auth-e-permissoes.md)). O sucesso instrui a pessoa a abrir o e-mail e criar a senha.
3. **`/cadastro-lote`** (`CadastroLote.tsx`) — importação em massa via planilha Excel (`xlsx`/SheetJS), com auto-mapeamento de colunas e sanitização linha a linha **documentados em detalhe em `docs/features/cadastro-lote-sanitizacao.md`** — esse doc específico está atualizado e deve ser a referência ao mexer nesse fluxo, não este arquivo.

## `useColaboradores.tsx` — regras de negócio no CRUD

- Listagem é sensível a role: `admin`/`fetchAll=true` vê todos; `coordenador` vê só os colaboradores retornados pela RPC `get_coordenador_colaboradores` (escopados às suas provas). **Esse recorte é client-side; a barreira real é a RLS** (abaixo).
- **RLS de verdade em `colaboradores` (subetapa 2D, 2026-07-15):** a policy de SELECT deixou de ser `USING (true)`. Agora só **admin/coordenador** (via `has_role`) veem a tabela inteira; **qualquer outra conta autenticada — inclusive um colaborador comum, que desde a 2A loga pelo Auth — vê apenas a própria linha** (`user_id = auth.uid()`), e `anon` não vê nada. Fecha o vazamento em que todo `authenticated` lia as 771 linhas (CPF, PIS, PIX, banco). Migration `20260715073500_rls_colaboradores_por_auth_uid.sql`. O colaborador continua lendo/gravando o próprio cadastro pelas RPCs SECURITY DEFINER (`get_meu_colaborador` etc.), que contornam RLS — então o `/perfil-colaborador` não muda.
- **A trava de edição concorrente foi removida (subetapa 2D, 2026-07-15).** Até então, o UPDATE era bloqueado se o colaborador estivesse "logado no portal", via `AND NOT is_colaborador_logged_in(id)` na policy + um pré-check no `useColaboradores`. O mecanismo já não protegia nada desde a 2A (ninguém mais escrevia em `colaborador_sessions`, então a função devolvia sempre `false`). Migration `20260715130603_*`: recriou a policy de UPDATE **só com `has_role(admin) OR has_role(coordenador)`**, e dropou `is_colaborador_logged_in` e a tabela `colaborador_sessions`. O pré-check saiu do `useColaboradores`. **A proteção contra edição concorrente deixou de existir — é dívida assumida** (last-write-wins; ver [`../analises/roadmap-auth-colaborador.md`](../analises/concluidos/roadmap-auth-colaborador.md)). A face de UI dela já saíra na 2A.
- **Delete é bloqueado se o colaborador estiver vinculado a alguma prova** (`colaboradores_prova`) — erro `COLABORADOR_VINCULADO_PROVA`. Para excluir, é preciso primeiro desalocar de todas as provas.
- **`colab_email` não é editável em linha já reivindicada (Etapa 1, 2026-07-16).** O tipo `Colaborador` agora declara **`user_id`** (a coluna já vinha nos `select('*')`; faltava no tipo), e `ColaboradorInsert` a **exclui** — quem preenche `user_id` é o trigger `handle_new_user`, nunca o cliente. Com `user_id` à mão, o `ColaboradorDialog` trava `colab_email` como read-only quando a linha é vinculada, e o campo sai do payload do update. **Isso não é preciosismo de UI:** em linha vinculada aquele e-mail é o login, e um UPDATE daqui não alcança `auth.users` — editá-lo só dessincroniza. A regra inteira, os três estados e o limite (trava só de UI, sem trigger no banco) estão em [`auth-e-permissoes.md`](./auth-e-permissoes.md).
- **Quando o e-mail está errado e a pessoa nunca entrou, a saída é a EF `corrigir-email-acesso` (Etapa 2, 2026-07-16).** Um link sob o campo travado abre o `CorrigirEmailAcessoDialog`, que **renomeia** a conta pendente no Auth (não a apaga — apagar perderia papéis e perfil por CASCADE) e alinha `colab_email` + `profiles.email`. Só vale para conta **não-confirmada**; se já foi confirmada, recusa. Ver [`auth-e-permissoes.md`](./auth-e-permissoes.md).
- **Terceiro escritor de `colab_email`, fácil de esquecer:** a Edge Function **`create-coordenador`** também grava a coluna, mas **só quando ela é nula** (`.is("colab_email", null)`) — ou seja, só alcança linha do estado A, o que é consistente com a regra. Um caminho novo que remova essa guarda reabriria a dessincronia.

## Perfis — dois componentes diferentes, não intercambiáveis

- **`Perfil.tsx`** — perfil do usuário admin (dados de `profiles`, autenticado via `useAuth`).
- **`PerfilColaborador.tsx`** — perfil do colaborador (dados de `colaboradores`). Desde a subetapa 2A é autenticado via **`useAuth`** (sessão do Supabase Auth): resolve-se por `isColaborador` + `auth.uid()`, e lê/grava pelas RPCs `get_meu_colaborador` / `update_meu_colaborador` / `update_meus_dados_bancarios`. Tem timer de inatividade de 5 minutos (`INACTIVITY_TIMEOUT`) que força logout. Salvar **não desloga mais** (confirma com toast e mantém a sessão). **Desde a Etapa 1 (2026-07-16), `colab_email` é read-only aqui — sempre**, porque quem abre esta página está logado e sua linha é, por definição, vinculada; a chamada da RPC ainda passa `p_email`, mas reescrevendo o valor carregado (no-op). Ver [`auth-e-permissoes.md`](./auth-e-permissoes.md).

## `GerenciarUsuarios` ≠ gestão de colaboradores

`/gerenciar-usuarios` (`useUsers.tsx`) gerencia contas com role de sistema (`profiles` + `user_roles`), incluindo criação de novos admins/coordenadores via Edge Function `create-admin` e concessão de acesso de coordenador a uma prova. Isso é ortogonal ao cadastro de colaboradores descrito acima — um "usuário" criado ali não aparece na lista de `colaboradores` a menos que também tenha um registro correspondente nessa tabela.
