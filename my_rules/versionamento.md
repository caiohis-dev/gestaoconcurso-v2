# Versionamento — Regras de Git

Regras de trabalho com git neste repositório, adotadas em 2026-07-12, quando o projeto passou a ser versionado e o desenvolvimento da **versão 2** começou.

Contexto importante: o código da v1 rodou em produção por meses **sem nenhum versionamento** — o repositório foi criado só agora. O primeiro commit congela esse estado.

---

## Branch base

A branch base é **`main`**. Ela deve estar sempre em estado consistente (buildando, sem migration pela metade).

⚠️ **`main` não é a fonte do que está no ar.** Hoje o deploy ainda sai da plataforma Lovable (`Share → Publish`), não do git — ver o item de migração de hospedagem no [`backlog.md`](./backlog.md). Enquanto isso não mudar, um commit em `main` **não** significa que a mudança está em produção, e o que está em produção pode divergir do que está aqui.

## Tags e versões

Versionamento semântico, com prefixo `v`:

- **`v1.0.0`** — o commit inicial, feito em 2026-07-12. É o ponto de retorno nomeado para "o começo do histórico", mas leia a ressalva abaixo antes de tratá-lo como "o que estava no ar".

  ⚠️ **`v1.0.0` não é um retrato fiel da produção da v1**, e nenhum commit pode ser. O git só foi adotado depois de duas limpezas irreversíveis já terem acontecido no disco: a remoção do Lovable (11/07) e a remoção do n8n (11/07, que levou junto o fluxo de recuperação de senha do admin). Esses arquivos não existem mais e não são recuperáveis. Além disso, o commit inicial já carrega a **fundação da v2** (as regras em `my_rules/`, os guardrails `prod:*`, as migrations de GRANT e dos cargos básicos, o `config.toml` de local). Ou seja: `v1.0.0` é *"a v1 já limpa, com a v2 engatilhada"* — não o binário que rodou em produção.
- **`v2.x.y`** — a v2 em diante. `MAJOR` para quebra de compatibilidade (schema/contrato), `MINOR` para funcionalidade nova, `PATCH` para correção.

Crie a tag no commit que efetivamente entrega a versão, com mensagem: `git tag -a v2.1.0 -m "..."`.

**A tag é o gatilho do banco de produção.** Combinado em 2026-07-12: o banco de produção só é atualizado em **versões estáveis** — nunca a cada migration ou a cada merge em `main`. Entre releases, as migrations se acumulam em `main` e o schema de produção fica deliberadamente atrás do local. Por isso **código e migration da mesma versão sobem juntos**: nunca publique o frontend de uma versão cujo schema ainda não subiu. O roteiro está em [`banco-producao.md`](./banco-producao.md).

## Mensagens de commit

**Conventional Commits, com a descrição em português.**

```
<tipo>(<escopo opcional>): <descrição no imperativo, minúscula, sem ponto final>

<corpo opcional: o porquê da mudança, não o que ela faz — isso o diff já mostra>
```

Tipos em uso:

| Tipo | Quando |
|---|---|
| `feat` | funcionalidade nova para o usuário |
| `fix` | correção de bug |
| `refactor` | mudança de código sem alterar comportamento |
| `docs` | só documentação (inclui `my_rules/`) |
| `chore` | build, dependências, configuração, tooling |
| `db` | migration nova (ver a seção de migrations abaixo) |

O escopo, quando existir, é o domínio — os mesmos nomes de [`estrutura/`](./estrutura/): `ocorrencias`, `colaboradores`, `provas`, `alocacao`, `auth`, `documentos`.

Exemplos reais do que vem por aí:

```
feat(ocorrencias): refatora diálogo de nova ocorrência para wizard
fix(ocorrencias): remove vínculo em colaboradores_prova ao marcar falta
db: concede privilégios de tabela aos roles da API
chore: migra hospedagem do Lovable para build estático
```

## Branches de trabalho

Branches **curtas**, criadas a partir de `main` e mescladas de volta assim que a mudança estiver pronta e verificada. Nomeie com o mesmo tipo do commit: `feat/wizard-ocorrencias`, `fix/falta-colaborador`, `db/reconciliacao-prod`.

Trabalho de uma sessão que já nasce pronto pode ir direto em `main` — o objetivo da branch é isolar mudança que fica dias em aberto ou que pode não dar certo, não criar cerimônia.

## Migrations — a regra inegociável

**Nunca edite uma migration já aplicada.** Mudança de schema é sempre um **arquivo novo** em `supabase/migrations/` (gere o nome com `npx supabase migration new <slug>`, que já cuida do timestamp).

Isso vale inclusive para desfazer algo: para remover uma tabela criada por uma migration antiga, escreva uma migration nova com `DROP` — não apague nem edite o `CREATE` original. Qualquer banco que já aplicou o arquivo antigo (produção, a máquina de outra pessoa) não vai reaplicar a versão editada, e o histórico deixa de reproduzir o schema.

Precedente no repo: `20260711230647_drop_colaboradores_backup_20260701.sql` removeu uma tabela sem tocar na migration que a criou.

Uma ressalva que este projeto já pagou caro: **as migrations não reproduzem fielmente a produção** — o schema de prod foi construído pelo dashboard do Lovable, então existe drift (ver `estrutura/desenvolvimento-local.md`). "Funciona em produção" é evidência *fraca* de que as migrations estão corretas.

## O que nunca é versionado

As regras estão no [`.gitignore`](../.gitignore); o motivo está aqui, porque o custo de errar é alto:

- **Segredos.** Qualquer `.env*` (exceto os templates `.env.example`). As chaves do Supabase de produção vivem nesses arquivos.
- **Dados reais.** `supabase/seed.local.sql` e qualquer `seed_*.sql`, `*.dump`, `*.sql.gz` carregam o dump de produção — CPF, PIS, conta bancária, chave PIX de colaboradores reais e hashes de senha. **Um vazamento desses é incidente de dados pessoais, não um deslize de repositório.** O banco local, por conter esses dados, merece o mesmo cuidado que produção.
- **Estado local.** `node_modules`, `dist`, `supabase/.temp`, `supabase/.branches`, `.claude/settings.local.json`.

Antes de um commit grande, vale um `git status --short` de conferência — e desconfie de qualquer arquivo que você não reconheça.

## Documentação anda junto com o código

Mudança que toca um domínio atualiza o `estrutura/*.md` correspondente **no mesmo commit** — não em um commit `docs:` posterior, que na prática nunca vem. A documentação em [`estrutura/`](./estrutura/) é a fonte canônica da arquitetura; se ela mente, ela vira dívida.

Trabalho concluído sai do [`backlog.md`](./backlog.md) (que é uma lista *futura*; o histórico do que foi feito vive no git e nos docs de estrutura).
