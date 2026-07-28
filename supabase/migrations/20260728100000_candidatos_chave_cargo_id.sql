-- Módulo CANDIDATOS — a chave natural troca o TEXTO do cargo pela REFERÊNCIA ao cargo.
-- Etapa 5 do roadmap em my_rules/analises/roadmap-cargos.yaml (decisão D3).
-- Doc do módulo: my_rules/estrutura/modulos/candidatos/00-modulo.md
--
-- ANTES:  (edital_id, cpf, cargo_chave, n_inscricao)
-- DEPOIS: (edital_id, cpf, cargo_id,    n_inscricao)   NULLS NOT DISTINCT
--
-- ── O que isto conserta ───────────────────────────────────────────────────────────────
-- O cargo chega SUJO da origem: 7 dos 9 cargos do arquivo real trazem `¿`, um travessão
-- em cp1252 lido como latin-1. Enquanto o TEXTO do cargo fez parte da identidade,
-- corrigir esse texto e reimportar CRIAVA UM SEGUNDO REGISTRO e mantinha o antigo —
-- 481 registros novos só para `DOCENTE I ¿ HISTÓRIA`. A promessa "corrija a planilha e
-- reimporte" nunca valeu para os campos da própria chave.
--
-- Com `cargo_id` na identidade, o nome do cargo vira ATRIBUTO: corrigi-lo é um UPDATE em
-- UMA linha de `cargos`, e nenhum candidato duplica. Esse é o ganho inteiro da etapa.
--
-- ⚠️ Isto NÃO reverte a migration 20260727200000. O `cpf` continua na chave e o
-- `n_inscricao` também. O que sai é só a coluna gerada do TEXTO do cargo.
--
-- ⚠️ Somar coluna a uma chave única só SEPARA linhas; TROCAR texto por referência pode
-- FUNDI-LAS — duas grafias sujas mapeadas ao mesmo cargo viram a mesma chave. Está
-- correto (é a mesma pessoa no mesmo cargo) e o `deduplicar()` do app resolve, mas por
-- isso a etapa exige o pré-check abaixo em vez de presumir.
--
-- ── Pré-check medido no banco local em 2026-07-28 ─────────────────────────────────────
--     candidatos ....... 0 linhas      (0 com cargo_id NULL)
--     cargos ........... 0 linhas
--     cargo_apelidos ... 0 linhas
-- Nada a preencher e nada a fundir AQUI. O backfill e a guarda abaixo ficam mesmo assim,
-- porque a migration vai rodar noutros bancos — inclusive o de produção no dia do deploy.
--
-- ⚠️ Sobre a regra "dado não vai em migration" (feedback registrado em
-- estrutura/transversais/desenvolvimento-local.md): a regra separa SCHEMA de CARGA. Este
-- UPDATE não carrega dado nenhum — é uma regra genérica e idempotente derivada do próprio
-- banco, e PRECISA rodar ENTRE dois comandos de schema desta mesma migration (depois da
-- coluna existir, antes do índice novo). `seed.pos.sql` roda depois de todas as
-- migrations e não alcança esse ponto.

-- ── 1. Backfill determinístico, a partir dos apelidos já aprendidos ───────────────────
-- Sem dado inventado: só reaproveita a decisão que o usuário já tomou no passo Cargos.
UPDATE public.candidatos c
   SET cargo_id = a.cargo_id
  FROM public.cargo_apelidos a
 WHERE c.cargo_id IS NULL
   AND a.texto_chave = lower(btrim(coalesce(c.cargo, '')));

-- ── 2. A guarda: falhar com mensagem NOSSA, não com 'duplicate key' ───────────────────
-- ⚠️ Aqui a guarda é MAIS PRECISA do que o roadmap propôs. O roadmap mandava levantar erro
-- se restasse qualquer `cargo_id` NULL; mas NULL sozinho não é problema — o problema é
-- COLISÃO. Com NULLS NOT DISTINCT, dois NULLs colidem entre si, e é isso que derruba o
-- CREATE UNIQUE INDEX: no arquivo real 382 pessoas concorrem a mais de um cargo com a
-- MESMA inscrição, então com os dois cargo_id nulos elas viram a mesma chave.
-- Checar a colisão diretamente cobre esse caso E qualquer outro, e não falha à toa quando
-- existe UMA linha sem cargo (que o índice aceitaria numa boa).
-- `GROUP BY` agrupa NULLs juntos, que é exatamente a semântica de NULLS NOT DISTINCT.
DO $$
DECLARE
  colisoes bigint;
  sem_cargo bigint;
BEGIN
  SELECT count(*) INTO colisoes
    FROM (
      SELECT 1
        FROM public.candidatos
       GROUP BY edital_id, cpf, cargo_id, n_inscricao
      HAVING count(*) > 1
    ) t;

  IF colisoes > 0 THEN
    SELECT count(*) INTO sem_cargo
      FROM public.candidatos WHERE cargo_id IS NULL;

    RAISE EXCEPTION
      'Etapa 5 (cargos): a chave natural nova colidiria em % grupo(s) de candidatos. % linha(s) ainda estão sem cargo_id.',
      colisoes, sem_cargo
      USING HINT =
        'Resolva os cargos antes de migrar: associe cada texto de cargo a um cargo do '
        'catálogo (tabela cargo_apelidos) e rode a migration de novo. Ver a etapa 5 em '
        'my_rules/analises/roadmap-cargos.yaml.';
  END IF;
END $$;

-- ── 3. A troca do índice ──────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS public.candidatos_cpf_cargo_inscricao_key;

-- ⚠️ `NULLS NOT DISTINCT` continua obrigatório, e agora por DOIS motivos:
--   - os 2 CPFs impossíveis do arquivo real viram NULL; no padrão do Postgres dois NULLs
--     são distintos entre si, então essas linhas se reinseririam a cada reimportação;
--   - `cargo_id` é NULLABLE no banco de propósito (ver abaixo), então vale o mesmo ali.
CREATE UNIQUE INDEX candidatos_cpf_cargo_id_inscricao_key
  ON public.candidatos (edital_id, cpf, cargo_id, n_inscricao) NULLS NOT DISTINCT;

COMMENT ON INDEX public.candidatos_cpf_cargo_id_inscricao_key IS
  'Chave natural do candidato: edital + CPF + cargo (por REFERÊNCIA) + nº de inscrição. '
  'É sobre ela que a importação faz UPSERT. Como a identidade aponta para cargos.id e não '
  'para o texto, renomear um cargo é um UPDATE numa linha e NÃO duplica candidato — que é '
  'o ganho da etapa 5 do roadmap-cargos.yaml. NULLS NOT DISTINCT para que inscritos sem '
  'CPF não se multipliquem a cada reimportação.';

-- ── 4. A coluna gerada do texto sai junto (D3) ────────────────────────────────────────
-- Sai NA MESMA migration, e não depois: deixar no schema uma coluna cujo nome termina em
-- `_chave`, sem chave nenhuma apontando para ela, é a definição de armadilha neste repo.
-- O texto CRU continua em `candidatos.cargo` (D2, procedência) — nada se perde, e é dele
-- que o trigger da etapa 5b calcula a normalização quando precisa.
ALTER TABLE public.candidatos DROP COLUMN IF EXISTS cargo_chave;

-- ⚠️ `cargo_id` continua NULLABLE no banco, de propósito e mesmo depois desta etapa — o
-- MESMO desenho de provas.edital_id. A obrigatoriedade real é imposta pelo app (D4: o
-- passo Cargos não libera a importação com cargo por resolver) somada à colisão que o
-- NULLS NOT DISTINCT provoca. Um NOT NULL honesto esbarraria na ordem migration → carga.
