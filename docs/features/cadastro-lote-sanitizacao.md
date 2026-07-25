# Sanitização de Dados na Importação em Lote (/cadastro-lote)

Este documento descreve as transformações que os dados da planilha Excel passam **antes de cada tentativa de INSERT** na tabela `colaboradores` do Supabase, na rota `/cadastro-lote` (`src/pages/CadastroLote.tsx`).

> A importação em lote **não persiste a planilha original**. Cada linha é lida, transformada em memória e, somente após a sanitização, enviada ao banco via `supabase.from('colaboradores').insert(...)`.

---

## 1. Auto-mapeamento dos cabeçalhos

Antes de qualquer sanitização de linha, o sistema tenta adivinhar a correspondência entre os cabeçalhos da planilha e as colunas do banco (`colab_*`).

Para isso, a função `normalizarTexto`:

- Converte o texto para minúsculas.
- Remove acentos (`normalize('NFD')` + regex de diacríticos).
- Remove underscores (`_`), espaços e hífens (`-`).
- Remove espaços nas extremidades (`trim`).

**Exemplo:**
- Cabeçalho da planilha: `"Nome Completo"` → `nomecompleto`
- Coluna do banco: `colab_nome_completo` → `nomecompleto` → correspondência detectada.
- Cabeçalho: `"CPF"` → `cpf` / coluna: `colab_cpf` → `cpf` → correspondência.

O usuário pode revisar e ajustar o mapeamento antes de iniciar o processamento.

---

## 2. Sanitização linha a linha (função `formatarDados`)

Abaixo, para cada campo do banco, o tipo de tratamento aplicado ao valor vindo da planilha.

| Coluna do banco (Supabase) | Tipo esperado | Sanitização aplicada antes do INSERT |
|---|---|---|
| `colab_matricula` | `string` (max 6) | Convertido para string. Não remove máscaras. |
| `colab_nome_completo` | `string` (max 40) | Convertido para string. Campo obrigatório. |
| `colab_cpf` | `string` (11) | **Remove tudo o que não for numérico 0-9**, depois preenche com zeros à esquerda até 11 dígitos (`padStart(11, '0')`). |
| `colab_data_nascimento` | `string` (`YYYY-MM-DD`) | Convertido pela função `converterDataExcel`. Aceita: número serial do Excel, `DD/MM/AAAA`, `DD-MM-AAAA`, `DD.MM.AAAA`, `DDMMAAAA` e `YYYY-MM-DD`. Saída sempre em `YYYY-MM-DD`. |
| `colab_nacionalidade` | `string` (max 10) | Convertido para string. |
| `colab_pis` | `string` (max 11) | **Remove tudo o que não for numérico 0-9** (`replace(/\D/g, '')`). |
| `colab_rua` | `string` (max 34) | Convertido para string. |
| `colab_numero_casa` | `integer` / null | Convertido para string, depois `parseInt`. Se vazio, `null`. |
| `colab_bairro` | `string` (max 26) | Convertido para string. |
| `colab_cidade` | `string` (max 15) | Convertido para string. |
| `colab_cep` | `integer` / null | Remove tudo que não for dígito (`\D/g`), depois `parseInt`. Se vazio, `null`. |
| `colab_estado_civil` | `integer` / null | `parseInt` do valor. Se vazio, `null`. |
| `colab_raca` | `integer` / null | `parseInt` do valor. Se vazio, `null`. |
| `colab_grau_instrucao` | `integer` / null | `parseInt` do valor. Se vazio, `null`. |
| `colab_telefone` | `integer` / null | Remove tudo que não for dígito, depois `parseInt`. Se vazio, `null`. |
| `colab_complemento_endereco` | `string` (max 20) | Convertido para string. |
| `colab_deficiente` | `boolean` | Converte para string em minúsculas e compara com `'true'`. Qualquer outro valor vira `false`. |
| `colab_email` | `string` (max 255) | Convertido para string. Não valida formato de e-mail nesta etapa. |
| `colab_chave_pix` | `string` (max 255) | Convertido para string. |

> **Regra geral:** campos vazios (`undefined`, `null`, `''`) viram `null` no banco, exceto os campos obrigatórios (`colab_nome_completo`, `colab_cpf`, `colab_data_nascimento`), que são verificados logo após a formatação.

---

## 3. Sanitização do CPF

A mais rigorosa das sanitizações. Remove **tudo o que não for numérico 0-9** e completa com zeros à esquerda até 11 dígitos.

```text
Valor na planilha: "123.456.789-09"
Após replace(/\D/g, ''): "12345678909"
Após padStart(11, '0'): "12345678909"

Valor na planilha: "0011223344"
Após replace(/\D/g, ''): "0011223344"
Após padStart(11, '0'): "000011223344"
```

Isso garante que o CPF sempre chegue ao banco como um número de 11 dígitos, independentemente da máscara usada na planilha.

---

## 4. Sanitização/conversão de datas

A função `converterDataExcel` tenta identificar o formato do valor de data:

1. **Número serial do Excel** (ex: `26254`) → converte para data baseada em 20/12/1899 e retorna `YYYY-MM-DD`.
2. **ISO `YYYY-MM-DD`** → mantém o formato.
3. **Separado por `/`, `-` ou `.`** (`DD/MM/AAAA`, `DD-MM-AAAA`, `DD.MM.AAAA`) → normaliza dia e mês para 2 dígitos e retorna `YYYY-MM-DD`.
4. **8 dígitos seguidos (`DDMMAAAA`)** → interpreta os dois primeiros como dia, os dois seguintes como mês e os quatro últimos como ano, retornando `YYYY-MM-DD`.
5. **Qualquer outro formato** → é passado adiante como veio, gerando erro amigável no log se o banco rejeitar.

---

## 5. Sanitização de campos numéricos

Os campos numéricos (`colab_numero_casa`, `colab_cep`, `colab_telefone`, `colab_estado_civil`, `colab_raca`, `colab_grau_instrucao`) passam por `parseInt` após a conversão para string.

Para `colab_cep` e `colab_telefone`, também é feita a remoção de caracteres não numéricos (`replace(/\D/g, '')`) antes do `parseInt`, permitindo que a planilha contenha valores como `"(11) 99999-8888"` ou `"01234-567"`.

---

## 6. Pré-validação de tamanho (antes do INSERT)

Antes de enviar para o banco, o sistema verifica se algum campo string excede o limite de caracteres definido no banco (`LIMITES_COLUNAS`).

Exemplos:

| Campo | Limite (caracteres) |
|---|---|
| `colab_nome_completo` | 40 |
| `colab_cpf` | 11 |
| `colab_rua` | 34 |
| `colab_bairro` | 26 |
| `colab_cidade` | 15 |
| `colab_email` | 255 |
| `colab_chave_pix` | 255 |

Se houver excesso, a linha é rejeitada **antes do INSERT**, e o log mostra a mensagem:

```text
O campo "CPF" (coluna da planilha: "cpf", coluna do banco: "colab_cpf") excede o tamanho permitido (máximo 11 caracteres). Reduza o valor e tente novamente.
```

---

## 7. Validação de campos obrigatórios

Após a sanitização, o sistema garante que os campos obrigatórios não estejam vazios:

- `colab_nome_completo`
- `colab_cpf`
- `colab_data_nascimento`

Se algum estiver vazio, a linha é rejeitada com a mensagem:

```text
Campos obrigatórios faltando (nome_completo, cpf ou data_nascimento)
```

---

## 8. O que **não** é sanitizado nesta importação

A importação em lote **preserva** os seguintes comportamentos:

- **Não gera nenhum código de acesso:** o código de 4 dígitos foi aposentado na refatoração do acesso do colaborador — o trigger `generate_codigo_acesso()` foi removido (subetapa 2C) e a coluna `colab_codigo_acesso` foi dropada (subetapa 2D). A importação em lote não escreve nada disso; o acesso ao portal se dá por e-mail/senha do Supabase Auth (ver [`../../my_rules/estrutura/transversais/auth-e-permissoes.md`](../../my_rules/estrutura/transversais/auth-e-permissoes.md)).
- **Não valida formato de e-mail:** apenas converte para string. A validação é responsabilidade do banco ou de fluxos manuais.
- **Não valida se o CPF é matematicamente válido:** apenas garante que tenha 11 dígitos numéricos.
- **Não converte nomes para maiúsculas/minúsculas:** mantém o texto como veio na planilha.
- **Não remove acentos ou caracteres especiais do nome:** a planilha é enviada ao banco com o texto original.

---

## 9. Resumo visual do fluxo

```text
Planilha Excel (.xlsx)
        ↓
Leitura dos cabeçalhos → normalização de texto para auto-mapeamento
        ↓
Mapeamento colunas planilha ↔ colunas banco (usuário pode revisar)
        ↓
Para cada linha:
  • CPF: remove máscaras e completa com zeros
  • Datas: converte para YYYY-MM-DD
  • Números: parseInt (CEP/telefone remove não-dígitos)
  • Boolean: "true" → true, resto → false
  • Strings: trim + toString
  • Pré-validação de tamanho máximo
  • Validação de campos obrigatórios
        ↓
INSERT na tabela colaboradores (se tudo OK)
        ↓
Log de sucesso ou erro amigável
```
