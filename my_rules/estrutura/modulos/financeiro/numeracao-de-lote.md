# Numeração de Lotes (CÓDIGO DO LOTE) - CNAB 085 Itaú SISPAG

## 1. Propriedades do Campo

| Propriedade | Valor | Descrição |
| --- | --- | --- |
| Nome do Campo | `CÓDIGO DO LOTE` | Identificador do lote de serviço |
| Posição (Bytes) | `004 a 007` | Ocupa as mesmas posições em todos os tipos de registro |
| Tamanho | `4 posições` | O campo possui tamanho fixo |
| Formato (Picture) | `9(04)` | Estritamente numérico, alinhado à direita, preenchido com zeros à esquerda |

## 2. Regras de Preenchimento por Tipo de Registro

O valor do campo varia conforme o identificador do tipo de registro (posição 008):

- **Registro Tipo 0 (Header de Arquivo):** preenchimento estático e obrigatório com o valor `0000`
- **Registro Tipo 1 (Header de Lote):** define a abertura do lote. A numeração é sequencial e deve ser iniciada em `0001`
- **Registro Tipo 3 (Detalhes/Segmentos):** todos os pagamentos contidos no lote devem herdar e repetir o mesmo número definido no Header de Lote (Tipo 1)
- **Registro Tipo 5 (Trailer de Lote):** o encerramento do lote deve espelhar o mesmo número utilizado no Header de Lote e nos Detalhes
- **Registro Tipo 9 (Trailer de Arquivo):** preenchimento estático e obrigatório com o valor `9999`

## 3. Regras de Negócio e Validação

- **Homogeneidade do Lote:** um lote de serviço só pode conter pagamentos de um único tipo (ex: salários, fornecedores) e de uma única forma (ex: DOC, TED, Crédito em Conta)
- **Isolamento de Pagamentos PIX:** lotes de serviço para pagamentos na forma de PIX (Transferência ou QR Code) possuem uma restrição estrutural e devem ser enviados obrigatoriamente em um arquivo separado das demais formas de pagamento
- **Tratamento de Exceções:** caso ocorra falha na validação do sequencial ou no preenchimento estrutural do campo no arquivo remessa, o Banco Itaú rejeitará o processamento
- **Código de Ocorrência:** o erro correspondente no arquivo de retorno será apontado com a sigla `AG`, cuja descrição técnica é "NÚMERO DO LOTE INVÁLIDO"

