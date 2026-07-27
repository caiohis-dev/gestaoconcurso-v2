# Onde mora cada regra de negócio

> **Documento transversal.** Nasceu da auditoria de 2026-07-26, feita para atacar um padrão em vez de mais um item: **a maior parte dos defeitos achados nos últimos dias tinha a mesma forma — a regra existia só na camada que o usuário vê.**
>
> Leia isto **antes de implementar qualquer regra nova**, e antes de mexer numa existente. A última seção é uma lista de verificação curta; ela é o ponto do documento.

## O padrão, enunciado

Uma regra de negócio implementada só no cliente **não é uma regra, é uma sugestão**. Ela vale para quem passa pela tela e não vale para mais ninguém:

- o **PostgREST** aceita `DELETE`/`PATCH` direto de qualquer admin autenticado, sem passar pelo seu `if`;
- uma **Edge Function** com `service_role` roda **fora da RLS** — e este repo já teve duas fabricando dado que a UI jamais criaria;
- um **script** de manutenção, um `psql`, um seed;
- e a própria tela, quando o estado que ela usa para decidir **ainda não carregou** (o `false` enquanto carrega, que já apareceu três vezes aqui).

O sintoma característico é a **perda silenciosa**: não dá erro, some dado. Foi assim na cascata de funções, na meta órfã e na fabricação de alocação.

### Por que este repo produz esse padrão com frequência

Três razões estruturais, e conhecê-las ajuda a prever onde procurar:

1. **O schema veio do dashboard do Lovable**, onde `ON DELETE CASCADE` é o default confortável. As FKs nasceram **destrutivas por omissão**, não por decisão.
2. **Quase toda escrita é PostgREST direto** — poucos RPCs. Sem função no meio, não há lugar natural para pôr regra, e ela acaba no hook.
3. **A RLS responde "quem pode", não "o que é coerente".** Ela autoriza a operação; não impede que a operação deixe o banco num estado inválido.

## O que o banco JÁ garante (auditado em 2026-07-26)

Não repita esforço: isto está coberto e não precisa de barreira no cliente para existir.

| Garantia | Onde |
|---|---|
| Formatos e faixas: CPF numérico, e-mail, telefone, conta/agência, capacidade, andar, nº de candidatos, ordem de horário | **28 CHECKs**, a maioria do tema de constraints de 25/07 |
| Valor de pagamento e meta **não negativos** | `chk_valor_pagamento_nao_negativo`, `chk_quantidade_meta_nao_negativa` |
| Unicidade: e-mail e chave PIX de colaborador, nome de edital, nome de função, meta por (unidade, função), valor por (prova, função), papel por usuário | índices únicos — vários **funcionais** (`lower(btrim(...))`), de propósito |
| Colaborador só numa unidade por prova | trigger `check_colaborador_prova_unique_trigger` |
| Função do sistema não se exclui, não se renomeia, não vira editável | trigger `check_system_funcao_changes` |
| Função em uso não se exclui | **`ON DELETE RESTRICT`** nas 3 FKs (26/07) |
| Valor não se remove com meta > 0 pendente | trigger `check_valor_sem_meta` (26/07) |
| Revogação de coordenador é atômica | RPC `revogar_coordenador` |
| Hierarquia de papéis (`superadmin ⇒ admin`) | dentro do `has_role` |

## ✅ As três lacunas da auditoria foram fechadas no mesmo dia

Ficam aqui em resumo porque a **forma** de cada conserto é reutilizável; o detalhe está no [`../../backlog.md`](../../backlog.md).

| Lacuna | Conserto | Forma |
|---|---|---|
| Excluir colaborador apagava alocação e ocorrências em cascata — e a **própria UI** permitia, porque checava alocação e não ocorrência | `RESTRICT` nas 3 FKs de participação (`20260726210000`) | FK, quando a dependência é direta |
| Numeração de sala calculada no cliente, sem unicidade | índice único em `(unidade, numero)` e `(prova, unidade, numero)` (`20260726220000`) | UNIQUE **não conserta a corrida — torna-a visível** |
| Vincular/desvincular unidade eram 3 passos soltos | RPCs `vincular_unidade_a_prova` / `desvincular_unidade_da_prova` (`20260726230000`) | RPC, quando são vários passos |

Três lições que valem além dos itens:

1. **A regra do cliente costuma proteger menos do que aparenta.** O pré-check de colaborador cobria alocação e ignorava ocorrência — 18 das 19 ocorrências do banco estavam a um clique de sumir *pela tela*, não por um caminho exótico. Ao auditar uma regra client-side, pergunte **o que ela NÃO cobre**, não só se ela existe.
2. **Pré-check é para ser removido, não estendido.** "Leio e então decido" é uma corrida — o vínculo pode nascer entre o `SELECT` e o `DELETE`. Com a barreira no banco, o pré-check vira código a mais que dá a impressão de garantia.
3. **Ao virar RPC, tire do cliente o que ele não precisa saber.** `desvincular_unidade_da_prova` deriva o `prova_id` da própria linha em vez de recebê-lo: um parâmetro a mais é uma chance de o cliente mandar um valor incoerente e apagar dado de outra prova.

## 🔁 Segunda rodada da auditoria (mesmo dia) — o que a primeira deixou passar

A primeira varredura olhou as FKs **das tabelas que já estavam sob investigação**. A correta é varrer o schema inteiro de uma vez (a segunda consulta em "Como auditar isto de novo"). Refeita assim, apareceram **22 FKs destrutivas**, e três lacunas que a primeira não viu:

| Achado | Decisão (usuário, 26/07) | Como ficou |
|---|---|---|
| **Excluir prova** cascateava para 7 tabelas — 531 alocações, as 19 ocorrências, 17 valores, 172 metas, 42 salas, 10 coordenadores | **Não pode. Nem com senha.** | policy de DELETE removida **+ trigger** `check_prova_nao_excluivel`; sumiu do hook, da página e do card |
| **Excluir unidade do catálogo** cascateava para alocações, metas e ocorrências (as 11 estão em uso; a "ICT" levaria 110 alocações e 10 ocorrências) | **Só se não tiver nenhum uso** | `RESTRICT` em `prova_unidades` e `salas_prova_distribuidas` |
| **Desalocar colaborador**: a guarda de acesso de coordenador é client-side, e a FK é CASCADE | **Bloquear no banco também** | `RESTRICT` em `coordenadores_prova.colaborador_prova_id` (`20260726250000`) |

**Por que o trigger além da policy, no caso da prova:** remover a policy faz a RLS negar por padrão, o que cobre PostgREST e cliente. Não cobre `service_role`, que é como rodam as Edge Functions e passa **por cima** da RLS. Verificado: o `DELETE` como superusuário é recusado pelo trigger.

**O que continua CASCADE de propósito:** `sala_prova → unidades_prova`. As salas cadastradas são parte da unidade, não uso dela; sem isso, nenhuma unidade com sala poderia sair do catálogo. Controle positivo confirmou: unidade nova com uma sala é excluível.

### ⚠️ Dois testes afirmavam cenários impossíveis

Ao trocar as FKs, dois testes existentes caíram e a leitura deles foi instrutiva:

- `useProvas`: *"avisa quando a exclusão esbarra em vínculo"*, com o comentário "caso real: prova com unidades/alocações vinculadas". Aquele `23503` **nunca podia acontecer** — as FKs eram CASCADE, o vínculo não barrava nada.
- `useUnidadesProva`: *"a FK das salas/provas é quem barra"*. Mesma premissa falsa.

Os dois passavam porque **o mock devolvia o erro que o próprio teste mandou devolver**. É um modo de falha específico de suíte com mock: o teste prova o *tratamento* de um erro, não que o erro seja alcançável. Quando o comentário de um teste afirma um comportamento do banco, esse comportamento precisa ser conferido no banco — e é a mesma disciplina do controle positivo, vista do outro lado.

### ⚠️ Um RESTRICT pode criar obstáculo INDIRETO — o caso da desalocação

Ao bloquear a desalocação de quem tem acesso de coordenador, apareceu um efeito que vale como regra geral: **`colaboradores_prova` cascateia de `prova_unidades`**, então o novo RESTRICT também faz **desvincular uma unidade** falhar quando há coordenador alocado nela.

É o comportamento certo — desvincular não deve revogar coordenação em silêncio —, mas o erro chega numa tela em que a pessoa **não estava mexendo com coordenação**, falando de uma tabela que ela não citou. Por isso `useProvaUnidades` ganhou tradutor próprio (`mensagemErroDesvinculoUnidade`), separado do de desalocação.

**A regra que fica:** ao pôr `RESTRICT` numa FK, verifique **quem cascateia para a tabela pai**. Cada cascata que chega ali passa a poder falhar por causa do seu RESTRICT, numa operação que parece não ter relação. Sem tradução nessas telas, o usuário leva um erro incompreensível.

### O que segue morando só no cliente, e é aceito

- **`salas_prova_distribuidas.sala_fiscal_1/2` continua `SET NULL`** — e agora por decisão fechada (26/07), com **aviso na confirmação** em vez de bloqueio. Ver abaixo.
- **A numeração sequencial de salas** continua sendo calculada no cliente. Movê-la para o banco (uma sequence por unidade+andar) foi considerado desproporcional; o UNIQUE já converte o pior caso em erro visível.
- **`email_atualizacao_log` continua CASCADE** ao excluir colaborador — exceção consciente, documentada na migration `20260726210000`: é log de entrega, não histórico de participação, e bloquear ali criaria beco sem saída.

### ✅ Nem toda regra vira barreira — às vezes o defeito é o silêncio, não a ação

Remover um colaborador da unidade esvazia o campo de fiscal da sala em que ele estava (`SET NULL`). Isso está **certo**: quem saiu da unidade não pode ser fiscal nela. O problema era outro — acontecia **em silêncio e em outra tela**, porque a atribuição de fiscal se faz em `/gerenciar-salas-distribuidas` e a remoção em `/gerenciar-colaboradores-prova`. Quem remove tipicamente não sabe que a pessoa era fiscal.

Bloquear resolveria o silêncio, mas obrigaria a passar por duas telas numa operação que costuma ser urgente no dia da prova. A decisão do usuário foi **avisar**: a confirmação passa a dizer *"Fulana está como fiscal da sala 201. Removê-lo desta unidade vai retirá-lo dessa sala automaticamente."*

**A regra que fica:** antes de transformar um achado em barreira, separe **o que a ação faz** do **fato de ela ser invisível**. Quando a ação está correta e só falta transparência, a resposta é informar no ponto da decisão — barrar aí só adiciona atrito sem corrigir nada.

Dois detalhes de implementação que precisam sobreviver:

1. **O botão de confirmar fica desabilitado enquanto a consulta das salas carrega.** Sem isso, a lista chega vazia, o aviso não aparece e a pessoa confirma antes de saber — é a armadilha do **"vazio enquanto carrega"**, que já apareceu três vezes neste repo.
2. **O aviso trata plural.** O banco não impede a mesma pessoa de ser fiscal de duas salas; só a UI de distribuição evita. Confiar nessa UI aqui repetiria exatamente o erro que o aviso existe para corrigir.

## 🔎 RLS: recorte de leitura também é regra — e estava só na UI

Auditoria de 2026-07-26, disparada por uma pergunta: *o coordenador vê só as metas da unidade que coordena?* Na tela, sim. No banco, não.

Quatro tabelas operacionais tinham `SELECT ... USING (true)` — **qualquer autenticado lia tudo**:

| Tabela | Situação |
|---|---|
| `meta_colaboradores_unidade` | ✅ `20260726260000` — recorte por **unidade** |
| `valores_funcao_prova` | ✅ `20260726270000` — recorte por **prova** |
| `colaboradores_prova` | ✅ `20260726270000` — recorte por **prova** |
| `salas_prova_distribuidas` | ✅ `20260726270000` — recorte por **prova** |

Em todas: admin (e superadmin, pela hierarquia dentro do `has_role`) vê tudo; coordenador vê o seu escopo; **qualquer outro autenticado não vê nada**. Medido depois de aplicar: admin 24/554/58/186, coordenador 17/531/42/17, autenticado sem papel 0/0/0/0.

### Por que os níveis de recorte diferem — e por que isso NÃO é descuido

As metas são por **unidade**; as outras três, por **prova**. A razão é concreta: `OcorrenciasProva`, que o coordenador acessa, consulta `colaboradores_prova` filtrando pela **prova inteira**, para montar quem pode receber ocorrência e quem pode substituir. E a RLS de `ocorrencias_colaborador` já era por prova.

Recortar `colaboradores_prova` por unidade criaria um **desencontro**: o coordenador enxergaria a ocorrência de outra unidade e não a alocação por trás dela — a receita do "some o nome na tela". Já as metas não têm nenhum leitor cross-unidade, então lá o recorte mais apertado sai de graça.

**Regra que fica: o nível de recorte se deduz de quem lê, não da simetria.** Uniformizar por estética afrouxa uma tabela ou quebra uma tela.

⏭️ **Apertar as três para unidade é possível**, mas exige antes decidir se o coordenador deve registrar ocorrência de outra unidade da prova dele. É decisão de operação, não de schema.

### Custo: nenhum mensurável

`is_coordenador_prova` é `STABLE`, e o planejador transforma o `EXISTS` de `colaboradores_prova` num *hashed SubPlan* — avaliado uma vez, não por linha. `SELECT *` na tabela inteira como coordenador: **5 ms**, com 23 linhas removidas pelo filtro (as da outra prova).

`ocorrencias_colaborador` já estava correta, recortada por `is_coordenador_prova`.

**O ponto que generaliza:** a lista de verificação deste documento pergunta onde mora a regra de *escrita*. Recorte de **leitura** é regra do mesmo jeito, e some com a mesma facilidade — `GerenciarProva` filtra por `filteredProvaUnidades` e `Provas` passa `allowedProvaUnidadeIds`, mas os dois são conveniência. A pergunta a fazer é a mesma: *o que este usuário lê chamando o PostgREST direto?*

⚠️ **Dois níveis de recorte convivem, e a diferença é real:** metas por **unidade** (`get_coordenador_prova_unidade_ids`), ocorrências por **prova** (`is_coordenador_prova`). Quem for uniformizar precisa decidir o correto para cada tabela — copiar um para o outro afrouxa ou aperta demais.

⚠️ **`has_role(auth.uid(),'admin')` cobre o superadmin** — a hierarquia mora dentro da função (migration `20260725195530`). Nunca escrever `SELECT` literal em `user_roles` numa policy: é a falha que já bloqueou o superadmin três vezes aqui. Verificado nesta migration: superadmin lê as 186.

## ✅ A lista de verificação — use ao criar ou mexer numa regra

Antes de considerar uma regra implementada, responda:

1. **Onde ela mora?** Se a resposta for "num `if` do hook", ela ainda não existe. Pergunte: *o que acontece se alguém fizer isso por `psql`, por PostgREST ou por uma EF com `service_role`?*
2. **Qual camada é a barreira e qual é a conveniência?** As duas são legítimas — o banco recusa, a UI evita que a pessoa chegue lá. **Mas só uma delas pode ser a garantia.** Desabilitar botão é conveniência, sempre.
3. **A regra é de FORMATO ou de INTEGRIDADE?** Formato → `CHECK`. Integridade referencial → FK com `RESTRICT` (nunca CASCADE por omissão). Integridade que **cruza tabelas ou níveis** → trigger, porque FK não expressa. Vários passos → **RPC**, que roda em transação.
4. **A mensagem do banco chega ao usuário?** Uma barreira que devolve erro cru — ou pior, que o cliente troca por um genérico — transfere o problema. Traduza nomeando **o que fazer**. Isto já foi dívida duas vezes aqui.
5. **Você mediu antes de apertar?** Constraint em dado existente falha na carga. Conte as violações primeiro; se houver, o saneamento vem antes e mora no **dump**, não no `seed.pos.sql`.
6. **Tem controle positivo no teste?** Provar que passou a recusar é metade. A outra metade é provar que **continua permitindo o caso legítimo** — foi o controle positivo que pegou a semântica errada (`existe linha` vs `> 0`) na meta órfã.

## Como auditar isto de novo

Duas varreduras, uma de cada lado. **A do banco** acha as tabelas sem rede nenhuma — as que aparecem com `0 | 0 | 0` são onde a regra provavelmente está no cliente:

```sql
select rel.relname as tabela,
       count(*) filter (where i.indisunique and not i.indisprimary) as uniq,
       (select count(*) from pg_constraint c where c.conrelid = rel.oid and c.contype = 'c') as checks,
       (select count(*) from pg_trigger t
         where t.tgrelid = rel.oid and not t.tgisinternal
           and t.tgname not like '%updated_at%') as trig
from pg_class rel
join pg_namespace n on n.oid = rel.relnamespace
left join pg_index i on i.indrelid = rel.oid
where n.nspname = 'public' and rel.relkind = 'r'
group by rel.oid, rel.relname
order by 2, 3, 4;
```

E o inverso, para saber se uma FK protege ou destrói (`c` = CASCADE, `n` = SET NULL, `r` = RESTRICT):

```sql
select cl.relname, con.conname, con.confdeltype
from pg_constraint con
join pg_class cl on cl.oid = con.conrelid
where con.contype = 'f' and con.confrelid = 'public.<tabela>'::regclass;
```

**A do cliente** procura o `if` que finge ser regra: `throw new Error` em hook, `SELECT`-antes-de-gravar (o padrão "checo e então insiro", que além de frágil é uma corrida), `.refine(` em schema, e botão desabilitado por resultado de query.
