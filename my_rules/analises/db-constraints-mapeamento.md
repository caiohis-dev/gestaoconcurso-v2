# Mapeamento Zod × SQL — entregável da Etapa 1 do roadmap de DB constraints

**Data:** 2026-07-25 · **Branch:** `feat/db-constraints` · **Roadmap:** [`roadmap-db-constraints.yaml`](./roadmap-db-constraints.yaml)

Levantado do **banco local** (cópia dos dados reais de produção v1), não das migrations — o schema tem drift histórico, então migration não é fonte confiável do estado atual.

> **Portão:** este documento existe para ser revisado **antes** de qualquer `ALTER TABLE`. As linhas marcadas 🔴 dependem de decisão humana; as demais são mecânicas.

## Legenda dos baldes (decisão D5 do roadmap)

| Balde | Significado | Ferramenta |
|---|---|---|
| **(a)** | Regra da própria linha | `CHECK` |
| **(b)** | Regra entre tabelas | trigger, ou fica só no frontend |
| **(c)** | Conveniência de formulário, não invariante do domínio | nada no banco |

---

## `unidades_prova`

| Coluna | Regra Zod | Hoje no banco | Balde | Proposta | Violações |
|---|---|---|---|---|---|
| `unid_nome` | `min(1).max(30)` | `varchar(30)` NOT NULL | (a) | `length(trim(unid_nome)) > 0` | 0 |
| `unid_sigla` | `min(1).max(10)` | `char(10)` NOT NULL | (a) | `length(trim(unid_sigla)) > 0` | 0 |
| `unid_andares` | `min(1).max(99)` | `smallint` NOT NULL | (a) | `unid_andares >= 1` 🔴 e o teto? | 0 |

⚠️ **`unid_sigla` é `CHAR(10)`, não `VARCHAR`** — o Postgres preenche com espaços até 10. Portanto `length(unid_sigla)` é **sempre 10**, e só `length(trim(...))` diz alguma coisa. O `max(10)` do Zod já é garantido pelo tipo.

🔴 **Decisão: o teto de 99 andares é regra de negócio ou número redondo?** É o caso que o roadmap usa de exemplo. `>= 1` é indiscutível. O `<= 99` é aposta: se um dia houver unidade com mais andares, a constraint barra um cadastro legítimo **no dia da prova**. Recomendo entrar só com `>= 1` — a faixa mais larga que ainda barra o absurdo (`0` e negativos).

## `sala_prova`

| Coluna | Regra Zod | Hoje no banco | Balde | Proposta | Violações |
|---|---|---|---|---|---|
| `sala_capacidade` | `.int().positive()` | `smallint` NOT NULL | (a) | `sala_capacidade > 0` | 0 |
| `sala_numero` | `.int().positive()` | `integer` NOT NULL | (a) | `sala_numero > 0` | 0 |
| `sala_andar` (piso) | `.int().min(1)` | `smallint` NULL | (a) | `sala_andar IS NULL OR sala_andar >= 1` | 0 |
| `sala_andar` (teto) | `.max(maxAndares)` | — | **(b)** | **não vira CHECK** — ver abaixo | 0 |
| `sala_descricao` | `.max(50)` | `varchar(50)` | (a) | já garantido pelo tipo | — |
| `quantidade` | `.min(1).max(50)` | *não é coluna* | **(c)** | nada — é quantas salas criar de uma vez | — |

**O caso (b), que o roadmap registra como armadilha:** o Zod limita `sala_andar` a `maxAndares`, que vem de `unidades_prova.unid_andares` **da unidade daquela sala**. `CHECK` não enxerga outra tabela. A tentação é escrever um CHECK com função que consulta `unidades_prova` — o Postgres **aceita**, mas **não reavalia** quando `unid_andares` diminui, então a constraint passa a mentir. Ou trigger, ou nada. Hoje: 0 salas violam.

## `provas`

| Coluna | Regra Zod | Hoje no banco | Balde | Proposta | Violações |
|---|---|---|---|---|---|
| `prova_edital` | — (denormalizado) | `char(30)` NOT NULL | (a) | `length(trim(prova_edital)) > 0` | 0 |
| `prova_n_candidatos` | string → int | `integer` NULL | (a) | `IS NULL OR prova_n_candidatos > 0` | 0 |
| `prova_hora_inicio/final` | `z.string().optional()` — **sem formato nem ordem** | `time` NULL | (a) | 🔴 `final > inicio` quando ambos existem | 0 |

🔴 **Decisão: o banco deve ser mais rígido que o Zod aqui?** O schema aceita qualquer string e não confere ordem — os testes registram isso. Uma prova que termina antes de começar é absurda, e o tipo `time` já barra formato inválido. Mas note o que a constraint muda: hoje é **possível** salvar `final <= inicio` pela UI, e passaria a ser impossível. Nenhuma linha viola. Recomendo entrar — é exatamente o tipo de invariante que justifica o tema.

## `editais`

| Coluna | Regra Zod | Hoje no banco | Balde | Proposta | Violações |
|---|---|---|---|---|---|
| `nome` | `min(1)`, sem máximo | `text` NOT NULL | (a) | `length(trim(nome)) > 0` | 0 |
| `n_candidatos` | string → int | `integer` NULL | (a) | `IS NULL OR n_candidatos > 0` | 0 |

## `funcoes_colaboradores`

| Coluna | Regra Zod | Hoje no banco | Balde | Proposta | Violações |
|---|---|---|---|---|---|
| `cargo_nome` | `min(1).max(35)` | `varchar(35)` NOT NULL | (a) | `length(trim(cargo_nome)) > 0` | 0 |
| `cargo_cbo` | `.max(7)` | `varchar(7)` | (a) | já garantido pelo tipo | — |
| `cargo_descricao` | `.max(1000)` | `varchar(1000)` | (a) | já garantido pelo tipo | — |

## `colaboradores`

Já tem 7 CHECKs (bancários + `tipo_chave_pix`) — os campos de banco **já estão cobertos**, foi trabalho anterior.

| Coluna | Regra Zod | Hoje no banco | Balde | Proposta | Violações |
|---|---|---|---|---|---|
| `colab_nome_completo` | `min(1).max(40)` | `varchar(40)` NOT NULL | (a) | `length(trim(...)) > 0` | 0 |
| `colab_cpf` | `.length(11)` — ⚠️ **não exige dígito** | `char(11)` NOT NULL | (a) | `colab_cpf ~ '^[0-9]{11}$'` | 0 |
| `colab_telefone` | `.int().positive()` | `bigint` NULL | (a) | `IS NULL OR > 0` | 0 |
| `colab_numero_casa` | `number` | `integer` NULL | (a) | `IS NULL OR >= 0` | 0 |
| `colab_email` | `.email().max(255)` | `varchar(255)` NULL | (a) | 🔴 regex de e-mail | **24** |
| dígitos verificadores do CPF | ⚠️ **não valida** | — | (c) | fora de escopo — é algoritmo, não formato | — |

**O CPF é o melhor achado da tabela:** o Zod usa `.length(11)`, que aceita **11 caracteres quaisquer** — `"abcdefghijk"` passa. O banco é `CHAR(11)`, que também aceita. Ou seja, hoje **nada** garante que o CPF seja numérico, nem no frontend nem no banco. A constraint fecha isso, e nenhuma das 771 linhas viola.

---

## 🔴 O único ponto com dado sujo: e-mail (24 linhas)

Das 24 que falham numa regex básica de e-mail, a divisão importa mais que o total:

| Grupo | Qtd. | Exemplos | Natureza |
|---|---|---|---|
| **Só espaço nas pontas** | **22** | `" brunaalmoreira@gmail.com"`, `"anderson04877@gmail.com "` | E-mail **válido**, sujeira de digitação/importação |
| **Realmente malformados** | **2** | `conceicaorosana55@gmailcom` (sem o ponto), `reaportalvr.com` (sem `@`) | Endereço que **não existe** |

E o espaço nas pontas **não é só no e-mail** — é sistêmico do dump:

- `colab_email` com espaço sobrando: **22**
- `colab_nome_completo` com espaço sobrando: **20**
- `colab_chave_pix` com espaço sobrando: **21**
- `unid_nome`: 0

**Por que isso importa além da constraint:** o índice único de `colab_email` é funcional sobre `lower(trim(...))`, então a unicidade já ignora o espaço — mas qualquer busca por igualdade crua (`WHERE colab_email = 'x'`) erra. E `colab_chave_pix` com espaço é dado bancário: casa com o item de backlog do saneamento das chaves PIX, que já está aberto.

### As duas decisões que isto abre

1. **O que fazer com as 22 de espaço.** Recomendo **normalizar** (`trim`) em vez de recusar: é sujeira, não erro do usuário. Mas o saneamento é **operação de dados** e, pela D4 do roadmap, **não vai na migration** — vai para `seed.pos.sql` como regra genérica idempotente. E se a normalização entrar, vale considerar um trigger `BEFORE INSERT OR UPDATE` que aplica `trim` na escrita, senão o problema volta pela mesma porta.

2. **O que fazer com as 2 malformadas.** São pessoas reais com endereço inexistente. Ninguém consegue adivinhar o certo — `conceicaorosana55@gmailcom` *provavelmente* é `gmail.com`, mas "provavelmente" não basta para dado de contato que vai virar login. Opções: (i) corrigir a óbvia e anular a outra; (ii) anular as duas (`NULL` é honesto: "não temos e-mail dela"); (iii) deixar como está e **não** criar a constraint de e-mail agora. Recomendo **(ii)**, com a lista nominal levada a quem conhece essas pessoas — anular não perde informação recuperável, porque o valor atual não serve para nada mesmo.

⚠️ Enquanto (1) e (2) não forem decididos, **a constraint de e-mail não entra**. Todas as outras 17 podem entrar já, porque têm zero violações.

---

## Resumo para decisão

**Entram sem discussão (mecânicas, 0 violações):** `unid_nome`, `unid_sigla`, `sala_capacidade`, `sala_numero`, `sala_andar >= 1`, `prova_edital`, `prova_n_candidatos`, `editais.nome`, `editais.n_candidatos`, `cargo_nome`, `colab_nome_completo`, `colab_cpf` (a melhor delas), `colab_telefone`, `colab_numero_casa`.

**Precisam de decisão sua:**
1. `unid_andares` — só `>= 1`, ou também `<= 99`?
2. `prova_hora_final > prova_hora_inicio` — o banco pode ser mais rígido que o formulário?
3. E-mail — o que fazer com as 22 de espaço e as 2 malformadas?

**Fica de fora, com motivo registrado:** teto de `sala_andar` (balde b), dígito verificador de CPF (algoritmo, não formato), `quantidade` de salas (balde c).
