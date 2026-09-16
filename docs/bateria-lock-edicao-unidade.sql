-- ─────────────────────────────────────────────────────────────────────────────────────
-- Bateria — Lock de edição exclusiva POR UNIDADE DE PROVA
-- migrations 20260916100732 (por unidade) + 20260916102407 (identidade por auth.uid)
-- ─────────────────────────────────────────────────────────────────────────────────────
--
-- Substitui o lock por PROVA (migration 20260122123358, tabela `prova_edit_locks` e as
-- RPCs `acquire_prova_lock`/`update_prova_lock_activity`/`release_prova_lock`/
-- `check_prova_lock`, todas DROPADAS).
--
-- ⚠️ AS ASSINATURAS MUDARAM DUAS VEZES EM 2026-09-16. Hoje as três recebem **só**
-- `p_prova_unidade_id`: `p_user_id` e `p_user_name` saíram, e quem chamar com a forma
-- antiga recebe 42883. Se este arquivo falhar na primeira linha, é isso — e é o erro de
-- 02/08, quando a bateria da troca total ficou 2 dias falhando sem ninguém ver.
--
-- 🔴 POR QUE ESTA BATERIA EXISTE. O lock nunca funcionou: a tela passava o
-- `prova_unidades.id` da rota para uma coluna com FK para `provas(id)`, e todo INSERT
-- morria em 23503 — 500+ por dia no log de produção, desde o commit inicial. Nenhum dos
-- 17 testes de `useProvaUnidadeLock.test.tsx` podia pegar isso: eles mockam o Supabase,
-- onde qualquer string serve como uuid. Só o banco de verdade tem a FK.
--
-- Os dois casos que carregam o desenho:
--   · CASO 3 — dois coordenadores em UNIDADES DIFERENTES da mesma prova conseguem o lock
--     ao mesmo tempo. É a razão de o conserto não ter sido "passar o id da prova".
--   · CASO 8 — ninguém libera nem mantém vivo o lock ALHEIO. Antes de 20260916102407
--     bastava mandar o uuid da outra pessoa em `p_user_id`.
--
-- COMO A SESSÃO É SIMULADA: `auth.uid()` lê o `sub` de `request.jwt.claims`. Os casos
-- usam `set_config(..., true)` — local à transação, o mesmo padrão de
-- `bateria-finalizacao-autorizacao.sql`.
--
-- Como rodar (o container muda de nome por projeto):
--   C=$(docker ps --format '{{.Names}}' | grep '^supabase_db')
--   docker exec -i $C psql -U postgres -d postgres < docs/bateria-lock-edicao-unidade.sql
--
-- ⚠️ Roda como `postgres` e em TRANSAÇÃO, com ROLLBACK no fim: não deixa lock para trás.
-- ⚠️ Cada recusa afirma o SQLSTATE **e o nome de quem barrou** — regra nova não pode
--    ofuscar a antiga sem que a bateria perceba.

\set ON_ERROR_STOP off
BEGIN;

-- ── CASO 0 — a FK aponta para onde se diz que aponta (o nome mente; medir) ────────────
SELECT 'CASO 0' AS caso,
       c.conname,
       (SELECT relname FROM pg_class WHERE oid = c.confrelid) AS aponta_para,
       CASE c.confdeltype WHEN 'c' THEN 'CASCADE' WHEN 'r' THEN 'RESTRICT'
                          WHEN 'a' THEN 'NO ACTION' ELSE c.confdeltype::text END AS on_delete,
       CASE WHEN (SELECT relname FROM pg_class WHERE oid = c.confrelid) = 'prova_unidades'
             AND c.confdeltype = 'c'
            THEN 'OK — por unidade, e CASCADE (lock é estado efêmero, não registro)'
            ELSE '🔴 FALHOU' END AS veredito
FROM pg_constraint c
WHERE c.conrelid = 'public.prova_unidade_edit_locks'::regclass AND c.contype = 'f';

-- ── CASO 0b — as RPCs do lock por prova não existem mais ─────────────────────────────
SELECT 'CASO 0b' AS caso,
       count(*) AS rpcs_antigas_ainda_vivas,
       CASE WHEN count(*) = 0 THEN 'OK' ELSE '🔴 FALHOU — sobrou função do lock por prova' END AS veredito
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('acquire_prova_lock','update_prova_lock_activity',
                    'release_prova_lock','check_prova_lock');

-- ── CASO 0c — a assinatura NÃO aceita mais identidade do cliente ─────────────────────
SELECT 'CASO 0c' AS caso, p.proname, pg_get_function_arguments(p.oid) AS argumentos,
       CASE WHEN pg_get_function_arguments(p.oid) = 'p_prova_unidade_id uuid'
            THEN 'OK — só o id da unidade'
            ELSE '🔴 FALHOU — voltou a receber identidade do cliente' END AS veredito
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('acquire_prova_unidade_lock','update_prova_unidade_lock_activity',
                    'release_prova_unidade_lock')
ORDER BY p.proname;

-- ── CASO 0d — `anon` não executa nenhuma das três; `authenticated` executa ───────────
SELECT 'CASO 0d' AS caso, p.proname,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_executa,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_executa,
       CASE WHEN NOT has_function_privilege('anon', p.oid, 'EXECUTE')
             AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
            THEN 'OK' ELSE '🔴 FALHOU' END AS veredito
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('acquire_prova_unidade_lock','update_prova_unidade_lock_activity',
                    'release_prova_unidade_lock')
ORDER BY p.proname;

-- ── CASOS 1 a 10 — o comportamento ───────────────────────────────────────────────────
DO $$
DECLARE
  v_prova      uuid;
  v_pu_a       uuid;   -- unidade A da prova
  v_pu_b       uuid;   -- unidade B da MESMA prova
  v_ana        uuid;   -- dona do lock nos casos
  v_ana_nome   text;   -- o nome que o BANCO tem para ela
  v_bruno      uuid;   -- a outra pessoa
  v_unidade_livre uuid;
  v_pu_temp    uuid;
  r            RECORD;
  v_con text; v_msg text; v_det text; v_estado text; v_ok boolean;
BEGIN
  SELECT pu.prova_id INTO v_prova
  FROM public.prova_unidades pu
  GROUP BY pu.prova_id HAVING count(*) >= 2
  LIMIT 1;
  IF v_prova IS NULL THEN
    RAISE EXCEPTION 'Sem prova com 2+ unidades no banco local — o CASO 3 não teria o que provar.';
  END IF;
  SELECT id INTO v_pu_a FROM public.prova_unidades WHERE prova_id = v_prova ORDER BY id LIMIT 1;
  SELECT id INTO v_pu_b FROM public.prova_unidades WHERE prova_id = v_prova AND id <> v_pu_a ORDER BY id LIMIT 1;

  -- Duas pessoas COM perfil, porque o nome exibido agora vem de `profiles`.
  SELECT p.id, p.full_name INTO v_ana, v_ana_nome
    FROM public.profiles p WHERE nullif(trim(p.full_name),'') IS NOT NULL ORDER BY p.id LIMIT 1;
  SELECT p.id INTO v_bruno
    FROM public.profiles p WHERE p.id <> v_ana ORDER BY p.id LIMIT 1;

  RAISE NOTICE '--- fixture: prova=% uniA=% uniB=% ana=% (%) bruno=%',
    v_prova, v_pu_a, v_pu_b, v_ana, v_ana_nome, v_bruno;

  -- ── CASO 1 — CONTROLE POSITIVO: com sessão, o id da unidade adquire o lock ─────────
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_ana, 'role', 'authenticated')::text, true);
  SELECT * INTO r FROM public.acquire_prova_unidade_lock(v_pu_a);
  RAISE NOTICE 'CASO 1 (adquire) success=%  %',
    r.success, CASE WHEN r.success THEN 'OK' ELSE '🔴 FALHOU' END;

  -- ── CASO 1b — o nome gravado veio do BANCO, não do cliente ────────────────────────
  RAISE NOTICE 'CASO 1b (nome vem de profiles) gravado=% esperado=%  %',
    (SELECT user_name FROM public.prova_unidade_edit_locks WHERE prova_unidade_id = v_pu_a),
    v_ana_nome,
    CASE WHEN (SELECT user_name FROM public.prova_unidade_edit_locks
               WHERE prova_unidade_id = v_pu_a) = v_ana_nome
         THEN 'OK' ELSE '🔴 FALHOU' END;

  -- ── CASO 1c — o dono gravado é o do JWT ───────────────────────────────────────────
  RAISE NOTICE 'CASO 1c (dono = auth.uid) %',
    CASE WHEN (SELECT user_id FROM public.prova_unidade_edit_locks
               WHERE prova_unidade_id = v_pu_a) = v_ana
         THEN 'OK' ELSE '🔴 FALHOU' END;

  -- ── CASO 2 — REGRESSÃO do defeito de 2026-09-16: id de `provas` é RECUSADO ────────
  BEGIN
    PERFORM public.acquire_prova_unidade_lock(v_prova);
    RAISE NOTICE 'CASO 2 (id de provas) 🔴 FALHOU — foi aceito';
  EXCEPTION WHEN foreign_key_violation THEN
    GET STACKED DIAGNOSTICS v_con = CONSTRAINT_NAME, v_det = PG_EXCEPTION_DETAIL;
    RAISE NOTICE 'CASO 2 (id de provas) RECUSADO por %/% — %  %',
      SQLSTATE, v_con, v_det,
      CASE WHEN v_con = 'prova_unidade_edit_locks_prova_unidade_id_fkey'
           THEN 'OK' ELSE '🔴 FALHOU — barrou outra regra' END;
  END;

  -- ── CASO 3 — 🔴 O CASO QUE DECIDIU O DESENHO: outra pessoa, OUTRA unidade da MESMA
  --            prova, ao mesmo tempo. Com lock por prova isto seria recusado.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_bruno, 'role', 'authenticated')::text, true);
  SELECT * INTO r FROM public.acquire_prova_unidade_lock(v_pu_b);
  RAISE NOTICE 'CASO 3 (2a pessoa em outra unidade da mesma prova) success=%  %',
    r.success, CASE WHEN r.success THEN 'OK' ELSE '🔴 FALHOU — virou lock por prova' END;

  -- ── CASO 4 — outra pessoa na MESMA unidade: recusa, e diz de quem é ───────────────
  SELECT * INTO r FROM public.acquire_prova_unidade_lock(v_pu_a);
  RAISE NOTICE 'CASO 4 (2a pessoa na mesma unidade) success=% dono=% desde=%  %',
    r.success, r.locked_by_name, r.locked_since,
    CASE WHEN NOT r.success AND r.locked_by_name = v_ana_nome AND r.locked_since IS NOT NULL
         THEN 'OK' ELSE '🔴 FALHOU' END;

  -- ── CASO 5 — a MESMA pessoa repetindo (outra aba, bfcache): renova, não recusa ────
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_ana, 'role', 'authenticated')::text, true);
  SELECT * INTO r FROM public.acquire_prova_unidade_lock(v_pu_a);
  RAISE NOTICE 'CASO 5 (mesma pessoa renova) success=%  %',
    r.success, CASE WHEN r.success THEN 'OK' ELSE '🔴 FALHOU' END;

  -- ── CASO 6 — lock abandonado há mais de 10 minutos é tomado ───────────────────────
  UPDATE public.prova_unidade_edit_locks
  SET last_activity = NOW() - INTERVAL '11 minutes' WHERE prova_unidade_id = v_pu_a;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_bruno, 'role', 'authenticated')::text, true);
  SELECT * INTO r FROM public.acquire_prova_unidade_lock(v_pu_a);
  RAISE NOTICE 'CASO 6 (expirado, 11 min) success=% novo_dono_e_bruno=%  %',
    r.success,
    (SELECT user_id = v_bruno FROM public.prova_unidade_edit_locks WHERE prova_unidade_id = v_pu_a),
    CASE WHEN r.success THEN 'OK' ELSE '🔴 FALHOU' END;

  -- ── CASO 6b — CONTROLE POSITIVO do timeout: 9 minutos ainda NÃO expira ────────────
  UPDATE public.prova_unidade_edit_locks
  SET last_activity = NOW() - INTERVAL '9 minutes' WHERE prova_unidade_id = v_pu_a;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_ana, 'role', 'authenticated')::text, true);
  SELECT * INTO r FROM public.acquire_prova_unidade_lock(v_pu_a);
  RAISE NOTICE 'CASO 6b (9 min: ainda vivo) success=%  %',
    r.success, CASE WHEN NOT r.success THEN 'OK' ELSE '🔴 FALHOU — expirou cedo demais' END;

  -- ── CASO 7 — heartbeat: o dono renova; quem não é dono NÃO mantém o lock vivo ─────
  --            (o lock está com Bruno desde o CASO 6)
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_bruno, 'role', 'authenticated')::text, true);
  v_ok := public.update_prova_unidade_lock_activity(v_pu_a);
  RAISE NOTICE 'CASO 7 (heartbeat do dono) retorno=%  %',
    v_ok, CASE WHEN v_ok THEN 'OK' ELSE '🔴 FALHOU' END;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_ana, 'role', 'authenticated')::text, true);
  v_ok := public.update_prova_unidade_lock_activity(v_pu_a);
  RAISE NOTICE 'CASO 7b 🔴 (heartbeat de quem NÃO é dono) retorno=%  %',
    v_ok, CASE WHEN NOT v_ok THEN 'OK — não dá para segurar lock alheio' ELSE '🔴 FALHOU' END;

  -- ── CASO 8 — 🔴 O DEFEITO QUE 20260916102407 FECHA: liberar lock ALHEIO ───────────
  --            Ana ainda está com a sessão; o lock é de Bruno.
  v_ok := public.release_prova_unidade_lock(v_pu_a);
  RAISE NOTICE 'CASO 8 🔴 (release do lock ALHEIO) retorno=% lock_continua=%  %',
    v_ok,
    (SELECT count(*) FROM public.prova_unidade_edit_locks WHERE prova_unidade_id = v_pu_a),
    CASE WHEN NOT v_ok
          AND EXISTS (SELECT 1 FROM public.prova_unidade_edit_locks
                      WHERE prova_unidade_id = v_pu_a AND user_id = v_bruno)
         THEN 'OK — o lock de Bruno segue de pé' ELSE '🔴 FALHOU' END;

  -- ── CASO 8b — CONTROLE POSITIVO: o dono libera ────────────────────────────────────
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_bruno, 'role', 'authenticated')::text, true);
  v_ok := public.release_prova_unidade_lock(v_pu_a);
  RAISE NOTICE 'CASO 8b (o dono libera) retorno=% linhas_restantes=%  %',
    v_ok, (SELECT count(*) FROM public.prova_unidade_edit_locks WHERE prova_unidade_id = v_pu_a),
    CASE WHEN v_ok THEN 'OK' ELSE '🔴 FALHOU' END;

  -- ── CASO 8c — heartbeat NÃO ressuscita linha apagada ──────────────────────────────
  v_ok := public.update_prova_unidade_lock_activity(v_pu_a);
  RAISE NOTICE 'CASO 8c (heartbeat NÃO recria linha apagada) retorno=% linhas=%  %',
    v_ok, (SELECT count(*) FROM public.prova_unidade_edit_locks WHERE prova_unidade_id = v_pu_a),
    CASE WHEN NOT v_ok THEN 'OK' ELSE '🔴 FALHOU' END;
  -- (é por isso que o `pageshow` do bfcache readquire, em vez de só bater heartbeat)

  -- ── CASO 9 — SEM SESSÃO: `auth.uid()` é NULL ──────────────────────────────────────
  PERFORM set_config('request.jwt.claims', '', true);
  BEGIN
    PERFORM public.acquire_prova_unidade_lock(v_pu_a);
    RAISE NOTICE 'CASO 9 (adquirir sem sessão) 🔴 FALHOU — foi aceito';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_estado = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    RAISE NOTICE 'CASO 9 (adquirir sem sessão) RECUSADO [%]: %  %',
      v_estado, v_msg, CASE WHEN v_estado = 'P0002' THEN 'OK' ELSE '⚠️ barrou por outra regra' END;
  END;
  v_ok := public.update_prova_unidade_lock_activity(v_pu_a);
  RAISE NOTICE 'CASO 9b (heartbeat sem sessão) retorno=%  %',
    v_ok, CASE WHEN NOT v_ok THEN 'OK — devolve false, não explode' ELSE '🔴 FALHOU' END;
  v_ok := public.release_prova_unidade_lock(v_pu_b);
  RAISE NOTICE 'CASO 9c (release sem sessão NÃO derruba lock de terceiro) retorno=% lock_de_B_continua=%  %',
    v_ok,
    (SELECT count(*) FROM public.prova_unidade_edit_locks WHERE prova_unidade_id = v_pu_b),
    CASE WHEN NOT v_ok
          AND EXISTS (SELECT 1 FROM public.prova_unidade_edit_locks WHERE prova_unidade_id = v_pu_b)
         THEN 'OK' ELSE '🔴 FALHOU' END;

  -- ── CASO 10 — desvincular a unidade leva o lock junto (CASCADE) ───────────────────
  -- A unidade é criada aqui, descartável: toda `prova_unidade` do banco local tem
  -- coordenador alocado, e `coordenadores_prova` é RESTRICT — o delete morreria por
  -- outra regra, antes de chegar ao lock, e o caso não provaria nada.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_ana, 'role', 'authenticated')::text, true);
  INSERT INTO public.unidades_prova (unid_nome, unid_sigla)
  VALUES ('BATERIA LOCK — descartável', 'ZZZ') RETURNING id INTO v_unidade_livre;
  INSERT INTO public.prova_unidades (prova_id, unidade_id)
  VALUES (v_prova, v_unidade_livre) RETURNING id INTO v_pu_temp;

  PERFORM public.acquire_prova_unidade_lock(v_pu_temp);
  RAISE NOTICE 'CASO 10 — lock criado na unidade descartável: %',
    (SELECT count(*) FROM public.prova_unidade_edit_locks WHERE prova_unidade_id = v_pu_temp);
  DELETE FROM public.prova_unidades WHERE id = v_pu_temp;
  RAISE NOTICE 'CASO 10 (delete da unidade) lock restante=%  %',
    (SELECT count(*) FROM public.prova_unidade_edit_locks WHERE prova_unidade_id = v_pu_temp),
    CASE WHEN NOT EXISTS (SELECT 1 FROM public.prova_unidade_edit_locks
                          WHERE prova_unidade_id = v_pu_temp)
         THEN 'OK — CASCADE levou o lock junto' ELSE '🔴 FALHOU — lock órfão' END;
END $$;

ROLLBACK;

-- Depois do ROLLBACK a tabela tem de estar como estava (vazia, em banco recém-resetado).
SELECT 'CASO 11' AS caso,
       count(*) AS linhas_apos_rollback,
       CASE WHEN count(*) = 0 THEN 'OK — a bateria não deixou lock para trás'
            ELSE '⚠️ sobrou lock (pode ser de uso real; confira antes de apagar)' END AS veredito
FROM public.prova_unidade_edit_locks;
