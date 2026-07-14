# Índice — Documentação de Estrutura do Sistema

> Gerado a partir de leitura direta do código-fonte em 2026-07-11. Documentos seccionados por domínio/feature (não por rota, não por camada técnica) — a unidade de trabalho típica ("adicionar campo em X") toca página + hook + RPC/migration ao mesmo tempo, então cada arquivo aqui agrupa o que muda junto.
>
> Existe outra documentação fora desta pasta (`docs/`, `README.md`) que cobre recortes pontuais. Os arquivos abaixo foram escritos a partir do estado real do código — confirme sempre no código antes de agir sobre algo que só está documentado. (Dois arquivos da raiz foram removidos em 2026-07-11 por serem lixo desatualizado: `project-context.md`, um doc de transição manual de 882 linhas, e `.lovable/plan.md`, uma nota de sessão de debug do Lovable.)

| Arquivo | Conteúdo |
|---|---|
| [`arquitetura-geral.md`](./arquitetura-geral.md) | Visão geral, stack, arquitetura macro (SPA + Supabase, sem backend próprio), estrutura de pastas, mapa de rotas, higiene do repositório |
| [`auth-e-permissoes.md`](./auth-e-permissoes.md) | Login único no Supabase Auth (`useAuth`), o papel `colaborador` e `isColaborador`, roles, RLS/RPC |
| [`colaboradores.md`](./colaboradores.md) | Cadastro de colaboradores (individual, público, lote), perfil, distinção colaborador vs. usuário admin |
| [`provas-e-unidades.md`](./provas-e-unidades.md) | Ciclo de vida de uma prova, unidades/salas (template vs. distribuídas), lock de edição concorrente |
| [`alocacao-e-funcoes.md`](./alocacao-e-funcoes.md) | Funções/cargos, valores de pagamento, metas por unidade, alocação colaborador↔prova, acesso de coordenador |
| [`ocorrencias.md`](./ocorrencias.md) | Registro de ocorrências durante a prova, encerramento/reabertura |
| [`documentos-e-relatorios.md`](./documentos-e-relatorios.md) | Geração de PDF (listas/recibos), painel de dados de colaboradores, dashboard |
| [`integracoes-externas.md`](./integracoes-externas.md) | E-mail transacional, Edge Functions administrativas (n8n foi removido em 2026-07-11, ver nota no arquivo) |
| [`desenvolvimento-local.md`](./desenvolvimento-local.md) | Como rodar o Supabase localmente via Docker (setup, scripts, `seed.sql`, `seed.local.sql` com dados de produção, gotcha das funções de coordenação) |

Fora desta pasta, [`../historico/`](../historico/) guarda código já aposentado (não deployado, não buildado) cujo raciocínio vale preservar — hoje, a Edge Function `export-seed`. As regras de trabalho com git (branches, mensagens de commit, tags, o que nunca versionar) estão em [`../versionamento.md`](../versionamento.md).

Ordem sugerida de leitura para quem está chegando: `arquitetura-geral.md` → `auth-e-permissoes.md` → o arquivo de feature relevante à tarefa. Para subir o ambiente local, vá direto a `desenvolvimento-local.md`.
