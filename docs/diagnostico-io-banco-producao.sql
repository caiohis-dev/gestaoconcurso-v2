-- ============================================================================
-- DIAGNÓSTICO DE I/O E CONEXÕES — banco de PRODUÇÃO (zugigdpuxbpogoepdawm)
-- ============================================================================
-- Motivo: 2026-09-10 o dashboard avisou "seu projeto está prestes a esgotar o
-- Orçamento de E/S de Disco" e, junto, apareceu "CONNECTION TERMINATED DUE TO
-- CONNECTION TIMEOUT". A hipótese a testar é que o segundo é CONSEQUÊNCIA do
-- primeiro: esgotado o burst, o disco cai para 5 MB/s de base, toda consulta
-- fica lenta, as conexões ficam presas mais tempo e o cliente desiste.
--
-- 🔵 ISTO É 100% LEITURA. Não escreve, não altera, não precisa de `supabase
--    link` — roda no SQL Editor do dashboard. O repo continua DESLINKADO.
--
-- COMO RODAR: o SQL Editor mostra só o resultado do ÚLTIMO statement. Rode um
-- bloco por vez (selecione o bloco e Run), de B1 a B6.
--
-- ⚠️ pg_stat_statements acumula desde o último reset das estatísticas. Se
--    `stats_desde` (B5) for recente, os números são de uma janela curta e não
--    representam o dia do estouro.
--
-- 🔴 RESTART ZERA AS ESTATÍSTICAS CUMULATIVAS — e um banco travado só volta com
--    restart, então é NORMAL chegar aqui logo depois de perder a evidência.
--    Reiniciar projeto sem resposta é desligamento SUJO, e o Postgres descarta
--    os contadores no arranque seguinte. Isso esvazia B1, B2 e as colunas de
--    tupla do B3 de uma vez.
--
--    COMO SABER QUE FOI ISSO (aconteceu em 2026-09-10, os três sinais juntos):
--      · `ultimo_vacuum` NULO em TODAS as tabelas do B3 — impossível num banco
--        com semanas de vida e autovacuum ligado;
--      · `stats_desde` NULO no B5 (entrada recriada, nunca resetada à mão);
--      · `blocos_lidos_do_disco` baixo demais — ~3 mil blocos é UM aquecimento
--        de cache, não um mês de operação.
--
--    🔴 Nesse estado, `vivos`/`mortos`/`pct_morto` do B3 NÃO SÃO CONTAGEM: são o
--    saldo observado desde o restart. Em 10/09 `colaboradores` mostrou `vivos: 2`
--    numa tabela de 528 kB — tamanho que nenhuma tabela de 2 linhas ocupa. É
--    essa contradição entre `tamanho` e `vivos` que denuncia o estado.
--    Para CONTAR, só o B6.
-- ============================================================================


-- ── B1 ── Quem mais leu do DISCO (o suspeito nº 1 do orçamento de E/S) ──────
-- Leia `blocos_do_disco`, não o tempo. `cache_pct` baixo com `calls` alto é o
-- padrão que queima orçamento: a mesma consulta indo ao disco toda vez.
SELECT calls, rows,
       round(total_exec_time::numeric/1000, 1) AS seg_total,
       round(mean_exec_time::numeric, 1)       AS ms_media,
       shared_blks_read                        AS blocos_do_disco,
       pg_size_pretty(shared_blks_read * 8192::bigint) AS lido_do_disco,
       round(100.0 * shared_blks_hit / nullif(shared_blks_hit + shared_blks_read, 0), 1) AS cache_pct,
       left(regexp_replace(query, '\s+', ' ', 'g'), 120) AS consulta
FROM pg_stat_statements
WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
ORDER BY shared_blks_read DESC
LIMIT 15;


-- ── B2 ── Derrame para disco (temp) e escrita (WAL) ─────────────────────────
-- `temp_escrito` > 0 é sort/hash que não coube na RAM — em instância Nano é
-- comum e custa E/S dos dois lados. `wal_gerado` alto denuncia escrita em
-- massa (a importação é troca total: DELETE + INSERT de milhares de linhas).
SELECT calls,
       pg_size_pretty(temp_blks_written * 8192::bigint) AS temp_escrito,
       pg_size_pretty(wal_bytes::bigint)                AS wal_gerado,
       round(total_exec_time::numeric/1000, 1)          AS seg_total,
       left(regexp_replace(query, '\s+', ' ', 'g'), 100) AS consulta
FROM pg_stat_statements
WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
  AND (temp_blks_written > 0 OR wal_bytes > 0)
ORDER BY temp_blks_written DESC, wal_bytes DESC
LIMIT 15;


-- ── B3 ── Tabelas: tamanho, linhas mortas, varredura sequencial ─────────────
-- `pct_morto` alto = bloat, e bloat faz a MESMA consulta ler mais páginas do
-- disco. Importar candidatos apaga e reinsere tudo, então `candidatos` é onde
-- olhar primeiro. `seq_scan` alto com `idx_scan` baixo em tabela grande é
-- índice faltando — cada varredura lê a tabela inteira.
--
-- ⚠️ `tamanho` é a ÚNICA coluna deste bloco que não vem de estatística — é
--    `pg_total_relation_size`, medida real do disco. Ela continua válida mesmo
--    depois de um restart ter zerado todo o resto, e foi ela que denunciou, em
--    10/09, uma tabela de negócio ausente da lista.
--
-- 🔵 `WHERE schemaname = 'public'` e SEM `LIMIT`, os dois de propósito. Sem o
--    filtro, `auth.users`, `auth.sessions`, `auth.identities`,
--    `auth.refresh_tokens`, `auth.one_time_tokens` e `storage.objects` comem
--    6 das 15 vagas e EMPURRAM PARA FORA as tabelas de negócio — o recorte
--    mente calado. Sem o `LIMIT`, quem interessa é justamente o fim da lista:
--    tabela de negócio pequena demais é achado, não ruído.
SELECT relname AS tabela,
       pg_size_pretty(pg_total_relation_size(relid)) AS tamanho,
       n_live_tup AS vivos, n_dead_tup AS mortos,
       round(100.0*n_dead_tup/nullif(n_live_tup+n_dead_tup,0),1) AS pct_morto,
       seq_scan, idx_scan,
       coalesce(last_autovacuum, last_vacuum)::timestamp(0) AS ultimo_vacuum
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(relid) DESC;


-- ── B4 ── Conexões AGORA (o lado "connection timeout") ──────────────────────
-- Muitas `idle in transaction` são conexões seguradas sem trabalho — elas
-- ocupam vaga do pool e produzem exatamente o erro de timeout.
SELECT state, count(*), max(now()-state_change)::interval(0) AS mais_antiga
FROM pg_stat_activity WHERE datname = current_database()
GROUP BY state ORDER BY count(*) DESC;


-- ── B5 ── Panorama: o banco cabe na RAM? ────────────────────────────────────
-- Este banco é pequeno (13 MB no bootstrap de 08/08). Se `cache_pct` estiver
-- alto e ainda assim o orçamento de E/S esvazia, a causa é ESCRITA (WAL,
-- autovacuum, importação), não leitura — e B2/B3 é que respondem.
SELECT pg_size_pretty(pg_database_size(current_database())) AS tamanho_banco,
       round(100.0*sum(blks_hit)/nullif(sum(blks_hit)+sum(blks_read),0),2) AS cache_pct,
       sum(blks_read) AS blocos_lidos_do_disco,
       (SELECT setting FROM pg_settings WHERE name='shared_buffers') AS shared_buffers_8kb,
       stats_reset::timestamp(0) AS stats_desde
FROM pg_stat_database WHERE datname = current_database()
GROUP BY stats_reset;


-- ── B6 ── CONTAGEM REAL — o controle positivo ──────────────────────────────
-- `count(*)` varre a tabela e não consulta estatística nenhuma, então é a única
-- resposta confiável a "quantas linhas há?" depois de um restart. Custa uma
-- varredura completa, mas neste banco (14 MB) isso é irrelevante.
--
-- 🔴 É O CONTROLE POSITIVO do diagnóstico (CLAUDE.md §2): provar que uma tabela
--    está pequena é metade; a outra é provar que as demais seguem povoadas. Sem
--    isto, "a tabela X sumiu da lista" fica sem régua para ser lido.
--
-- ⚠️ Rode ESTE bloco antes de concluir qualquer coisa sobre volume de dados.
--    Em 10/09 `candidatos` não apareceu no B3 e a pergunta "produção perdeu
--    dado?" só pôde ser respondida aqui.
SELECT 'candidatos'      AS tabela, count(*) FROM public.candidatos
UNION ALL SELECT 'candidatos_alocacao',  count(*) FROM public.candidatos_alocacao
UNION ALL SELECT 'colaboradores',        count(*) FROM public.colaboradores
UNION ALL SELECT 'colaboradores_prova',  count(*) FROM public.colaboradores_prova
UNION ALL SELECT 'editais',              count(*) FROM public.editais
UNION ALL SELECT 'cargos',               count(*) FROM public.cargos
UNION ALL SELECT 'provas',               count(*) FROM public.provas
UNION ALL SELECT 'unidades_prova',       count(*) FROM public.unidades_prova
UNION ALL SELECT 'sala_prova',           count(*) FROM public.sala_prova
UNION ALL SELECT 'user_roles',           count(*) FROM public.user_roles
ORDER BY 1;
