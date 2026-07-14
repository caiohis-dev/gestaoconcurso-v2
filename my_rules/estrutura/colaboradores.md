# Colaboradores

> Ver [`00-indice.md`](./00-indice.md). Não confundir "colaboradores" (a staff sendo gerenciada — fiscais, coordenadores, apoio) com "usuários" (contas com role de sistema — `superadmin`/`admin`/`coordenador`/`user`, tabela `profiles`+`user_roles`, geridas em `/gerenciar-usuarios`). São dois conceitos e duas tabelas diferentes; um colaborador só vira também um "usuário" se explicitamente promovido a coordenador (ver [`auth-e-permissoes.md`](./auth-e-permissoes.md)).

## Entidade `colaboradores`

Ver interface `Colaborador` em `src/hooks/useColaboradores.tsx`. Campos principais: `colab_matricula`, `colab_nome_completo`, `colab_cpf` (chave natural, único), `colab_data_nascimento`, `colab_pis`, endereço (`colab_rua`/`numero_casa`/`bairro`/`cidade`/`cep`/`complemento_endereco`), `colab_estado_civil`/`colab_raca`/`colab_grau_instrucao` (códigos numéricos mapeados em `src/lib/constants.ts`), dados bancários (`codigo_banco`, `agencia`, `agencia_dv`, `conta`, `conta_dv`, `tipo_conta`, `colab_chave_pix`, `tipo_chave_pix`), e credenciais do portal (`colab_codigo_acesso`, `colab_ultimo_acesso`).

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

**Hoje ela está preenchida em 12 das 771 linhas** — a cúpula (2 admins + 10 coordenadores), que já tinha conta no Auth antes da refatoração e foi vinculada pelo **backfill** do `supabase/seed.pos.sql` (que também lhes concedeu o papel `colaborador`). As outras 759 são NULL e passam a ser preenchidas quando cada colaborador reivindicar o próprio cadastro (etapa 2 da refatoração — ver [`../analises/roadmap-auth-colaborador.md`](../analises/roadmap-auth-colaborador.md)).

**Nenhum código ainda lê ou escreve essa coluna.** Ela é a fundação: é ela que vai permitir que RLS e RPCs resolvam o colaborador por `auth.uid()`, em vez de confiar no `p_colaborador_id` que hoje vem do cliente.

Três decisões embutidas no schema, que valem entender antes de mexer:

- **Nula por padrão, e assim fica.** A premissa não é "todo colaborador vira usuário", e sim "todo colaborador *pode* virar usuário". Quem nunca se cadastrar continua existindo normalmente como linha de dados.
- **`UNIQUE`** impede que uma mesma pessoa acabe dona de dois registros de colaborador (risco real: a base tinha e-mails repetidos entre pares). Como o Postgres admite múltiplos NULLs num `UNIQUE`, isso convive com as 771 linhas não-vinculadas.
- **`ON DELETE SET NULL`**: apagar a conta de acesso **não** apaga a pessoa. A linha de `colaboradores` é o cadastro funcional (dados bancários, alocações, histórico) e sobrevive ao fim do usuário — apenas volta a ficar não-vinculada, e portanto reivindicável de novo. `CASCADE` aqui destruiria folha de pagamento.

Existia também `colaboradores_backup_20260701` (snapshot manual pontual, criado em `20260701211430_adcc92ea-*.sql`) — removida via `DROP TABLE` em `20260711230647_drop_colaboradores_backup_20260701.sql` por não ter mais uso. A migration original que a criava foi mantida (não reescrevemos histórico de migration); a remoção é uma migration nova, então só faz efeito depois que o banco (local ou remoto) rodar essa migration.

## Três fluxos de cadastro

1. **`/cadastro`** (`Cadastro.tsx`) — admin/coordenador logado abre `ColaboradorDialog` diretamente; fecha o dialog → volta para `/`.
2. **`/cadastro-publico`** (`CadastroPublico.tsx`) — fluxo sem login, para o próprio colaborador se auto-cadastrar:
   - Passo 1: informa CPF, que é checado via Edge Function `check-cpf-colaborador` (evita expor a tabela `colaboradores` a uma query pública direta).
   - Se já existe, mostra mensagem orientando a usar "Estou sem meu código" em vez de recadastrar.
   - Se não existe, abre `ColaboradorDialog` em `publicMode` com `initialCpf` pré-preenchido — o insert nesse modo público provavelmente passa pela Edge Function `public-create-colaborador` (valida payload com Zod antes de tocar no banco), não diretamente via `supabase.from('colaboradores').insert`, para não expor a tabela a escrita anônima direta.
3. **`/cadastro-lote`** (`CadastroLote.tsx`) — importação em massa via planilha Excel (`xlsx`/SheetJS), com auto-mapeamento de colunas e sanitização linha a linha **documentados em detalhe em `docs/cadastro-lote-sanitizacao.md`** (raiz do repo) — esse doc específico está atualizado e deve ser a referência ao mexer nesse fluxo, não este arquivo.

## `useColaboradores.tsx` — regras de negócio no CRUD

- Listagem é sensível a role: `admin`/`fetchAll=true` vê todos; `coordenador` vê só os colaboradores retornados pela RPC `get_coordenador_colaboradores` (escopados às suas provas); demais usuários autenticados veem todos em modo leitura.
- **Update é bloqueado se o colaborador estiver logado no portal no momento** — checagem via RPC `is_colaborador_logged_in` antes do update, lançando erro `COLABORADOR_LOGGED_IN`. **Em vias de deixar de funcionar (desde a subetapa 2A, 2026-07-14):** ninguém mais escreve em `colaborador_sessions` (as chamadas de sessão saíram do front), então a função envelhece para sempre e devolve `false` — a trava, na prática, já não bloqueia. A cláusula `AND NOT is_colaborador_logged_in(id)` sai da policy de UPDATE na etapa 3; a proteção contra edição concorrente vira dívida assumida (ver [`../analises/roadmap-auth-colaborador.md`](../analises/roadmap-auth-colaborador.md)). A face de UI dela — a coluna "online" e o trava-seleção na `ColaboradoresList` — **já foi removida na 2A**.
- **Delete é bloqueado se o colaborador estiver vinculado a alguma prova** (`colaboradores_prova`) — erro `COLABORADOR_VINCULADO_PROVA`. Para excluir, é preciso primeiro desalocar de todas as provas.

## Perfis — dois componentes diferentes, não intercambiáveis

- **`Perfil.tsx`** — perfil do usuário admin (dados de `profiles`, autenticado via `useAuth`).
- **`PerfilColaborador.tsx`** — perfil do colaborador (dados de `colaboradores`). Desde a subetapa 2A é autenticado via **`useAuth`** (sessão do Supabase Auth): resolve-se por `isColaborador` + `auth.uid()`, e lê/grava pelas RPCs `get_meu_colaborador` / `update_meu_colaborador` / `update_meus_dados_bancarios`. Tem timer de inatividade de 5 minutos (`INACTIVITY_TIMEOUT`) que força logout. Salvar **não desloga mais** (confirma com toast e mantém a sessão).

## `GerenciarUsuarios` ≠ gestão de colaboradores

`/gerenciar-usuarios` (`useUsers.tsx`) gerencia contas com role de sistema (`profiles` + `user_roles`), incluindo criação de novos admins/coordenadores via Edge Function `create-admin` e concessão de acesso de coordenador a uma prova. Isso é ortogonal ao cadastro de colaboradores descrito acima — um "usuário" criado ali não aparece na lista de `colaboradores` a menos que também tenha um registro correspondente nessa tabela.
