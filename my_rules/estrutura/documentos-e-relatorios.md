# Documentos, Painel e Dashboard

> Ver [`00-indice.md`](./00-indice.md). Depende de uma prova finalizada — ver ciclo de vida em [`provas-e-unidades.md`](./provas-e-unidades.md) — e dos dados de alocação/pagamento em [`alocacao-e-funcoes.md`](./alocacao-e-funcoes.md).

## `/documentos-impressao/:provaId` (`DocumentosImpressao.tsx`)

- **Só acessível se `prova.prova_finalizada === true`** — do contrário redireciona para `/gerenciar-prova/:provaId`. Também é **restrita a `isAdmin`** (não a `coordenador`), diferente de outras telas de gestão de prova onde coordenador tem acesso parcial — se um coordenador precisar gerar documentos no futuro, essa checagem de role precisa mudar aqui especificamente.
- Gera PDFs 100% client-side com jsPDF + `jspdf-autotable`, em landscape, com logo carregado como base64 (`fevreLogo` convertido via `FileReader` no mount) e cabeçalho customizável por prova (`prova_cabecalho_linha1/2`, com fallback para o texto padrão da fundação).
- **Recibo de pagamento** (`gerarReciboPagamento`): busca `colaboradores_prova` da unidade (com `valor_pagamento` já "congelado" na alocação — ver [`alocacao-e-funcoes.md`](./alocacao-e-funcoes.md)) e complementa com `valores_funcao_prova` como mapa auxiliar; busca separadamente o nome do "Coordenador Geral" daquela unidade para exibir no documento; agrupa colaboradores por função (ordenado alfabeticamente) para montar as tabelas.
- Também existem exportações para "coordenadores" e "cargos" (`isExportingCoordenadores`, `isExportingCargos` em `GerenciarProva.tsx`) — variações do mesmo padrão de exportação, não detalhadas aqui em profundidade; ao alterar o layout de um PDF, provavelmente as três exportações (recibo, coordenadores, cargos) merecem ser conferidas juntas por reaproveitarem padrões visuais parecidos.

## `/painel-dados-colaboradores/:provaId` (`PainelDadosColaboradores.tsx`)

Painel read-only dos colaboradores alocados numa prova (nome, e-mail, unidade, último acesso), com busca e ordenação por nome / último acesso. Restrito a `isAdmin`. Faz fetch manual (`useState`/`useEffect`), não React Query.

> **Envio de e-mail em massa aposentado na 2D (2026-07-15).** A página tinha um botão "Solicitar Atualização de Dados" que mandava e-mail em lote (`buildEmailHtml` + `send-email`) aos colaboradores com campos pendentes ou sem primeiro acesso. Esse e-mail embutia `colab_codigo_acesso` (morto) e apontava para o login antigo `fevre.online/auth`; na 2D optou-se por **remover a feature inteira** (botão, `buildEmailHtml`, `getCamposFaltantes`, o dialog e a leitura de `email_atualizacao_log`), não reescrevê-la. A tabela `email_atualizacao_log` **fica** (histórico de 232 envios), apenas deixou de ser alimentada. Ver [`../analises/roadmap-auth-colaborador.md`](../analises/concluidos/roadmap-auth-colaborador.md).

## `/dashboard` (`Dashboard.tsx`)

Restrito a `isAdmin`. KPIs simples via `useQuery` direto (contagens de `provas`, `provas_finalizadas`, etc., usando `count: "exact", head: true` para evitar trazer os dados) + gráfico de pizza (Recharts) com paleta de cores fixa definida no próprio arquivo (`COLORS`). Não usa hooks de entidade compartilhados (`useProvas` etc.) — faz suas próprias queries de agregação porque só precisa de contagens, não das linhas completas.
