-- Busca de colaborador que ignora acento — "Jose" acha "José".
--
-- ⚠️ O timestamp deste arquivo é UTC: foi criado em 2026-09-10, à noite (horário local).
--
-- POR QUE EXISTE: em 2026-09-10 a listagem de `/colaboradores` passou a buscar no
-- SERVIDOR (antes filtrava no cliente, depois de baixar a tabela inteira). O `ilike` do
-- Postgres diferencia acento, então a busca nasceu com uma regressão: quem digitava
-- "jose" deixou de achar "José". MEDIDO no dado real: 97 dos 771 nomes têm acento.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- POR QUE `translate` E NÃO A EXTENSÃO `unaccent`
-- ─────────────────────────────────────────────────────────────────────────────
-- `unaccent()` NÃO é IMMUTABLE (depende de um dicionário que pode ser recarregado), e o
-- caminho usual é embrulhá-la numa função marcada IMMUTABLE à força — uma afirmação
-- falsa que o planejador passa a acreditar.
--
-- Aqui não é preciso: os acentos deste domínio são um conjunto PEQUENO E CONHECIDO.
-- Medido em 2026-09-10 sobre `colab_nome_completo`: existem exatamente `á â ã ç é ê í ó
-- ô õ ú`. O mapa abaixo cobre esses e o resto do português/espanhol, para o dado FUTURO
-- não depender de nova migration. `translate` e `lower` são IMMUTABLE de verdade, sem
-- extensão e sem mentira ao planejador.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- POR QUE COLUNA COMPUTADA E NÃO COLUNA GERADA
-- ─────────────────────────────────────────────────────────────────────────────
-- Uma `GENERATED ALWAYS AS ... STORED` seria indexável, mas acrescenta coluna à tabela —
-- e coluna nova em `colaboradores` toca o DUMP, que é a parte frágil deste repo
-- (CLAUDE.md §3). Isto aqui é função sobre a linha: o PostgREST a expõe como se fosse
-- coluna (`?colab_nome_busca=ilike.*jose*`), nada é armazenado e o dump não muda.
--
-- 🔵 SEM ÍNDICE, e isso é medição, não esquecimento: são 771 linhas em 528 kB, que cabem
--    inteiras no cache (o banco todo tem 14 MB para 224 MB de `shared_buffers`). Um
--    `ilike '%x%'` não usa índice btree de qualquer forma — precisaria de GIN/pg_trgm
--    sobre a expressão, o que só se paga com ordem de grandeza a mais de linhas.
--    ⚠️ Se `colaboradores` crescer muito, o índice vem junto com uma coluna GERADA (a
--    computada não é indexável), e aí o dump entra na conta.
--
-- ⚠️ O CLIENTE PRECISA NORMALIZAR O TERMO TAMBÉM. A comparação só fecha se os dois lados
--    estiverem sem acento: a coluna computada tira o acento do DADO, e
--    `src/lib/texto.ts#removerAcentos` tira o do que foi DIGITADO. Mexer num lado sem o
--    outro quebra a busca em silêncio — ela passa a não achar, sem erro nenhum.

CREATE OR REPLACE FUNCTION public.colab_nome_busca(public.colaboradores)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT translate(
    lower($1.colab_nome_completo),
    'áàâãäåéèêëíìîïóòôõöúùûüçñýÿ',
    'aaaaaaeeeeiiiiooooouuuucnyy'
  )
$$;

COMMENT ON FUNCTION public.colab_nome_busca(public.colaboradores) IS
  'Coluna COMPUTADA do PostgREST: o nome do colaborador em minusculas e SEM ACENTO, '
  'para a busca de /colaboradores encontrar "Jose" quando o cadastro diz "Jose" com '
  'acento. Nao armazena nada. O cliente precisa normalizar o termo digitado do mesmo '
  'jeito (src/lib/texto.ts#removerAcentos) — os dois lados ou nenhum.';

-- 🔴 O REVOKE segue o padrão do repo e NÃO é cerimônia: toda função nasce com EXECUTE
-- para PUBLIC (o que inclui `anon`), e `anon` tem USAGE no schema public desde
-- 20260712010000. Quem lista colaboradores é admin ou coordenador, ambos `authenticated`
-- — e a RLS da tabela continua sendo a barreira real: a coluna computada é avaliada
-- sobre as linhas que a policy já deixou passar, então ela não alarga leitura nenhuma.
--
-- ⚠️ `service_role` PRECISA constar. A coluna computada é avaliada com o papel de QUEM
-- consulta, então conceder só a `authenticated` faz toda leitura pela chave de serviço
-- (Edge Function, script, bateria SQL pelo PostgREST) morrer com
-- `42501 permission denied for function colab_nome_busca` — e o erro não menciona busca
-- nem acento, então custa a ser entendido. Foi o que aconteceu ao testar esta migration.
REVOKE ALL ON FUNCTION public.colab_nome_busca(public.colaboradores) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.colab_nome_busca(public.colaboradores)
  TO authenticated, service_role;
