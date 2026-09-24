Abaixo está a documentação técnica estruturada em formato Markdown contendo todos os campos do layout CNAB 240 (Itaú SISPAG Versão 085) necessários para a geração de arquivos de remessa de **PIX Transferência (Forma 45)** destinados exclusivamente a **Pessoas Físicas (CPF / Recebedor PF)**.

---

# Layout de Campos CNAB 240 - Itaú SISPAG (v085)
## Remessa de PIX Transferência para Pessoas Físicas (CPF)

Este documento especifica a distribuição de posições, formatos (*pictures*) e conteúdos recomendados para a geração do arquivo.

### Formato de Preenchimento:
*   **Campos Alfanuméricos (`X`)**: Alinhados à esquerda, preenchidos com espaços em branco à direita. Recomenda-se o uso de letras maiúsculas e sem acentos.
*   **Campos Numéricos (`9`)**: Alinhados à direita, preenchidos com zeros à esquerda.
*   **Campos com Vírgula Assumida (`V`)**: Representam valores monetários onde as duas últimas posições são os centavos (sem ponto ou vírgula explícita).

---

## SEÇÃO 1: HEADERS (Envelopamento Inicial)

### 1.1 Header de Arquivo (Registro Tipo 0)
Responsável pela abertura do arquivo e identificação da empresa pagadora (matriz).

| Posição | Campo | Picture | Conteúdo Padrão (Remessa PIX PF) |
| :--- | :--- | :--- | :--- |
| `001-003` | Código do Banco | `9(03)` | `341` (Banco Itaú) |
| `004-007` | Código do Lote | `9(04)` | `0000` (Fixo para Header de Arquivo) |
| `008-008` | Tipo de Registro | `9(01)` | `0` (Header de Arquivo) |
| `009-014` | Brancos | `X(06)` | Preencher com espaços em branco |
| `015-017` | Layout do Arquivo | `9(03)` | `080` (Versão do layout) |
| `018-018` | Inscrição Pagador - Tipo | `9(01)` | `2` (CNPJ do Pagador) |
| `019-032` | Inscrição Pagador - Número | `9(14)` | CNPJ da Empresa Pagadora (apenas números) |
| `033-052` | Brancos | `X(20)` | Preencher com espaços em branco |
| `053-057` | Agência Conta - Agência | `9(05)` | Número da agência debitada (com zeros à esquerda) |
| `058-058` | Brancos | `X(01)` | Preencher com espaço em branco |
| `059-070` | Agência Conta - Conta | `9(12)` | Número da conta corrente debitada (com zeros à esquerda) |
| `071-071` | Brancos | `X(01)` | Preencher com espaço em branco |
| `072-072` | Agência Conta - DAC | `9(01)` | Dígito Verificador (DAC) da Agência/Conta |
| `073-102` | Nome da Empresa | `X(30)` | Razão Social da Empresa Pagadora |
| `103-132` | Nome do Banco | `X(30)` | `BANCO ITAU SA` |
| `133-142` | Brancos | `X(10)` | Preencher com espaços em branco |
| `143-143` | Código de Remessa | `9(01)` | `1` (Remessa) |
| `144-151` | Data de Geração | `9(08)` | Data de criação do arquivo (formato `DDMMAAAA`) |
| `152-157` | Hora de Geração | `9(06)` | Hora de criação do arquivo (formato `HHMMSS`) |
| `158-166` | Zeros | `9(09)` | Preencher com zeros |
| `167-171` | Unidade de Densidade | `9(05)` | Preencher com zeros |
| `172-240` | Brancos | `X(69)` | Preencher com espaços em branco |

---

### 1.2 Header de Lote (Registro Tipo 1)
Abre o lote de pagamento de fornecedores via Pix.

| Posição | Campo | Picture | Conteúdo Padrão (Remessa PIX PF) |
| :--- | :--- | :--- | :--- |
| `001-003` | Código do Banco | `9(03)` | `341` (Banco Itaú) |
| `004-007` | Lote de Serviço | `9(04)` | `0001` (Sequencial do lote no arquivo) |
| `008-008` | Tipo de Registro | `9(01)` | `1` (Header de Lote) |
| `009-009` | Tipo de Operação | `X(01)` | `C` (Crédito) |
| `010-011` | Tipo de Pagamento | `9(02)` | `20` (Fornecedores) |
| `012-013` | Forma de Pagamento | `9(02)` | `45` (PIX Transferência) |
| `014-016` | Layout do Lote | `9(03)` | `040` (Layout do Lote) |
| `017-017` | Brancos | `X(01)` | Preencher com espaço em branco |
| `018-018` | Inscrição Pagador - Tipo | `9(01)` | `2` (CNPJ do Pagador) |
| `019-032` | Inscrição Pagador - Número | `9(14)` | CNPJ da Empresa Pagadora |
| `033-036` | Identificação do Lançamento | `X(04)` | Preencher com espaços em branco |
| `037-052` | Brancos | `X(16)` | Preencher com espaços em branco |
| `053-057` | Agência Conta - Agência | `9(05)` | Número da agência debitada |
| `058-058` | Brancos | `X(01)` | Preencher com espaço em branco |
| `059-070` | Agência Conta - Conta | `9(12)` | Número da conta corrente debitada |
| `071-071` | Brancos | `X(01)` | Preencher com espaço em branco |
| `072-072` | Agência Conta - DAC | `9(01)` | Dígito Verificador (DAC) |
| `073-102` | Nome da Empresa | `X(30)` | Razão Social da Empresa Pagadora |
| `103-132` | Finalidade do Lote | `X(30)` | Preencher com espaços em branco |
| `133-142` | Histórico de C/C | `X(10)` | Preencher com espaços em branco |
| `143-172` | Endereço da Empresa | `X(30)` | Preencher com espaços em branco |
| `173-177` | Número | `9(05)` | Preencher com zeros |
| `178-192` | Complemento | `X(15)` | Preencher com espaços em branco |
| `193-212` | Cidade | `X(20)` | Preencher com espaços em branco |
| `213-220` | CEP | `9(08)` | Preencher com zeros |
| `221-222` | Estado | `X(02)` | Preencher com espaços em branco |
| `223-230` | Brancos | `X(08)` | Preencher com espaços em branco |
| `231-240` | Ocorrências | `X(10)` | Preencher com espaços em branco (uso exclusivo de retorno) |

---

## SEÇÃO 2: CORPO (Detalhes da Transação)

Cada transação de transferência Pix é representada por dois registros consecutivos obrigatórios: o **Segmento A** e o **Segmento B**.

### 2.1 Segmento A (Registro Tipo 3 - Detalhes da Transferência)

| Posição | Campo | Picture | Conteúdo Padrão (Remessa PIX PF) |
| :--- | :--- | :--- | :--- |
| `001-003` | Código do Banco | `9(03)` | `341` (Banco Itaú) |
| `004-007` | Lote de Serviço | `9(04)` | `0001` (Idêntico ao Header de Lote) |
| `008-008` | Tipo de Registro | `9(01)` | `3` (Detalhe) |
| `009-013` | Número do Registro | `9(05)` | Sequencial do pagamento dentro do lote (inicia em `00001`) |
| `014-014` | Código do Segmento | `X(01)` | `A` |
| `015-017` | Tipo de Movimento | `9(03)` | `000` (Inclusão de Pagamento) |
| `018-020` | Câmara | `9(03)` | `009` (SPI - PIX) |
| `021-023` | Banco Favorecido | `9(03)` | Preencher com zeros |
| `024-043` | Agência / Conta Favorecido | `X(20)` | Preencher com espaços em branco |
| `044-073` | Nome do Favorecido | `X(30)` | Nome completo do favorecido PF |
| `074-093` | Seu Número | `X(20)` | Identificador exclusivo do pagamento gerado pelo ERP |
| `094-101` | Data de Pagamento | `9(08)` | Data de efetivação do Pix (formato `DDMMAAAA`) |
| `102-104` | Moeda - Tipo | `X(03)` | `REA` (Real) |
| `105-112` | Código ISPB | `X(08)` | Preencher com espaços em branco |
| `113-114` | Identificação de Transferência | `X(02)` | `04` (Chave Pix) |
| `115-119` | Zeros | `9(05)` | Preencher com zeros |
| `120-134` | Valor do Pagamento | `9(13)V9(02)` | Valor nominal do Pix (em centavos, sem ponto ou vírgula) |
| `135-149` | Nosso Número | `X(15)` | Preencher com espaços em branco (uso exclusivo de retorno) |
| `150-154` | Brancos | `X(05)` | Preencher com espaços em branco |
| `155-162` | Data Efetiva | `9(08)` | Preencher com zeros (uso exclusivo de retorno) |
| `163-177` | Valor Efetivo | `9(13)V9(02)` | Preencher com zeros (uso exclusivo de retorno) |
| `178-197` | Finalidade Detalhe | `X(20)` | Preencher com espaços em branco |
| `198-203` | Número do Documento | `9(06)` | Preencher com zeros |
| `204-217` | Número de Inscrição | `9(14)` | CPF do Favorecido (com zeros à esquerda até completar 14 dígitos) |
| `218-219` | Finalidade DOC | `X(02)` | Preencher com espaços em branco |
| `220-224` | Finalidade TED | `X(05)` | Preencher com espaços em branco |
| `225-229` | Brancos | `X(05)` | Preencher com espaços em branco |
| `230-230` | Aviso | `X(01)` | `0` (Não emite aviso ao favorecido) |
| `231-240` | Ocorrências | `X(10)` | Preencher com espaços em branco (uso exclusivo de retorno) |

---

### 2.2 Segmento B (Registro Tipo 3 - Endereçamento Pix)
Este segmento é o complemento obrigatório para remessa via Pix e deve conter a identificação da chave de endereçamento.

*   *Importante*: O campo **Número do Registro (posições 009-013)** deve conter o **mesmo valor** numérico que foi informado no correspondente Segmento A.

| Posição | Campo | Picture | Conteúdo Padrão (Remessa PIX PF) |
| :--- | :--- | :--- | :--- |
| `001-003` | Código do Banco | `9(03)` | `341` (Banco Itaú) |
| `004-007` | Lote de Serviço | `9(04)` | `0001` (Idêntico ao Segmento A correspondente) |
| `008-008` | Tipo de Registro | `9(01)` | `3` (Detalhe) |
| `009-013` | Número do Registro | `9(05)` | **Idêntico ao informado no respectivo Segmento A** (Nota 9) |
| `014-014` | Código do Segmento | `X(01)` | `B` |
| `015-016` | Tipo Chave | `X(02)` | `'01'` (Celular), `'02'` (E-mail), `'03'` (CPF) ou `'04'` (Aleatória) |
| `017-017` | Brancos | `X(01)` | Preencher com espaço em branco |
| `018-018` | Empresa - Inscrição Tipo | `9(01)` | `1` (Tipo de inscrição do favorecido: CPF) |
| `019-032` | Número de Inscrição | `9(14)` | CPF do Favorecido (com zeros à esquerda) |
| `033-062` | Brancos | `X(30)` | Preencher com espaços em branco |
| `063-127` | Informação entre Usuários | `X(65)` | `[EDITAL] - [FUNÇÃO]` (concatenação das colunas do CSV; truncado em 65 chars, maiúsculas sem acento) |
| `128-227` | Chave Pix | `X(100)` | Chave Pix do recebedor (formatada de acordo com as regras da Nota 40) |
| `228-230` | Brancos | `X(03)` | Preencher com espaços em branco |
| `231-240` | Ocorrências | `X(10)` | Preencher com espaços em branco (uso exclusivo de retorno) |

---

## SEÇÃO 3: TRAILERS (Envelopamento Final)

### 3.1 Trailer de Lote (Registro Tipo 5)
Encerra o lote de pagamentos e fornece dados para controle de integridade de somatório.

| Posição | Campo | Picture | Conteúdo Padrão (Remessa PIX PF) |
| :--- | :--- | :--- | :--- |
| `001-003` | Código do Banco | `9(03)` | `341` (Banco Itaú) |
| `004-007` | Lote de Serviço | `9(04)` | `0001` (Idêntico ao do lote correspondente) |
| `008-008` | Tipo de Registro | `9(01)` | `5` (Trailer de Lote) |
| `009-017` | Brancos | `X(09)` | Preencher com espaços em branco |
| `018-023` | Quantidade de Registros | `9(06)` | Soma de linhas físicas do lote (Header [1] + Detalhes [2x Pagamentos] + Trailer [1]) |
| `024-041` | Valor Total dos Pagamentos | `9(16)V9(02)` | Soma acumulada dos valores dos Pix do lote (em centavos) |
| `042-059` | Zeros | `9(18)` | Preencher com zeros |
| `060-230` | Brancos | `X(171)` | Preencher com espaços em branco |
| `231-240` | Ocorrências | `X(10)` | Preencher com espaços em branco (uso exclusivo de retorno) |

---

### 3.2 Trailer de Arquivo (Registro Tipo 9)
Encerra o arquivo remessa contendo a quantidade consolidada de linhas e lotes para controle global.

| Posição | Campo | Picture | Conteúdo Padrão (Remessa PIX PF) |
| :--- | :--- | :--- | :--- |
| `001-003` | Código do Banco | `9(03)` | `341` (Banco Itaú) |
| `004-007` | Lote de Serviço | `9(04)` | `9999` (Código fixo de encerramento de lote) |
| `008-008` | Tipo de Registro | `9(01)` | `9` (Trailer de Arquivo) |
| `009-017` | Brancos | `X(09)` | Preencher com espaços em branco |
| `018-023` | Quantidade de Lotes | `9(06)` | Quantidade total de lotes de serviço dentro do arquivo (geralmente `000001`) |
| `024-029` | Quantidade de Registros | `9(06)` | Soma física de todas as linhas do arquivo (Header de Arquivo + registros de lote + Trailer de Arquivo) |
| `030-240` | Brancos | `X(211)` | Preencher com espaços em branco |