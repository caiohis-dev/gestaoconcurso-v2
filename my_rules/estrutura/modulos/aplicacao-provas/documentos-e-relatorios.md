# Documentos, Painel e Dashboard

> Documento de área do módulo **Aplicação de Provas** — comece pelo contrato em [`00-modulo.md`](./00-modulo.md). Depende de uma prova finalizada — ver ciclo de vida em [`provas-e-unidades.md`](./provas-e-unidades.md) — e dos dados de alocação/pagamento em [`alocacao-e-funcoes.md`](./alocacao-e-funcoes.md).

## `/documentos-impressao/:provaId` (`DocumentosImpressao.tsx`)

- **Só acessível se `prova.prova_finalizada === true`** — do contrário redireciona para `/gerenciar-prova/:provaId`. Também é **restrita a `admin`** (não a `coordenador`), diferente de outras telas de gestão de prova onde o coordenador tem acesso parcial. ⚠️ **Desde 2026-07-26 o papel é declarado na rota**, no `RequireAcesso` do `App.tsx` — se um coordenador precisar gerar documentos, é lá que muda, não nesta página.
- Gera PDFs 100% client-side com jsPDF + `jspdf-autotable`, em landscape, com logo carregado como base64 (`fevreLogo` convertido via `FileReader` no mount) e cabeçalho customizável **por prova** (`prova_cabecalho_linha1/2`, com fallback para o texto padrão da fundação). O nome exibido no centro do cabeçalho é o do **edital** (via join `prova.editais.nome`).
  - **Importante (desde 2026-07-24):** as duas linhas de cabeçalho lidas pelo PDF são as **da prova**, não as do edital. O edital só fornece o valor inicial (sugestão) ao cadastrar a prova; editar o cabeçalho do edital depois **não** altera os PDFs de provas já existentes. Ver [`provas-e-unidades.md`](./provas-e-unidades.md) (editais como modelo).
- **Recibo de pagamento** (`gerarReciboPagamento`): busca `colaboradores_prova` da unidade (com `valor_pagamento` já "congelado" na alocação — ver [`alocacao-e-funcoes.md`](./alocacao-e-funcoes.md)) e complementa com `valores_funcao_prova` como mapa auxiliar; busca separadamente o nome do "Coordenador Geral" daquela unidade para exibir no documento; agrupa colaboradores por função (ordenado alfabeticamente) para montar as tabelas.
## As três exportações do `GerenciarProva.tsx` — e a que não é PDF

Além dos documentos da página acima, `GerenciarProva.tsx` tem três exportações próprias, cada uma com seu flag de loading. **Elas não são três variações do mesmo padrão** — a terceira é de outra natureza:

| Função | Flag | Formato | Fonte |
|---|---|---|---|
| `exportColaboradores` | `isExporting` | PDF | `colaboradores_prova` da prova |
| `exportCoordenadores` | `isExportingCoordenadores` | PDF | `coordenadores_prova` da prova |
| **`exportCargosCSV`** | `isExportingCargos` | **CSV** | `colaboradores_prova` + `valores_funcao_prova`, agregados por função |

`exportCargosCSV` monta um mapa `funcao_id → { nome, count, valor }` semeado por `valores_funcao_prova` e depois percorre as alocações. Uma função **com gente alocada mas sem valor cadastrado entra assim mesmo**, com `valor: 0` (`if (!map[c.funcao_id]) map[c.funcao_id] = { …, valor: 0 }`) — o relatório não esconde alocação por falta de valor. A linha só é omitida quando `count === 0 && valor === 0`, e se nada sobra a página avisa "Não há cargos alocados nesta prova" em vez de baixar arquivo vazio.

Ao mexer em layout de PDF, `exportColaboradores` e `exportCoordenadores` andam juntas (compartilham padrões visuais); `exportCargosCSV` é independente e não é afetada.

## `/painel-dados-colaboradores/:provaId` (`PainelDadosColaboradores.tsx`)

Painel read-only dos colaboradores alocados numa prova (nome, e-mail, unidade, último acesso), com busca e ordenação por nome / último acesso. Restrito a `admin` pela rota. Faz fetch manual (`useState`/`useEffect`), não React Query.

> **Envio de e-mail em massa aposentado na 2D (2026-07-15).** A página tinha um botão "Solicitar Atualização de Dados" que mandava e-mail em lote (`buildEmailHtml` + `send-email`) aos colaboradores com campos pendentes ou sem primeiro acesso. Esse e-mail embutia `colab_codigo_acesso` (morto) e apontava para o login antigo `fevre.online/auth`; na 2D optou-se por **remover a feature inteira** (botão, `buildEmailHtml`, `getCamposFaltantes`, o dialog e a leitura de `email_atualizacao_log`), não reescrevê-la. A tabela `email_atualizacao_log` **fica** (histórico de 232 envios), apenas deixou de ser alimentada. Ver [`../analises/roadmap-auth-colaborador.md`](../../../analises/concluidos/roadmap-auth-colaborador.md).

## `/dashboard` (`Dashboard.tsx`)

Restrito a `admin` pela rota. KPIs simples via `useQuery` direto (contagens de `provas`, `provas_finalizadas`, etc., usando `count: "exact", head: true` para evitar trazer os dados) + gráfico de pizza (Recharts) com paleta de cores fixa definida no próprio arquivo (`COLORS`). Não usa hooks de entidade compartilhados (`useProvas` etc.) — faz suas próprias queries de agregação porque só precisa de contagens, não das linhas completas.
