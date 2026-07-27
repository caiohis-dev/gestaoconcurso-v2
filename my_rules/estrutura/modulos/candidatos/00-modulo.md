# Módulo: Candidatos

> **Contrato do módulo.** Este arquivo deve bastar para implementar ou refatorar o módulo Candidatos sem reler o codebase. Se faltou algo, o defeito é deste doc — corrija-o junto com o código. Ver [`../../00-indice.md`](../../00-indice.md).

## Identidade

| | |
|---|---|
| **`id`** em `src/lib/modulos.ts` | `candidatos` |
| **Nome na UI** | Candidatos |
| **Papéis com acesso** | `superadmin`, `admin` — **não** coordenador |
| **Rota de entrada** | `/candidatos` (fixa, sem variação por papel) |
| **`prefixosRota`** | `['/candidatos']` — cobre `/candidatos/importar` pela regra prefixo + `/` |
| **`navLinks`** | Candidatos → `/candidatos` · Importar → `/candidatos/importar` (ambos `showFor: ['admin','superadmin']`) |
| **Ícone** | `Users` (lucide) |

Módulo criado em **2026-07-27**, a partir do arquivo real de inscritos do concurso 002-2026-SMA (7.416 linhas, em `docs/temp/`).

## O que o módulo é

O **candidato** é o **inscrito** num edital: a pessoa que vai **fazer** a prova. É a contraparte do *colaborador*, que é quem **aplica** a prova. Essa distinção é a razão de o módulo existir separado — ver a fronteira no fim.

**O ponto que governa tudo aqui: candidato NÃO se cadastra à mão. Ele sempre chega por importação de planilha** (decisão do usuário na criação do módulo). Não existe formulário de criação nem de edição; a ficha do candidato é somente leitura. Corrigir um candidato significa corrigir a planilha na origem e reimportar.

Duas consequências que precisam sobreviver a qualquer refatoração:

1. **A tabela precisa de uma chave natural**, senão "sempre importado" vira "duplica a cada importação". É o índice `candidatos_inscricao_cargo_key`, e o app faz **UPSERT** sobre ele.
2. **Reimportar é o fluxo normal, não a exceção.** Toda mensagem de erro da importação deve terminar em "corrija e importe de novo" — é sempre seguro, porque o upsert é idempotente (verificado: reimportar as 7.416 linhas mantém 7.416).

## Arquivos

| Arquivo | Papel |
|---|---|
| `src/lib/candidatos-import.ts` (448 l.) | **O cérebro do módulo.** Puro, sem React nem Supabase: campos disponíveis, rótulos de coluna, auto-pareamento, conversores (data/hora/CPF/e-mail), a distinção erro-vs-aviso, deduplicação e tradução de erro do Postgres |
| `src/lib/candidatos-import.test.ts` (40 testes) | A bateria da lógica acima. **Todos os casos de dado sujo são medidos no arquivo real**, não inventados |
| `src/hooks/useCandidatos.test.tsx` (24 testes) | Bateria dos hooks: paginação e o `count` do servidor, o `onConflict` da chave natural, a divisão em blocos, o parar, a tradução de erro |
| `src/pages/Candidatos.ui.test.tsx` (23 testes) | Bateria da listagem: total do servidor, data sem o bug de fuso, badges, busca, paginação e **as duas exclusões com barreiras diferentes** |
| `src/pages/CandidatosImportar.ui.test.tsx` (18 testes) | Bateria do assistente. Monta um `.xlsx` de verdade (com as duas colunas `NOME`) e o lê pelo caminho real da página; guarda o **alerta de chave repetida com cargo sem parear** |
| `src/pages/Candidatos.tsx` (424 l.) | Listagem: escolha do edital por card, busca, paginação, ficha em diálogo, exclusão de um e "limpar edital" |
| `src/pages/CandidatosImportar.tsx` (615 l.) | O assistente de 4 passos: arquivo → pareamento → importação → relatório |
| `src/hooks/useCandidatos.tsx` (258 l.) | React Query: `useCandidatos` (paginada), `useContagemCandidatosPorEdital`, `useImportarCandidatos` (upsert em blocos), `useExcluirCandidatos` |
| `supabase/migrations/20260727000000_create_candidatos.sql` | Todo o schema do módulo — tabela, coluna gerada, índices, 6 CHECKs, RLS, trigger e a RPC de contagem |

Não há Edge Function neste módulo. A única RPC é `contar_candidatos_por_edital`, e ela é **SECURITY INVOKER** de propósito.

**105 testes ao todo** (medidos em 2026-07-27), o que faz de Candidatos o módulo mais coberto do sistema. ⚠️ **Mas a suíte mocka o Supabase:** ela não exercita RLS, CHECK, índice único nem a coluna gerada. A tabela de permissões acima e a idempotência do upsert foram verificadas **à mão** contra o banco local — e precisam ser refeitas assim por quem mexer no schema. Ver [`../../transversais/invariantes.md`](../../transversais/invariantes.md).

## Modelo de dados

```
candidatos
  id                    uuid PK
  edital_id             uuid NOT NULL → editais(id) ON DELETE RESTRICT
  n_inscricao           varchar(8) NOT NULL     -- string(8): pedido explícito do usuário
  cargo                 text                     -- compõe a chave natural
  cargo_chave           text GENERATED ... STORED  -- lower(btrim(coalesce(cargo,'')))
  nome                  text NOT NULL
  cpf                   text        -- 11 dígitos ou NULL
  identidade_numero / identidade_orgao / identidade_uf(2) / identidade_emissao(date)
  email / telefone / celular         -- os três TEXT
  logradouro / numero / complemento / bairro / cidade / uf(2) / cep
  data_nascimento       date
  hora_nascimento       time         -- desempate legal em concurso
  sexo                  text         -- '0'/'1' na origem, guardado cru
  raca                  smallint     -- códigos de RACA_MAP
  portador_deficiencia  boolean NOT NULL DEFAULT false
  confirmado            boolean NOT NULL DEFAULT false
  concurso_id_origem    text         -- rastro da procedência ('242')
  created_at / updated_at / created_by
```

### ⭐ A chave natural — o achado que decidiu o desenho

**A unicidade é `(edital_id, n_inscricao, cargo_chave)`, e NÃO `(edital_id, n_inscricao)`.**

Medido no arquivo real: **382 números de inscrição aparecem mais de uma vez** (778 linhas). Não é sujeira — é a mesma pessoa concorrendo a mais de um cargo com a mesma inscrição:

```
213946 | CASSIA ANDREA ... | DOCENTE II
213946 | CASSIA ANDREA ... | DOCENTE I - LÍNGUA INGLESA
213946 | CASSIA ANDREA ... | DOCENTE I - HISTÓRIA
```

O trio é único nas 7.416 linhas; o par rejeitaria **396 inscritos legítimos**. Quem for "corrigir" isso para uma chave mais simples vai perder inscrito.

⚠️ **Por que a coluna gerada `cargo_chave` existe.** A normalização (`lower(btrim(coalesce(...)))`) segue o padrão funcional de `editais_nome_key`, mas **não pode morar no índice** como lá: o upsert do PostgREST (`?on_conflict=a,b,c`) só sabe nomear **colunas**, e um índice funcional seria invisível para ele — a reimportação duplicaria tudo em vez de atualizar. Sendo `GENERATED`, o banco a mantém sozinho, então não há como o app esquecer de atualizá-la. **Não troque por coluna comum preenchida no app.**

### As constraints, e por que estas e não outras

Todas foram **contadas contra as 7.416 linhas antes de existir** (regra 5 de [`../../transversais/invariantes.md`](../../transversais/invariantes.md)):

| CHECK | O que barra |
|---|---|
| `chk_candidato_n_inscricao_preenchido` / `chk_candidato_nome_preenchido` | branco no que identifica |
| `chk_candidato_cpf_formato` | CPF que não seja 11 dígitos (ou NULL) |
| `chk_candidato_cep_formato` | CEP que não seja 8 dígitos (ou NULL) |
| `chk_candidato_email_formato` | e-mail sem `@`/domínio (formato mínimo, frouxo de propósito) |
| `chk_candidato_raca_valida` | código fora de `RACA_MAP` (1, 2, 4, 6, 8, 9) |

⚠️ **O que foi deixado de fora, e é decisão, não esquecimento:**

- **Não há faixa em `data_nascimento`.** 15 linhas reais trazem 1193, 1780, 2975. É a data que a pessoa digitou na inscrição; um CHECK rejeitaria a carga, e "corrigir" seria inventar dado.
- **Não há lista de UFs.** `identidade_uf` tem 36 valores distintos no arquivo real, incluindo `BR`, `UF` e `13`. São 2 caracteres e cabem.
- **Não há dicionário de `sexo`.** A origem manda `'0'`/`'1'` sem legenda. Traduzir para `'M'`/`'F'` aqui seria afirmar um significado que ninguém confirmou.

**Três colunas do arquivo NÃO viraram campo**: `REGISTRO_ORGAO` e `TIPOPROVA` (100% vazias nas 7.416 linhas) e **`SENHA`** — senha de terceiro não se importa para lugar nenhum, mesmo vindo vazia.

## Permissões

| Operação | RLS |
|---|---|
| SELECT / INSERT / UPDATE / DELETE | `has_role(auth.uid(), 'admin')` — **as quatro** |

⚠️ **A LEITURA é fechada em admin, e isso é escolha deliberada — não copie a política de `editais`.** `editais` usa `SELECT USING (true)` porque nome de edital não é dado de ninguém. Aqui **cada linha é CPF, e-mail, endereço e telefone de um cidadão**. A auditoria de 2026-07-26 fechou quatro tabelas operacionais que estavam em `USING (true)` exatamente por isso; esta nasceu fechada em vez de repetir o caminho.

O coordenador não tem uso para a lista de inscritos: ele opera **colaboradores**, não candidatos.

**Verificado no banco local em 2026-07-27**, com as 7.416 linhas carregadas:

| Quem | SELECT | INSERT |
|---|---|---|
| admin | 7416 | ok |
| superadmin | 7416 (a hierarquia mora no `has_role`) | ok |
| coordenador | **0** | **recusado pela RLS** |
| anon | **0** | — |

A tabela herda os `GRANT`s do `ALTER DEFAULT PRIVILEGES` da migration `20260712010000` — sem eles o PostgREST nem chegaria a avaliar a RLS.

🔴 **Mas a herança traz junto o que não se quer, e aqui dói mais que nas outras tabelas.** Verificado em 2026-07-27: `anon` recebeu também `TRUNCATE`, `INSERT`, `UPDATE`, `DELETE` e `REFERENCES`. A RLS neutraliza todos **menos `TRUNCATE`, que não passa por RLS** — confirmado no banco local, um `TRUNCATE candidatos` como `anon` **funciona**. O que segura na prática é o PostgREST não expor TRUNCATE pela API, ou seja, um detalhe de implementação de terceiro.

Isso é o item *"Enxugar os grants de `anon`/`authenticated`"* do [`backlog.md`](../../../backlog.md), que é sistêmico e anterior a este módulo. **O que muda com Candidatos é a aposta:** as outras tabelas guardam dado operacional; esta guarda CPF, e-mail, telefone e endereço de milhares de cidadãos. Ao mexer naquele item, comece por aqui.

## A importação — as regras que não são óbvias

### ⭐ Erro vs. aviso: o que descarta a linha e o que só limpa um campo

**A identidade do candidato é o NÚMERO DE INSCRIÇÃO**, não o CPF (ao contrário do colaborador, que loga com o CPF). Daí a regra:

- falta o que **identifica** (inscrição, nome) → **ERRO**, a linha não entra;
- campo secundário impossível (CPF de 10 dígitos, e-mail sem `@`, data irreconhecível) → **AVISO**, a linha entra com aquele campo em `NULL` e o relatório diz qual foi.

**Por quê:** descartar o inscrito inteiro por causa do e-mail dele deixaria a **lista de inscritos incompleta**, que é o único jeito de esta tabela estar de fato errada. No arquivo real isso salva 29 inscritos: 2 com CPF impossível (`' 8631309761'` com 10 dígitos, `'1O778817709'` com a letra O no lugar do zero) e 27 com e-mail impossível (`'andi.gmail'`, `'marcia2manoel@ gmail.com'`, dois endereços no mesmo campo).

### ⚠️ A planilha é lida em ARRAY, nunca em objeto

`XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false })`. As duas opções são obrigatórias:

- **`header: 1` (array)** porque o arquivo real tem **duas colunas chamadas `NOME`**: a **C** (nome da pessoa) e a **AC** (o cargo, `'DOCENTE II'`). No modo objeto a segunda sobrescreve a primeira e **todo mundo passa a se chamar 'DOCENTE II'**. `CadastroLote.tsx` lê em modo objeto — não copie de lá.
- **`raw: false` (texto)** porque em modo cru o CPF `'05176390760'` viraria o número `5176390760` e perderia o zero à esquerda — o CPF de outra pessoa.

Por isso **o pareamento é por índice de coluna**, e o rótulo mostrado carrega a letra (`NOME (coluna AC)`) quando o cabeçalho se repete ou está vazio.

⚠️ **Cada campo do pareamento precisa continuar com `htmlFor`/`id` ligando o `<label>` ao `SelectTrigger`.** São 25 comboboxes idênticos numa tela só: sem a associação, um leitor de tela anuncia 25 vezes "combobox" e a tela fica inoperável para quem depende dele — foi assim que ela nasceu, e foi corrigido em 2026-07-27. Funciona porque `<button>` é elemento rotulável. O asterisco dos obrigatórios é `aria-hidden` (decoração); quem informa a obrigatoriedade é o `required` do `Select`, que o Radix transforma em `aria-required` no gatilho. Duas regressões em `CandidatosImportar.ui.test.tsx` guardam isso.

### ⚠️ O cargo NÃO é auto-pareado, de propósito

`'tipoprova'` foi **removido** dos sinônimos de `cargo`. No arquivo real o cargo está na segunda coluna `NOME`, enquanto `TIPOPROVA` existe e está **100% vazia**. Adivinhar `TIPOPROVA` *pareceria acertar* e deixaria o cargo nulo em todas as linhas — e como **o cargo compõe a chave natural**, as 382 inscrições repetidas colidiriam entre si e **396 inscritos sumiriam sem erro nenhum**.

Palpite que erra em silêncio é pior que palpite nenhum. Por isso o passo 2 do assistente também **alerta em vermelho** quando há chaves repetidas *e* o cargo está sem parear, apontando onde o cargo costuma estar.

O auto-pareamento em geral é mais rígido que o de `CadastroLote`: casa por **igualdade exata** do cabeçalho normalizado contra sinônimos, não por `includes` nos dois sentidos (que casa `'cidade'` com `'id'`). Cabeçalho ambíguo fica em branco esperando o usuário.

### ⚠️ Deduplicar dentro do arquivo é obrigatório, não zelo

O Postgres recusa o lote inteiro com *"ON CONFLICT DO UPDATE command cannot affect row a second time"* se a mesma chave aparecer duas vezes no mesmo upsert. Sem `deduplicar()`, **um arquivo com uma linha duplicada não importa nada** — falha o bloco de 500 inteiro e a pessoa não tem como saber por quê. Mantém-se a **última** ocorrência (quem corrige uma linha costuma reescrevê-la abaixo).

### Gravação em blocos

`TAMANHO_BLOCO = 500`, no `useCandidatos.tsx`. Uma requisição por linha — como faz `CadastroLote` — daria 7.416 idas ao servidor. Em blocos são 15. **Medido: 7.416 candidatos em 0,4 s.**

Cada bloco é uma transação sua: um bloco que falha não desfaz os anteriores, e por isso o relatório mostra quantos entraram.

## Fronteira do módulo — o que NÃO é daqui

**Candidato ≠ colaborador.** O colaborador (fiscal, coordenador, apoio) é quem **aplica** a prova, tem conta de login, CPF como identidade e vive no módulo [Aplicação de Provas](../aplicacao-provas/colaboradores.md). O candidato **não tem conta**, não loga, não é alocado em sala e não recebe pagamento. Nenhuma das duas tabelas referencia a outra.

**Nada em `candidatos` liga a `provas`.** O vínculo é com o **edital**. Se um dia for preciso saber em que sala cada candidato faz prova, isso é feature nova e provavelmente tabela nova — não é para pendurar `prova_id`/`sala_id` aqui sem desenho.

**O edital é do módulo [Editais](../editais/00-modulo.md).** Este módulo só o consome: lê a lista para escolher o destino da importação e para os cards da listagem.

⚠️ **Mas criou uma dependência de volta que precisa ser lembrada:** `candidatos.edital_id` é `ON DELETE RESTRICT`, então **`editais` agora tem DOIS dependentes que barram exclusão** (`provas` e `candidatos`) — e candidatos é o que mais barra, porque um edital tem milhares de inscritos e poucas provas. `useEditais.tsx` distingue os dois casos na mensagem de erro; culpar "provas vinculadas" quando quem barrou foram os inscritos manda o usuário procurar no lugar errado. É a armadilha do **RESTRICT indireto** descrita em [`../../transversais/invariantes.md`](../../transversais/invariantes.md).

**`editais.n_candidatos` continua sendo um número digitado à mão** e **não** é alimentado por este módulo. São coisas diferentes: aquele é a previsão do edital, este é a lista real de inscritos. Quem for unificar precisa decidir qual manda — hoje ninguém sincroniza os dois, e o card da listagem mostra a contagem real vinda da RPC, não `n_candidatos`.

## Acessibilidade — o que foi corrigido, e por que não pode voltar

As duas telas nasceram com defeitos de nome acessível, achados em 2026-07-27 **porque a bateria de UI precisou contorná-los** — quando um teste só consegue alcançar algo por posição no DOM, é sinal de que aquilo não tem nome. Ambos corrigidos, com regressão guardando cada um.

| Onde | Era | Ficou |
|---|---|---|
| Passo 2 do assistente | 25 `<label>` sem `htmlFor` — leitor de tela anunciava 25 "combobox" indistinguíveis | `htmlFor`/`id` ligando cada rótulo ao `SelectTrigger`; o `*` virou `aria-hidden` e a obrigatoriedade viaja no `required` do `Select` (Radix → `aria-required`) |
| Linha da listagem | botão de excluir só com o ícone de lixeira, **sem nome nenhum**; o de ver dizia só "Ver" | `aria-label` nomeando **o inscrito**: `Excluir <nome>` e `Ver ficha de <nome>` |

Três coisas que precisam sobreviver a qualquer refatoração dessas telas:

1. **`<button>` é elemento rotulável**, e é por isso que o `<label htmlFor>` funciona sobre o gatilho do Radix Select. Não troque por texto solto ao lado do campo.
2. **O nome da ação inclui em QUEM ela age.** São até 50 linhas por página; "Excluir" repetido 50 vezes não diz nada a quem navega por leitor de tela. O mesmo raciocínio vale para qualquer tabela de ações que venha depois.
3. **`Ver ficha de …` começa com a palavra visível ("Ver")**, o que a WCAG 2.5.3 (*Label in Name*) exige de quem tem texto na tela — quem usa comando de voz fala o que enxerga. Ao criar `aria-label` sobre um botão com texto, **comece pelo texto visível**.

## Pontos frágeis conhecidos

- **O acento do arquivo de origem vem quebrado** (`'DOCENTE I ¿ LÍNGUA INGLESA'` — o `¿` é um travessão mal codificado em cp1252). Guardamos como veio: é o dado da origem, e "consertar" no meio do caminho criaria divergência entre a planilha e o banco. Se incomodar, o conserto é na exportação de origem.
- **A exclusão de um candidato não pede senha; "limpar edital" pede.** Proposital: a primeira atinge uma linha e é reversível por reimportação, a segunda atinge milhares. Pedir senha nas duas ensinaria a digitá-la no piloto automático.
- **Não há paginação no relatório de problemas** — ele sai em `.xlsx`, que é onde a pessoa vai trabalhar.
