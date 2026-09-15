-- ============================================================================
-- Bateria — `colaboradores.colab_nome_completo` virou `text` (2026-09-15)
-- ============================================================================
--
-- O QUE ISTO PROVA
-- Que o teto de 40 caracteres CAIU de verdade (controle positivo: nome de 100
-- caracteres entra e volta INTEIRO) e que nada foi derrubado junto: a CHECK de
-- não-vazio, o NOT NULL, o trigger de caixa alta e a coluna computada da busca
-- continuam valendo sobre o valor longo.
--
-- POR QUE UMA BATERIA, E NÃO UM TESTE DO VITEST
-- A suíte mocka o Supabase — um teste lá afirmaria o mock. Tipo de coluna, CHECK,
-- NOT NULL, trigger e coluna computada só se verificam contra o Postgres de verdade.
-- Ver my_rules/estrutura/transversais/testes.md.
--
-- 🔴 O CONTROLE POSITIVO É A METADE QUE IMPORTA AQUI. Esta mudança AFROUXA uma regra:
-- provar que o vazio continua recusado não prova nada sobre o que ela mudou. O caso 2
-- é o que reprova a mudança se algum outro ponto (trigger, CHECK nova, coluna
-- computada) continuar cortando em 40.
--
-- COMO RODAR (banco LOCAL — nunca contra produção)
--   sg docker -c "docker exec -i supabase_db_<ref> psql -U postgres -d postgres" \
--     < docs/bateria-nome-colaborador-text.sql
--
-- É SEGURO: tudo roda dentro de uma transação que termina em ROLLBACK. Nenhuma linha
-- é alterada de verdade. Pode rodar quantas vezes quiser.
--
-- MÉTODO: usa UPDATE numa linha existente, não INSERT — INSERT exigiria satisfazer
-- NOT NULL e FKs de tabelas inteiras, e o ruído esconderia o que se quer medir.
-- Se a tabela estiver vazia (clone sem o dump), a bateria para com SKIP em vez de
-- passar em falso.
-- ============================================================================

BEGIN;

DO $bateria$
DECLARE
  passou   int := 0;
  falhou   int := 0;
  v_id     uuid;
  v_tipo   text;
  v_max    int;
  v_nome   text;
  v_lido   text;
  v_busca  text;
  v_erro   text;

  -- 47 caracteres com acento + 53 de enchimento = 100. O acento é de propósito:
  -- é ele que exercita o par `colab_nome_busca` × removerAcentos (caso 5).
  c_nome_longo constant text :=
    'José Antônio da Conceição Ávila Gonçalves Neto ' || repeat('a', 53);
BEGIN
  SELECT id INTO v_id FROM colaboradores ORDER BY id LIMIT 1;
  IF v_id IS NULL THEN
    RAISE NOTICE 'SKIP: `colaboradores` está vazia — rode `npx supabase db reset` para carregar o dump.';
    RETURN;
  END IF;

  RAISE NOTICE '';

  -- ------------------------------------------------------------------ caso 1
  -- O tipo em si. Sem isto, os casos seguintes poderiam passar num varchar(200).
  SELECT data_type, character_maximum_length INTO v_tipo, v_max
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'colaboradores'
     AND column_name = 'colab_nome_completo';

  IF v_tipo = 'text' AND v_max IS NULL THEN
    passou := passou + 1;
    RAISE NOTICE 'ok      1  colab_nome_completo é `text`, sem teto declarado';
  ELSE
    falhou := falhou + 1;
    RAISE NOTICE 'FALHOU  1  esperava text/sem teto, achei % (limite %)', v_tipo, v_max;
  END IF;

  -- ------------------------------------------------------------------ caso 2
  -- 🔴 CONTROLE POSITIVO: o nome longo entra e volta INTEIRO.
  BEGIN
    UPDATE colaboradores SET colab_nome_completo = c_nome_longo WHERE id = v_id;
    SELECT colab_nome_completo INTO v_lido FROM colaboradores WHERE id = v_id;

    IF length(v_lido) = 100 THEN
      passou := passou + 1;
      RAISE NOTICE 'ok      2  nome de 100 caracteres entrou e voltou inteiro (o teto de 40 caiu)';
    ELSE
      falhou := falhou + 1;
      RAISE NOTICE 'FALHOU  2  gravei 100 caracteres e li % — ALGO ainda está cortando', length(v_lido);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    falhou := falhou + 1;
    RAISE NOTICE 'FALHOU  2  o nome de 100 caracteres foi RECUSADO (% — %)', SQLSTATE, SQLERRM;
  END;

  -- ------------------------------------------------------------------ caso 3
  -- O trigger de caixa alta continua agindo — inclusive sobre a parte acentuada.
  IF v_lido = upper(c_nome_longo) THEN
    passou := passou + 1;
    RAISE NOTICE 'ok      3  tr_uppercase_colab_nome_completo aplicou UPPER no valor longo';
  ELSE
    falhou := falhou + 1;
    RAISE NOTICE 'FALHOU  3  esperava o valor em caixa alta, li "%"', left(v_lido, 50);
  END IF;

  -- ------------------------------------------------------------------ caso 4
  -- O par da busca: `colab_nome_busca` tem de devolver o nome longo minúsculo e SEM
  -- acento. Vale medir porque o nome gravado é sempre CAIXA ALTA (caso 3), então a
  -- remoção de acento depende de `lower()` rebaixar 'Ç'/'Ã' — o que só acontece
  -- porque o banco é en_US.UTF-8. Num banco criado com collate C isto quebraria
  -- calado, e a busca por "jose" pararia de achar "JOSÉ".
  SELECT public.colab_nome_busca(c) INTO v_busca FROM colaboradores c WHERE c.id = v_id;

  IF v_busca ~ 'jose antonio da conceicao avila goncalves neto'
     AND v_busca !~ '[áàâãäåéèêëíìîïóòôõöúùûüçñýÿ]'
     AND length(v_busca) = 100 THEN
    passou := passou + 1;
    RAISE NOTICE 'ok      4  colab_nome_busca devolveu o nome longo sem acento e completo';
  ELSE
    falhou := falhou + 1;
    RAISE NOTICE 'FALHOU  4  colab_nome_busca devolveu "%" (% caracteres)', left(v_busca, 60), length(v_busca);
  END IF;

  -- ------------------------------------------------------------------ caso 5
  -- Controle negativo: a CHECK de não-vazio sobreviveu ao ALTER TYPE. Exigimos o NOME
  -- da constraint, não só "houve recusa" — foi assim que uma CHECK ofuscada por outra
  -- apareceu em 03/08 (ver CLAUDE.md §8).
  BEGIN
    UPDATE colaboradores SET colab_nome_completo = '   ' WHERE id = v_id;
    falhou := falhou + 1;
    RAISE NOTICE 'FALHOU  5  nome só com espaços foi ACEITO — chk_colab_nome_preenchido não barrou';
  EXCEPTION
    WHEN check_violation THEN
      GET STACKED DIAGNOSTICS v_erro = CONSTRAINT_NAME;
      IF v_erro = 'chk_colab_nome_preenchido' THEN
        passou := passou + 1;
        RAISE NOTICE 'ok      5  nome em branco barrado por chk_colab_nome_preenchido';
      ELSE
        falhou := falhou + 1;
        RAISE NOTICE 'FALHOU  5  barrou por "%", não pela esperada', v_erro;
      END IF;
    WHEN OTHERS THEN
      falhou := falhou + 1;
      RAISE NOTICE 'FALHOU  5  erro % em vez de check_violation: %', SQLSTATE, SQLERRM;
  END;

  -- ------------------------------------------------------------------ caso 6
  -- Controle negativo: o NOT NULL também sobreviveu.
  BEGIN
    UPDATE colaboradores SET colab_nome_completo = NULL WHERE id = v_id;
    falhou := falhou + 1;
    RAISE NOTICE 'FALHOU  6  nome NULL foi ACEITO — o NOT NULL sumiu';
  EXCEPTION
    WHEN not_null_violation THEN
      passou := passou + 1;
      RAISE NOTICE 'ok      6  nome NULL barrado pelo NOT NULL';
    WHEN OTHERS THEN
      falhou := falhou + 1;
      RAISE NOTICE 'FALHOU  6  erro % em vez de not_null_violation: %', SQLSTATE, SQLERRM;
  END;

  RAISE NOTICE '';
  RAISE NOTICE '--- Resultado: % ok, % falhou (de % casos) ---', passou, falhou, passou + falhou;

  IF falhou > 0 THEN
    RAISE EXCEPTION 'BATERIA REPROVADA: % caso(s).', falhou;
  END IF;
  RAISE NOTICE 'BATERIA APROVADA.';
  RAISE NOTICE '';
END
$bateria$;

-- Nada aqui deve persistir.
ROLLBACK;

-- ============================================================================
-- O que esta bateria NÃO cobre
-- ============================================================================
--
-- O caminho HTTP. Quem escreve nome pelo PostgREST direto (`ColaboradorDialog`,
-- `CadastroLote`) passa pela RLS e pelo Zod do cliente, não por aqui. E a Edge
-- Function `public-create-colaborador` valida o corpo com Zod no Deno — o `.max(40)`
-- dela saiu no mesmo passe desta migration; se voltar, o cadastro público recusa o
-- que o banco aceita, e NENHUM caso acima denuncia isso.
--
-- ⚠️ O corte no PDF também não. `DocumentosImpressao.tsx` fixa a coluna Nome da folha
-- de assinatura em 80 mm com `overflow: 'hidden'` — em Times 9 e caixa alta cabem ~45
-- caracteres, e o que passa disso sai cortado no papel. É comportamento conhecido e
-- aceito (ver my_rules/estrutura/modulos/aplicacao-provas/documentos-e-relatorios.md),
-- não defeito desta bateria.
