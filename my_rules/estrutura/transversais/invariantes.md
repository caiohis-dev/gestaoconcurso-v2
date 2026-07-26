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

## ⚠️ O que ainda mora SÓ no cliente

Três lacunas achadas na auditoria. Estão no [`../../backlog.md`](../../backlog.md) com medição; aqui fica a forma delas.

### 1. Excluir colaborador — a regra do cliente protege menos que ele pensa

`useColaboradores.deleteMutation` faz `SELECT` em `colaboradores_prova` e recusa se houver vínculo. No banco, **as FKs que apontam para `colaboradores` são CASCADE**: `colaboradores_prova`, `ocorrencias_colaborador` e `email_atualizacao_log`.

Duas consequências, e a segunda é pior:

- Um `DELETE` direto pelo PostgREST **apaga alocações e ocorrências** sem erro.
- O cliente **não checa ocorrências** — só alocação. Um colaborador com histórico de ocorrência mas sem alocação é excluível **pela própria tela**, levando o histórico junto. Medido em 26/07: **18 das 19 ocorrências** do banco pertencem a colaboradores nessa situação.

### 2. Numeração de sala — calculada no cliente, sem unicidade no banco

`useSalasProva.createMultipleMutation` lê o maior `sala_numero` do andar e insere `max + 1`. `sala_prova` **não tem índice único** em `(sala_fk_unidade, sala_numero)`. Duas sessões criando salas ao mesmo tempo produzem números repetidos, e nada acusa. Hoje há 0 duplicatas — é dívida preventiva.

### 3. Vincular unidade a uma prova — três passos sem transação

`useProvaUnidades` insere em `prova_unidades`, lê as salas da unidade e insere em `salas_prova_distribuidas`. Falhar no terceiro passo deixa a **unidade vinculada sem sala nenhuma**, estado que a tela não sabe distinguir de "unidade sem salas cadastradas". `salas_prova_distribuidas` é a única tabela do schema com **zero** unique, zero check e zero trigger.

> Este é o segundo padrão da mesma família: **vários passos sem transação**. Já mordeu na revogação de coordenador (corrigida com RPC em 26/07). O conserto tem a mesma forma: uma função no banco, que roda em transação.

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
