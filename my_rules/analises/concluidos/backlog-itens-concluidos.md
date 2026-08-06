# Itens CONCLUÍDOS do backlog — histórico

> 📁 **HISTÓRICO — não leia por padrão.** Este arquivo registra um tema já entregue.
> Abra só quando o pedido for sobre o passado (*por que ficou assim? o que se tentou?
> que alternativa foi rejeitada?*). **Não é plano** — nada aqui é lista de tarefas.
> Para o que o sistema É, veja `my_rules/estrutura/`; para o que FALTA, `my_rules/backlog.md`.

> **Isto NÃO é um plano.** É o registro dos temas já entregues, movido de
> [`../../backlog.md`](../../backlog.md) em **2026-07-31**, quando os blocos fechados
> passaram a ocupar **496 das 757 linhas** dele (65%) e o arquivo deixou de responder de
> relance "o que falta". O cabeçalho do backlog sempre mandou removê-los; o que faltava
> era uma casa. Esta pasta já era essa casa para roadmaps — ver
> [`../README.md`](../README.md).

## Por que nada foi resumido na mudança

Os blocos vieram **na íntegra**. O que eles guardam não é "o que foi feito" — isso o
código e o git contam melhor. É **o que foi medido, a premissa que estava errada e o
que a decisão custou**, e é a parte que não se recupera lendo o repo depois.

⚠️ **Ao ler qualquer bloco daqui, valem os dois avisos do [`README.md`](./README.md) da
pasta:** distinga *"era verdade e mudou"* de *"nunca chegou a ser verdade"*, e trate
número escrito como ordem de grandeza — contagem envelhece mais rápido que o resto.

🔴 **O padrão que mais se repete aqui, e o motivo de guardar tudo:** **item de backlog
carrega premissa errada.** Aconteceu quatro vezes — guards lendo papéis de `modulos.ts`
(afrouxaria o acesso), papel `coordenador` sem vínculo ser "inofensivo", "dois
`useEffect`" que eram três, e `anon` "cair em default deny" quando 8 policies o deixavam
ler dado real. **Conferir a premissa no código antes de executar o item é obrigatório.**

---

## ✅ CONCLUÍDO 2026-07-26 — a fabricação de alocação falsa foi apagada por inteiro

**Área:** Alocação e Funções / Autenticação. Registro mantido no backlog porque **deixou uma decisão de operação em aberto** (no fim desta seção) e porque a verificação não é automatizável.

### O que era

`coordenadores_prova.colaborador_prova_id` é `NOT NULL`. Para conceder acesso de coordenador a quem não estava alocado, o código pegava **um colaborador arbitrário** (`.limit(1)`, sem ordenação) e criava uma linha em `colaboradores_prova` — a tabela de alocação real, base de relatório e pagamento — sem função e sem valor. Dado inventado indistinguível do verdadeiro.

Havia **duas cópias**, e as duas caíram no mesmo dia:

1. `useUsers.addCoordenadorAccess`, junto com a concessão pela UI de `/gerenciar-usuarios` — o papel deixou o enum do `createUserSchema`, o campo "Prova do Coordenador" e o Switch da tabela sumiram. A coluna Coordenador virou **somente leitura**. Conceder e revogar são agora exclusivos do `CoordenadoresProvaDialog`, que exige alocação elegível.
2. `createCoordenadorAccess`, na EF `create-admin`, que roda com `service_role` fora da RLS. Saiu com o ramo que a chamava e com o `provaId` do corpo — que `useUsers.createUser` também não manda mais.

**Revogação conferida antes de remover o Switch:** o `deleteMutation` do `useCoordenadoresProva` apaga o vínculo e, se era o último, remove o papel — ninguém fica com papel irrevogável.

### ⚠️ A premissa que este item trazia estava errada — vale guardar

Este backlog afirmava que conceder o papel `coordenador` **sem** vínculo de prova era *inofensivo*, porque `is_coordenador_prova` lê `coordenadores_prova` e não `user_roles`. **É falso para o front:** o `RequireAcesso` deriva `isCoordenador` de `user_roles`, então quem recebesse só o papel **passaria pelos guards** das rotas de coordenação e entraria — para ver listas vazias, porque as consultas se apoiam na outra tabela. Meio-usuário: exatamente o que levou alguém a fabricar alocação para evitá-lo.

Por isso a EF **recusa** `role: "coordenador"` com **400** e mensagem apontando o fluxo da prova, em vez de aceitar e ignorar. E recusa explícita, não rebaixamento silencioso para `user`: cair no `else` do `validRoles` criaria a conta com papel errado sem sinal nenhum.

É a segunda vez que um item deste backlog carrega premissa errada sobre autorização — a primeira foi a proposta de os guards lerem papéis de `src/lib/modulos.ts`, que teria **afrouxado** o acesso. **Conferir a premissa no código antes de executar o item continua sendo obrigatório.**

### 🔴 Não há teste guardando isto — a verificação é manual

O teste `⚠️ DEFEITO` que acusava a fabricação vivia em `useUsers.test.tsx` e **saiu junto com o hook**; era a última marca dessas no repo. A EF roda em Deno, fora do alcance do Vitest. Ficou um aviso no lugar do bloco removido.

**Quem mexer na `create-admin` refaz esta verificação à mão** (foi assim que esta entrega foi conferida, contra o runtime local, com JWT de superadmin assinado com o `JWT_SECRET` do `supabase status`):

| Corpo | Esperado | Obtido em 26/07 |
|---|---|---|
| `role: "coordenador"` **com** `provaId` | 400, mensagem do fluxo da prova | ✅ |
| `role: "coordenador"` **sem** `provaId` | 400, mesma mensagem | ✅ |
| `role: "admin"` | 200, papel gravado | ✅ |
| sem `Authorization` | 401 (o portão de 25/07 segue de pé) | ✅ |

E as contagens de `colaboradores_prova` / `coordenadores_prova` **iguais antes e depois** (554 / 9 em 26/07). É essa **igualdade** que prova que nada foi fabricado — não o status HTTP, e não o número em si.

> ⚠️ **Medido de novo em 2026-07-30, depois de um `db reset`: 554 / 10.** As 10 linhas são todas de 2026-06-26, com e-mails reais do dump, e nenhuma foi criada pelos testes — não é resíduo. Não sei dizer se o `9` estava errado ou se o dump foi reexportado desde então, e **não vale investigar**: o que a verificação prova é a igualdade antes/depois, não o valor absoluto. Fica como exemplo da regra da casa — **contagem escrita envelhece; confira na hora**.

> Observação colhida na verificação, **não é defeito deste item**: a conta criada pela EF termina com **dois** papéis, `user` (do trigger `handle_new_user`) e o pedido. Comportamento antigo, sem efeito prático porque `has_role` é por papel — mas quem for contar papéis por usuário precisa saber.

### ⏭️ Decisão de operação que segue em aberto

**Criar um coordenador passou de 1 para 3 passos:** criar a conta → alocar na prova com função de coordenação → conceder no diálogo. É mais correto (não inventa alocação), mas é mais trabalho no dia da prova. **Vale confirmar na operação** — se não for aceitável, a saída mais honesta é tornar `coordenadores_prova.colaborador_prova_id` **nullable**, que era o conserto de modelagem descartado no começo, e não voltar a fabricar linha.

---

## ✅ CONCLUÍDO 2026-07-26 — as três regras que moravam só no cliente foram para o banco

**Área:** transversal (ver [`estrutura/transversais/invariantes.md`](./estrutura/transversais/invariantes.md), que traz o mapa e a lista de verificação)

A auditoria do padrão **"regra implementada só na camada que o usuário vê"** varreu as 19 tabelas e os hooks. As três lacunas achadas foram fechadas no mesmo dia, na ordem pedida.

### 1. Excluir colaborador com histórico — impossível (migration `20260726210000`)

As FKs para `colaboradores` eram CASCADE. **O agravante não era o PostgREST, era a UI:** o cliente checava alocação e não checava ocorrência, então quem tinha histórico sem alocação era excluído pela tela levando o histórico junto — **18 das 19 ocorrências** do banco estavam nessa situação.

`colaboradores_prova`, `ocorrencias_colaborador.colaborador_id` e `ocorrencias_colaborador.substituto_id` viraram **RESTRICT**. O `substituto_id` entrou de propósito: ser citado como substituto é histórico, e deixá-lo em `SET NULL` reproduziria o mesmo defeito em miniatura.

⚠️ **Exceção consciente:** `email_atualizacao_log` **continua CASCADE**. É log operacional de entrega, não histórico de participação, e bloquear por causa dele criaria beco sem saída — não há tela para limpá-lo, e `colaborador_id` é NOT NULL, então `SET NULL` não era opção. Custo medido: 4 colaboradores.

**O pré-check client-side foi removido**, não estendido: era "leio e então decido", uma corrida, e a mensagem do banco nomeia o obstáculo melhor do que ele conseguia. 553 dos 771 passaram a ser inexcluíveis.

### 2. Numeração de sala (migration `20260726220000`)

Índice único em `sala_prova (sala_fk_unidade, sala_numero)` e em `salas_prova_distribuidas (prova_id, sala_fk_unidade, sala_numero)` — esta era a única tabela do schema com zero unique, zero check e zero trigger.

**O índice não conserta a corrida, torna-a visível:** a numeração continua sendo calculada no cliente (lê o maior, insere max+1), mas duas sessões simultâneas agora colidem com 23505 em vez de criarem duas salas 203. O tradutor cobre os dois caminhos com saídas diferentes — na criação, repetir resolve; na edição, é preciso escolher outro número.

### 3. Vincular/desvincular unidade (migration `20260726230000`)

Viraram as RPCs `vincular_unidade_a_prova` e `desvincular_unidade_da_prova`. **As duas operações tinham o defeito**, não só a de vincular: remover apagava as salas antes do vínculo, e falhar no fim deixava o mesmo estado corrompido — vínculo vivo, zero salas, indistinguível na tela de "unidade sem salas cadastradas".

`prova_id` **não é parâmetro** do desvincular: sai da própria linha, para o cliente não poder mandar um que não corresponde ao vínculo e apagar salas de outra prova.

### Como foram verificadas

Todas contra o banco real, com `ROLLBACK`, e **todas com controle positivo** — provar que passou a recusar é metade:

| Regra | Recusa | Controle positivo |
|---|---|---|
| Colaborador | alocação ✓, ocorrência ✓, substituto ✓ (caso construído, pois não existe isolado no dado) | sem histórico → `DELETE 1` |
| Sala | mesmo número na mesma unidade ✓ | mesmo número em **outra** unidade → passa |
| Unidade | — | 16 salas copiadas, e desvincular zera as duas tabelas |

A **atomicidade** da RPC foi provada sabotando a cópia com um `CHECK ... NOT VALID` (que só vale para linhas novas) e confirmando que o vínculo não sobra. Foi essa a falha exata que produzia o estado corrompido.

> **Seis testes caíram de propósito**, dois deles marcados `⚠️ ATENÇÃO` — eles *afirmavam* a não-atomicidade ("o vínculo fica sem as salas se a cópia falhar"). Eram a testemunha do defeito; viraram o oposto, garantindo que a RPC seja usada. A atomicidade em si não é testável no Vitest, porque o mock não tem transação.

---

## ✅ CONCLUÍDO 2026-07-26 — segunda e terceira rodadas da auditoria de invariantes

**Área:** transversal (ver [`estrutura/transversais/invariantes.md`](./estrutura/transversais/invariantes.md))

Depois de fechar as três primeiras lacunas, a auditoria foi refeita **sobre o schema inteiro** (a primeira só olhara as FKs das tabelas sob investigação) e depois estendida à **leitura**. Saldo:

| Decisão do usuário | Como ficou |
|---|---|
| **Prova não se exclui. Nem com senha.** | policy de DELETE removida **+** trigger `check_prova_nao_excluivel` (pega `service_role`, que passa por cima da RLS). Sumiu do hook, da página e do card |
| **Unidade só se exclui sem nenhum uso** | `RESTRICT` em `prova_unidades` e `salas_prova_distribuidas`; `sala_prova` segue CASCADE (as salas são parte da unidade) |
| **Desalocar quem tem coordenação: bloquear no banco** | `RESTRICT` em `coordenadores_prova.colaborador_prova_id`; pré-check removido |
| **Fiscal de sala: avisar, não bloquear** | aviso na confirmação de remoção, com o número da sala |
| **Recorte de leitura por RLS** | 4 tabelas saíram de `USING (true)` |

### ⏭️ O que ficou decidido em aberto

1. **Apertar as três tabelas de `USING (true)` para recorte por UNIDADE** (hoje são por prova). Exige antes decidir **se o coordenador deve registrar ocorrência de outra unidade da prova dele** — é decisão de operação, não de schema. Hoje `OcorrenciasProva` lê a prova inteira e a RLS de ocorrências é por prova; igualar sem essa decisão cria desencontro ou afrouxa.
2. **Prova criada por engano não tem como ser apagada.** Se incomodar na operação, a saída é um conceito de *arquivada/cancelada* — **não** reabrir o DELETE.

### 🔴 Nada disso tem teste automatizado

A suíte mocka o Supabase: não exercita RLS, constraint, trigger nem transação. Tudo foi verificado à mão contra o banco local, com `ROLLBACK` e **controle positivo** em cada caso. As consultas de auditoria e as tabelas de resultado esperado estão em [`estrutura/transversais/invariantes.md`](./estrutura/transversais/invariantes.md). **Quem mexer nessas regras refaz a verificação manualmente.**

---

## ❌ FORA DO BACKLOG 2026-07-26 — os CPFs inválidos são trabalho do coordenador

**Decisão do usuário:** o coordenador resolve. Não é trabalho de código e não fica na fila de implementação.

Dos **771** CPFs cadastrados, **16** não passam na validação de dígito verificador (14 com DV errado, 2 formados por dígitos repetidos) — medido em 2026-07-26. Não dá para corrigir por algoritmo: CPF errado é o CPF de outra pessoa.

**O que continua valendo, e é a razão de esta nota existir:**

- O cliente valida (`src/lib/cpf.ts`, usado por `ColaboradorDialog` e `CadastroLote`), mas **de propósito só quando o CPF é novo ou alterado**. Validar sempre travaria a edição desses cadastros, impedindo corrigir telefone ou e-mail deles no dia da prova. **É decisão registrada — não "conserte" isso achando que é esquecimento.**
- **Um CHECK de DV no banco depende do saneamento acontecer primeiro**, senão a migration falha na carga. Enquanto os 16 existirem, esse CHECK não é possível — e a correção teria de morar no **dump**, não no `seed.pos.sql`, que roda depois das migrations.

---

## ✅ CONCLUÍDO 2026-07-26 — a meta órfã deixou de ser possível

**Área:** Alocação e Funções (ver [`estrutura/modulos/aplicacao-provas/alocacao-e-funcoes.md`](./estrutura/modulos/aplicacao-provas/alocacao-e-funcoes.md))

Apagar o valor de pagamento de uma função fazia a linha de `meta_colaboradores_unidade` ficar órfã — invisível no diálogo (que só lista função com valor) e ainda **contando no card da prova** como gente faltando, sem que ninguém conseguisse zerá-la.

Migration `20260726200000`: trigger **`check_valor_sem_meta`** recusa remover o valor enquanto houver **meta > 0** daquela função na prova. É trigger e não FK porque a meta é por unidade e o valor é por prova — a dependência cruza um nível.

**Decisão do usuário:** bloquear, não zerar as metas junto. Zerar seria um clique só, mas perderia em silêncio o número planejado.

**A ressalva deste item — "apagar meta órfã é decisão de produto, pode ser histórico legítimo" — ficou sem objeto:** a medição mostrou **0 órfãs** em 186 metas. A dívida era inteiramente preventiva; não houve o que sanear e nenhuma decisão sobre histórico precisou ser tomada.

**Verificado com `db reset` + DELETE real em transação:** valor cuja função tinha 7 metas > 0 → recusado com a mensagem; e o **controle positivo**, um valor cuja função tinha **8 linhas de meta, todas zero** → `DELETE 1`. É esse segundo caso que prova a semântica `> 0` — bloquear pela existência da linha criaria impasse, já que o diálogo não apaga linha, só zera.

> **Corrigido junto, e é dívida de outra classe:** `deleteValor` descartava a mensagem do banco e mostrava "Erro ao remover valor" para qualquer falha. Segunda ocorrência do padrão (a primeira foi a mensagem da Edge Function). **A regra que fica: mensagem vinda do banco ou de EF passa adiante; texto próprio é fallback.**

---

## ✅ CONCLUÍDO 2026-07-26 — excluir função em uso passou a ser recusado pelo banco

**Área:** Alocação e Funções (ver [`estrutura/modulos/aplicacao-provas/alocacao-e-funcoes.md`](./estrutura/modulos/aplicacao-provas/alocacao-e-funcoes.md))

As três FKs que apontavam para `funcoes_colaboradores` eram destrutivas — `SET NULL` em `colaboradores_prova`, `CASCADE` em `meta_colaboradores_unidade` e `valores_funcao_prova`. Excluir uma função em uso não dava erro: apagava registro financeiro de várias provas em silêncio. Só o cliente protegia, e uma chamada direta ao PostgREST passava reto.

Migration `20260726190000_funcoes_colaboradores_on_delete_restrict.sql`: as três viraram **`ON DELETE RESTRICT`**. O `23503` chega à UI traduzido por `mensagemErroExclusaoFuncao`, que **nomeia qual uso bloqueia** (alocação, meta ou valor), porque as três pedem providências diferentes.

**Decisão do usuário (26/07):** `RESTRICT`, **não** soft delete. A dúvida registrada aqui era se o `SET NULL` seria deliberado, para aposentar função sem travar em histórico; **não existe função aposentada** — o bloqueio que a UI já fazia é o comportamento correto, e a migration só o move para onde não pode ser contornado.

**Medido antes de apertar:** 0 de 554 linhas de `colaboradores_prova` com `funcao_id` nulo — o `SET NULL` nunca disparou em produção. Nenhum saneamento foi necessário.

**Verificado com `db reset` + DELETE real em transação:** função editável com alocação → recusa citando `colaboradores_prova`; editável só com meta e valor → recusa citando `meta_colaboradores_unidade`; e o **controle positivo** — função editável sem uso nenhum → `DELETE 1`. Excluir continua possível quando deve ser.

> **Achado de brinde, agora documentado:** existe uma segunda barreira mais antiga no banco, o trigger `check_system_funcao_changes`, que recusa excluir/renomear/tornar editável as funções com `cargo_editavel = false`. Ele **dispara antes** da checagem de FK — tentar excluir função do sistema levanta `P0001`, não `23503`. Não estava em doc nenhuma.

---

## ❌ DESCARTADO 2026-07-26 — exposição da `send-email` no projeto v1

**Decisão do usuário:** não é problema, porque **não há sistema no ar**.

Registro do que era, para quem reabrir: em 2026-07-20 descobriu-se que a `send-email` não checava quem a chamava — o `verify_jwt` exige um JWT, mas a anon key é um JWT válido e público. **Corrigido no código deste repo** (passou a exigir `service_role`); a dúvida que restava era se o projeto Supabase **v1** ainda teria a versão vulnerável publicada.

⚠️ **A premissa que fica anotada, não contestada:** uma Edge Function responde pela URL do projeto **independentemente de o frontend estar no ar**. Ou seja, "sistema fora do ar" e "endpoint inalcançável" não são a mesma coisa — o que fecha o assunto de fato é o projeto v1 **não existir mais** ou não ter a function publicada. Se algum dia se confirmar que o projeto v1 segue ativo, isto volta a valer, incluindo checar o volume de envio da conta SMTP.

---

## ✅ CONCLUÍDO 2026-07-27 — a chave natural de `candidatos` passou a incluir o CPF

**Área:** Candidatos (ver [`estrutura/modulos/candidatos/00-modulo.md`](./estrutura/modulos/candidatos/00-modulo.md)). Registro mantido porque **deixou consequências em aberto** (no fim) e porque a verificação não é automatizável.

**Decisão do usuário:** a chave passa de `(edital_id, n_inscricao, cargo_chave)` para **`(edital_id, cpf, cargo_chave, n_inscricao)`** — migration `20260727200000`, índice `candidatos_cpf_cargo_inscricao_key`.

⚠️ **A chave mudou DE NOVO em 2026-07-28**, e este registro é histórico: `cargo_chave` deu lugar a `cargo_id`. A chave em vigor é **`(edital_id, cpf, cargo_id, n_inscricao)`**, índice `candidatos_cpf_cargo_id_inscricao_key`. Tudo que segue sobre o CPF e o `NULLS NOT DISTINCT` continua valendo.

### Medido antes, contra o arquivo real (regra 5 de invariantes)

| Chave | Grupos distintos em 7.416 linhas |
|---|---|
| `(n_inscricao, cargo)` — antiga | 7.416 |
| `(cpf, cargo, n_inscricao)` — nova | 7.416 |

**Ninguém se perde, e não podia perder:** a chave nova **contém** a antiga, e acrescentar coluna a uma chave única só separa linhas, nunca as funde. ⚠️ **Não confundir com a proposta recusada em 27/07**, que era *trocar* `cargo_chave` **por** `cpf` — essa sim colapsaria 396 inscritos em silêncio.

### ⚠️ `NULLS NOT DISTINCT` é a parte que não pode ser removida

2 das 7.416 linhas têm CPF impossível (`8631309761`, 10 dígitos; `1O778817709`, letra O) e o importador grava `NULL`. No padrão do Postgres dois `NULL` são **distintos**, então essas linhas se inseririam de novo **a cada reimportação**, multiplicando em silêncio. O índice é `NULLS NOT DISTINCT` por causa disso, e `chaveNatural()` espelha o mesmo com `cpf ?? ''`.

O CPF **não ganhou coluna gerada** como o cargo, e a assimetria é deliberada: o cargo precisa de coluna porque precisa de *normalização* e o PostgREST não sabe nomear expressão; o CPF já é forçado a 11 dígitos pela CHECK, então uma `cpf_chave` seria cópia inútil.

### Verificado à mão, contra o banco local (a suíte mocka o Supabase)

Via PostgREST, que é o caminho real — o teste do Vitest só afirma a string do `onConflict`:

| Caso | Esperado | Obtido |
|---|---|---|
| Importar 3 linhas, reimportar 2× | 3, 3, 3 | ✅ |
| Linha **sem CPF** após 3 reimportações | 1 | ✅ |
| **Controle positivo:** reimportar com nome novo | atualiza | ✅ |
| Mesma inscrição+cargo, CPF diferente | linha nova (4) | ✅ |

O terceiro caso é o que prova que o índice está sendo *inferido* pelo PostgREST — sem isso, "não duplicou" poderia ser só o insert falhando.

### ⏭️ O que a decisão deixou em aberto

1. **Corrigir CPF na planilha agora cria registro novo**, em vez de atualizar — o mesmo defeito que o texto do cargo já tinha, agora em três campos. As duas saídas desenhadas em 27/07 seguem sem implementação: **modelo** (cargo em tabela filha, candidato único por inscrição) ou **reconciliação** (ao fim da importação, listar quem está no banco e não veio no arquivo). A reconciliação resolve o sintoma para os três campos de uma vez.
2. **Afrouxamento aceito:** duas linhas com a mesma inscrição e o mesmo cargo passam a coexistir se tiverem CPF diferente. Não ocorre no arquivo medido.
3. ~~**A instabilidade do texto do cargo continua**~~ — **RESOLVIDO em 2026-07-28** pela etapa 5 do tema Cargos: a chave trocou `cargo_chave` por `cargo_id` (migration `20260728100000`) e o texto saiu da identidade. Renomear cargo virou um `UPDATE` numa linha.

---

## ❌ RETIRADO 2026-07-28 — ⚠️ E A RETIRADA ESTAVA ERRADA (visto em 2026-07-31)

> 🔴 **NÃO use este bloco como referência.** Ele retirou um item **válido**, com base na mesma inferência falsa que a "correção de 28/07" na doc do módulo: concluiu que a coluna 0 é a inscrição porque tem 7.416 valores distintos em 7.416 linhas. **Cardinalidade não distingue inscrição de contador de linha.** Medido em 31/07: a coluna 0 é `1, 2, 3 … 7416` **sem um gap** — é o contador do export.
>
> **O que isso significa para este bloco:** a instrução que ele mandou abandonar — *"conferir à mão que 'Nº de Inscrição' aponta para a coluna `ID`"* — **continua correta e necessária**. E as três "saídas descartadas" no fim do bloco foram descartadas por um motivo que não se sustenta.
>
> ⚠️ **O que NÃO mudou:** `autoMapear` continua sugerindo a coluna 0, **por decisão do usuário em 31/07**, e não haverá alerta automático de contador. A sugestão é sugestão; quem escolhe é o usuário no passo 2. O estado correto está em [`../../estrutura/modulos/candidatos/00-modulo.md`](../../estrutura/modulos/candidatos/00-modulo.md).

### O texto original, preservado

**Área:** Candidatos (ver [`estrutura/modulos/candidatos/00-modulo.md`](./estrutura/modulos/candidatos/00-modulo.md))

O item aberto em 27/07 dizia que `autoMapear` casava `N_INSCRICAO` com "o contador de linha do export" e mandava, enquanto não houvesse conserto, **conferir à mão que "Nº de Inscrição" aponta para a coluna `ID`**.

🔴 **Aquela instrução fazia a coisa errada, e é por isso que o item fica registrado em vez de sumir.** Informado pelo usuário e remedido em 28/07 contra o arquivo real:

| Coluna | Distintos em 7.416 linhas | O que é |
|---|---|---|
| `N_INSCRICAO` (coluna 0) | **7.416** | **a inscrição** — uma por linha |
| `ID` | 7.020 | **a pessoa** no sistema de origem |
| `CPF` | 7.020 | bate exatamente com o `ID` |

Os 382 `ID` repetidos têm todos o mesmo CPF e todos cargos distintos: `ID` é a pessoa, `N_INSCRICAO` é a inscrição — uma por pessoa-por-cargo. Seguir a instrução antiga gravaria o **identificador da pessoa** no campo de inscrição, repetido em até 4 linhas.

**Nada a fazer no código:** `autoMapear` já casa `N_INSCRICAO` corretamente, e é o comportamento desejado. As três "saídas" propostas no item antigo (tirar o sinônimo, desempatar por conteúdo, avisar na tela) estão **todas descartadas** — resolveriam um problema que não existe, e a saída 2 (recusar coluna que seja `1..N`) recusaria justamente a coluna certa.

⚠️ **O que a correção deixou em aberto está no módulo, não aqui:** a justificativa de o cargo estar na chave natural caiu junto (a inscrição não se repete, então `(edital, n_inscricao)` já seria único). A chave em vigor continua correta — ver a seção "CORREÇÃO DE 2026-07-28" em [`estrutura/modulos/candidatos/00-modulo.md`](./estrutura/modulos/candidatos/00-modulo.md), com as duas decisões que ela abre.

---

## ✅ CONCLUÍDO 2026-07-29 — Cargos como entidade: o cargo do candidato deixou de ser texto sujo

**Status:** **as 6 etapas concluídas** (27 a 29/07), **mais parte da etapa 7 em 31/07**. Roadmap arquivado em [`analises/concluidos/roadmap-cargos.yaml`](./analises/concluidos/roadmap-cargos.yaml); doc da feature em [`estrutura/modulos/candidatos/cargos.md`](./estrutura/modulos/candidatos/cargos.md).

> 🔵 **Corrigido em 2026-07-31 — este status dizia que a etapa 7 "não é pendência, foi decidida como não planejada em D7".** O usuário pediu a página depois, e ela existe: **`/candidatos/cargos`**, com listar/criar/renomear/excluir. **A D7 foi revertida.** Continuam fora do escopo, por decisão dele: **desativar** (`cargos.ativo` segue sem consumidor) e **fundir cargos** (três tabelas, exige RPC transacional) — esta última segue desenhada na etapa 7 do roadmap.
>
> ⚠️ **Ressalva ao bloco abaixo, em duas camadas — leia as duas:** em 31/07 uma regra tornou IMUTÁVEL cargo com **qualquer** menção (migration `20260731100000`, `CG001`), o que inverteria todo o sentido do que se lê aqui. **Ela foi ESTREITADA em 2026-08-01** (migration `20260801103940`): hoje só **inscrito** tranca, e apelido voltou a ser CASCADE. **O que vale agora:** renomear cargo é livre **até a primeira importação que o use** — que é aproximadamente o que a etapa 5 entregou e o que o bloco abaixo descreve. A regra larga travava o cargo já no passo 3 do assistente, antes de existir um só inscrito, e foi por isso que caiu.

✅ **Etapa 1 (schema):** migration `20260727210000` criou `cargos` e `cargo_apelidos`, acrescentou `candidatos.cargo_id` e os dois índices de apoio a FK. Verificada por [`../docs/bateria-cargos.sql`](../docs/bateria-cargos.sql), verde.

✅ **Etapa 2 (lib pura):** `cargosDaPlanilha`, `pareceSujo` e `aplicarResolucoes` em `candidatos-import.ts`, mais o tipo `CandidatoResolvido` — 22 testes novos.

✅ **Etapa 3 (hooks):** `useCargos.tsx` — catálogo, apelidos, criação e gravação — 26 testes. **Fecha a janela A.**

✅ **Etapa 4 (a tela):** o assistente passou de 4 para 5 passos, com o passo **Cargos** entre pareamento e importação — associação, criação inline partindo do texto sujo, memória de apelidos com selo "lembrado", e o cargo virou **obrigatório** (D4 + D9). 20 testes novos. **Fecha a janela B.**

✅ **Etapa 5 (a chave):** migration `20260728100000` — a chave natural trocou `cargo_chave` por `cargo_id` e a coluna gerada foi dropada (D3). **Renomear um cargo deixou de duplicar candidato**, verificado pelo PostgREST. O dedup mudou de lugar no pipeline, e a ordem agora é garantida pelo TypeScript, não por disciplina.

✅ **Etapa 5b (a guarda):** migration `20260728110000` — trigger `candidatos_recusa_reapontar_cargo` (SQLSTATE `RC001`). A etapa 5 **inverteu qual erro é fatal**: o perigo deixou de ser a origem mudar a grafia e passou a ser o usuário **reapontar** um texto já importado para outro cargo, o que criaria linhas novas e deixaria as antigas órfãs em silêncio. A guarda fica em `candidatos`, **não** em `cargo_apelidos`.

✅ **Etapa 6 (a exibição):** a lista e a ficha passaram a mostrar o **nome canônico** do catálogo (join à esquerda embutido no select da listagem), a ficha ganhou o texto da planilha como procedência — só quando difere —, e o cabeçalho ganhou um **filtro por cargo** recortado no servidor. 15 testes novos (suíte em 965). Verificado pelo PostgREST, inclusive o controle negativo que mostra `cargos!inner` sumindo com o inscrito de `cargo_id` nulo.

🔴 **A etapa 6 achou e corrigiu um defeito preexistente:** a confirmação de **"limpar edital"** — a que pede senha — anunciava o `count` da consulta **filtrada** numa ação que apaga o edital inteiro. Com uma busca ligada, prometia remover 12 inscritos e removia 7.416. Passou a usar a contagem da RPC, e a visibilidade do botão também. ⚠️ **A regra que fica:** ao acrescentar filtro a uma tela, revise toda ação que age sobre o conjunto inteiro.


**Área:** Candidatos (ver [`estrutura/modulos/candidatos/00-modulo.md`](./estrutura/modulos/candidatos/00-modulo.md))

Os cargos chegam sujos da origem: **7 dos 9** trazem `¿`, um travessão mal decodificado (em dash cp1252 lido como latin-1). Como o cargo compõe a **identidade** do candidato, corrigir o texto e reimportar **cria registro novo em vez de atualizar** — é o problema que abriu a revisão da chave natural, e que a inclusão do CPF nela **não** resolveu.

**O desenho:** tabelas `cargos` (catálogo canônico) e `cargo_apelidos` (memória de "texto sujo → cargo"), mais um **passo novo no assistente de importação, entre o pareamento e a importação**, onde o usuário associa cada cargo lido a um existente ou cria um novo redigitando o nome. Depois, a chave natural troca `cargo_chave` por `cargo_id` — e renomear cargo passa a ser inofensivo.

**Medido antes de desenhar:** 9 cargos distintos em 7.416 linhas; normalizar por caixa e espaço **não colapsa nenhum** (9 → 9), ou seja, não existe limpeza automática que resolva. E `ARTE` (195 linhas) foge do padrão dos outros sete — só o usuário sabe se é `DOCENTE I — ARTE` ou outro cargo.

**Decidido pelo usuário em 2026-07-27**, e são as duas escolhas que moldam o resto:

- **D1 — catálogo GLOBAL.** `cargos` e `cargo_apelidos` não têm `edital_id`; o apelido aprendido numa importação vale para todas as seguintes, de qualquer edital. É o que faz o passo novo virar conferência a partir da segunda vez.
- **D4 — pareamento OBRIGATÓRIO.** `cargo` passa a `obrigatorio: true` em `CAMPOS_CANDIDATO`, e o passo novo só libera a importação com todos os cargos resolvidos. Planilha sem coluna de cargo deixa de ser importável — pretendido, porque com `cargo_id` na chave deixá-la vazia ressuscita a perda dos 396 inscritos. A saída alternativa (um cargo `(não informado)` no catálogo) fica **descartada**, registrada no roadmap caso a operação venha a precisar.

---

## ✅ CONCLUÍDO 2026-07-30 — os `useEffect` do `GerenciarColaboradoresProva` saíram do jeito cru

**Área:** Alocação e Funções

A página chamava `supabase...then()` **cru** e fazia `setState` no `.then`, em vez de usar React Query como o resto do repo. Estado que aterrissa fora do ciclo do React Query não participa de cache, invalidação nem `isLoading` — a tela pode mostrar dado velho sem ninguém perceber.

**Os TRÊS foram convertidos**, em dois momentos: `fetchProvaUnidadeInfo` (virou a query `prova_unidade_info`, com o `refetch` reaproveitando o nome antigo, então os dois pontos de chamada não mudaram) e `isCoordDestaProva` em 29/07; o `setUserName` em 30/07.

**Verificado pelo critério certo, e agora medido:** `npx vitest run src/pages/guards.test.tsx` não cita mais `not wrapped in act` — **de 3 para 0**, e **0 na suíte inteira** (974 testes).

### 🔴 A premissa deste item estava errada — é o que vale guardar

O item se chamava **"Dois `useEffect`"** e prometia que converter os dois faria os 3 avisos sumirem: *"é o sinal de que deu certo"*. **Eram TRÊS**, e os dois convertidos primeiro **não eram a fonte do barulho** — medido em 30/07, depois da primeira conversão, os 3 avisos continuavam intactos. Quem os produzia era justamente o terceiro, que o item nunca contou.

**A lição:** o item mediu o **sintoma** (3 avisos) e presumiu a **causa** (2 efeitos) sem cruzar os dois. É a **terceira vez** que um item deste backlog carrega premissa errada — as anteriores foram a proposta de os guards lerem papéis de `modulos.ts` (que teria **afrouxado** o acesso) e a de que papel `coordenador` sem vínculo era inofensivo. **Conferir a premissa no código antes de executar o item continua sendo obrigatório.**

### ⚠️ O terceiro tinha uma regra que os outros dois não tinham

Os dois primeiros passaram a **propagar erro** (`if (error) throw error`) — inclusive corrigindo, no `prova_unidade_info`, um `error` que sequer era desestruturado e sumia em silêncio.

O do `setUserName` faz o **oposto, de propósito**: engole a falha e devolve `user.email` como nome. `userName` habilita o **lock de edição exclusiva** da unidade; deixar a falha virar estado de erro manteria o lock **desligado**, e a unidade ficaria sem proteção contra dois coordenadores editando ao mesmo tempo. O `try/catch` cobre os dois modos de falha que o `.then(ok, erro)` antigo tratava junto — o erro do PostgREST (que volta em `error`, sem rejeitar) e a rejeição de rede —, e devolver em vez de relançar evita o retry do React Query, que atrasaria o lock sem melhorar nada.

**O `enabled` do lock passou a olhar `isSuccess`** em vez de `!!userName`: diz "o nome foi resolvido", que é a condição de verdade, em vez de inferi-la de a string não estar vazia.

---

## ✅ CONCLUÍDO 2026-07-30 — dado inválido do candidato passou a ENTRAR como veio

**Área:** Candidatos (ver [`estrutura/modulos/candidatos/00-modulo.md`](./estrutura/modulos/candidatos/00-modulo.md))

**Decisão do usuário:** *"Candidato com dados considerado inválido. Candidato e dados entram. Candidato e dados são citados no relatório."*

Até 29/07 o campo secundário impossível virava `NULL`: o inscrito entrava, mas **o que a origem afirmou sumia** — e ninguém depois conseguia saber o que a pessoa tinha digitado para corrigir na fonte. Agora o valor é gravado como veio, e o relatório continua igual em forma e lugar.

Migration `20260730100000`: as quatro CHECKs de formato (`cpf`, `cep`, `email`, `raca`) saíram, e `raca` (`smallint`) e `data_nascimento` (`date`) viraram `text` — nesses dois não havia CHECK a remover, o valor cru **fisicamente não cabia no tipo**.

### 🔴 O que esta decisão custou, dito por extenso

**A garantia de formato caiu para TODO caminho de escrita**, não só para o importador: PostgREST direto, Edge Function e script passam a poder gravar CPF, CEP, e-mail e raça em qualquer forma. Isto foi levantado como **risco alto antes da decisão** e escolhido assim mesmo, com o risco à vista.

**A consequência prática para quem for escrever regra nova:** `candidatos` deixou de ter opinião sobre o formato desses quatro campos. Quem precisar de CPF válido **valida na leitura** — não dá mais para presumir, como dava até 29/07, que o que está na coluna passou por uma CHECK. As duas CHECKs de **identidade** (`n_inscricao`, `nome`) seguem de pé, e a classe "erro" da importação não mudou: inscrição, nome e cargo vazios continuam descartando a linha.

**O que se perde com `data_nascimento` text:** ordenação e comparação por data no banco. Hoje ninguém faz nenhuma das duas (`useCandidatos` ordena só por `nome`), então o custo é futuro. Quem for construir filtro por faixa etária vai precisar de `to_date(...)` com o dado sujo dentro.

### 🔴 A mudança corrigiu um defeito que ninguém tinha visto

Os 2 CPFs impossíveis do arquivo real são **valores distintos** (`8631309761` e `1O778817709`). Com os dois virando `NULL`, a chave natural ficava idêntica e o `deduplicar()` **fundia os dois inscritos num só** — um sumia da lista, que é exatamente o erro que a regra de aviso existe para evitar. **Havia um teste afirmando essa fusão como correta.** Verificado contra o PostgREST em 30/07: agora são duas linhas.

⚠️ **Uma regressão silenciosa saiu junto:** a guarda antiga do CPF lia `soDigitos`, que devolve `null` quando não sobra dígito — então `'abc'` era anulado **sem aviso**. Perda calada dentro da regra criada para não perder calado.

⚠️ **O `NULLS NOT DISTINCT` não perdeu a razão de existir, mudou de dono:** guarda agora a célula **vazia**, não a impossível. **Vazio ≠ impossível.**

### Segunda leva, mesmo dia: três regras novas de campo

Todas **aviso**, nenhuma descarta linha, todas medidas no arquivo real antes de existir:

| Regra | Atinge | O que pega |
|---|---|---|
| Nome com caractere estranho | **10** de 7.416 | `SALVAD0` (zero por O), `SANT¿ ANA` (mojibake), `VITO&#769;RIA` (entidade HTML), `D\'AVILA` (**escape vazado da exportação**, 3×), ID concatenado, `}` |
| Nome de uma palavra só | **10** de 7.416 | `TESTEPAULO` ×3 e um `A` — **registro de teste na lista de inscritos** |
| Nome com palavra de mock | **3** de 7.416 | `TESTEPAULO`. `PALAVRAS_DE_MOCK` = `teste`, `test`; **substring**, case-insensitive |
| Hora de nascimento irreconhecível | **2** de 3.089 | `'88888888'` e `'Não sei'` — migration `20260730110000` (`time` → `text`) |

⚠️ **Aceitos no nome: letra COM ACENTO, espaço, apóstrofo, hífen e ponto.** 1.527 nomes têm acento e acusá-los faria a regra virar ruído; o ponto saiu por decisão do usuário (abreviação é nome bem escrito), o que levou a regra de 16 para 10 linhas. Há **controle negativo** guardando os dois.

⚠️ **A busca de mock é por SUBSTRING** (é o que pega `TESTEPAULO`, uma palavra só). Falso positivo conhecido e aceito: **`TESTA`, sobrenome legítimo** — 0 no arquivo real. O risco é real e o campo e-mail prova (`soumatestemunhadodeusvivente@` traz "testemunha"). 🔴 **Medir antes de acrescentar palavra à lista.** Hoje a regra não acrescenta linha nenhuma ao relatório — existe pelo caso que as outras não pegam (`TESTE DA SILVA`).

🔴 **A hora era o buraco maior:** único campo secundário que anulava **sem sequer avisar** — não havia `avisos.push` para ela. Segunda ocorrência do padrão "perda silenciosa" no mesmo dia.

⚠️ **Hora de nascimento é critério LEGAL de desempate em concurso.** Com a coluna em `text`, desempate por SQL vai exigir conversão com o dado sujo dentro.

### Como foi verificado

Suíte em **974** (eram 965), `tsc` limpo, `build` limpo, `db reset` com as 101 migrations. Mais bateria SQL contra o banco local, em transação com `ROLLBACK` e **dois controles positivos** — porque provar que passou a aceitar é metade:

| Caso | Esperado | Obtido |
|---|---|---|
| `cpf`/`email`/`cep`/`raca`/`data_nascimento` impossíveis | entram crus | ✅ |
| Dois CPFs impossíveis diferentes | **duas** linhas | ✅ |
| **CP1:** `nome` em branco | ainda recusado | ✅ |
| **CP2:** reimportar o CPF cru | **atualiza**, não multiplica | ✅ |

O **CP2 é o que sustenta o resto**: prova que a idempotência do upsert sobreviveu, porque o valor cru é determinístico e a chave natural volta a casar na reimportação.

---

## ✅ CONCLUÍDO 2026-07-30 — o registro órfão deixou de ser possível: importar virou TROCA TOTAL

**Área:** Candidatos (ver [`estrutura/modulos/candidatos/00-modulo.md`](./estrutura/modulos/candidatos/00-modulo.md)). Roadmap arquivado em [`analises/concluidos/roadmap-importacao-troca-total.yaml`](./analises/concluidos/roadmap-importacao-troca-total.yaml).

### O que era

A chave natural é `(edital_id, cpf, cargo_id, n_inscricao)`. Como CPF, cargo e inscrição **compunham a identidade**, corrigir qualquer um deles na planilha e reimportar fazia o upsert **não casar** a linha: entrava um registro NOVO e o antigo **ficava lá, órfão**. Sem aviso. É o formato de erro que este repo chama de o pior — **parece ter funcionado**.

### A decisão do usuário

**Importar passa a APAGAR a lista do edital e reinserir a planilha inteira**, numa transação só. Ele escolheu isto sobre a alternativa que eu recomendei (upsert + exclusão do resíduo), com os trade-offs à vista. As duas premissas que autorizam: *"sempre planilhas inteiras, nunca de adição"* e *"corrigimos tudo na origem"*.

Resolve os **três** campos de uma vez — coisa que nem trocar a chave natural nem o `RC001` alcançavam.

### 🔴 A medição que mudou a FORMA da solução

O desenho óbvio era um RPC recebendo tudo em JSON. **Não cabe:** 5,40 MB para 7.416 inscritos (5,11 MB omitindo nulos — economiza 5%) contra o limite de 5 MB do Kong, e pior com editais maiores.

Por isso os blocos continuam, mas sobem para uma **tabela de preparo**, e **uma** chamada à RPC faz `DELETE` + `INSERT` no servidor. Delete total + insert total, atômico, sem teto: o bloco não cresce com o edital, só o número de requisições (50.000 inscritos = 50 requisições de 0,89 MB).

### As três guardas do banco, e por que cada uma existe

| Código | Recusa | Por que é silencioso sem ela |
|---|---|---|
| `IM001` | lote vazio ou já consumido | o `DELETE` roda, o `INSERT` não insere ninguém, **e não há erro** |
| `IM002` | preparo com edital divergente | apagaria a lista de A e poria a de B no lugar |
| `IM003` | contagem ≠ total declarado | **preparo incompleto**: apagaria 7.416 e inseriria 6.000, dizendo sucesso |

🔴 **A `IM003` nasceu de uma pergunta do usuário.** Eu tinha posto essa conferência no *cliente*, e ele perguntou se dava para fatiar em mil "entregando ao fim o total" — o que expôs que aquilo era **convenção, não regra**: não valeria para PostgREST, script nem chamada manual. A guarda foi para o banco.

### ⚠️ A inversão que precisa sobreviver a qualquer refatoração

Antes, um bloco falho deixava a importação **pela metade** e reimportar consertava. Agora deixa a lista **INTACTA**. É melhor, mas é diferente — o relatório abre com *"A lista NÃO foi alterada"*, porque sem isso o usuário assume o pior e vai conferir milhares de linhas à mão.

### O que a decisão custou, dito por extenso

- **`created_at` e `created_by` de todos os inscritos são reescritos a cada importação.** A data de entrada de cada pessoa passa a ser a do último reimport. Não tem mitigação dentro deste desenho; foi aceito ao escolhê-lo.
- **A proteção contra arquivo truncado é mais fraca** que a da alternativa recusada, que sabia dizer *quem* sumiria. Aqui o usuário compara os dois números na confirmação e decide.
- 🔴 **Se `candidatos` um dia guardar algo que a planilha não sabe** (nota, alocação de sala, presença), a troca total passa a **destruir esse dado a cada importação**, e o tema tem de ser reaberto ANTES da feature nova. Hoje há **0 FKs** apontando para `candidatos` — é o que torna isto seguro agora.

### O `RC001` saiu junto, e o acoplamento fica registrado

O trigger existia porque o upsert casava linha pela chave. Com o `DELETE` rodando antes do `INSERT`, ele não tinha mais o que encontrar — **guarda que não pode disparar**. ⚠️ **Se a importação voltar ao upsert, o trigger tem de voltar junto.**

### Como foi verificado

Bateria própria em [`../docs/bateria-troca-total-candidatos.sql`](../docs/bateria-troca-total-candidatos.sql), **10 casos**, mais os três casos reescritos de `bateria-cargos.sql`. Suíte em **978**, `tsc`, `build` e lint (110, = baseline) limpos.

⚠️ **A prova de ATOMICIDADE roda FORA de transação, de propósito** — dentro de um `BEGIN` o erro aborta o bloco, e o que se mediria depois do `ROLLBACK` seria o efeito **dele**, não o da função: o caso provaria a si mesmo. Vale para qualquer bateria futura que precise observar estado **após** um erro.

**Verificado pelo PostgREST, e é o item que fecha o tema:** com o CPF corrigido na origem, 2 linhas entram e 2 ficam. No upsert ficariam 3.

---

## ✅ CONCLUÍDO 2026-07-31 — os grants de `anon` foram a zero, e a auditoria achou um vazamento de leitura

**Área:** Auth e Permissões (ver [`estrutura/transversais/auth-e-permissoes.md`](./estrutura/transversais/auth-e-permissoes.md)). Aberto em 2026-07-15, executado em 31/07 pela migration `20260731110000`.

### 🔴 A premissa deste item estava errada — e é o que vale guardar

O item dizia: *"hoje só a RLS impede o estrago: `anon` não tem policy, então SELECT/INSERT/UPDATE/DELETE caem em default deny; mas `TRUNCATE` não passa por RLS"*. **A primeira metade era falsa.**

As 46 policies de `public` foram criadas **`TO public`** — e no Postgres o papel `public` **inclui `anon`**. Oito ainda usavam `USING (true)`, apesar de se chamarem *"Authenticated users can view …"*: `bancos`, `coordenadores_prova`, `editais`, `funcoes_colaboradores`, `prova_edit_locks`, `prova_unidades`, `provas`, `sala_prova`.

Medido contra o PostgREST com a anon key e **sem login**: as sete primeiras devolviam **dado real**. `prova_edit_locks` devolveu `[]` só por estar vazia.

⚠️ **O nome da policy foi a armadilha** — descrevia a intenção do autor, não o comportamento. Auditoria por leitura de nome passava batido, e passou por meses.

**O que salvou o pior:** `candidatos`, `colaboradores` e `user_roles` recusavam (as policies delas checam `has_role(auth.uid(), …)`, nulo sem sessão), e **nenhuma** policy de escrita era permissiva — POST anônimo em `editais` recusa com 42501. Vazamento de **leitura**, não de escrita. Nada no ar, então sem exposição real; teria subido com a v2.

### O conserto, em quatro partes

| Parte | O quê |
|---|---|
| 1 | `REVOKE ALL ... FROM anon` em todas as tabelas de `public` — inclui o TRUNCATE que abriu o item |
| 2 | `REVOKE TRUNCATE, REFERENCES, TRIGGER ... FROM authenticated` (fica só o DML) |
| 3 | O `ALTER DEFAULT PRIVILEGES` para de reconceder — **sem isto, 1 e 2 duram até a próxima tabela** |
| 4 | As 46 policies passaram de `TO public` para **`TO authenticated`** |

**A parte 4 é redundante com a 1 de propósito:** sem GRANT não se lê, policy nenhuma salva. `TO authenticated` é a camada que sobrevive a alguém reconceder um GRANT — e foi aplicada às 46, não só às 8, porque a próxima policy copiada de uma vizinha herdaria o `TO public`. **O modo de falhar passa a ser "ninguém vê" em vez de "todo mundo vê".**

**O que autorizou tirar tudo de `anon`:** nenhum fluxo público lê tabela com a anon key. `/cadastro-publico` fala só com EF; as páginas alcançáveis deslogado não têm `.from(...)`; `useBancos` é consumida só por `ColaboradorDialog` e `PerfilColaborador`, ambos autenticados.

### Como foi verificado

`db reset` com as **106** migrations, mais [`../docs/bateria-grants-e-policies.sql`](../docs/bateria-grants-e-policies.sql) — **7 casos, todos verdes**:

| Caso | Prova |
|---|---|
| 1, 2 | `anon` com zero grants; `authenticated` só com DML |
| 3 | `anon` recusado no `TRUNCATE candidatos` |
| 4 | zero policies ainda `TO public` |
| 5a, 5b | **tabela nova nasce enxuta** — é o caso que impede o defeito de voltar |
| 5c | **controle positivo:** tabela nova segue usável por `authenticated` |

Mais a parte via **PostgREST**, que é o caminho real e está no rodapé da bateria: `anon` leva 42501 nas 9 tabelas testadas, e o **controle positivo** com JWT de admin forjado lê `editais`, `provas` e `bancos` normalmente. `postgres` e `service_role` têm BYPASSRLS, então seed, dump e EF não passam por policy.

🔴 **A suíte não cobre nada disto** — mocka o Supabase, então não exercita GRANT, RLS nem policy. Os **1017** testes ficaram verdes durante e depois do vazamento. `tsc` e `build` limpos.

### ⏭️ O que fica em aberto

**Produção nunca recebeu esta migration** — o repo está deslinkado por decisão. Quando a v2 subir, o `prod:push` leva junto; **conferir lá** que `anon` ficou sem grants, porque o schema de produção foi construído pelo dashboard e pode ter policy que não existe aqui (ver [`estrutura/transversais/desenvolvimento-local.md`](./estrutura/transversais/desenvolvimento-local.md) sobre o drift).

---

## ✅ CONCLUÍDO 2026-07-31 — as duas pontas de infraestrutura de teste

**Área:** Infraestrutura de testes (ver [`estrutura/transversais/testes.md`](./estrutura/transversais/testes.md))

### 1. `callFunction` degradava em silêncio

Sem `SUPABASE_ANON_KEY`, ele **omitia o header `Authorization`** em vez de falhar. O custo era invisível: o caso *"A1 — Anon Key crua (401)"* passava a exercitar **"requisição sem header nenhum"**, que também dá 401. **O teste seguia verde afirmando outro cenário** — e o que ele existe para guardar (que **`verify_jwt` não é autorização**, porque a anon key *é* um JWT válido e público — a falha que já apareceu em `send-email` e `create-admin`) deixava de ser coberto.

Agora **lança**, como o `getAdminClient` já fazia. Para exercitar de propósito a ausência de header, passe `""` como token — explícito, e não se confunde com env var faltando.

🔴 **Não consegui executar os testes de EF: `deno` não está instalado** neste ambiente, não é dependência do projeto e não há script no `package.json`. A correção é de leitura e revisão, **não foi rodada**. Isso é uma lacuna maior que o item: quem nunca instalou o Deno não roda esta camada e **não recebe sinal nenhum disso**. O comando e as três variáveis obrigatórias foram documentados em `testes.md`, que não os trazia.

> 🔵 **Resolvido em 2026-08-02:** o Deno foi instalado e a camada ganhou `npm run test:ef`. **A correção descrita acima foi finalmente executada e passa** — os 8 passos, sem resíduo. A lacuna que este parágrafo aponta ("nada avisa") **só foi resolvida pela metade**: `npm test` continua sem alcançar a camada. Ver a decisão no fim deste arquivo.

### 2. `bateria-cargos.sql` exigia catálogo sem os fixtures dela — **e estava desatualizada em 4 pontos**

A pré-condição **foi eliminada**, não só anotada: todo fixture ganhou o prefixo `BATERIA `, que nenhuma origem produz. **Provado** povoando o catálogo com os nomes reais (`DOCENTE II`, `ARTE`, `DOCENTE I — HISTÓRIA`, `DOCENTE I ¿ HISTÓRIA`) e rodando: **zero** ocorrências de *"transaction is aborted"*, contra 2 antes.

Ao rodá-la, apareceu que ela afirmava coisas que deixaram de valer:

| Onde | Afirmava | Agora |
|---|---|---|
| 1.4 | `apelidos = CASCADE (c)` | as duas FKs são **RESTRICT** desde a CG001 |
| 2.3 | "CONTRASTE — `candidatos` ainda tem o pacote da era Lovable" | o contraste acabou hoje: as três tabelas seguem o mesmo padrão |
| Seção 4 | "o CASCADE e o RESTRICT, opostos de propósito" | não são mais opostos |
| 4.1 | apagar cargo **leva** os apelidos | é **recusado** |

🔴 **E o caso 7.2 era a testemunha do ganho que a CG001 reverteu.** Ele se chamava *"RENOMEAR O CARGO NÃO DUPLICA CANDIDATO — o ponto inteiro da etapa 5"* e renomeava um cargo com 3 inscritos. **Esse UPDATE agora é recusado.** Foi partido em dois: **7.2a** afirma a recusa, e **7.2b** guarda o que a etapa 5 ainda compra — o candidato aponta para `cargo_id`, não para o texto, então renomear **dentro da janela** (antes do primeiro inscrito) deixa a listagem com o nome canônico e a ficha com o texto sujo como procedência. ⚠️ **Não restaure o 7.2 original:** um caso que só passa se a CG001 sumir vira pressão para removê-la.

**A CG001 não tinha caso nenhum** na bateria — a única verificação real dessas regras, já que a suíte mocka o Supabase. Ganhou a seção **4-bis**, com 4 casos: recusa com inscrito, recusa com apelido, recusa ao trocar só `ativo` (o trigger é sobre a **linha**, não a coluna) e o **controle positivo** de que cargo sem menção ainda é renomeável.

---
## ✅ CONCLUÍDO 2026-08-01 — a CG001 passou a trancar só por INSCRITO, não por apelido

**Área:** Candidatos → cargos (ver [`estrutura/modulos/candidatos/cargos.md`](../../estrutura/modulos/candidatos/cargos.md))

Decisão do usuário: *"a regra de bloqueio deve corresponder somente a condições de haver candidatos associados a esse cargo em algum edital"*.

🔴 **A regra larga de 31/07 fechava a janela de correção NO MOMENTO ERRADO, e isso se lia no próprio assistente:** `salvarApelidos` grava a memória no fim do **passo 3**, e só o **passo 4** escreve os inscritos. O apelido recém-gravado já tornava o cargo imutável **antes de existir um único inscrito** — enquanto a doc prometia que a janela ia até o passo 3.

Migration `20260801103940`. O par trigger+função é **RENOMEADO**, não só substituído: `..._em_uso` descrevia a regra larga, e aqui vale a armadilha da casa — **o nome mente antes do código**. `cargo_apelidos.cargo_id` volta a `CASCADE`, e o aviso *"N textos memorizados serão apagados junto"* volta ao diálogo de exclusão: sem ele o CASCADE vira **perda muda**.

---

## ✅ CONCLUÍDO 2026-08-01 — o timbre dos PDFs virou `src/lib/pdf-timbre.ts`

**Área:** transversal (Aplicação de Provas + Candidatos)

Três páginas geram PDF (`DocumentosImpressao`, `OcorrenciasProva`, `CandidatosImportar`) e as três copiavam o `useEffect` do logo **verbatim**, reescrevendo a geometria a cada vez.

🔴 **A geometria do helper reproduz EXATAMENTE o que as páginas antigas emitiam, conferido linha a linha** — lista de presença e recibo de pagamento são **impressos e assinados**, então espaçamento não é cosmético. `desenharTimbre` devolve o Y do **TÍTULO**, e não "o Y livre abaixo", porque `DocumentosImpressao` reserva 14mm para a linha do Coordenador Geral **mesmo quando não há coordenador** — um helper não teria como saber disso.

Três defeitos do relatório de importação saíram junto da extração: o `catch` mudo virou `<Alert>` visível (dizendo que os inscritos **já estão salvos**, senão a pessoa refaz a importação inteira achando que perdeu tudo); `overflow: 'hidden'` virou `'linebreak'` na coluna Detalhe (com `hidden` a mensagem do erro era **cortada sem aviso**, e o detalhe é a única coisa que o relatório existe para entregar); e saíram os 5 `(doc.internal as any)` — `getCurrentPageInfo()` e `getNumberOfPages()` são públicos e tipados no jsPDF 4.

⚠️ **Armadilha nova, que custou sujeira no repo: `doc.save()` GRAVA ARQUIVO DE VERDADE no jsdom.** O teste de exportação bem-sucedida escreveu 4 PDFs na raiz antes de alguém notar. O mock de `criarDocumentoPaisagem` neutraliza `save` num spy — que de quebra permite afirmar o nome do arquivo.

⏭️ **Ficou aberto de propósito:** o PDF de ocorrências só timbra a página 1. Corrigir **muda o documento emitido**, e a extração tinha como regra não mudar nenhum. Está no [`backlog.md`](../../backlog.md).

---

## ✅ CONCLUÍDO 2026-08-01 — a importação passou a trazer só quem PAGOU a inscrição

**Área:** Candidatos (ver [`estrutura/modulos/candidatos/00-modulo.md`](../../estrutura/modulos/candidatos/00-modulo.md))

Decisão do usuário. A coluna `CONFIRMADO` da planilha passou a **filtrar** a importação.

**Medido no arquivo real** (`docs/temp/todos inscritos concurso 002-2026-SMA cabeçalho.xls`): a coluna é a de **índice 23** e só tem dois valores — `'1'` em **7.231** linhas e `'0'` em **185**. Sem vazio, sem terceiro valor.

🔴 **`separarPorPagamento` roda ANTES do dedup, e a posição é CORREÇÃO, não estilo.** `deduplicar` mantém a **última** ocorrência da chave; na ordem inversa, um não-pagante que repetisse a chave de um pagante o **deslocaria** e só então seria descartado — o pagante sumiria da importação sem aparecer como erro, nem como repetida, nem como não-pagante. Há teste com o controle que mostra a perda na ordem errada.

🔴 **`confirmado` virou campo OBRIGATÓRIO no pareamento, e não é zelo.** Opcional e não pareado, `parseBooleano(null)` devolveria `false` para toda linha, o filtro descartaria o arquivo inteiro, e — como importar é **troca total** — a lista do edital seria apagada com ninguém no lugar e a tela dizendo *"concluída"*. É o mesmo precedente do `cargo` (decisão D4), pelo mesmo motivo: **campo cuja ausência produz resultado errado em silêncio não pode ser opcional.**

⚠️ **O rótulo "nesta planilha" virou "vão entrar"** na confirmação destrutiva. O número passou a ser **pós-filtro**, e o rótulo antigo virou promessa falsa no instante em que o filtro entrou — é exatamente o defeito do *"limpar edital"*, que exibia a contagem filtrada ao lado de um botão que apagava o edital inteiro, e estava atrás da mesma confirmação.

⚠️ **"Sem pagamento" NÃO se soma a "Não importados".** As duas dizem que a linha ficou de fora, mas a providência é **oposta**: erro de dado se corrige na planilha e se reimporta; inscrição não paga não é defeito nenhum. Juntá-las mandaria a pessoa caçar erro em 185 linhas que não têm nenhum.

**Consequência aceita e registrada:** o selo *"não confirmada"* e a linha *"Inscrição confirmada"* ficaram inalcançáveis. Decisão do usuário mantê-los — está no [`backlog.md`](../../backlog.md). Uma `CHECK (confirmado = true)` foi **considerada e rejeitada**: a regra é sobre *o que a importação seleciona*, não sobre *o que um candidato pode ser*.

---

## ✅ CONCLUÍDO 2026-08-01 — a chave natural virou `(edital_id, n_inscricao)`

**Área:** Candidatos (ver [`estrutura/modulos/candidatos/00-modulo.md`](../../estrutura/modulos/candidatos/00-modulo.md))

Decisão do usuário: *"a chave que deve ser única para cada candidato é o `n_inscricao`; um mesmo CPF pode ter mais de uma inscrição, desde que para cargos diferentes"*. Migration `20260801193530`.

🔴 **ESTE ITEM INVERTE UM AVISO QUE ESTAVA EM LETRAS VERMELHAS**, e é o motivo de ele estar registrado com tanto detalhe. A doc do módulo dizia: *"`cargo_id` NÃO é redundante: é ele que garante a unicidade… **não simplifique para `(edital_id, n_inscricao)`** — já foi proposto aqui e **destrói dado**"*. O arquivo [`candidatos-chave-natural-e-a-coluna-0.md`](./candidatos-chave-natural-e-a-coluna-0.md) registrava a mesma proposta como **rejeitada**.

**O aviso não estava errado sobre o dado — estava certo sobre OUTRA COLUNA.** Ele valia enquanto a inscrição era lida na coluna `ID`, que é a **pessoa** e repete 396 vezes. Com a inscrição vindo da **coluna A** (decisão do usuário, mesma data), o número é único por linha e a simplificação passou a ser correta.

⚠️ **Como o erro quase se repetiu, e o que o desfez:** ao ser consultado, medi os "382 repetidos" na coluna `ID` e concluí que a proposta fundiria 380 pagantes — a resposta errada, pela mesma confusão de três reviravoltas anteriores. O usuário insistiu duas vezes. **O que desfez não foi medir mais: foi olhar o que o banco JÁ gravava** — 7.231 candidatos, 7.231 `n_inscricao` distintos, de 1 a 7416.

**Medido antes de apertar:**

| Onde | O quê | Resultado |
|---|---|---|
| arquivo real, 7.416 linhas | nº de inscrição repetido | **0** |
| banco local, 7.231 candidatos | `(edital_id, n_inscricao)` repetido | **0** |

A chave nova é **estritamente mais apertada** (4 colunas → 2) e mesmo assim nenhuma linha existente a violava — não houve saneamento.

🔴 **`edital_id` é indispensável, por um motivo NOVO:** o nº de inscrição **recomeça em 1 a cada planilha**. Sem ele, o segundo edital importado colidiria já na primeira linha.

**Os dois lados aceitos**, ambos com 0 casos no arquivo medido: *afrouxou* — não barra mais o mesmo CPF duas vezes no mesmo cargo com números diferentes; *apertou* — nº repetido entre cargos passa a fundir, mantendo a última, **mas não em silêncio**: a descartada sai nomeada na seção *Repetidas* do relatório.

**O que caiu junto, e não deve voltar sem cuidado:** o `NULLS NOT DISTINCT` saiu do índice (existia porque `cpf`/`cargo_id` são nullable; as duas colunas novas são `NOT NULL`) e os `??` de `chaveNatural()` saíram com ele. A **fusão dos 2 CPFs impossíveis** — o defeito de 29/07 que um teste verde afirmava como correto — virou impossível **por construção**: eles estão nas inscrições 375 e 4256.

⚠️ **Verificação: a suíte MOCKA o Supabase e não exercita índice único.** A prova é [`../../../docs/bateria-chave-natural-candidatos.sql`](../../../docs/bateria-chave-natural-candidatos.sql), 5 casos com controle positivo, em transação com `ROLLBACK`. ⚠️ A guarda de colisão dentro da migration é **no-op num `db reset`** (migrations rodam antes do dump) — ela vale para push contra base já povoada.

---
## ✅ CONCLUÍDO 2026-08-02 — o edital de uma prova virou imutável (`PE001`)

**Área:** Aplicação de Provas / Editais (ver [`estrutura/modulos/aplicacao-provas/provas-e-unidades.md`](../../estrutura/modulos/aplicacao-provas/provas-e-unidades.md))

Item aberto em 2026-07-26. Decisão do usuário: *"uma prova **nunca** pode ter seu Edital modificado. O campo de vinculação ao Edital deve ser permitido apenas no momento do cadastro/criação da prova… O valor segue sendo visualizado na UI. Apenas visualizado."*

**Premissa conferida antes de executar** (obrigatório aqui — item de backlog com premissa errada já aconteceu 5 vezes): o botão **"Parâmetros Gerais"** de `/gerenciar-prova` abre o **mesmo `ProvaDialog`** da listagem, com `prova` preenchida. Uma mudança no componente cobriu as duas portas.

### 🔴 O achado que definiu o desenho: o backfill do `seed.pos.sql`

A trava óbvia — *"`edital_id` não pode mudar"* — **quebraria todo `db reset`**. O `seed.pos.sql` (linhas 96-99) faz `UPDATE provas SET edital_id = … WHERE p.edital_id IS NULL`, reconstruindo o vínculo a partir da coluna velha `prova_edital` a cada carga do dump do v1 — e roda **depois** das migrations, com o trigger já instalado.

**A condição correta é `edital_id JÁ TINHA valor E mudou`.** Atribuir pela primeira vez não é modificar. O caminho de volta (`valor → NULL`) também é recusado, senão a trava teria porta dos fundos em dois passos.

O sintoma de errar isso seria traiçoeiro: as provas do dump ficariam permanentemente sem edital e apareceria como *"o seed falhou"*, não como *"o trigger está errado"*.

**Medido antes de apertar:** 2 provas no banco local, 2 com edital, 0 sem — nenhuma linha existente viola a regra.

### Onde a regra mora

**No banco**, migration `20260802045221`: trigger `check_prova_edital_imutavel` + função `provas_recusa_trocar_edital()`, SQLSTATE **`PE001`**, `SECURITY INVOKER` (é regra de coerência, não de permissão — vale inclusive para `service_role`). A escrita de `provas` é PostgREST direto: um `PATCH` com `edital_id` novo passaria pela RLS, então a tela sozinha não seria regra nenhuma.

**Na tela**, o `ProvaDialog` mostra o edital em **bloco de leitura** ao editar — e não um `<Select disabled>`, de propósito: um select acinzentado diz *"isto poderia mudar, mas não agora"* e convida a procurar como habilitar. Aqui não há quando.

⚠️ **O payload da edição deixou de carregar `edital_id`/`prova_edital`.** É mais forte que desabilitar o campo: sem valor viajando, nem um bug de estado do formulário vira uma tentativa de troca — que o trigger recusaria, virando toast vermelho para quem não pediu nada.

⚠️ **`prova_edital` ficou fora da regra**, de propósito: é dívida de transição que o `seed.pos.sql` ainda lê, e amarrá-la criaria uma segunda regra sobre uma coluna que deve sumir.

### Verificação

Bateria [`../../../docs/bateria-prova-edital-imutavel.sql`](../../../docs/bateria-prova-edital-imutavel.sql) — 5 casos, **3 deles controle positivo**: `NULL → valor` (o backfill), editar os outros campos (o que "Parâmetros Gerais" faz o tempo todo) e reescrever o **mesmo** `edital_id` (o `PATCH` pode reenviar a coluna sem intenção de trocar — por isso a condição é `IS DISTINCT FROM`, não *"veio no payload"*).

O `db reset` completo foi rodado **com o trigger instalado** e o `seed.pos.sql` preencheu as 2 provas normalmente — a prova real de que o `NULL → valor` sobreviveu.

**Falsificado 2 vezes:** devolver `edital_id` ao payload da edição derrubou o teste do payload; tirar a guarda do `NULL` do trigger derrubou **exatamente o caso 3** da bateria, o controle positivo do backfill.

⚠️ **Um teste da suíte inverteu**, e ficou dizendo o que afirmava: `"trocar o edital de uma prova existente NÃO sobrescreve os campos dela"` **trocava o edital** para provar que a herança não reagia. O cenário virou inalcançável. O que ele guardava — PDFs e alocação leem os campos DA prova — continua guardado por um caminho mais forte: não há troca que possa reagir.

---
## ✅ CONCLUÍDO 2026-08-02 — o cadastro público valida o CPF antes de consultar

**Área:** Colaboradores (ver [`estrutura/modulos/aplicacao-provas/colaboradores.md`](../../estrutura/modulos/aplicacao-provas/colaboradores.md))

Item aberto em 2026-07-26. `/cadastro-publico` conferia só o **tamanho** do CPF e já chamava a Edge Function — era a **última porta fora do `cpfValido`** e a **única aberta ao público**.

**A armadilha que o item avisava era real e ainda estava lá:** o arquivo tinha um *estado* chamado `cpfValido`, que colidiria com a função importada. Renomeado para `cpfConferido` — e o nome novo é o que ele sempre significou: guarda a **string** do CPF que passou na checagem, não um booleano de validade.

**Duas mensagens, no lugar de uma.** *"Digite os 11 dígitos"* para quem não terminou, *"CPF inválido — confira os dígitos"* para quem terminou e errou. A mensagem única de antes (*"Digite um CPF válido com 11 dígitos"*) mentia nos dois casos — dizia "11 dígitos" a quem já tinha digitado 11. São erros com providências diferentes: continuar digitando vs. conferir o que digitou.

⚠️ **A validação da tela NÃO é barreira de segurança**, e o comentário no código diz isso: quem quer sondar chama a EF direto. O ganho é poupar a ida ao servidor e dizer o que corrigir. A barreira é a própria EF, que devolve só `{exists}`.

### 🔴 O achado: a Edge Function consultava o CPF de OUTRA PESSOA

Ao ler a EF para escrever o item, apareceu um defeito que não estava no backlog:

```ts
const cpf = parsed.data.cpf.replace(/\D/g, '').padStart(11, '0');
if (cpf.length !== 11) { ... }   // nunca falha para entrada CURTA
```

É **exatamente** a classe de defeito que `src/lib/cpf.ts` documenta como o bug original do `ColaboradorDialog`: preencher com zeros **antes** de conferir o tamanho faz a checagem nunca falhar por baixo. Seis dígitos viravam `00000123456` — um CPF de terceiro — e a função consultava esse.

**A consequência não era só resultado errado:** se o CPF preenchido existisse, o usuário era mandado ao fluxo *"você já tem cadastro"*, que dispara a reivindicação de acesso sobre o **registro de outra pessoa**.

O `padStart` saiu. Sem ele, `length !== 11` volta a valer para os dois lados.

⚠️ **A EF continua sem o módulo 11**, e é decisão: duplicar o algoritmo no Deno criaria um segundo validador que pode divergir do de `src/lib/`. O que a EF precisa garantir é não consultar a linha errada, e o tamanho resolve. Se a validação completa for necessária no servidor um dia, a saída é **compartilhar o módulo**, não copiá-lo.

### Verificação

**4 testes novos** em `src/pages/CadastroPublico.ui.test.tsx` — o primeiro arquivo de teste desta tela.

⚠️ **O mock é do `fetch` GLOBAL, não do client do Supabase**, e o comentário do arquivo explica: esta tela não usa o client, ela monta a chamada à EF à mão (é fluxo sem login). Mockar `supabase.functions.invoke` não pegaria nada. É padrão novo no repo — não havia mock de `fetch` em lugar nenhum.

O teste central é **"CPF com DV errado NÃO chega à Edge Function"**, com o **controle positivo** de que CPF válido chega — sem ele, a asserção passaria mesmo se a tela tivesse parado de chamar a EF por completo, que é o modo de falha mais fácil de introduzir aqui.

**Falsificado:** tirar a chamada a `cpfValido` derrubou 2 dos 4 (o DV errado e o de dígitos repetidos) e preservou os 2 controles — exatamente o esperado.

⚠️ **A mudança da EF NÃO foi executada**, e segue sem teste: não existe arquivo de teste para `check-cpf-colaborador` — só `create-admin` tem. Ela é inerte até `supabase functions deploy`.

> 🔵 **O motivo mudou horas depois, no mesmo dia:** o `deno` foi **instalado** em 02/08 e a camada ganhou `npm run test:ef` (ver a decisão logo abaixo neste arquivo). O que impede verificar esta EF hoje não é mais a falta do runtime — é a falta de um teste para ela.

---
## ✅ DECIDIDO 2026-08-02 — instalar o Deno e dar um comando à camada de EF

**Área:** Infraestrutura de testes (ver [`estrutura/transversais/testes.md`](../../estrutura/transversais/testes.md))

Não era item de backlog — virou decisão porque **esbarramos nisso três vezes**: em 31/07 (ao consertar o `callFunction`, que não pôde ser executado), e em 02/08 ao corrigir o `padStart` do `check-cpf-colaborador`, que foi commitado **sem verificação nenhuma**.

### O que foi medido antes de decidir

| | |
|---|---|
| Edge Functions | **9** |
| Arquivos de teste de EF | **1** (`create-admin/index.test.ts`) |
| Já tinha rodado neste ambiente | **não**, desde que foi escrito em 28/07 |
| Script no `package.json` | nenhum |

🔴 **O argumento não foi destravar 1 arquivo — foi que as EFs são onde mora a autorização.** É lá que `verify_jwt` não é autorização, a falha que já apareceu **duas vezes** (`send-email` e `create-admin`). Mudar uma EF sem poder executá-la, com 9 delas no repo, era garantia de repetição.

**Custo, medido e contido:** binário único (2.9.4, `~/.deno/bin`), **não** entra no `package.json`, não toca a suíte do Vitest. Desinstalar não deixa rastro no projeto.

### O que a decisão entregou

**`npm run test:ef`** (`scripts/test-ef.sh`). Ele lê as três variáveis obrigatórias do próprio `supabase status` — antes elas viviam como três `export` enterrados no `testes.md`, e quem não conhecesse o comando não rodava nada.

**Resultado da primeira execução:** os 8 passos passaram, e o teardown não deixou resíduo (conferido: 0 contas `test_runner_*`/`novo_admin_*` em `auth.users`). O teste tinha 4 dias sem nunca ter rodado e **não** estava quebrado.

### ⚠️ O que a decisão NÃO resolveu

**Instalar o Deno resolveu *"não dá para rodar"*. NÃO resolveu *"nada avisa"*.** `npm test` continua sem alcançar a camada, e o CI segue adiado — então rodar `test:ef` ainda depende de alguém lembrar. A diferença é que agora existe um comando descoberto em vez de instruções enterradas numa doc.

### 🔴 O achado que limita expandir esta camada

Escrever teste para as **outras 8 EFs** esbarra numa condição do ambiente:

**`public-create-colaborador`, `reivindicar-acesso`, `recuperar-senha` e `send-email` enviam e-mail de verdade daqui**, e o banco local é cópia de produção — 771 endereços reais. Um teste que dispare qualquer uma contra a linha errada manda e-mail com SPF/DKIM da FEVRE para uma pessoa real.

**`create-admin` é o único que roda sem combinado prévio**, porque não envia e-mail (verificado) e o teste usa `@exemplo.com` com `email_confirm: true`. Expandir a cobertura exige **decidir antes** o guardrail — endereço de teste obrigatório ou SMTP de teste —, não depois.

---

## ✅ CONCLUÍDO 2026-08-02 — o nº de inscritos passou a ter UMA fonte: a lista real

**Área:** Candidatos × Editais × Aplicação de Provas. O item durou **algumas horas** como item próprio: foi promovido de sub-item nesta mesma data e fechado no mesmo dia, porque a medição feita ao promovê-lo revelou um defeito ativo em vez de uma inconsistência de cadastro.

### O que era

Três números respondiam "quantos inscritos tem este concurso", e nenhum conversava com os outros: `editais.n_candidatos` (digitado no `EditalDialog`), `provas.prova_n_candidatos` (herdado do edital na criação, editável depois) e `count(candidatos)` (a lista real importada).

**Medido no banco local:**

```
Edital 001/2026 SMA     previsão 200   inscritos reais 7.231   prova 200
Edital 002/2026 - SMA   previsão —     inscritos reais     0   prova NULL
```

A alocação (`GerenciarProva`) calculava `naoAlocados = prova_n_candidatos − alocados`, ou seja **200 − alocados** com 7.231 pessoas inscritas: o painel dizia que a prova estava coberta **faltando 7.031 lugares**. Sem erro, sem aviso — o formato de defeito que este repo mais teme.

### A decisão do usuário, e o que ela dispensou

Perguntado qual dos três manda, o usuário respondeu **"vale para tudo"** — a contagem real é a fonte em toda tela — e, sobre a ressalva de prova parcial, **"preocupação justa, mas não vamos cuidar dela agora: nesse momento, todo candidato inscrito faz a prova"**.

Isso dispensou o que o item apontava como pré-requisito. O backlog registrava que trocar cegamente a alocação para `count(candidatos)` era a armadilha, porque *"uma prova pode não ser do edital inteiro"* e o sistema não sabe **quantos inscritos ESTA prova aplica** (não há vínculo candidato↔prova). A premissa afirmada pelo usuário torna as duas perguntas a mesma pergunta — **enquanto ela valer**.

⚠️ **É o limite explícito da entrega, e está anotado nos docs dos três módulos:** quando existir prova que aplica um recorte do edital, isto reabre. E reabre pelo vínculo candidato↔prova, **não** por um campo digitado de volta.

### O que foi feito

- **`GerenciarProva`** passou a contar os inscritos reais do edital da prova. A conta saiu do componente para **`src/lib/alocacao.ts`** (`resumoAlocacao`), com testes próprios.
- **O card de `/editais`** passou a mostrar a contagem real.
- **Os dois campos digitados à mão saíram dos formulários** (`EditalDialog` e `ProvaDialog`) e das interfaces TS de `useEditais`/`useProvas` — inclusive da herança edital→prova, que hoje só carrega cabeçalho.
- **As colunas NÃO foram dropadas.** `provas.prova_n_candidatos` aparece nos `INSERT`s do dump (`seed.local.sql`) e o backfill do `seed.pos.sql` lê ambas para reconstruir os editais — dropar quebraria o `db reset` local. Ficaram órfãs e documentadas como tal.

### Três coisas que a execução ensinou

1. **Nenhum estado pode virar "0".** Trocar um número sempre presente por uma contagem criou estados que não existiam: carregando, sem lista importada, prova sem edital. Um "0" em qualquer um deles pintaria a alocação de coberta — exatamente o defeito que se estava corrigindo, com outra causa. Cada um virou mensagem própria, e há caso de teste para os três.
2. **O hook não podia ficar onde a conta estava.** `GerenciarProva` tem `return` condicional por `authLoading` no meio; chamar `useContagemCandidatosPorEdital` no ponto da conta antiga quebrou a ordem de hooks do React. **Quem pegou foi a suíte** — `guards.test.tsx` e `CadastroPublico.ui.test.tsx` falharam com "Rendered fewer hooks than expected", em arquivos que não têm nada a ver com o tema.
3. **A RLS decide quem pode ver o painel.** `candidatos` é `has_role(admin)` e a RPC de contagem é **SECURITY INVOKER**: para coordenador ela volta **vazia sem erro**. O painel já era `isAdmin &&` por outro motivo, e isso passou a ser parte da regra — soltá-lo diria "nenhum inscrito importado" a quem tem lista.

### Verificação

`npm test` **1090 passando** (baseline 1089 — 11 casos caíram na mudança e foram reescritos; os que afirmavam a herança de `n_candidatos` e o payload com o campo **eram a pergunta, não obstáculo**). `tsc` limpo, `build` OK, **lint 118** contra baseline 120 (desceu: saiu código). O único erro não tratado da suíte (`CadastroPublico`, `useAuth must be used within an AuthProvider`) foi medido com `git stash` e **é pré-existente**.

⚠️ **Não há bateria SQL aqui, e não faltou uma:** a mudança é toda de leitura no cliente. Nenhuma regra nova foi para o banco — o que mudou foi **de onde** a tela lê, e a RPC que ela passou a usar já existia e já era usada por `/candidatos`.

---

## ✅ 2026-08-04 — o candidato ganhou sala: módulo Alocação de Candidatos

**O item era o 1 de Candidatos**: *"não há vínculo entre candidato e prova, unidade ou sala… feature nova com desenho próprio"*. Virou módulo próprio (`alocacao-candidatos`, o quarto do hub), com a tabela nova `candidatos_alocacao` — nada foi pendurado em `candidatos`, como o item mandava. Contrato em [`../../estrutura/modulos/alocacao-candidatos/00-modulo.md`](../../estrutura/modulos/alocacao-candidatos/00-modulo.md).

### As cinco decisões do usuário

> ⚠️ **O QUE MUDOU DEPOIS — 2026-08-05.** Três destas cinco continuam valendo (1, 2 e 5). As decisões **3 e 4 mudaram**, e a forma de acionar a distribuição mudou por inteiro: ela deixou de ser um botão automático e virou um **plano montado por arrasto**. Não reescrevi este registro — ele descreve o que se decidiu em 04/08, com a informação de 04/08. O estado atual está em [`../../estrutura/modulos/alocacao-candidatos/00-modulo.md`](../../estrutura/modulos/alocacao-candidatos/00-modulo.md); as anotações abaixo marcam só o que um leitor tomaria por regra vigente.

1. Distribuição automática **por cargo** (alfabética do nome canônico; alfabética por nome dentro do cargo, inscrição desempata).
2. **Cargo novo abre sala nova** — a sala de fronteira fica ociosa; salas não se misturam. Escolhido sobre "sala mista" vendo os dois previews.
3. **Especiais fora do automático**: `sala_especial` preenchida ou PCD entram à mão, listados com o texto do pedido.
   > ⚠️ **REVERTIDO em 05/08.** Cada cargo passou a ter **três blocos arrastáveis** — comuns, PCD e sala especial —, e o plano coloca os três. O que sobreviveu é que *colocar não é conferir*: o pedido individual continua sendo trabalho de gente, e `especiais_da_prova` ganhou a coluna `origem` para a tela distinguir "posto pelo plano" de "conferido à mão".
4. **Reimportar com alocação de pé é RECUSADO** (FK RESTRICT) — escolhido sobre CASCADE+aviso. Reimportar vira dois passos conscientes.
   > ⚠️ **Segue valendo para a ALOCAÇÃO.** Mas em 05/08 nasceu uma tabela vizinha, `candidatos_fora_do_automatico`, e nela a escolha foi a **oposta** — CASCADE + aviso —, porque a marcação é anotação sem valor próprio e RESTRICT bloquearia a reimportação inteira. As duas decisões convivem de propósito; não são incoerência.
5. Ajuste manual na v1: **incluir e retirar** de sala (`origem='manual'`); redistribuir preserva o manual.

### Medido antes de desenhar

- Pós-reset o banco local tem **0 candidatos** (os 7.231 viviam acima do seed — playground). A distribuição foi provada com **7.150 sintéticos**: 7.000 alocados em **~0,7–1,1 s**, blocos contíguos, 0 salas mistas, 0 violações de continuidade alfabética.
- No dado do dump, **toda distribuição real é recusada pelas guardas** (provas finalizadas; 480 vagas). As mensagens das guardas são a tela mais vista do módulo — por isso nomeiam números e dizem o que fazer.

### O que foi para o banco (migration `20260804225156`)

Tabela + **FK composta** `(sala_id, prova_id)` (metade da coerência de graça — exigiu `UNIQUE (id, prova_id)` nas salas) + trigger único `check_candidato_alocacao` (PF001 congelamento espelhado com mensagem própria → AL005 coerência de edital → AL006 capacidade com `FOR UPDATE`) + `check_sala_reducao_capacidade` (AL007; o nome ordena DEPOIS do de finalizada, para PF001 continuar respondendo primeiro) + RPCs `distribuir_candidatos_da_prova` (SECURITY INVOKER com guarda explícita de admin; laço por cargo; AL001..AL004), `contar_alocados_por_sala`, `especiais_da_prova` + a definição única `candidato_pede_atendimento_especial`.

> ⚠️ **`distribuir_candidatos_da_prova` NÃO EXISTE MAIS** (dropada em 05/08, migration `20260805185155`). Foi substituída por `aplicar_plano_de_alocacao(prova, plano jsonb)`, que recebe o rascunho montado por arrasto. `contar_alocados_por_sala` e `especiais_da_prova` seguem, mas **com colunas a mais** (`manuais` e `origem`). A tabela e os triggers desta migration continuam como descritos.

### Efeitos nos vizinhos, feitos no mesmo passe

- `mensagemErroImportacao` ganhou o ramo `candidatos_alocacao` — **um ramo cobre os três fluxos** (troca total, excluir um, limpar edital usam a mesma função).
- `mensagemErroDesvinculoUnidade` ganhou o segundo dependente (o RESTRICT indireto de invariantes.md).
- Docs atualizados: fronteira de `candidatos/00-modulo.md` ("nada liga candidato a provas" caiu), o limite da fonte única de inscritos (o vínculo agora existe; **reabrir o recorte por prova segue decisão não tomada**), "três módulos" → quatro em 3 lugares, 115→116 migrations.

### Verificação

`db reset` limpo · `docs/bateria-alocacao-candidatos.sql` (10 casos, 13 recusas todas com o SQLSTATE e o NOME esperados, controles positivos) · as baterias vizinhas (troca total, renumeração) **rodadas** e verdes · `npm test` 1210 · `tsc` limpo · `build` OK · `docs:conferir` sem divergência · lint 118 (baseline).

### O que a execução ensinou

1. **A bateria provou a coisa errada duas vezes antes de provar a certa** — o caso da FK composta morreu primeiro em PF001 (unidade da OUTRA prova seguia finalizada no setup) e depois em 23505 (o candidato escolhido já estava alocado). Afirmar **o nome de quem barrou** foi o que denunciou; "houve recusa" teria passado calado.
2. **O smoke com dado sintético pegou o trigger funcionando**: a inclusão manual do caso 4 caiu em AL006 porque o script escolheu a sala lotada — o "erro" era a barreira correta.
3. `SET LOCAL ROLE authenticated` + JWT forjado por `set_config` é o padrão para exercitar RLS e `has_role` dentro de bateria (herdado da bateria de renumeração, agora em duas).
