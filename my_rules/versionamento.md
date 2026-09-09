# Versionamento — Regras de Git

Regras de trabalho com git neste repositório, adotadas em 2026-07-12, quando o projeto passou a ser versionado e o desenvolvimento da **versão 2** começou.

Contexto importante: o código da v1 rodou em produção por meses **sem nenhum versionamento** — o repositório foi criado só agora. O primeiro commit congela esse estado.

---

## Branches base — `main` e `dev`

Duas branches de vida longa, com papéis diferentes. Combinado em 2026-07-13.

**`main` é o estado publicado.** Ela recebe `dev` de uma vez no dia de uma subida, junto com o push do banco e a tag. Nenhuma branch de tema é mesclada em `main` no meio do caminho.

> 🔵 **O congelamento ACABOU em 2026-09-09.** Esta linha dizia que `main` ficava *"congelada em `v1.0.0`, e só volta a se mover no dia da subida da v2"*. `main` está em **`v2.0.0`**.
>
> ⚠️ **Mas leia como aconteceu, porque não foi como esta página descrevia** — e é isso que explica por que ela envelheceu: **o site subiu antes, a partir da `dev`.** `fevre.online` está no ar desde **13/08**, publicado de um build da `dev`, com a `main` intocada no commit inicial e 205 commits atrás. O ritual "merge + push do banco + tag, no mesmo evento" **não ocorreu naquele dia**. A `main` só alcançou a `dev` em **09/09**, quando as duas migrations do keep-alive foram para produção — e a tag `v2.0.0` nasceu aí, retroativamente, marcando o primeiro momento em que código e schema de produção coincidiram.
>
> **A lição, que vale mais que a correção:** a regra descrevia um evento único e a prática o partiu em três, com quase um mês entre as pontas. Se voltar a acontecer, **a doc é que está errada** — não force o ritual só para honrá-la.

**`dev` é a branch de integração** e a base do dia a dia. É de `dev` que saem as branches de tema e é para `dev` que elas voltam. Ela deve estar sempre em estado consistente (buildando, sem migration pela metade) — é ela que faz o papel que `main` normalmente faria.

```
                         site no ar (13/08)      main alcanca dev (09/09)
                         a partir da DEV                    │
main   ──●(v1.0.0)──────────────────────────────────────────●(v2.0.0)
           \                                               /
dev         ●──●──●──●──●──●──●──●──●──●──●──●──●──●──●──●──●──●──●──●
             \    /       \  /       \  /                      (segue a frente:
feat/*        ●──●         ●●          ●●                       so documentacao)
```

**Por que a `main` ficou congelada tanto tempo:** a v2 subiria como um bloco — banco novo, frontend novo, hospedagem nova (ver [`banco-producao.md`](./banco-producao.md)). Não existia subida incremental enquanto essa fundação não estivesse no ar, então `main` avançar a cada merge não significaria nada, e apagaria a única coisa que ela então significava: o retrato do que rodou (a v1).

**O que cada uma responde agora:** `main` volta a responder *"o que está publicado"* e `dev`, *"onde o trabalho está"*. É normal e esperado que `dev` fique à frente — o que **não** pode é `dev` ter migration ou mudança de frontend que produção não tenha, sem que isso vire uma subida consciente.

> 🔵 **Corrigido em 2026-09-09.** Aqui havia um ⚠️ afirmando: *"Hoje nenhuma das duas é a fonte do que está no ar — o site da v1 saiu do ar em 2026-07-12 e não há deploy ativo em lugar nenhum."* **Deixou de valer em 13/08**, quando `fevre.online` entrou no ar. Era exatamente o caso que o `CLAUDE.md` descreve: **aviso envelhecido é pior que aviso nenhum**, porque tem autoridade — este mandava tratar como "sem deploy" um sistema que já servia gente de verdade.

## Tags e versões

Versionamento semântico, com prefixo `v`:

- **`v1.0.0`** — o commit inicial, feito em 2026-07-12. É o ponto de retorno nomeado para "o começo do histórico", mas leia a ressalva abaixo antes de tratá-lo como "o que estava no ar".

  ⚠️ **`v1.0.0` não é um retrato fiel da produção da v1**, e nenhum commit pode ser. O git só foi adotado depois de duas limpezas irreversíveis já terem acontecido no disco: a remoção do Lovable (11/07) e a remoção do n8n (11/07, que levou junto o fluxo de recuperação de senha do admin). Esses arquivos não existem mais e não são recuperáveis. Além disso, o commit inicial já carrega a **fundação da v2** (as regras em `my_rules/`, os guardrails `prod:*`, as migrations de GRANT e dos cargos básicos, o `config.toml` de local). Ou seja: `v1.0.0` é *"a v1 já limpa, com a v2 engatilhada"* — não o binário que rodou em produção.
- **`v2.x.y`** — a v2 em diante. `MAJOR` para quebra de compatibilidade (schema/contrato), `MINOR` para funcionalidade nova, `PATCH` para correção.

  **`v2.0.0` nasceu em 2026-09-09**, no commit `e36fd87`, quando `main` alcançou `dev` e as duas migrations do keep-alive foram para produção. Não existe tag em `dev`.

  ⚠️ **A tag NÃO marca o dia em que o sistema foi ao ar.** O site subiu em 13/08, da `dev`, quase um mês antes. `v2.0.0` marca o primeiro momento em que **código, schema de produção e `main` coincidiram** — que é o que a tag precisa significar para servir de ponto de retorno. Quem procurar "o commit que foi ao ar em agosto" não vai achar tag nenhuma, e isso é fato, não descuido.

Crie a tag no commit que efetivamente entrega a versão, com mensagem: `git tag -a v2.1.0 -m "..."`.

**A tag é o gatilho do banco de produção.** Combinado em 2026-07-12: o banco de produção só é atualizado em **versões estáveis** — nunca a cada migration ou a cada merge. Entre releases, as migrations se acumulam em **`dev`** e o schema de produção fica deliberadamente atrás do local. Por isso **código e migration da mesma versão sobem juntos**: nunca publique o frontend de uma versão cujo schema ainda não subiu. O roteiro está em [`banco-producao.md`](./banco-producao.md).

> 🔴 **Corrigido em 2026-09-09: esta frase dizia que as migrations se acumulam em `main`.** Nunca foi verdade — elas se acumulam em **`dev`**, como o [`CLAUDE.md`](../CLAUDE.md) §6 e o [`banco-producao.md`](./banco-producao.md) sempre disseram, e como a prática confirma (`main` passou 205 commits parada enquanto as migrations entravam em `dev`). É o segundo tipo de erro que o `CLAUDE.md` manda distinguir: não é *"era verdade e mudou"*, é *"nunca chegou a ser verdade"* — e esse é o que faz alguém mesclar em `main` para "acumular migration lá".

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
| `test` | testes automatizados (Vitest + React Testing Library) |
| `db` | migration nova (ver a seção de migrations abaixo) |

O escopo, quando existir, é o **módulo** ou o **domínio** — os mesmos nomes de [`estrutura/`](./estrutura/). Módulos: `editais`, e as áreas de Aplicação de Provas (`colaboradores`, `provas`, `alocacao`, `ocorrencias`, `documentos`). Transversais: `auth`, `arquitetura`, `local`.

Exemplos reais do que vem por aí:

```
feat(ocorrencias): refatora diálogo de nova ocorrência para wizard
fix(ocorrencias): remove vínculo em colaboradores_prova ao marcar falta
db: concede privilégios de tabela aos roles da API
chore: migra hospedagem do Lovable para build estático
```

## Branches de trabalho

Branches **curtas**, criadas a partir de **`dev`** e mescladas de volta **em `dev`** assim que a mudança estiver pronta e verificada — nunca em `main`. Nomeie com o mesmo tipo do commit: `feat/wizard-ocorrencias`, `fix/falta-colaborador`, `db/reconciliacao-prod`.

Trabalho de uma sessão que já nasce pronto pode ir direto em `dev` — o objetivo da branch é isolar mudança que fica dias em aberto ou que pode não dar certo, não criar cerimônia.

A regra prática, se houver dúvida: **`git checkout main` só acontece no dia de uma subida.** Em qualquer outro dia, sair de uma branch de tema significa voltar para `dev`.

💡 **E talvez nem no dia da subida.** Em 09/09 a `main` foi avançada **sem checkout**, com `git fetch . dev:main` — porque a árvore tinha 19 arquivos com alteração pendente, e trocar de branch com trabalho solto é onde se perde coisa. O `fetch` só atualiza a referência: **recusa** se não for fast-forward (ao contrário de `git branch -f`, que sobrescreveria calado) e não encosta na árvore de trabalho.

## Migrations — a regra inegociável

**Nunca edite uma migration já aplicada.** Mudança de schema é sempre um **arquivo novo** em `supabase/migrations/` (gere o nome com `npx supabase migration new <slug>`, que já cuida do timestamp).

Isso vale inclusive para desfazer algo: para remover uma tabela criada por uma migration antiga, escreva uma migration nova com `DROP` — não apague nem edite o `CREATE` original. Qualquer banco que já aplicou o arquivo antigo (produção, a máquina de outra pessoa) não vai reaplicar a versão editada, e o histórico deixa de reproduzir o schema.

Precedente no repo: `20260711230647_drop_colaboradores_backup_20260701.sql` removeu uma tabela sem tocar na migration que a criou.

🔵 **A ressalva do drift DEIXOU DE VALER para a produção da v2 (corrigido em 2026-09-09).** Aqui se lia: *"as migrations não reproduzem fielmente a produção — o schema de prod foi construído pelo dashboard do Lovable, então existe drift. 'Funciona em produção' é evidência fraca de que as migrations estão corretas."*

Isso descrevia o projeto da era Lovable (`dqslqfzqukcahogkieet`), que está congelado e fora do caminho. **A produção da v2 (`zugigdpuxbpogoepdawm`) nasceu de `db push` das 122 migrations** e teve o dado conferido por controle positivo de 12 contagens — não há drift a suspeitar nela. Confirmado de novo em 09/09: o `prod:push:dry` listou **exatamente** as 2 migrations pendentes, nem uma a mais, que é o que se espera de um banco reproduzido pelas migrations.

⚠️ **O que continua verdade** é a origem do *schema* — ele veio do dashboard, e é daí que vêm os `CASCADE` por omissão (ver `CLAUDE.md` §2). E segue valendo, por outro motivo, que **"funciona em produção" não prova que a migration está correta**: a suíte mocka o Supabase e não exercita RLS, GRANT, constraint nem trigger. Quem prova isso é o `db reset` do zero mais bateria SQL.

## O que nunca é versionado

As regras estão no [`.gitignore`](../.gitignore); o motivo está aqui, porque o custo de errar é alto:

- **Segredos.** Qualquer `.env*` (exceto os templates `.env.example`). As chaves do Supabase de produção vivem nesses arquivos.
- **Dados reais.** `supabase/seed.local.sql` e qualquer `seed_*.sql`, `*.dump`, `*.sql.gz` carregam o dump de produção — CPF, PIS, conta bancária, chave PIX de colaboradores reais e hashes de senha. **Um vazamento desses é incidente de dados pessoais, não um deslize de repositório.** O banco local, por conter esses dados, merece o mesmo cuidado que produção.
- **Estado local.** `node_modules`, `dist`, `supabase/.temp`, `supabase/.branches`, `.claude/settings.local.json`.

Antes de um commit grande, vale um `git status --short` de conferência — e desconfie de qualquer arquivo que você não reconheça.

## Documentação anda junto com o código

Mudança que toca um domínio atualiza o `estrutura/*.md` correspondente **no mesmo commit** — não em um commit `docs:` posterior, que na prática nunca vem. A documentação em [`estrutura/`](./estrutura/) é a fonte canônica da arquitetura; se ela mente, ela vira dívida.

Trabalho concluído sai do [`backlog.md`](./backlog.md) (que é uma lista *futura*; o histórico do que foi feito vive no git e nos docs de estrutura).
