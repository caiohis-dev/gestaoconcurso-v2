# Documentos, Painel e Dashboard

> Ver [`00-indice.md`](./00-indice.md). Depende de uma prova finalizada — ver ciclo de vida em [`provas-e-unidades.md`](./provas-e-unidades.md) — e dos dados de alocação/pagamento em [`alocacao-e-funcoes.md`](./alocacao-e-funcoes.md).

## `/documentos-impressao/:provaId` (`DocumentosImpressao.tsx`)

- **Só acessível se `prova.prova_finalizada === true`** — do contrário redireciona para `/gerenciar-prova/:provaId`. Também é **restrita a `isAdmin`** (não a `coordenador`), diferente de outras telas de gestão de prova onde coordenador tem acesso parcial — se um coordenador precisar gerar documentos no futuro, essa checagem de role precisa mudar aqui especificamente.
- Gera PDFs 100% client-side com jsPDF + `jspdf-autotable`, em landscape, com logo carregado como base64 (`fevreLogo` convertido via `FileReader` no mount) e cabeçalho customizável por prova (`prova_cabecalho_linha1/2`, com fallback para o texto padrão da fundação).
- **Recibo de pagamento** (`gerarReciboPagamento`): busca `colaboradores_prova` da unidade (com `valor_pagamento` já "congelado" na alocação — ver [`alocacao-e-funcoes.md`](./alocacao-e-funcoes.md)) e complementa com `valores_funcao_prova` como mapa auxiliar; busca separadamente o nome do "Coordenador Geral" daquela unidade para exibir no documento; agrupa colaboradores por função (ordenado alfabeticamente) para montar as tabelas.
- Também existem exportações para "coordenadores" e "cargos" (`isExportingCoordenadores`, `isExportingCargos` em `GerenciarProva.tsx`) — variações do mesmo padrão de exportação, não detalhadas aqui em profundidade; ao alterar o layout de um PDF, provavelmente as três exportações (recibo, coordenadores, cargos) merecem ser conferidas juntas por reaproveitarem padrões visuais parecidos.

## `/painel-dados-colaboradores/:provaId` (`PainelDadosColaboradores.tsx`)

Painel consolidado dos colaboradores alocados numa prova, com busca, ordenação (nome / último acesso) e **checagem de campos obrigatórios pendentes** (`CAMPOS_OBRIGATORIOS`: CPF, data de nascimento, nome, nacionalidade, PIS, telefone, chave PIX, endereço completo, estado civil, raça, grau de instrução) via `getCamposFaltantes`.

Tem uma função de **envio de e-mail em massa** aos colaboradores alocados (`buildEmailHtml` monta o HTML inline, enviado via `send-email`) — o texto muda conforme haja campos pendentes ("atualize seus dados" vs. "acesse o sistema").

> ⚠️ **Ponta solta da refatoração do acesso (a resolver na 2D).** Esse e-mail ainda embute `colab_codigo_acesso` (morto — colaboradores novos têm NULL) e aponta para `fevre.online/auth` no modelo antigo de login por código. Precisa ser repensado: ou remover o código do corpo e apontar para "primeiro acesso"/reivindicação, ou aposentar o botão. Ver [`../analises/roadmap-auth-colaborador.md`](../analises/roadmap-auth-colaborador.md).

## `/dashboard` (`Dashboard.tsx`)

Restrito a `isAdmin`. KPIs simples via `useQuery` direto (contagens de `provas`, `provas_finalizadas`, etc., usando `count: "exact", head: true` para evitar trazer os dados) + gráfico de pizza (Recharts) com paleta de cores fixa definida no próprio arquivo (`COLORS`). Não usa hooks de entidade compartilhados (`useProvas` etc.) — faz suas próprias queries de agregação porque só precisa de contagens, não das linhas completas.
