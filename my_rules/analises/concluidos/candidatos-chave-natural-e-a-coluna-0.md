# Candidatos — a chave natural e a coluna 0, em três reviravoltas

> 🔴 **HOUVE UMA QUARTA REVIRAVOLTA, EM 2026-08-01, E ELA INVERTE O DESFECHO DESTE ARQUIVO.**
> Por decisão do usuário, **o nº de inscrição é a coluna A** e a chave natural passou a ser
> **`(edital_id, n_inscricao)`** — migration `20260801193530`. Ou seja: a simplificação que
> este documento registra como **rejeitada por destruir dado** foi **adotada**, e o aviso
> *"o cargo é indispensável na chave"* **não vale mais**.
>
> ⚠️ **Leia isto antes de usar qualquer conclusão daqui.** As medições continuam corretas —
> o que mudou foi *qual coluna é a inscrição*, e com ela a resposta muda inteira: a coluna A
> tem os 7.416 valores distintos que a chave precisa, e a mesma pessoa em dois cargos aparece
> com dois números (inscrições 9 e 5208 para o CPF `05261923727`).
> A regra vigente está em [`../../estrutura/modulos/candidatos/00-modulo.md`](../../estrutura/modulos/candidatos/00-modulo.md).

> 📁 **HISTÓRICO — não leia por padrão.** Este arquivo registra um tema já entregue.
> Abra só quando o pedido for sobre o passado (*por que ficou assim? o que se tentou?
> que alternativa foi rejeitada?*). **Não é plano** — nada aqui é lista de tarefas.
> Para o que o sistema É, veja `my_rules/estrutura/`; para o que FALTA, `my_rules/backlog.md`.

Movido de `estrutura/modulos/candidatos/00-modulo.md` em **2026-07-31**, onde ocupava
**143 das 432 linhas** do contrato do módulo — um terço do doc que alguém abre para saber
*o que o módulo é* era a narrativa de como se chegou até aqui.

**A regra operante ficou lá**; aqui está a história. Ao mover, as anotações que a
"correção de 28/07" havia inserido nas seções corretas foram **retificadas** — elas
afirmavam o oposto do que se mediu depois.

---

## O resumo, para quem só quer a lição

**A coluna 0 do arquivo de inscritos chama-se `N_INSCRICAO` e é o CONTADOR DO EXPORT**
(`1, 2, 3 … 7416`, sem um gap). A inscrição vem do **`ID`** (coluna 1), que **repete** para
quem concorre a mais de um cargo.

🔴 **Isso foi medido certo em 27/07, desfeito por engano em 28/07 e remedido em 31/07.**
O engano de 28/07 foi de **inferência, não de medição**: concluiu que a coluna 0 é a
inscrição porque tem 7.416 valores distintos em 7.416 linhas. **Um contador `1..N` também
tem.** Cardinalidade não distingue "inscrição" de "contador"; quem separa os dois é a
**sequencialidade** — e essa prova, que existia em 27/07, não foi refeita.

⚠️ **A lição que vale além deste tema:** ao medir para decidir *o que um dado é*, pergunte
qual observação **distinguiria as hipóteses**. Uma medição correta pode não responder a
pergunta que você acha que está fazendo.

---

## 2026-07-27 — a revisão que abriu e fechou no mesmo dia

> Tudo neste bloco aconteceu em **2026-07-27**: o módulo nasceu de manhã, a revisão da
> chave abriu à tarde e a decisão saiu à noite.

O usuário decidiu: a chave natural passa a incluir o **CPF** (migration `20260727200000`).
⚠️ Em **28/07** ela mudou de novo, trocando `cargo_chave` por `cargo_id` (migration
`20260728100000`). A chave em vigor é **`(edital_id, cpf, cargo_id, n_inscricao)`**.

**A planilha de origem foi remedida no fim do dia e NÃO corrigiu o que abriu a revisão:**

- Todas as medições seguem descrevendo o arquivo original — a versão "corrigida" não mudou
  nenhum número: as 7.416 linhas, os 2 CPFs impossíveis, os 27 e-mails, as 15 datas fora de
  faixa, os 36 valores de `identidade_uf`. As constraints foram dimensionadas por elas.
  **Se um arquivo de fato diferente chegar, remeça do zero.**
- A instabilidade do texto do cargo não foi resolvida, e o CPF entrou junto.

### 🔴 O arquivo "corrigido" — a armadilha PIOROU

O arquivo só ganhou **cabeçalho novo**:

- A coluna 0 passou a se chamar **`N_INSCRICAO`** e **continua sendo o contador de linha**
  (verificado em 27/07: exatamente `1, 2, 3 … 7416`). A inscrição segue na coluna `ID`.
- 🔴 **Isso quebra o auto-pareamento.** `normalizarTexto('N_INSCRICAO')` → `ninscricao`, o
  **primeiro sinônimo** de `n_inscricao` em `CAMPOS_CANDIDATO`. Antes a coluna 0 era anônima
  e era pulada, então o palpite acertava a `ID`. Agora casa com o contador — e **nada
  acusa**, porque o contador é perfeitamente único: importaria 7.416 candidatos numerados
  de 1 a 7416.
- As inscrições repetidas continuam existindo: **7.020 `ID` distintos em 7.416 linhas**.

### O que foi medido

| Fato | Número |
|---|---|
| Linhas | 7.416 |
| `ID` distintos | 7.020 |
| CPFs distintos | 7.020 |
| `ID` com mais de um CPF | **0** |
| CPFs com mais de um `ID` | **0** |

`ID` e CPF são **a mesma informação** — os dois identificadores da PESSOA.

> 🔴 **Retificado em 31/07.** Uma anotação de 28/07 dizia aqui que *"a inscrição de verdade
> é a coluna `N_INSCRICAO`, única por linha (7.416)"*. **Falso** — aquilo é o contador.

Distribuição: **6.638** pessoas com 1 cargo, **369** com 2, **12** com 3 e **1** com 4. Os
**396** excedentes (7.416 − 7.020) são as inscrições adicionais de quem concorre a mais de
um cargo — por exemplo o `ID` `213946`, CPF `99528037704`, em `DOCENTE II`,
`DOCENTE I ¿ LÍNGUA INGLESA` e `DOCENTE I ¿ HISTÓRIA`.

### ⚠️ SOMAR o CPF à chave (feito) ≠ TROCAR o cargo pelo CPF (recusado)

A distinção é a coisa mais fácil de errar aqui — as duas propostas se parecem no enunciado:

| Chave | Linhas únicas | Colapsam | Status |
|---|---|---|---|
| `(ID, cargo)` | 7.416 | 0 | vigorou até 27/07 |
| **`(cpf, cargo, ID)`** | **7.416** | **0** | ✅ virou a chave em 27/07 |
| `(ID, cpf)` — trocar | 7.020 | **396** | ❌ recusada |
| `(ID)` sozinha | 7.020 | **396** | ❌ recusada |
| `(contador da coluna 0)` | 7.416 | 0 | ❌ **nunca deve ser usada** — é a posição da linha |

**Somar não podia perder ninguém, e não perdeu:** acrescentar coluna a uma chave única só
*separa* linhas, nunca as funde. **Trocar** o cargo pelo CPF colapsaria 396 inscritos em
silêncio (o `deduplicar()` mantém a última ocorrência e descarta as anteriores sem erro).
**Não ressuscite a troca sem remedir.**

O que somar o CPF **custa**, e está aceito: o CPF entra na identidade, então corrigir um CPF
errado e reimportar cria um segundo registro. E abre um afrouxamento: duas linhas com a
mesma inscrição e o mesmo cargo coexistem se tiverem CPF diferente.

### O problema que originou a revisão

O texto do cargo é instável (o `¿` é um travessão mal codificado em cp1252) e **fazia parte
da identidade**. Corrigir o texto criava um segundo registro e deixava o antigo. As saídas
discutidas na época:

1. **Modelo:** `candidatos` único por `(edital, inscrição)` e cargo em tabela filha.
2. **Reconciliação:** ao fim da importação, listar quem está no banco e não veio no arquivo.

> 🔵 **As duas foram superadas em 30/07** pela **troca total**: importar apaga a lista do
> edital e reinsere numa transação, o que resolve os três campos de uma vez. Ver
> [`roadmap-importacao-troca-total.yaml`](./roadmap-importacao-troca-total.yaml).

---

## 2026-07-28 — a "correção" que estava errada

Uma revisão concluiu que a coluna 0 **é** a inscrição, e reescreveu o doc do módulo em
cima disso. O raciocínio: *"7.416 distintos em 7.416 linhas ⇒ é a inscrição"*.

**O que ela declarou derrubado, e que na verdade continuava valendo:**

- ❌ *"382 números de inscrição se repetem — não se repetem"* → **repetem sim**, lidos do `ID`.
- ❌ *"o cargo é indispensável na chave — falso"* → **é indispensável**.
- ❌ *"a coluna 0 é o contador — ela é a inscrição"* → **é o contador**.

Ela também retirou do backlog um item **válido** (*"conferir à mão que 'Nº de Inscrição'
aponta para o `ID`"*) e propôs simplificar a chave para `(edital_id, n_inscricao)` — que,
com a inscrição vinda do `ID`, **fundiria 396 inscritos**.

---

## 2026-07-31 — a retificação

Medido contra o arquivo real: `col0.every((v, i) => v === i + 1)` → **`true`**.

**O caso que encerra a dúvida:** a pessoa de CPF `05261923727` aparece na **linha 9** e na
**linha 5208**. Se a coluna 0 fosse inscrição, seriam dois números a 5.199 de distância.

Confirmado também que os **382 `ID` repetidos** têm todos o mesmo CPF e cargos distintos.

### Decisão do usuário: o código NÃO muda

- **`autoMapear` continua sugerindo a coluna 0** (o cabeçalho se chama `N_INSCRICAO`).
- **Sem alerta automático** de "isto parece um contador".
- 📌 **Quem escolhe a coluna é o usuário, no passo 2** — `autoMapear` só sugere. Por isso a
  conferência manual daquele passo **é parte do fluxo, não um remendo**.
- O **texto de tela** do passo 2 também não muda: não cita número, então vale sob qualquer
  mapeamento. Voltar a prometer "396 somem" trocaria um número falso por um **condicional**.

### O que foi corrigido no código

O comentário de `CandidatosImportar.tsx` que afirmava *"medido com a coluna certa: perda
ZERO"* (a medição usara o contador, que nunca colide), e os comentários de
`candidatos-import.test.ts`.

> 🔴 **Registro de um erro meu, porque ele é o exemplo mais claro da lição.** Em 31/07 pela
> manhã eu "corrigi" o fixture do teste para afirmar `n_inscricao: "1"`, chamando o valor
> correto (`214274`) de *"o `ID` da pessoa"* e o teste anterior de *"defeito"*. Era o
> contrário. Eu havia medido cardinalidade e tratado o resultado como resposta a uma
> pergunta que ele não respondia — **o mesmo erro de 28/07, cometido enquanto eu o
> consertava.** O que pegou não foi disciplina; foi um segundo passe com outra pergunta.

Há teste executável dos dois caminhos em `candidatos-import.test.ts` — o do mapeamento
sugerido e o do mapeamento corrigido à mão.

---

## Apêndice — a guarda do reapontamento (`RC001`), etapa 5b

> Movido de `estrutura/modulos/candidatos/cargos.md` em 2026-07-31: eram **57 linhas**
> descrevendo um trigger **removido em 30/07**, dentro do doc que se lê para saber o que o
> módulo é. ⚠️ **Uma afirmação daqui era falsa e foi retificada na mudança** — está
> marcada abaixo.

## A guarda do reapontamento (etapa 5b) — `candidatos_recusa_reapontar_cargo`

> ❌ **ESTE TRIGGER NÃO EXISTE MAIS — removido em 2026-07-30** (migration `20260730140000`).
> A importação virou **troca total**: a RPC apaga a lista do edital e reinsere, na mesma
> transação. Quando o `INSERT` roda, o `DELETE` já rodou — o trigger não tinha mais o que
> encontrar, e virou guarda incapaz de disparar. **E o gesto que ele barrava deixou de ser
> perigoso:** reapontar cargo hoje converge para uma linha só, verificado no caso 7.4 de
> `docs/bateria-cargos.sql`.
>
> ⚠️ **Os dois são acoplados:** se a importação um dia voltar ao upsert, este trigger tem
> de voltar JUNTO — senão o defeito de 28/07 reaparece sem guarda nenhuma.
>
> O texto abaixo fica como registro do que ele era e de por que existiu.

Trigger `BEFORE INSERT` em `candidatos`, migration `20260728110000`, SQLSTATE **`RC001`**. Recusava gravar quando **já existia** linha com o mesmo `(edital_id, cpf, n_inscricao)` **e o mesmo texto de cargo**, apontando para um `cargo_id` **diferente**.

### ⚠️ Por que a guarda NÃO fica em `cargo_apelidos`

É o alvo intuitivo e é o **errado**. As três razões foram verificadas no código:

1. **O apelido não é o caminho do dado**, é a memória de pré-preenchimento. Quem decide o `cargo_id` do lote é `resolverLinhas(convertidas, resolucoes)`, e `resolucoes` é **estado da UI**.
2. **`salvarApelidos` manda os ~9 pares num upsert único e atômico.** Barrar um par derrubaria os nove.
3. **O chamador engole o erro de propósito** (`.catch(() => undefined)`) — apelido é conveniência, a importação é o objetivo. A guarda falharia **em silêncio** e a importação seguiria gravando o `cargo_id` novo.

### 🔴 A condição é ESTREITA — e a razão disso CAIU em 2026-07-28

**A justificativa original era:** exigir o texto do cargo igual porque *"382 pessoas concorrem a mais de um cargo com a mesma inscrição"*, e uma condição mais larga as bloquearia.

> 🔴 **RETIFICADO EM 2026-07-31 — o parágrafo abaixo estava ERRADO.** Ele dizia: *"A inscrição foi lida na coluna `ID`, que é a pessoa; a inscrição de verdade é a coluna `N_INSCRICAO`, e ela é única por linha (7.416 em 7.416). Ninguém compartilha número de inscrição."*
>
> **A coluna `N_INSCRICAO` é o contador do export.** A justificativa ORIGINAL da condição estreita — *"382 pessoas concorrem a mais de um cargo com a mesma inscrição"* — **estava certa**, e foi esta "correção" que a derrubou por engano. Ver a seção de 31/07 acima.

**O que a condição estreita continua sendo:** correta, porém **mais restrita do que precisa**. Ela não bloqueia nada de legítimo — só deixa passar mais do que deveria.

⚠️ **O buraco que a estreiteza abre.** Se a origem mudar a **grafia** do cargo e o usuário reclassificar no mesmo gesto, o texto difere, o trigger não dispara e os inscritos antigos ficam **órfãos em silêncio** — exatamente o que a etapa 5b existe para impedir. Antes eu registrei isso como *"irredutível, porque o arquivo não tem identificador por cargo"*. **Não é irredutível:** com `n_inscricao` único, `(edital_id, cpf, n_inscricao)` já identifica a linha, e a comparação do texto pode simplesmente sair da condição.

**O conserto proposto (não feito):** remover do trigger a linha

```sql
AND lower(btrim(coalesce(c.cargo,''))) = lower(btrim(coalesce(NEW.cargo,'')))
```

⚠️ **Antes de fazer isso, MEDIR:** o alargamento só é seguro enquanto `n_inscricao` for único por linha. Se algum edital repetir numeração entre cargos, a condição larga passa a bloquear inscrito legítimo — que é precisamente o risco que a versão estreita foi desenhada para evitar, ainda que pelo motivo errado. E o **CONTROLE POSITIVO 1** da bateria (`docs/bateria-cargos.sql`, caso 7.5) **vai falhar** com a condição larga, porque ele foi escrito com CPF e inscrição iguais nos dois cargos — ele precisa ser reescrito com inscrições diferentes, que é o dado real.

Enquanto isso não for decidido, quem pegaria o resíduo é a **reconciliação**, ainda não implementada.

### O que a guarda deliberadamente NÃO bloqueia

| | |
|---|---|
| Renomear `cargos.nome` | ✅ **Livre enquanto o cargo não tiver INSCRITO** (regra estreitada em 2026-08-01, migration `20260801103940`). ⚠️ Esta linha dizia "NÃO é mais livre desde 31/07: cargo com menção é imutável" — valeu por um dia, quando apelido também trancava |
| Criar cargo novo | livre — é `INSERT` em `cargos` |
| Apagar cargo em uso | já recusado pelo `ON DELETE RESTRICT` da etapa 1 |
| Reimportar a mesma linha com o mesmo cargo | é o caminho feliz, vira `UPDATE` |

⚠️ **A mensagem orienta, não só barra** (lição da etapa 4): nomeia o texto, o cargo a que ele já está associado, e a saída. Ela **passa inteira** ao usuário — `mensagemErroImportacao` não tem ramo próprio para `RC001`, e o fallback já devolve o texto do banco. **Não tente casar pelo código:** verificado pelo PostgREST, o `RC001` chega em `error.code`, nunca dentro de `error.message`.

**O certo, que não coube:** o reapontamento deveria **mover** os inscritos de um cargo para o outro, não duplicá-los — mudar de ideia deveria simplesmente funcionar. Isso é a fusão de cargos da etapa 7 (RPC transacional). Bloquear é o downgrade barato: converte perda silenciosa em "ainda não dá" explícito.

