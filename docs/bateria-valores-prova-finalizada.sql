-- Bateria manual da PF001 em `valores_funcao_prova` — prova FINALIZADA congela o valor
-- das funções (migration 20261128000031).
-- Rodar contra o banco LOCAL:
--   docker cp docs/bateria-valores-prova-finalizada.sql supabase_db_<ref>:/tmp/b.sql
--   docker exec supabase_db_<ref> psql -U postgres -d postgres -f /tmp/b.sql
--
-- POR QUE ISTO EXISTE: a suíte mocka o Supabase e não exercita trigger. A visão de prova
-- finalizada em `GerenciarProva` não mostra o botão do diálogo de valores — isso é
-- CONVENIÊNCIA; a garantia é o trigger, e só esta bateria a verifica.
--
-- POR QUE A REGRA EXISTE: o valor é lido AO VIVO pela Exportação DAF (que vira a remessa
-- PIX no Financeiro) e pelo recibo. `colaboradores_prova.valor_pagamento` nunca foi
-- preenchido (977/977 NULL em 2026-11-27). Mudar o valor depois da prova reescreveria o
-- pagamento de todo mundo daquela função.
--
-- Cada caso afirma QUEM barrou (SQLSTATE + trecho da mensagem), não só que houve recusa:
-- o DELETE também pode ser barrado pela `check_valor_sem_meta`, e uma recusa pela regra
-- errada passaria por certa. Os dados de preparo não têm meta, de propósito.
--
-- REGRA DA CASA: toda recusa vem com CONTROLE POSITIVO. Tudo em transação com ROLLBACK.
-- Saída esperada: só linhas "OK". Qualquer "FALHOU" é defeito.

\set ON_ERROR_STOP on
\timing off

\echo '── ESTRUTURA: o trigger existe e está habilitado (tgenabled = O) ──'
SELECT tgname, tgenabled
  FROM pg_trigger
 WHERE tgrelid = 'public.valores_funcao_prova'::regclass AND NOT tgisinternal
 ORDER BY tgname;

BEGIN;

-- Preparo: uma função e duas provas, uma ABERTA e uma FINALIZADA, cada uma com um valor.
INSERT INTO public.funcoes_colaboradores (id, cargo_nome)
VALUES ('99990000-0000-0000-0000-0000000000f1', 'FUNCAO BATERIA PF001 VALORES');
INSERT INTO public.funcoes_colaboradores (id, cargo_nome)
VALUES ('99990000-0000-0000-0000-0000000000f2', 'FUNCAO BATERIA PF001 VALORES 2');

INSERT INTO public.provas (id, prova_edital, prova_finalizada) VALUES
  ('99991111-0000-0000-0000-00000000000a', 'BATERIA PF001 ABERTA', false),
  ('99991111-0000-0000-0000-00000000000f', 'BATERIA PF001 FINALIZADA', false);

INSERT INTO public.valores_funcao_prova (id, prova_id, funcao_id, valor_pagamento) VALUES
  ('99992222-0000-0000-0000-00000000000a', '99991111-0000-0000-0000-00000000000a',
   '99990000-0000-0000-0000-0000000000f1', 100),
  ('99992222-0000-0000-0000-00000000000f', '99991111-0000-0000-0000-00000000000f',
   '99990000-0000-0000-0000-0000000000f1', 200);

-- Só finaliza DEPOIS de semear: com a prova já finalizada o INSERT acima seria recusado.
UPDATE public.provas SET prova_finalizada = true
 WHERE id = '99991111-0000-0000-0000-00000000000f';

-- Helper local: executa o comando e afirma que ele foi recusado pela PF001 DESTA regra.
CREATE FUNCTION pg_temp.deve_recusar(p_caso text, p_sql text) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
    -- Passou indevidamente: aborta o subbloco para DESFAZER a escrita, e os casos
    -- seguintes não herdam resíduo (sem isto o caso 4 colidia com a linha do caso 1).
    RAISE EXCEPTION 'bateria: passou' USING ERRCODE = 'BT000';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = 'BT000' THEN
      RETURN 'FALHOU  ' || p_caso || ' — PASSOU, devia ter sido recusado';
    END IF;
    IF SQLSTATE = 'PF001' AND SQLERRM LIKE '%valor das funções não pode mais ser alterado%' THEN
      RETURN 'OK      ' || p_caso || ' — recusado pela PF001 dos valores';
    END IF;
    RETURN 'FALHOU  ' || p_caso || ' — recusado pela regra ERRADA: ' || SQLSTATE || ' ' || SQLERRM;
  END;
END $$;

-- E o oposto: afirma que passou (controle positivo).
CREATE FUNCTION pg_temp.deve_passar(p_caso text, p_sql text) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RETURN 'OK      ' || p_caso || ' — passou';
EXCEPTION WHEN OTHERS THEN
  RETURN 'FALHOU  ' || p_caso || ' — recusado: ' || SQLSTATE || ' ' || SQLERRM;
END $$;

\echo ''
\echo '── PROVA FINALIZADA: as três escritas são recusadas ──'
SELECT pg_temp.deve_recusar('1 INSERT em prova finalizada',
  $q$INSERT INTO public.valores_funcao_prova (prova_id, funcao_id, valor_pagamento)
     VALUES ('99991111-0000-0000-0000-00000000000f', '99990000-0000-0000-0000-0000000000f2', 50)$q$);
SELECT pg_temp.deve_recusar('2 UPDATE do valor em prova finalizada',
  $q$UPDATE public.valores_funcao_prova SET valor_pagamento = 999
      WHERE id = '99992222-0000-0000-0000-00000000000f'$q$);
SELECT pg_temp.deve_recusar('3 DELETE em prova finalizada (sem meta: só a PF001 pode barrar)',
  $q$DELETE FROM public.valores_funcao_prova WHERE id = '99992222-0000-0000-0000-00000000000f'$q$);

\echo ''
\echo '── UPDATE é checado dos DOIS lados ──'
SELECT pg_temp.deve_recusar('4 mover valor da prova ABERTA para a FINALIZADA (lado NEW)',
  $q$UPDATE public.valores_funcao_prova SET prova_id = '99991111-0000-0000-0000-00000000000f',
            funcao_id = '99990000-0000-0000-0000-0000000000f2'
      WHERE id = '99992222-0000-0000-0000-00000000000a'$q$);
SELECT pg_temp.deve_recusar('5 tirar valor da FINALIZADA para a ABERTA (lado OLD)',
  $q$UPDATE public.valores_funcao_prova SET prova_id = '99991111-0000-0000-0000-00000000000a',
            funcao_id = '99990000-0000-0000-0000-0000000000f2'
      WHERE id = '99992222-0000-0000-0000-00000000000f'$q$);

\echo ''
\echo '── CONTROLE POSITIVO: prova ABERTA segue editável ──'
SELECT pg_temp.deve_passar('6 INSERT em prova aberta',
  $q$INSERT INTO public.valores_funcao_prova (prova_id, funcao_id, valor_pagamento)
     VALUES ('99991111-0000-0000-0000-00000000000a', '99990000-0000-0000-0000-0000000000f2', 50)$q$);
SELECT pg_temp.deve_passar('7 UPDATE em prova aberta',
  $q$UPDATE public.valores_funcao_prova SET valor_pagamento = 150
      WHERE id = '99992222-0000-0000-0000-00000000000a'$q$);
SELECT pg_temp.deve_passar('8 DELETE em prova aberta',
  $q$DELETE FROM public.valores_funcao_prova
      WHERE prova_id = '99991111-0000-0000-0000-00000000000a'
        AND funcao_id = '99990000-0000-0000-0000-0000000000f2'$q$);

\echo ''
\echo ''
\echo '── CONTROLE POSITIVO: reabrir a prova destrava (é o caminho de volta) ──'
UPDATE public.provas SET prova_finalizada = false
 WHERE id = '99991111-0000-0000-0000-00000000000f';
SELECT pg_temp.deve_passar('9 UPDATE depois de reabrir',
  $q$UPDATE public.valores_funcao_prova SET valor_pagamento = 250
      WHERE id = '99992222-0000-0000-0000-00000000000f'$q$);

\echo ''
ROLLBACK;
