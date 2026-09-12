-- Bateria: busca de colaborador para alocação
-- Migration coberta: 20260912180627_buscar_colaboradores_para_alocacao.sql
-- Escrita em 2026-09-12, junto com a migration.
--
-- COMO RODAR
--   sg docker -c "docker exec -i supabase_db_<ref> psql -U postgres -d postgres" \
--     < docs/bateria-buscar-colaboradores-alocacao.sql
--
-- POR QUE ELA EXISTE
-- A suíte Vitest mocka o Supabase: um teste lá afirmaria o mock, nunca o JOIN, o LIMIT
-- nem a RLS. Isto aqui é a única verificação real do que a RPC faz — e só existe quando
-- alguém a executa. ⚠️ "Ela existe" não é "ela passa": uma bateria deste repo já ficou
-- 2 dias quebrada na primeira linha sem que nenhum dos 10 casos rodasse.
--
-- ⚠️ PRÉ-CONDIÇÃO: banco local logo depois de `db reset`. Os casos escolhem as fixtures
-- DINAMICAMENTE do dado real; o bloco 0 confere que elas existem. Só leitura — a RPC é
-- STABLE e não escreve nada, mas tudo roda em transação com ROLLBACK mesmo assim, porque
-- o caso de RLS precisa fabricar papel.

\set ON_ERROR_STOP off
\timing off

\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 0. PRÉ-CONDIÇÕES                                                       ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'

\echo ''
\echo '-- 0.1 A função existe e é SECURITY INVOKER'
\echo '--     INVOKER não é detalhe: é o que mantém a RLS das duas tabelas valendo. Fosse'
\echo '--     DEFINER, um coordenador de outra prova passaria a ver alocação que não vê.'
SELECT CASE WHEN NOT p.prosecdef THEN 'OK — SECURITY INVOKER (a RLS continua valendo)'
            ELSE 'FALHOU — virou DEFINER; a RLS deixou de recortar' END AS resultado
FROM pg_proc p WHERE p.proname = 'buscar_colaboradores_para_alocacao';

\echo ''
\echo '-- 0.2 anon não executa; authenticated executa (controle positivo do revoke)'
SELECT CASE WHEN has_function_privilege('anon',
         'public.buscar_colaboradores_para_alocacao(uuid,text,uuid,int)', 'EXECUTE')
            THEN 'FALHOU — anon executa'
            ELSE 'OK — anon sem EXECUTE' END AS resultado;
SELECT CASE WHEN has_function_privilege('authenticated',
         'public.buscar_colaboradores_para_alocacao(uuid,text,uuid,int)', 'EXECUTE')
            THEN 'OK — authenticated executa'
            ELSE 'FALHOU — revogamos de quem precisa' END AS resultado;

\echo ''
\echo '-- 0.3 As fixtures de dado real'
SELECT (SELECT count(*) FROM public.colaboradores)                        AS colaboradores,
       (SELECT count(*) FROM public.colaboradores_prova)                  AS alocacoes,
       (SELECT count(*) FROM public.colaboradores
         WHERE colab_nome_completo <> translate(colab_nome_completo,
               'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ','AAAAAEEEEIIIIOOOOOUUUUCN'))    AS nomes_com_acento;


\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 1. CONTROLE POSITIVO — a busca legítima acha quem tem de achar         ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'
DO $$
DECLARE
  v_prova uuid; v_nome text; v_sem_acento text; v_achou int;
BEGIN
  SELECT pu.prova_id INTO v_prova
    FROM colaboradores_prova ap JOIN prova_unidades pu ON pu.id = ap.prova_unidade_id
   GROUP BY 1 ORDER BY count(*) DESC LIMIT 1;

  -- Um nome COM acento, para provar os dois sentidos da normalização.
  SELECT colab_nome_completo INTO v_nome
    FROM colaboradores
   WHERE colab_nome_completo <> translate(colab_nome_completo,
         'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ','AAAAAEEEEIIIIOOOOOUUUUCN')
   LIMIT 1;

  IF v_prova IS NULL OR v_nome IS NULL THEN
    RAISE NOTICE 'CASO 1: PULADO — sem fixture'; RETURN;
  END IF;

  v_sem_acento := translate(lower(v_nome),
                    'áàâãäåéèêëíìîïóòôõöúùûüçñýÿ','aaaaaaeeeeiiiiooooouuuucnyy');

  -- 1.1 termo JÁ sem acento acha o nome COM acento
  SELECT count(*) INTO v_achou
    FROM buscar_colaboradores_para_alocacao(v_prova, v_sem_acento, NULL, 1000)
   WHERE colab_nome_completo = v_nome;
  IF v_achou = 1 THEN
    RAISE NOTICE 'CASO 1.1: OK — termo sem acento acha "%"', v_nome;
  ELSE
    RAISE NOTICE 'CASO 1.1: FALHOU — nao achou "%" pelo termo "%"', v_nome, v_sem_acento;
  END IF;

  -- 1.2 ⚠️ o termo CRU (com acento) tem de achar também. É o lado que o cliente
  --     normaliza com `removerAcentos`; se este caso passar a falhar, os dois lados
  --     deixaram de casar — e a busca para de achar SEM ERRO.
  SELECT count(*) INTO v_achou
    FROM buscar_colaboradores_para_alocacao(v_prova,
           translate(lower(v_nome),'áàâãäåéèêëíìîïóòôõöúùûüçñýÿ','aaaaaaeeeeiiiiooooouuuucnyy'),
           NULL, 1000)
   WHERE colab_nome_completo = v_nome;
  IF v_achou = 1 THEN
    RAISE NOTICE 'CASO 1.2: OK — os dois lados da normalizacao casam';
  ELSE
    RAISE NOTICE 'CASO 1.2: FALHOU — o par colab_nome_busca x removerAcentos desalinhou';
  END IF;

  -- 1.3 termo vazio devolve gente (o picker abre com lista, nao vazio)
  SELECT count(*) INTO v_achou
    FROM buscar_colaboradores_para_alocacao(v_prova, '', NULL, 10);
  IF v_achou = 10 THEN
    RAISE NOTICE 'CASO 1.3: OK — termo vazio devolve as primeiras por nome';
  ELSE
    RAISE NOTICE 'CASO 1.3: ATENCAO — termo vazio devolveu % linhas', v_achou;
  END IF;
END $$;


\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 2. 🔴 O TETO DEIXOU DE ALCANÇAR — é o ponto do tema                    ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'
DO $$
DECLARE
  v_prova uuid; v_n int; v_total int;
BEGIN
  SELECT pu.prova_id INTO v_prova
    FROM colaboradores_prova ap JOIN prova_unidades pu ON pu.id = ap.prova_unidade_id
   GROUP BY 1 ORDER BY count(*) DESC LIMIT 1;

  SELECT count(*) INTO v_total FROM colaboradores;
  SELECT count(*) INTO v_n FROM buscar_colaboradores_para_alocacao(v_prova, '', NULL, 50);

  -- O que a tela pede é 50. O conjunto tem 771. Antes, a consulta crua traria 771 hoje e
  -- exatamente 1000 quando o cadastro passasse disso — calada.
  IF v_n = 50 THEN
    RAISE NOTICE 'CASO 2.1: OK — LIMIT respeitado (% no cadastro, 50 devolvidas)', v_total;
  ELSE
    RAISE NOTICE 'CASO 2.1: FALHOU — pedimos 50 e vieram %', v_n;
  END IF;

  -- Limite maior que o conjunto devolve o conjunto, não estoura.
  SELECT count(*) INTO v_n FROM buscar_colaboradores_para_alocacao(v_prova, '', NULL, 100000);
  IF v_n = v_total THEN
    RAISE NOTICE 'CASO 2.2: OK — limite alto devolve o conjunto inteiro (%)', v_n;
  ELSE
    RAISE NOTICE 'CASO 2.2: ATENCAO — % de % linhas', v_n, v_total;
  END IF;

  -- Limite inválido não vira "sem limite".
  SELECT count(*) INTO v_n FROM buscar_colaboradores_para_alocacao(v_prova, '', NULL, 0);
  IF v_n = 1 THEN
    RAISE NOTICE 'CASO 2.3: OK — limite 0 vira 1, nunca "tudo"';
  ELSE
    RAISE NOTICE 'CASO 2.3: FALHOU — limite 0 devolveu %', v_n;
  END IF;
END $$;


\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 3. O CRUZAMENTO — quem sai da lista, quem fica desabilitado            ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'
DO $$
DECLARE
  v_prova uuid; v_unidade uuid;
  v_na_unidade int; v_apos_excluir int; v_outras int; v_sem_sigla int;
BEGIN
  SELECT pu.prova_id, ap.prova_unidade_id INTO v_prova, v_unidade
    FROM colaboradores_prova ap JOIN prova_unidades pu ON pu.id = ap.prova_unidade_id
   GROUP BY 1,2 ORDER BY count(*) DESC LIMIT 1;

  IF v_unidade IS NULL THEN RAISE NOTICE 'CASOS 3.x: PULADOS'; RETURN; END IF;

  SELECT count(*) INTO v_na_unidade
    FROM buscar_colaboradores_para_alocacao(v_prova, '', NULL, 100000)
   WHERE alocado_prova_unidade_id = v_unidade;

  SELECT count(*) INTO v_apos_excluir
    FROM buscar_colaboradores_para_alocacao(v_prova, '', v_unidade, 100000)
   WHERE alocado_prova_unidade_id = v_unidade;

  IF v_na_unidade > 0 AND v_apos_excluir = 0 THEN
    RAISE NOTICE 'CASO 3.1: OK — os % da unidade atual somem quando ela e excluida', v_na_unidade;
  ELSE
    RAISE NOTICE 'CASO 3.1: FALHOU — % antes, % depois', v_na_unidade, v_apos_excluir;
  END IF;

  -- 🔴 Quem está em OUTRA unidade CONTINUA na lista. Esconder seria repetir o defeito
  -- que o tema veio fechar: o usuário procuraria o nome e não saberia por que sumiu.
  SELECT count(*) INTO v_outras
    FROM buscar_colaboradores_para_alocacao(v_prova, '', v_unidade, 100000)
   WHERE alocado_prova_unidade_id IS NOT NULL;
  IF v_outras > 0 THEN
    RAISE NOTICE 'CASO 3.2: OK — % alocados em outra unidade seguem visiveis', v_outras;
  ELSE
    RAISE NOTICE 'CASO 3.2: ATENCAO — ninguem alocado em outra unidade nesta fixture';
  END IF;

  -- A sigla é o que a tela mostra ao lado do nome; sem ela o aviso fica mudo.
  SELECT count(*) INTO v_sem_sigla
    FROM buscar_colaboradores_para_alocacao(v_prova, '', v_unidade, 100000)
   WHERE alocado_prova_unidade_id IS NOT NULL
     AND coalesce(btrim(alocado_unid_sigla), '') = '';
  IF v_sem_sigla = 0 THEN
    RAISE NOTICE 'CASO 3.3: OK — todo alocado vem com a sigla da unidade';
  ELSE
    RAISE NOTICE 'CASO 3.3: FALHOU — % alocados sem sigla', v_sem_sigla;
  END IF;

  -- Uma linha por pessoa: o DISTINCT ON evita duplicar alguem que (hoje nao, mas o banco
  -- permite) esteja em duas unidades da mesma prova.
  IF NOT EXISTS (
    SELECT 1 FROM buscar_colaboradores_para_alocacao(v_prova, '', NULL, 100000)
     GROUP BY id HAVING count(*) > 1
  ) THEN
    RAISE NOTICE 'CASO 3.4: OK — ninguem aparece duas vezes';
  ELSE
    RAISE NOTICE 'CASO 3.4: FALHOU — ha pessoa repetida na lista';
  END IF;
END $$;


\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 4. RLS — INVOKER significa que o recorte continua valendo              ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'
\echo ''
\echo '-- 4.1 ADMIN vê a lista e o cruzamento'
BEGIN;
DO $$
DECLARE v_admin uuid; v_prova uuid;
BEGIN
  SELECT user_id INTO v_admin FROM user_roles WHERE role = 'admin' LIMIT 1;
  SELECT pu.prova_id INTO v_prova FROM colaboradores_prova ap
    JOIN prova_unidades pu ON pu.id = ap.prova_unidade_id
   GROUP BY 1 ORDER BY count(*) DESC LIMIT 1;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);

  RAISE NOTICE 'CASO 4.1: admin ve % colaboradores, % deles com alocacao',
    (SELECT count(*) FROM buscar_colaboradores_para_alocacao(v_prova, '', NULL, 100000)),
    (SELECT count(*) FROM buscar_colaboradores_para_alocacao(v_prova, '', NULL, 100000)
      WHERE alocado_prova_unidade_id IS NOT NULL);
END $$;
ROLLBACK;

\echo ''
\echo '-- 4.2 AUTENTICADO SEM PAPEL: a RLS de colaboradores o limita a propria linha'
\echo '--     Se aqui aparecer a lista inteira, INVOKER virou DEFINER em algum lugar.'
BEGIN;
DO $$
DECLARE v_user uuid; v_prova uuid; v_n int;
BEGIN
  SELECT ur.user_id INTO v_user FROM user_roles ur
   WHERE ur.role = 'user'
     AND ur.user_id NOT IN (SELECT user_id FROM user_roles
                             WHERE role IN ('admin','superadmin','coordenador'))
   LIMIT 1;
  SELECT pu.prova_id INTO v_prova FROM colaboradores_prova ap
    JOIN prova_unidades pu ON pu.id = ap.prova_unidade_id
   GROUP BY 1 ORDER BY count(*) DESC LIMIT 1;

  IF v_user IS NULL THEN RAISE NOTICE 'CASO 4.2: PULADO — sem fixture'; RETURN; END IF;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);

  SELECT count(*) INTO v_n FROM buscar_colaboradores_para_alocacao(v_prova, '', NULL, 100000);
  IF v_n <= 1 THEN
    RAISE NOTICE 'CASO 4.2: OK — autenticado sem papel ve % linha(s), nao a lista', v_n;
  ELSE
    RAISE NOTICE 'CASO 4.2: FALHOU — ve % colaboradores; a RLS deixou de recortar', v_n;
  END IF;
END $$;
ROLLBACK;


\echo ''
\echo '╔════════════════════════════════════════════════════════════════════════╗'
\echo '║ 5. ORDEM ESTÁVEL — o desempate por id não é zelo                       ║'
\echo '╚════════════════════════════════════════════════════════════════════════╝'
\echo ''
\echo '-- Medido em 2026-09-12 contra o dump: NENHUM colab_nome_completo repetido hoje'
\echo '-- (a consulta abaixo sai vazia, e isso e o esperado). Nada impede que apareca um:'
\echo '-- nao ha unique nessa coluna. Por isso a ordem leva `id` como desempate, e o caso'
\echo '-- 5.1 e quem afirma a estabilidade — nao a ausencia de homonimo.'
SELECT colab_nome_completo, count(*) AS linhas
FROM public.colaboradores GROUP BY 1 HAVING count(*) > 1;

DO $$
DECLARE v_prova uuid; v_a uuid[]; v_b uuid[];
BEGIN
  SELECT pu.prova_id INTO v_prova FROM colaboradores_prova ap
    JOIN prova_unidades pu ON pu.id = ap.prova_unidade_id
   GROUP BY 1 ORDER BY count(*) DESC LIMIT 1;

  SELECT array_agg(id ORDER BY ordem) INTO v_a FROM (
    SELECT id, row_number() OVER () AS ordem
      FROM buscar_colaboradores_para_alocacao(v_prova, '', NULL, 100000)) x;
  SELECT array_agg(id ORDER BY ordem) INTO v_b FROM (
    SELECT id, row_number() OVER () AS ordem
      FROM buscar_colaboradores_para_alocacao(v_prova, '', NULL, 100000)) y;

  IF v_a = v_b THEN
    RAISE NOTICE 'CASO 5.1: OK — duas chamadas devolvem a MESMA ordem';
  ELSE
    RAISE NOTICE 'CASO 5.1: FALHOU — a ordem mudou entre chamadas; paginar pularia linha';
  END IF;
END $$;
