-- ═══════════════════════════════════════════════════════════════════════════════════════
-- A chave natural do candidato passa a ser (edital_id, n_inscricao)
-- ═══════════════════════════════════════════════════════════════════════════════════════
--
-- Decisão do usuário em 2026-08-01: "a chave que deve ser única para cada candidato é o
-- n_inscricao; um mesmo CPF pode ter mais de uma inscrição, desde que para cargos
-- diferentes".
--
-- A segunda metade da frase CONTINUA valendo sem que o cargo esteja na chave, e é o que
-- torna a proposta possível: no arquivo real cada inscrição tem número próprio. A mesma
-- pessoa em dois cargos aparece com DOIS números (medido: CPF 05261923727 nas inscrições
-- 9 e 5208). Portanto tirar `cargo_id` da chave não funde essas linhas — elas nunca
-- dependeram do cargo para se distinguir.
--
-- ── O que foi MEDIDO antes de apertar (regra da casa: medir antes) ────────────────────
--
--   arquivo real (todos inscritos concurso 002-2026-SMA), 7.416 linhas de dado:
--     · nº de inscrição com mais de uma linha ......................... 0
--   banco local (cópia de produção), 7.231 candidatos:
--     · (edital_id, n_inscricao) com mais de uma linha ................ 0
--
-- A chave nova é ESTRITAMENTE mais apertada que a antiga (4 colunas -> 2), e mesmo assim
-- nenhuma linha existente a viola. Não há saneamento a fazer.
--
-- ── O que sai da identidade, e o que isso desfaz ──────────────────────────────────────
--
-- `cpf` e `cargo_id` deixam de compor a identidade. Duas consequências que ESTAVAM
-- documentadas como armadilhas e que esta migration RESOLVE por construção:
--
--   · o `NULLS NOT DISTINCT` deixa de ser necessário. Ele existia porque `cpf` e
--     `cargo_id` são nullable e, no padrão do Postgres, dois NULL são distintos entre si —
--     as linhas sem CPF se reinseririam a cada reimportação. As duas colunas da chave nova
--     são NOT NULL (conferido no information_schema), então a questão não se coloca.
--
--   · a fusão dos 2 CPFs impossíveis do arquivo real (o defeito achado em 2026-07-29, que
--     um teste verde afirmava como correto) não pode voltar: eles estão nas inscrições 375
--     e 4256, que são chaves diferentes. O CPF saiu da identidade e por isso o valor dele
--     — cru, inválido ou ausente — deixou de conseguir empatar duas pessoas.
--
-- ⚠️ O AFROUXAMENTO ACEITO, para quem auditar depois: a chave não barra mais o mesmo CPF
-- duas vezes no MESMO cargo, se vierem com números de inscrição diferentes. Não ocorre no
-- arquivo medido (0 casos), e a providência, se ocorrer, é na origem do dado.
--
-- ⚠️ O APERTO ACEITO, que é o lado que pode perder linha: se um edital futuro repetir o
-- MESMO número de inscrição entre cargos diferentes, as linhas passam a ser a mesma chave
-- e o `deduplicar()` do cliente mantém só a última. NÃO é perda silenciosa — a descartada
-- sai nomeada na seção "Repetidas" do relatório de importação. O arquivo real não tem
-- nenhum caso (0 de 7.416).
--
-- 🔴 `edital_id` é INDISPENSÁVEL na chave, e por um motivo novo: o número de inscrição
-- recomeça em 1 a cada planilha (o arquivo real vai de 1 a 7.416). Sem o edital, o segundo
-- edital importado colidiria já na primeira linha.
-- ═══════════════════════════════════════════════════════════════════════════════════════

-- ── 1. Controle: a chave nova cabe no dado que já existe? ─────────────────────────────
-- Roda contra a tabela real antes de qualquer DDL. Se houver violação, a migration para
-- aqui e nada é trocado — em vez de o CREATE INDEX falhar com a mensagem crua do Postgres.
DO $$
DECLARE
  colisoes integer;
BEGIN
  SELECT count(*) INTO colisoes
    FROM (
      SELECT edital_id, n_inscricao
        FROM public.candidatos
       GROUP BY edital_id, n_inscricao
      HAVING count(*) > 1
    ) g;

  IF colisoes > 0 THEN
    RAISE EXCEPTION
      'A chave natural nova (edital_id, n_inscricao) colidiria em % grupo(s) de candidatos.',
      colisoes
      USING HINT =
        'Há mais de um candidato com o mesmo nº de inscrição no mesmo edital. Sanear o dado '
        'vem antes de apertar a chave: identifique os grupos com '
        'SELECT edital_id, n_inscricao, count(*) FROM candidatos GROUP BY 1,2 HAVING count(*) > 1.';
  END IF;
END $$;

-- ── 2. A troca do índice ──────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS public.candidatos_cpf_cargo_id_inscricao_key;

CREATE UNIQUE INDEX candidatos_edital_inscricao_key
  ON public.candidatos (edital_id, n_inscricao);

COMMENT ON INDEX public.candidatos_edital_inscricao_key IS
  'Chave natural do candidato: edital + nº de inscrição. Cada inscrição tem número '
  'próprio, então a mesma pessoa concorrendo a dois cargos são duas linhas com números '
  'diferentes — o cargo NÃO precisa estar na chave para isso valer. `edital_id` é '
  'indispensável: o nº de inscrição recomeça em 1 a cada planilha. Substituiu '
  'candidatos_cpf_cargo_id_inscricao_key em 2026-08-01; a chave em JS que precisa '
  'concordar com esta é chaveNatural(), em src/lib/candidatos-import.ts.';

-- ⚠️ `idx_candidatos_cpf` e `idx_candidatos_cargo` FICAM. Eles não são a chave natural —
-- servem à busca por CPF e ao "quem usa ESTE cargo?" da CG001, que continuam existindo
-- depois que essas duas colunas saíram da identidade.
