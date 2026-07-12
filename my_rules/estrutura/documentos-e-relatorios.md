# Documentos, Painel e Dashboard

> Ver [`00-indice.md`](./00-indice.md). Depende de uma prova finalizada — ver ciclo de vida em [`provas-e-unidades.md`](./provas-e-unidades.md) — e dos dados de alocação/pagamento em [`alocacao-e-funcoes.md`](./alocacao-e-funcoes.md).

## `/documentos-impressao/:provaId` (`DocumentosImpressao.tsx`)

- **Só acessível se `prova.prova_finalizada === true`** — do contrário redireciona para `/gerenciar-prova/:provaId`. Também é **restrita a `isAdmin`** (não a `coordenador`), diferente de outras telas de gestão de prova onde coordenador tem acesso parcial — se um coordenador precisar gerar documentos no futuro, essa checagem de role precisa mudar aqui especificamente.
- Gera PDFs 100% client-side com jsPDF + `jspdf-autotable`, em landscape, com logo carregado como base64 (`fevreLogo` convertido via `FileReader` no mount) e cabeçalho customizável por prova (`prova_cabecalho_linha1/2`, com fallback para o texto padrão da fundação).
- **Recibo de pagamento** (`gerarReciboPagamento`): busca `colaboradores_prova` da unidade (com `valor_pagamento` já "congelado" na alocação — ver [`alocacao-e-funcoes.md`](./alocacao-e-funcoes.md)) e complementa com `valores_funcao_prova` como mapa auxiliar; busca separadamente o nome do "Coordenador Geral" daquela unidade para exibir no documento; agrupa colaboradores por função (ordenado alfabeticamente) para montar as tabelas.
- Também existem exportações para "coordenadores" e "cargos" (`isExportingCoordenadores`, `isExportingCargos` em `GerenciarProva.tsx`) — variações do mesmo padrão de exportação, não detalhadas aqui em profundidade; ao alterar o layout de um PDF, provavelmente as três exportações (recibo, coordenadores, cargos) merecem ser conferidas juntas por reaproveitarem padrões visuais parecidos.

## `/painel-dados-colaboradores/:provaId` (`PainelDadosColaboradores.tsx`)

Painel consolidado dos colaboradores alocados numa prova, com busca, ordenação (nome / último acesso) e **checagem de campos obrigatórios pendentes** (`CAMPOS_OBRIGATORIOS`: CPF, data de nascimento, nome, nacionalidade, PIS, telefone, chave PIX, endereço completo, estado civil, raça, grau de instrução) via `getCamposFaltantes`.

Tem uma função de **reenvio de e-mail com código de acesso** (`buildEmailHtml` monta o HTML inline do e-mail, referenciando `fevre.online` como domínio) — o texto do e-mail muda dependendo de haver ou não campos pendentes ("atualize seus dados" vs. "acesse o sistema"). Esse e-mail é presumivelmente enviado via a Edge Function `send-email` (ver [`integracoes-externas.md`](./integracoes-externas.md)), já que não há SMTP client no frontend.

## `/dashboard` (`Dashboard.tsx`)

Restrito a `isAdmin`. KPIs simples via `useQuery` direto (contagens de `provas`, `provas_finalizadas`, etc., usando `count: "exact", head: true` para evitar trazer os dados) + gráfico de pizza (Recharts) com paleta de cores fixa definida no próprio arquivo (`COLORS`). Não usa hooks de entidade compartilhados (`useProvas` etc.) — faz suas próprias queries de agregação porque só precisa de contagens, não das linhas completas.
