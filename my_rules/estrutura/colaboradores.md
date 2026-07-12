# Colaboradores

> Ver [`00-indice.md`](./00-indice.md). Não confundir "colaboradores" (a staff sendo gerenciada — fiscais, coordenadores, apoio) com "usuários" (contas com role de sistema — `superadmin`/`admin`/`coordenador`/`user`, tabela `profiles`+`user_roles`, geridas em `/gerenciar-usuarios`). São dois conceitos e duas tabelas diferentes; um colaborador só vira também um "usuário" se explicitamente promovido a coordenador (ver [`auth-e-permissoes.md`](./auth-e-permissoes.md)).

## Entidade `colaboradores`

Ver interface `Colaborador` em `src/hooks/useColaboradores.tsx`. Campos principais: `colab_matricula`, `colab_nome_completo`, `colab_cpf` (chave natural, único), `colab_data_nascimento`, `colab_pis`, endereço (`colab_rua`/`numero_casa`/`bairro`/`cidade`/`cep`/`complemento_endereco`), `colab_estado_civil`/`colab_raca`/`colab_grau_instrucao` (códigos numéricos mapeados em `src/lib/constants.ts`), dados bancários (`codigo_banco`, `agencia`, `agencia_dv`, `conta`, `conta_dv`, `tipo_conta`, `colab_chave_pix`), e credenciais do portal (`colab_codigo_acesso`, `colab_ultimo_acesso`).

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
- **Update é bloqueado se o colaborador estiver logado no portal no momento** — checagem via RPC `is_colaborador_logged_in` antes do update, lançando erro `COLABORADOR_LOGGED_IN` tratado com mensagem amigável. Isso é uma trava deliberada (provavelmente para evitar sobrescrever dados que o colaborador está editando/usando em paralelo), não um bug de concorrência a "consertar".
- **Delete é bloqueado se o colaborador estiver vinculado a alguma prova** (`colaboradores_prova`) — erro `COLABORADOR_VINCULADO_PROVA`. Para excluir, é preciso primeiro desalocar de todas as provas.

## Perfis — dois componentes diferentes, não intercambiáveis

- **`Perfil.tsx`** — perfil do usuário admin (dados de `profiles`, autenticado via `useAuth`).
- **`PerfilColaborador.tsx`** — perfil do colaborador (dados de `colaboradores`, autenticado via `useColaboradorAuth`). Tem timer de inatividade de 5 minutos (`INACTIVITY_TIMEOUT = 5 * 60 * 1000`) que força logout e navega para `/auth` — ver observação de divergência com "15 min" em [`auth-e-permissoes.md`](./auth-e-permissoes.md).

## `GerenciarUsuarios` ≠ gestão de colaboradores

`/gerenciar-usuarios` (`useUsers.tsx`) gerencia contas com role de sistema (`profiles` + `user_roles`), incluindo criação de novos admins/coordenadores via Edge Function `create-admin` e concessão de acesso de coordenador a uma prova. Isso é ortogonal ao cadastro de colaboradores descrito acima — um "usuário" criado ali não aparece na lista de `colaboradores` a menos que também tenha um registro correspondente nessa tabela.
