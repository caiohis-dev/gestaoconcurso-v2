# Importação em lote de colaboradores — `/cadastro-lote`

Feature do módulo [Aplicação de Provas](./00-modulo.md), parte de [colaboradores](./colaboradores.md). Código: `src/pages/CadastroLote.tsx` (1.118 linhas).

> 🔵 **Este arquivo morava em `docs/features/cadastro-lote-sanitizacao.md` até 2026-07-31.** Foi movido para cá porque é doc de **feature de módulo**, e a regra da casa é que o doc do módulo baste para refatorá-lo sem reler o codebase — com a sanitização fora da pasta, não bastava. Na mudança ele foi **conferido linha a linha contra o código**, e **cinco afirmações estavam erradas**; as correções estão marcadas com 🔴 ao longo do texto.

A importação **não persiste a planilha original**. Cada linha é lida, transformada em memória e só então enviada ao banco por `supabase.from('colaboradores').insert(...)` — uma linha por vez, em laço, com pausa/parada controladas pelo usuário.

---

## A ordem real das etapas

O doc antigo descrevia sanitização → validação → INSERT. **A ordem verdadeira intercala validação e banco**, e isso importa: duas das barreiras acontecem *antes* de `formatarDados` sequer rodar.

```
Planilha (.xlsx)
      ↓
Auto-mapeamento dos cabeçalhos (normalizarTexto)  ── usuário revisa
      ↓
Para cada linha:
  1. Valida CPF  ────────────────►  cpfValido (módulo 11). Falhou → ERRO, pula a linha
  2. Consulta CPF no banco  ─────►  já existe → AVISO, pula a linha
  3. formatarDados(linha)          trim, conversões, truncamento, pré-validação de tamanho
  4. Valida obrigatórios           nome, cpf, data_nascimento
  5. INSERT
  6. Erro do banco → tradução para mensagem legível
```

---

## 1. Auto-mapeamento dos cabeçalhos

`normalizarTexto` (linha 101) reduz cabeçalho da planilha e nome de coluna à mesma forma para comparar: minúsculas → remove acentos (`NFD` + regex de diacríticos) → remove `_`, espaços e hífens → `trim`.

`"Nome Completo"` → `nomecompleto` · `colab_nome_completo` → `nomecompleto` → casa.

O usuário revisa e ajusta o mapeamento antes de processar.

---

## 2. 🔴 O CPF — e por que ele NÃO é apenas "11 dígitos"

> 🔴 **O doc antigo afirmava:** *"Não valida se o CPF é matematicamente válido: apenas garante que tenha 11 dígitos numéricos."* **Falso.** `CadastroLote` importa `cpfValido` de `src/lib/cpf.ts` (linha 4) e **rejeita a linha** (linha 420). O validador cobre tamanho, blacklist de dígitos repetidos e **os dois dígitos verificadores (módulo 11)**. É o mesmo e único validador do repo, compartilhado com o `ColaboradorDialog`.

**A validação roda sobre os dígitos SEM padding, e isso é deliberado:**

```ts
const cpfDigitos = (cpfRaw?.toString() || '').replace(/\D/g, '');   // sem padStart
if (!cpfRaw || !cpfValido(cpfDigitos)) { /* ERRO, pula a linha */ }
```

⚠️ **Padear antes de validar foi um defeito real, já corrigido no `ColaboradorDialog`:** `"123456"` virava `00000123456` — que é o CPF **de outra pessoa**, e podia até passar no módulo 11. O comentário no código registra isso; **não "otimize" juntando as duas linhas.**

> 🔴 **O doc antigo dava este exemplo:** planilha com `"0011223344"` → `padStart` → *"garante que o CPF sempre chegue ao banco"*. **Duplamente errado.** Aritmeticamente (`padStart(11)` sobre 10 caracteres dá **11** dígitos, e o doc escrevia 12) e, sobretudo, no resultado: esses 10 dígitos **falham em `cpfValido` e a linha é rejeitada** — ela nunca chega ao banco.

O `padStart(11, '0')` **existe**, mas só no payload do INSERT (linha 329), depois da validação já ter aprovado 11 dígitos válidos. Nesse ponto ele é inócuo.

### Duplicidade de CPF é AVISO, não erro

Antes do INSERT há um `SELECT id FROM colaboradores WHERE colab_cpf = ...`. Se existe, a linha é **ignorada e contada como aviso** (não erro) — importar a mesma planilha duas vezes não polui o relatório de falhas. ⚠️ É "leio e então decido", ou seja, uma corrida; quem de fato garante é o índice único, e o `23505` que chegar depois também vira aviso (linha 478).

---

## 3. 🔴 Campos textuais passam por `trim` — e vazio vira `NULL`

> 🔴 **O doc antigo dizia, para quase todo campo, apenas "Convertido para string".** Omitia o `trim`, que é justamente o que consertou um defeito histórico.

O helper `texto()` (linha 319) trata todo campo textual:

```ts
const limpo = valor.toString().trim();
return limpo === '' ? null : limpo;
```

⚠️ **Por que isso não é cosmético:** planilha traz espaço nas pontas o tempo todo, e foi assim que **22 e-mails com espaço** entraram na base. Desde as CHECK constraints de 2026-07-25, `chk_colab_email_formato` **rejeita** e-mail com espaço — sem o `trim`, a linha inteira falharia. O índice único de e-mail e PIX já comparava por `lower(trim(...))`, então normalizar na escrita só alinhou ao que a unicidade sempre assumiu.

### O que cada coluna recebe

| Coluna | Tipo | Tratamento |
|---|---|---|
| `colab_matricula` | texto (6) | `texto()` — trim, vazio → `NULL` |
| `colab_nome_completo` | texto (40) | `texto()`, com fallback `''`. **Obrigatório** |
| `colab_cpf` | texto (11) | Só dígitos + `padStart(11,'0')`. **Validado antes por `cpfValido`** |
| `colab_data_nascimento` | `YYYY-MM-DD` | `converterDataExcel` (§4). **Obrigatório** |
| `colab_nacionalidade` | texto (10) | `texto()` |
| `colab_pis` | texto (11) | Só dígitos (`\D` removido). Vazio → `NULL`. Não usa `texto()` — dígito não precisa de trim |
| `colab_rua` | texto (34) | `texto()` · ⚠️ **truncado** (§6) |
| `colab_numero_casa` | int / null | `parseInt`. Vazio → `NULL` |
| `colab_bairro` | texto (26) | `texto()` · ⚠️ **truncado** (§6) |
| `colab_cidade` | texto (15) | `texto()` |
| `colab_cep` | int / null | Só dígitos → `parseInt`. Aceita `"01234-567"` |
| `colab_estado_civil` | int / null | `parseInt` |
| `colab_raca` | int / null | `parseInt` |
| `colab_grau_instrucao` | int / null | `parseInt` |
| `colab_telefone` | int / null | Só dígitos → `parseInt`. Aceita `"(11) 99999-8888"` |
| `colab_complemento_endereco` | texto (20) | `texto()` · ⚠️ **truncado** (§6) |
| `colab_deficiente` | boolean | `toLowerCase() === 'true'`. Qualquer outra coisa → `false` |
| `colab_email` | texto (255) | `texto()`. Sem validação de formato no cliente — quem barra é `chk_colab_email_formato` |
| `colab_chave_pix` | texto (255) | `texto()` |

---

## 4. Datas

`converterDataExcel` (linha 261) tenta, nesta ordem:

1. **Serial do Excel** (número, e o valor **não** é string) → base `20/12/1899` + N dias.
2. **ISO `YYYY-MM-DD`** → mantém.
3. **`D/M/AAAA`** com `/`, `-` ou `.` → aceita 1 **ou** 2 dígitos em dia e mês, normaliza com `padStart`.
4. **8 dígitos seguidos** (`DDMMAAAA`) → fatia 2/2/4.
5. **Qualquer outra coisa** → devolve o texto como veio, e o banco rejeita. O `22007`/`22008` é traduzido para *"Data inválida. Use DD/MM/AAAA ou DDMMAAAA"*.

Vazio devolve `''`, que cai na validação de obrigatórios.

---

## 5. 🔴 Tamanho: QUATRO campos são truncados em silêncio, não rejeitados

> 🔴 **O doc antigo afirmava:** *"Se houver excesso, a linha é rejeitada antes do INSERT"* — e listava `colab_nome_completo` (40) na tabela de exemplos. **Falso para quatro campos**, incluindo o nome.

```ts
const CAMPOS_TRUNCAR = ['colab_nome_completo', 'colab_complemento_endereco',
                        'colab_rua', 'colab_bairro'];
// ...  valor.slice(0, limite)   ← corta e segue, sem log, sem aviso, sem contador
```

🔴 **Um nome com mais de 40 caracteres entra cortado e ninguém é avisado.** É **perda silenciosa** — o formato de erro que este repo mais teme: não dá erro, o relatório diz "cadastrado com sucesso", e o dado está errado. Está registrado como achado em aberto no [`backlog.md`](../../../backlog.md), não como comportamento desejado.

**Os demais campos** (`colab_matricula` 6, `colab_nacionalidade` 10, `colab_pis` 11, `colab_cidade` 15, `colab_email` 255, `colab_chave_pix` 255, `colab_cpf` 11) **rejeitam** a linha, com mensagem que nomeia a coluna da planilha, a do banco e o limite.

---

## 6. Obrigatórios

Depois de `formatarDados`, exige `colab_nome_completo`, `colab_cpf` e `colab_data_nascimento` preenchidos. Falta algum → *"Campos obrigatórios faltando (nome_completo, cpf ou data_nascimento)"*.

---

## 7. Tradução de erro do banco

A regra da casa — **mensagem do banco chega ao usuário nomeando o obstáculo** — está implementada aqui (linha 470+):

| Código | Vira |
|---|---|
| `TAMANHO_EXCEDIDO` (interno) | nomeia campo, coluna da planilha, coluna do banco e limite |
| `23505` em `colab_cpf` | *"CPF já cadastrado"* — classificado como **aviso** |
| `23505` em `colab_matricula` / `colab_pis` | *"Matrícula/PIS já cadastrada no sistema"* |
| `22001` / *value too long* | nomeia o campo e extrai o limite de `character varying(N)` |
| `22007` / `22008` | *"Data inválida. Use DD/MM/AAAA ou DDMMAAAA"* |
| `22P02` | *"Formato inválido em um dos campos"* |
| `23502` | *"Campo obrigatório não preenchido na planilha"* |

---

## 8. O que esta importação NÃO faz

- **Não gera código de acesso.** O código de 4 dígitos foi aposentado: o trigger `generate_codigo_acesso()` saiu (subetapa 2C) e `colab_codigo_acesso` foi dropada (2D). O acesso é por e-mail/senha do Supabase Auth — ver [`../../transversais/auth-e-permissoes.md`](../../transversais/auth-e-permissoes.md).
- **Não valida formato de e-mail no cliente** — quem barra é `chk_colab_email_formato`.
- **Não altera caixa nem remove acentos** do nome.
- **Não é transacional.** É um `INSERT` por linha, em laço: interromper no meio deixa as linhas já gravadas no banco. É intencional (o usuário pode pausar/parar), mas significa que **não há "desfazer"**.

---

## ⚠️ Dívida conhecida

**`CadastroLote` lê a planilha do jeito errado** — em modo objeto (perde coluna de cabeçalho repetido) e sem `raw: false` (come zero à esquerda). Não deu problema porque o template de colaboradores não tem cabeçalho repetido, mas é a mesma classe de defeito que `candidatos-import.ts` resolveu lendo **por índice**. Item aberto no [`backlog.md`](../../../backlog.md).
