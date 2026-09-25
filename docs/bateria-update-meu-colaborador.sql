-- Bateria: update_meu_colaborador — CPF sem LPAD, dígito verificador na MUDANÇA, duplicidade
-- que nomeia o campo.
-- Migration coberta: 20260925002742_update_meu_colaborador_cpf_e_duplicidade.sql
--   ⚠️ o nome do arquivo é UTC; a sessão que a escreveu foi 2026-09-24 local
-- Escrita em 2026-09-24, junto com a migration.
--
-- COMO RODAR
--   sg docker -c "docker exec -i \$(docker ps --format '{{.Names}}' | grep supabase_db) \
--     psql -U postgres -d postgres" < docs/bateria-update-meu-colaborador.sql
--   Toda linha de resultado começa com OK ou FALHOU.
--
-- POR QUE ELA EXISTE
-- A suíte Vitest mocka o Supabase: o `PerfilColaborador.ui.test.tsx` afirma o que a TELA faz
-- com a frase, nunca o que a RPC responde. Isto é a única verificação da RPC — e só existe
-- quando alguém a executa. ⚠️ Ao mudar a assinatura da RPC, as chamadas daqui mudam junto.
--
-- 🔴 CADA CASO AFIRMA O TEXTO DE QUEM RECUSOU, não só que houve recusa. Um CPF de 3 dígitos
-- recusado pela CHECK `chk_colab_cpf_numerico` seria recusa por OUTRA regra — e a da RPC
-- viraria cobertura fantasma (CLAUDE.md §8, "CHECK nova pode ofuscar CHECK antiga").
--
-- ⚠️ PRÉ-CONDIÇÃO: banco local logo depois de `db reset`. As fixtures são escolhidas
-- DINAMICAMENTE do dado real (colaborador A com conta; B, outro cadastro com CPF e e-mail).
-- Tudo roda numa transação com ROLLBACK, e cada caso num SAVEPOINT próprio.

\set ON_ERROR_STOP on
\timing off
\pset tuples_only on
\pset format unaligned

BEGIN;

\o /dev/null
-- ── Fixtures: guardadas em GUCs, porque a chamada roda como `authenticated`, e a RLS só
--    deixa o colaborador ver a própria linha.
SELECT set_config('bat.uid',   a.user_id::text, true),
       set_config('bat.a_id',  a.id::text, true),
       set_config('bat.nome',  a.colab_nome_completo, true),
       set_config('bat.cpf',   a.colab_cpf, true),
       set_config('bat.nasc',  a.colab_data_nascimento::text, true),
       set_config('bat.email', coalesce(a.colab_email, ''), true),
       set_config('bat.b_cpf',   b.colab_cpf, true),
       set_config('bat.b_email', b.colab_email, true)
  FROM colaboradores a,
       LATERAL (SELECT colab_cpf, colab_email FROM colaboradores
                 WHERE id <> a.id AND colab_email IS NOT NULL LIMIT 1) b
 WHERE a.user_id IS NOT NULL AND a.colab_data_nascimento IS NOT NULL
 LIMIT 1;
\o

-- Chama a RPC COMO o colaborador A e devolve 'OK' ou 'SQLSTATE: mensagem'. O set_config
-- local é desfeito sozinho quando o bloco aborta; no caminho feliz, volta-se à mão.
CREATE FUNCTION pg_temp.chamar(p_cpf text, p_email text DEFAULT NULL, p_telefone bigint DEFAULT NULL)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE r boolean;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', current_setting('bat.uid'), 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  r := public.update_meu_colaborador(
    current_setting('bat.nome'), p_cpf, NULL, current_setting('bat.nasc')::date,
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, p_telefone, NULL, NULL, NULL, false,
    coalesce(p_email, current_setting('bat.email')), NULL);
  PERFORM set_config('role', 'postgres', true);
  RETURN CASE WHEN r THEN 'OK' ELSE 'RETORNOU FALSE' END;
EXCEPTION WHEN OTHERS THEN
  RETURN SQLSTATE || ': ' || SQLERRM;
END $$;

CREATE FUNCTION pg_temp.conferir(p_caso text, p_obtido text, p_esperado text)
RETURNS text LANGUAGE sql AS $$
  SELECT CASE WHEN p_obtido = p_esperado THEN 'OK — ' || p_caso
              ELSE 'FALHOU — ' || p_caso || E'\n    esperado: ' || p_esperado
                   || E'\n    obtido:   ' || coalesce(p_obtido, 'NULL') END
$$;

\echo ''
\echo '── 0. PRÉ-CONDIÇÕES'
SELECT CASE WHEN current_setting('bat.uid', true) IS NOT NULL
            THEN 'OK — há colaborador com conta (A) e outro com e-mail (B)'
            ELSE 'FALHOU — sem fixture; nada abaixo significa coisa alguma' END;
SELECT CASE WHEN p.prosecdef AND p.proconfig @> ARRAY['search_path=public']
            THEN 'OK — a RPC segue SECURITY DEFINER com search_path fixo'
            ELSE 'FALHOU — secdef/search_path mudaram' END
  FROM pg_proc p WHERE p.oid = 'public.update_meu_colaborador(text,text,text,date,text,text,text,integer,text,text,text,bigint,bigint,smallint,smallint,smallint,boolean,text,text)'::regprocedure;
SELECT CASE WHEN NOT has_function_privilege('anon', p.oid, 'EXECUTE')
             AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
            THEN 'OK — anon NÃO executa; authenticated executa'
            ELSE 'FALHOU — permissões mudaram' END
  FROM pg_proc p WHERE p.proname = 'update_meu_colaborador';
SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM colaboradores WHERE colab_cpf = '52998224725')
            THEN 'OK — o CPF válido de teste (529.982.247-25) não pertence a ninguém'
            ELSE 'FALHOU — 52998224725 já existe; o caso 6 viraria duplicidade' END;

\echo ''
\echo '── 1. CONTROLE POSITIVO: salvar sem mudar o CPF, vindo MASCARADO'
SAVEPOINT c1;
SELECT pg_temp.conferir('CPF inalterado com pontos e traço é aceito',
  pg_temp.chamar(regexp_replace(current_setting('bat.cpf'), '(\d{3})(\d{3})(\d{3})(\d{2})', '\1.\2.\3-\4')),
  'OK');
SELECT pg_temp.conferir('e é gravado só com os dígitos',
  (SELECT colab_cpf FROM colaboradores WHERE id = current_setting('bat.a_id')::uuid),
  current_setting('bat.cpf'));
ROLLBACK TO c1;

\echo ''
\echo '── 2. 🔴 CPF CURTO é recusado pela RPC (o LPAD o completava para 00000000123 e passava)'
SAVEPOINT c2;
SELECT pg_temp.conferir('3 dígitos',
  pg_temp.chamar('123'), 'P0001: CPF inválido: informe os 11 dígitos.');
ROLLBACK TO c2;

\echo ''
\echo '── 3. 🔴 CPF LONGO é recusado (o LPAD o TRUNCAVA nos 11 primeiros — que eram o CPF de A)'
SAVEPOINT c3;
SELECT pg_temp.conferir('12 dígitos = CPF de A + 1',
  pg_temp.chamar(current_setting('bat.cpf') || '9'), 'P0001: CPF inválido: informe os 11 dígitos.');
ROLLBACK TO c3;

\echo ''
\echo '── 4. Dígitos todos iguais são recusados'
SAVEPOINT c4;
SELECT pg_temp.conferir('11111111111',
  pg_temp.chamar('11111111111'), 'P0001: CPF inválido: informe os 11 dígitos.');
ROLLBACK TO c4;

\echo ''
\echo '── 5. CPF NOVO com dígito verificador errado é recusado'
SAVEPOINT c5;
SELECT pg_temp.conferir('529.982.247-26 (último DV trocado)',
  pg_temp.chamar('52998224726'), 'P0001: CPF inválido: os dígitos verificadores não conferem.');
SELECT pg_temp.conferir('529.982.247-35 (primeiro DV trocado)',
  pg_temp.chamar('52998224735'), 'P0001: CPF inválido: os dígitos verificadores não conferem.');
ROLLBACK TO c5;

\echo ''
\echo '── 6. CONTROLE POSITIVO: CPF NOVO e válido é aceito e gravado'
SAVEPOINT c6;
SELECT pg_temp.conferir('trocar para 529.982.247-25',
  pg_temp.chamar('529.982.247-25'), 'OK');
SELECT pg_temp.conferir('e ele fica gravado',
  (SELECT colab_cpf FROM colaboradores WHERE id = current_setting('bat.a_id')::uuid), '52998224725');
ROLLBACK TO c6;

\echo ''
\echo '── 7. 🔵 CONTROLE POSITIVO: CPF LEGADO com DV inválido NÃO impede salvar o resto'
\echo '--     O DV só é exigido na MUDANÇA. Quem tem CPF antigo errado segue editando o endereço.'
SAVEPOINT c7;
UPDATE colaboradores SET colab_cpf = '52998224726' WHERE id = current_setting('bat.a_id')::uuid;
SELECT pg_temp.conferir('salvar com o mesmo CPF legado (DV errado)',
  pg_temp.chamar('52998224726'), 'OK');
ROLLBACK TO c7;

\echo ''
\echo '── 8. 🔴 A duplicidade NOMEIA O CAMPO (antes: sempre "e-mail ou chave PIX")'
SAVEPOINT c8;
SELECT pg_temp.conferir('CPF de outro colaborador',
  pg_temp.chamar(current_setting('bat.b_cpf')), 'P0001: Este CPF já está cadastrado para outro colaborador.');
ROLLBACK TO c8;
SAVEPOINT c8b;
SELECT pg_temp.conferir('e-mail de outro colaborador',
  pg_temp.chamar(current_setting('bat.cpf'), current_setting('bat.b_email')),
  'P0001: Este e-mail já está em uso por outro colaborador.');
ROLLBACK TO c8b;
SAVEPOINT c8c;
-- Só a CAIXA muda: com espaço nas pontas quem barra é a CHECK `chk_colab_email_formato`
-- (que proíbe espaço), antes do índice — e o caso afirmaria a regra errada. A RPC não apara
-- o e-mail; a tela manda o valor carregado, que já está limpo.
SELECT pg_temp.conferir('e-mail de outro em MAIÚSCULAS (o índice é sobre lower(trim(...)))',
  pg_temp.chamar(current_setting('bat.cpf'), upper(current_setting('bat.b_email'))),
  'P0001: Este e-mail já está em uso por outro colaborador.');
ROLLBACK TO c8c;

\echo ''
\echo '── 9. CONTROLE: a CHECK NÃO é engolida pelo handler — segue chegando como 23514'
\echo '--     É o que o `mensagemRecusaCheck` da tela traduz; se virasse P0001, ele não veria.'
SAVEPOINT c9;
SELECT pg_temp.conferir('telefone negativo',
  pg_temp.chamar(current_setting('bat.cpf'), NULL, -5),
  '23514: new row for relation "colaboradores" violates check constraint "chk_colab_telefone_positivo"');
ROLLBACK TO c9;

ROLLBACK;
