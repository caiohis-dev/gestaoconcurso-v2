-- Etapa 1 do roadmap `roadmap-lista-de-candidatos-e-exclusao.yaml`.
--
-- A seção de baixo da tela de alocação vira "Lista de todos os candidatos", e cada linha
-- ganha um marcador booleano: "Retirar da alocação automática". Quem está marcado sai dos
-- contadores dos blocos e o plano deixa de colocá-lo.
--
-- DECISÕES DO USUÁRIO (2026-08-05):
--   D1. Marcar GRAVA na hora e os contadores caem na hora, mas a alocação existente só é
--       desfeita no próximo "Aplicar". Só o Aplicar mexe em sala — a regra não muda.
--   P1. FK de candidato em CASCADE (exceção justificada, ver abaixo).
--   P2. Prova/unidade finalizada BLOQUEIA a marcação.
--
-- 🔴 MEDIDO ANTES, e decide o modelo: o EDITAL 001 TEM **DUAS** PROVAS (7.231 inscritos).
-- Uma coluna em `candidatos` faria "retirar do automático" na prova A retirar também na
-- prova B, EM SILÊNCIO. Por isso a chave é (prova_id, candidato_id).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. A tabela
-- ─────────────────────────────────────────────────────────────────────────────
-- ⚠️ `candidato_id` é ON DELETE **CASCADE**, contra o padrão do repo (CLAUDE.md §2 manda
-- RESTRICT por omissão). A exceção é consciente: esta linha é uma ANOTAÇÃO sem valor
-- próprio — sem o candidato ela não significa nada. RESTRICT bloquearia a reimportação
-- INTEIRA do edital, o que é pior que hoje (hoje só a alocação bloqueia, e isso já é uma
-- decisão pesada).
--
-- 🔴 O PREÇO da CASCADE é perda silenciosa: a troca total apaga os candidatos e recria com
-- ids NOVOS, então as marcações somem sem aviso. A mitigação é OBRIGATÓRIA e é da etapa 3
-- do roadmap: a confirmação de reimportação passa a anunciar quantas marcações serão
-- perdidas. Sem ela, isto vira exatamente o formato de erro que este repo mais teme.
--
-- `prova_id` segue RESTRICT: apagar uma prova que tem marcações é decisão consciente.
CREATE TABLE public.candidatos_fora_do_automatico (
  prova_id uuid NOT NULL REFERENCES public.provas(id) ON DELETE RESTRICT,
  candidato_id uuid NOT NULL REFERENCES public.candidatos(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  PRIMARY KEY (prova_id, candidato_id)
);

-- A PK começa por `prova_id` e não serve ao DELETE em massa da troca total, que filtra
-- por candidato. Sem este índice, apagar 7.231 candidatos varreria esta tabela uma vez
-- por linha — a mesma razão do índice de `candidatos_alocacao`.
CREATE INDEX idx_fora_do_automatico_candidato
  ON public.candidatos_fora_do_automatico (candidato_id);

COMMENT ON TABLE public.candidatos_fora_do_automatico IS
  'Marcacao por (prova, candidato): este inscrito NAO entra na distribuicao automatica. '
  'Sai dos contadores dos blocos e o plano nao o coloca. A alocacao que ele ja tenha so '
  'e desfeita no proximo Aplicar (decisao D1) — marcar nao mexe em sala.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. RLS — fechada em admin, como `candidatos_alocacao`
-- ─────────────────────────────────────────────────────────────────────────────
-- Mesma razão: a marcação só faz sentido junto do nome do inscrito, que é PII fechada em
-- admin. `has_role(..., 'admin')` cobre o superadmin — a hierarquia mora na função.
ALTER TABLE public.candidatos_fora_do_automatico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins podem ver quem esta fora do automatico"
  ON public.candidatos_fora_do_automatico FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins podem retirar do automatico"
  ON public.candidatos_fora_do_automatico FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins podem devolver ao automatico"
  ON public.candidatos_fora_do_automatico FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- SEM policy de UPDATE, de propósito: a linha não tem o que editar — ela existe ou não.
-- Sem policy, a RLS nega UPDATE por padrão para o PostgREST.

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. O trigger: congelamento e coerência
-- ─────────────────────────────────────────────────────────────────────────────
-- Espelho do de `candidatos_alocacao`, com as duas checagens que fazem sentido aqui:
--   PF001 — prova ou unidade finalizada não aceita marcar nem desmarcar (decisão P2). A
--           alocação já está congelada; deixar o marcador editável faria os números do
--           quadro mudarem numa prova que ninguém pode mais redistribuir.
--   AL005 — o candidato tem de ser do edital da prova. A FK não expressa isso (são duas
--           tabelas diferentes apontando para uma terceira), e sem a checagem daria para
--           marcar gente de outro edital, poluindo contadores em silêncio.
CREATE FUNCTION public.check_candidato_fora_do_automatico()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_prova_id uuid;
  v_candidato_id uuid;
  v_prova record;
BEGIN
  v_prova_id := coalesce(NEW.prova_id, OLD.prova_id);
  v_candidato_id := coalesce(NEW.candidato_id, OLD.candidato_id);

  SELECT p.prova_finalizada, p.edital_id, coalesce(e.nome, p.prova_edital) AS nome
    INTO v_prova
    FROM provas p LEFT JOIN editais e ON e.id = p.edital_id
   WHERE p.id = v_prova_id;

  IF v_prova.prova_finalizada THEN
    RAISE EXCEPTION
      'A prova "%" está finalizada: não é possível mudar quem fica fora da alocação automática. Reabra a prova para editar.',
      v_prova.nome
      USING ERRCODE = 'PF001';
  END IF;

  -- Só no INSERT: no DELETE o candidato pode até já ter mudado de edital, e impedir a
  -- limpeza seria prender a linha para sempre.
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (
      SELECT 1 FROM candidatos c
       WHERE c.id = v_candidato_id AND c.edital_id = v_prova.edital_id
    ) THEN
      RAISE EXCEPTION
        'O candidato não é do edital desta prova. A marcação foi recusada.'
        USING ERRCODE = 'AL005';
    END IF;
  END IF;

  RETURN coalesce(NEW, OLD);
END;
$$;

CREATE TRIGGER check_candidato_fora_do_automatico
  BEFORE INSERT OR UPDATE OR DELETE ON public.candidatos_fora_do_automatico
  FOR EACH ROW EXECUTE FUNCTION public.check_candidato_fora_do_automatico();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Os contadores dos blocos passam a descontar os marcados
-- ─────────────────────────────────────────────────────────────────────────────
-- É ISTO que faz os números de cima caírem no instante em que a pessoa marca alguém.
--
-- `fora_do_automatico` e `fora_com_sala` são novos e existem para a tela poder ser
-- honesta: entre marcar e aplicar, alguém está EM SALA e marcado para sair, e o total de
-- alocados inclui essa pessoa. Sem `fora_com_sala` a tela não teria como avisar, e o
-- número mentiria por omissão (risco R1 do roadmap).
DROP FUNCTION IF EXISTS public.cargos_pendentes_da_prova(uuid);

CREATE FUNCTION public.cargos_pendentes_da_prova(p_prova_id uuid)
RETURNS TABLE (
  cargo_id uuid,
  cargo_nome text,
  a_distribuir bigint,
  pcd_a_distribuir bigint,
  sala_especial_a_distribuir bigint,
  especiais bigint,
  ja_alocados bigint,
  fora_do_automatico bigint,
  fora_com_sala bigint,
  total bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT
    c.cargo_id,
    coalesce(cg.nome, '(sem cargo)') AS cargo_nome,
    -- ⚠️ Os três "a distribuir" descontam os alocados À MÃO e os MARCADOS, nunca os
    -- alocados pelo plano: aplicar apaga origem='automatica' e reinsere, então quem está
    -- lá volta a estar disponível. Descontá-los abriria a tela com a faixa vazia numa
    -- prova já distribuída — número plausível e errado.
    count(*) FILTER (
      WHERE bloco_do_candidato(c.sala_especial, c.portador_deficiencia) = 'comum'
        AND NOT EXISTS (SELECT 1 FROM candidatos_alocacao a
                         WHERE a.prova_id = p_prova_id AND a.candidato_id = c.id
                           AND a.origem = 'manual')
        AND NOT EXISTS (SELECT 1 FROM candidatos_fora_do_automatico f
                         WHERE f.prova_id = p_prova_id AND f.candidato_id = c.id)
    ) AS a_distribuir,
    count(*) FILTER (
      WHERE bloco_do_candidato(c.sala_especial, c.portador_deficiencia) = 'pcd'
        AND NOT EXISTS (SELECT 1 FROM candidatos_alocacao a
                         WHERE a.prova_id = p_prova_id AND a.candidato_id = c.id
                           AND a.origem = 'manual')
        AND NOT EXISTS (SELECT 1 FROM candidatos_fora_do_automatico f
                         WHERE f.prova_id = p_prova_id AND f.candidato_id = c.id)
    ) AS pcd_a_distribuir,
    count(*) FILTER (
      WHERE bloco_do_candidato(c.sala_especial, c.portador_deficiencia) = 'sala_especial'
        AND NOT EXISTS (SELECT 1 FROM candidatos_alocacao a
                         WHERE a.prova_id = p_prova_id AND a.candidato_id = c.id
                           AND a.origem = 'manual')
        AND NOT EXISTS (SELECT 1 FROM candidatos_fora_do_automatico f
                         WHERE f.prova_id = p_prova_id AND f.candidato_id = c.id)
    ) AS sala_especial_a_distribuir,
    count(*) FILTER (
      WHERE candidato_pede_atendimento_especial(c.sala_especial, c.portador_deficiencia)
    ) AS especiais,
    count(*) FILTER (
      WHERE EXISTS (SELECT 1 FROM candidatos_alocacao a
                     WHERE a.prova_id = p_prova_id AND a.candidato_id = c.id
                       AND a.origem = 'automatica')
    ) AS ja_alocados,
    count(*) FILTER (
      WHERE EXISTS (SELECT 1 FROM candidatos_fora_do_automatico f
                     WHERE f.prova_id = p_prova_id AND f.candidato_id = c.id)
    ) AS fora_do_automatico,
    -- Marcado E com sala: o estado transitório que a D1 aceita e que a tela precisa
    -- anunciar. Ele existe até o próximo "Aplicar".
    count(*) FILTER (
      WHERE EXISTS (SELECT 1 FROM candidatos_fora_do_automatico f
                     WHERE f.prova_id = p_prova_id AND f.candidato_id = c.id)
        AND EXISTS (SELECT 1 FROM candidatos_alocacao a
                     WHERE a.prova_id = p_prova_id AND a.candidato_id = c.id)
    ) AS fora_com_sala,
    count(*) AS total
    FROM candidatos c
    LEFT JOIN cargos cg ON cg.id = c.cargo_id
   WHERE c.edital_id = (SELECT p.edital_id FROM provas p WHERE p.id = p_prova_id)
   GROUP BY c.cargo_id, cg.nome
   ORDER BY (c.cargo_id IS NULL), cg.nome;
$$;

COMMENT ON FUNCTION public.cargos_pendentes_da_prova(uuid) IS
  'Os cargos do edital para a faixa de arrasto, com os TRES blocos DISJUNTOS. Os tres '
  '"a_distribuir" descontam os alocados A MAO e os RETIRADOS DO AUTOMATICO, nunca os '
  'alocados pelo plano. `fora_com_sala` = marcados que AINDA estao em sala (some no '
  'proximo Aplicar) — e o que a tela usa para nao deixar o total de alocados mentir. '
  'SECURITY INVOKER: para nao-admin volta vazio sem erro.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. A listagem de TODOS os candidatos da prova
-- ─────────────────────────────────────────────────────────────────────────────
-- A seção de baixo deixa de listar 122 especiais e passa a listar os 7.231 inscritos.
--
-- ⚠️ Por que RPC e não `useCandidatos`: as colunas que a tela precisa são POR PROVA
-- (a marcação, a sala, a origem), e `candidatos` não sabe de prova. Um embed do PostgREST
-- não filtra a tabela embutida pela prova sem estragar o `count`.
--
-- 🔴 As regras de busca são as MESMAS de `useCandidatos` (nome, inscrição ou CPF, `%` nas
-- duas pontas; cargo é filtro exato; ordem por nome). Divergirem faria duas telas
-- discordarem sobre quem é "o inscrito" — risco R3 do roadmap.
--
-- O `total` vem por window function e se repete em cada linha: é o padrão para paginar
-- sem uma segunda consulta, e o contador tem de falar do conjunto INTEIRO, não da página.
CREATE FUNCTION public.candidatos_da_prova(
  p_prova_id uuid,
  p_busca text DEFAULT NULL,
  p_cargo_id uuid DEFAULT NULL,
  p_pagina integer DEFAULT 0,
  p_por_pagina integer DEFAULT 50,
  p_sem_sala boolean DEFAULT false
)
RETURNS TABLE (
  candidato_id uuid,
  n_inscricao varchar,
  nome text,
  cargo_nome text,
  sala_especial text,
  portador_deficiencia boolean,
  bloco text,
  sala_id uuid,
  -- O id da linha de alocação, para a tela poder RETIRAR sem uma segunda consulta.
  alocacao_id uuid,
  -- 🔴 `origem` decide o que a tela PROMETE ao retirar: tirar quem o plano colocou
  -- ('automatica') é desfeito no próximo "Aplicar"; tirar quem entrou à mão ('manual')
  -- é permanente. Sem esta coluna o mesmo botão mentiria em metade dos casos.
  origem text,
  fora_do_automatico boolean,
  total bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  WITH filtrados AS (
    SELECT c.id, c.n_inscricao, c.nome, coalesce(cg.nome, '(sem cargo)') AS cargo_nome,
           c.sala_especial, c.portador_deficiencia,
           bloco_do_candidato(c.sala_especial, c.portador_deficiencia) AS bloco,
           a.sala_id, a.id AS alocacao_id, a.origem,
           (f.candidato_id IS NOT NULL) AS fora_do_automatico
      FROM candidatos c
      LEFT JOIN cargos cg ON cg.id = c.cargo_id
      LEFT JOIN candidatos_alocacao a
             ON a.candidato_id = c.id AND a.prova_id = p_prova_id
      LEFT JOIN candidatos_fora_do_automatico f
             ON f.candidato_id = c.id AND f.prova_id = p_prova_id
     WHERE c.edital_id = (SELECT p.edital_id FROM provas p WHERE p.id = p_prova_id)
       AND (p_cargo_id IS NULL OR c.cargo_id = p_cargo_id)
       -- 🔴 O recorte "só quem está sem sala" vai ao SERVIDOR, e é por isso que o
       -- contador continua valendo: filtrar no cliente deixaria o `total` falando do
       -- conjunto inteiro enquanto a tabela mostra um subconjunto — a tela mentiria sem
       -- quebrar nada. Mesma lição que `useCandidatos` já carrega para o filtro de cargo.
       AND (NOT p_sem_sala OR a.sala_id IS NULL)
       AND (
         nullif(btrim(coalesce(p_busca, '')), '') IS NULL
         OR c.nome        ILIKE '%' || btrim(p_busca) || '%'
         OR c.n_inscricao ILIKE '%' || btrim(p_busca) || '%'
         OR c.cpf         ILIKE '%' || btrim(p_busca) || '%'
       )
  )
  SELECT id, n_inscricao, nome, cargo_nome, sala_especial, portador_deficiencia,
         bloco, sala_id, alocacao_id, origem, fora_do_automatico,
         count(*) OVER () AS total
    FROM filtrados
   ORDER BY nome, n_inscricao
   OFFSET greatest(p_pagina, 0) * greatest(p_por_pagina, 1)
   LIMIT greatest(p_por_pagina, 1);
$$;

COMMENT ON FUNCTION public.candidatos_da_prova(uuid, text, uuid, integer, integer, boolean) IS
  'Listagem paginada de TODOS os inscritos do edital da prova, com as colunas POR PROVA '
  'que candidatos nao tem: o bloco, a sala atual e a marcacao de fora do automatico. '
  'Busca por nome, inscricao ou CPF — as MESMAS regras de useCandidatos, de proposito. '
  '`p_sem_sala` recorta quem ainda nao tem sala, NO SERVIDOR: filtrar isso no cliente '
  'deixaria o `total` falando do conjunto inteiro. '
  '`total` repete em cada linha (window function) e fala do conjunto inteiro, nao da '
  'pagina. SECURITY INVOKER: para nao-admin volta vazio sem erro.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. O plano deixa de colocar os marcados
-- ─────────────────────────────────────────────────────────────────────────────
-- Duas mudanças, e a segunda é a que evita a mentira: `sem_sala` passa a NÃO contar os
-- marcados, e o retorno ganha `fora_do_automatico`. Um marcado está sem sala DE
-- PROPÓSITO; somá-lo aos que não couberam mandaria a pessoa procurar espaço para gente
-- que ela mesma tirou.
DROP FUNCTION IF EXISTS public.aplicar_plano_de_alocacao(uuid, jsonb);

CREATE FUNCTION public.aplicar_plano_de_alocacao(p_prova_id uuid, p_plano jsonb)
RETURNS TABLE (
  alocados integer,
  preservados integer,
  pendentes_especiais integer,
  sem_sala integer,
  fora_do_automatico integer
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_edital uuid;
  v_item record;
  v_ptr bigint;
  v_vagas bigint;
  v_lote integer;
  v_max_ord bigint;
  v_bloco_estourado text;
  v_pedido bigint;
  v_tem bigint;
  v_ptr_map jsonb := '{}'::jsonb;
BEGIN
  alocados := 0;

  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Apenas administradores podem distribuir candidatos.';
  END IF;

  SELECT p.edital_id INTO v_edital FROM provas p WHERE p.id = p_prova_id;
  IF NOT FOUND OR v_edital IS NULL THEN
    RAISE EXCEPTION
      'Esta prova não tem edital definido; não há lista de inscritos a distribuir.'
      USING ERRCODE = 'AL001';
  END IF;

  IF p_plano IS NULL OR jsonb_typeof(p_plano) <> 'array' OR jsonb_array_length(p_plano) = 0 THEN
    RAISE EXCEPTION
      'O plano de alocação está vazio. Arraste ao menos um cargo para uma unidade antes de aplicar.'
      USING ERRCODE = 'AL008';
  END IF;

  PERFORM 1 FROM salas_prova_distribuidas s WHERE s.prova_id = p_prova_id FOR UPDATE;

  -- 🔴 Sem tabela temporária, e é decisão: `ON COMMIT DROP` só cai no COMMIT, e chamar
  -- esta RPC duas vezes na mesma transação — o que a bateria faz — quebraria na segunda
  -- com "relation already exists".
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_plano) e
     WHERE nullif(e.value->>'unidade_id', '') IS NULL
        OR nullif(e.value->>'quantidade', '') IS NULL
        OR (e.value->>'quantidade')::integer <= 0
        -- `bloco` é obrigatório e fechado nos três valores: omitir ou errar alocaria
        -- gente do estoque errado em silêncio.
        -- ⚠️ O `coalesce` NÃO é zelo. Sem ele, chave ausente dá NULL, e `NULL NOT IN (…)`
        -- é NULL — nem verdadeiro nem falso, então o EXISTS não dispara e a guarda passa
        -- batido. Quem barrava era o AL010 mais adiante, dizendo "só há 0 inscritos nesse
        -- bloco" — mensagem que manda procurar o problema no lugar errado. Foi a bateria
        -- que pegou, não a leitura.
        OR coalesce(e.value->>'bloco', 'ausente') NOT IN ('comum', 'pcd', 'sala_especial')
  ) THEN
    RAISE EXCEPTION
      'O plano de alocação tem entrada inválida (unidade ausente, quantidade não positiva, ou bloco ausente/desconhecido). Nada foi alterado.'
      USING ERRCODE = 'AL008';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_plano) e
     WHERE NOT EXISTS (SELECT 1 FROM prova_unidades pu
                        WHERE pu.prova_id = p_prova_id
                          AND pu.unidade_id = (e.value->>'unidade_id')::uuid)
  ) THEN
    RAISE EXCEPTION
      'O plano aponta uma unidade que não está vinculada a esta prova. Recarregue a página e monte o plano de novo. Nada foi alterado.'
      USING ERRCODE = 'AL009';
  END IF;

  -- Refaz SÓ o automático. O trigger de congelamento roda aqui e recusa prova ou unidade
  -- finalizada (PF001) antes de qualquer outra coisa.
  DELETE FROM candidatos_alocacao a WHERE a.prova_id = p_prova_id AND a.origem = 'automatica';

  IF NOT EXISTS (
    SELECT 1 FROM candidatos c
     WHERE c.edital_id = v_edital
       AND NOT EXISTS (SELECT 1 FROM candidatos_alocacao a
                        WHERE a.prova_id = p_prova_id AND a.candidato_id = c.id)
       AND NOT EXISTS (SELECT 1 FROM candidatos_fora_do_automatico f
                        WHERE f.prova_id = p_prova_id AND f.candidato_id = c.id)
  ) THEN
    RAISE EXCEPTION
      'Não há candidatos a distribuir neste edital (os retirados da alocação automática não entram).'
      USING ERRCODE = 'AL002';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM salas_prova_distribuidas s
      LEFT JOIN (SELECT a.sala_id, count(*) AS ocupadas
                   FROM candidatos_alocacao a WHERE a.prova_id = p_prova_id
                  GROUP BY a.sala_id) o ON o.sala_id = s.id
     WHERE s.prova_id = p_prova_id
       AND s.sala_capacidade - coalesce(o.ocupadas, 0) > 0
  ) THEN
    RAISE EXCEPTION
      'Nenhuma sala com vaga nesta prova. Vincule unidades com salas cadastradas em Gerenciar Prova antes de distribuir.'
      USING ERRCODE = 'AL003';
  END IF;

  -- O plano não pode pedir mais gente do que o BLOCO tem. Agrupa por (cargo, bloco): os
  -- três blocos do mesmo cargo são estoques separados, e somá-los deixaria passar um
  -- plano que pede 40 comuns onde há 5 comuns, 20 PCD e 15 de sala especial.
  -- ⚠️ Os marcados NÃO entram na conta — senão o plano montado antes de uma marcação
  -- passaria pela validação e alocaria a menos, calado.
  SELECT
      coalesce(cg.nome, '(sem cargo)') || rotulo_do_bloco(pl.bloco),
      pl.pedido, cnt.tem
    INTO v_bloco_estourado, v_pedido, v_tem
    FROM (
      SELECT nullif(e.value->>'cargo_id', '')::uuid    AS cargo_id,
             e.value->>'bloco'                         AS bloco,
             sum((e.value->>'quantidade')::integer)    AS pedido
        FROM jsonb_array_elements(p_plano) e
       GROUP BY 1, 2
    ) pl
    CROSS JOIN LATERAL (
      SELECT count(*) AS tem
        FROM candidatos c
       WHERE c.edital_id = v_edital
         AND c.cargo_id IS NOT DISTINCT FROM pl.cargo_id
         AND bloco_do_candidato(c.sala_especial, c.portador_deficiencia) = pl.bloco
         AND NOT EXISTS (SELECT 1 FROM candidatos_alocacao a
                          WHERE a.prova_id = p_prova_id AND a.candidato_id = c.id)
         AND NOT EXISTS (SELECT 1 FROM candidatos_fora_do_automatico f
                          WHERE f.prova_id = p_prova_id AND f.candidato_id = c.id)
    ) cnt
    LEFT JOIN cargos cg ON cg.id = pl.cargo_id
   WHERE pl.pedido > cnt.tem
   LIMIT 1;

  IF v_bloco_estourado IS NOT NULL THEN
    RAISE EXCEPTION
      'O plano pede % vaga(s) para "%", mas só há % inscrito(s) esperando sala nesse bloco (os retirados da alocação automática não contam). Recarregue a página e monte o plano de novo. Nada foi alterado.',
      v_pedido, v_bloco_estourado, v_tem
      USING ERRCODE = 'AL010';
  END IF;

  FOR v_item IN
    SELECT nullif(e.value->>'cargo_id', '')::uuid AS cargo_id,
           (e.value->>'unidade_id')::uuid         AS unidade_id,
           (e.value->>'quantidade')::integer      AS quantidade,
           e.value->>'bloco'                      AS bloco
      FROM jsonb_array_elements(p_plano) WITH ORDINALITY AS e(value, ord)
     ORDER BY e.ord
  LOOP
    v_ptr := coalesce((v_ptr_map ->> v_item.unidade_id::text)::bigint, 1);

    WITH salas AS (
      SELECT s.id AS sala_id,
             greatest(s.sala_capacidade - coalesce(o.ocupadas, 0), 0) AS vagas,
             row_number() OVER (ORDER BY s.sala_andar NULLS LAST, s.sala_numero) AS ord
        FROM salas_prova_distribuidas s
        LEFT JOIN (SELECT a.sala_id, count(*) AS ocupadas
                     FROM candidatos_alocacao a WHERE a.prova_id = p_prova_id
                    GROUP BY a.sala_id) o ON o.sala_id = s.id
       WHERE s.prova_id = p_prova_id AND s.sala_fk_unidade = v_item.unidade_id
    )
    SELECT coalesce(sum(vagas), 0) INTO v_vagas FROM salas WHERE ord >= v_ptr;

    IF v_item.quantidade > v_vagas THEN
      RAISE EXCEPTION
        'Faltou espaço: "%" precisa de % vaga(s) na unidade "%" e restam % (cada bloco começa em sala nova, e as salas não se dividem entre blocos). Tire gente dessa unidade, aumente capacidades ou use outra unidade. Nada foi alterado.',
        coalesce((SELECT cg.nome FROM cargos cg WHERE cg.id = v_item.cargo_id), '(sem cargo)')
          || rotulo_do_bloco(v_item.bloco),
        v_item.quantidade,
        -- btrim: `unid_sigla` é char(n) e chega preenchida com espaços.
        (SELECT btrim(u.unid_sigla) FROM unidades_prova u WHERE u.id = v_item.unidade_id),
        v_vagas
        USING ERRCODE = 'AL004';
    END IF;

    WITH salas AS (
      SELECT s.id AS sala_id,
             greatest(s.sala_capacidade - coalesce(o.ocupadas, 0), 0) AS vagas,
             row_number() OVER (ORDER BY s.sala_andar NULLS LAST, s.sala_numero) AS ord
        FROM salas_prova_distribuidas s
        LEFT JOIN (SELECT a.sala_id, count(*) AS ocupadas
                     FROM candidatos_alocacao a WHERE a.prova_id = p_prova_id
                    GROUP BY a.sala_id) o ON o.sala_id = s.id
       WHERE s.prova_id = p_prova_id AND s.sala_fk_unidade = v_item.unidade_id
    ),
    faixas AS (
      SELECT sala_id, ord,
             sum(vagas) OVER (ORDER BY ord) - vagas AS ini,
             sum(vagas) OVER (ORDER BY ord)         AS fim
        FROM salas
       WHERE ord >= v_ptr AND vagas > 0
    ),
    elegiveis AS (
      SELECT sub.id, row_number() OVER (ORDER BY sub.nome, sub.n_inscricao) AS pos
        FROM (
          SELECT c.id, c.nome, c.n_inscricao
            FROM candidatos c
           WHERE c.edital_id = v_edital
             AND c.cargo_id IS NOT DISTINCT FROM v_item.cargo_id
             -- A ÚNICA diferença entre os três blocos: qual deles o candidato ocupa.
             AND bloco_do_candidato(c.sala_especial, c.portador_deficiencia) = v_item.bloco
             AND NOT EXISTS (SELECT 1 FROM candidatos_alocacao a
                              WHERE a.prova_id = p_prova_id AND a.candidato_id = c.id)
             -- Quem foi retirado da alocação automática não entra, por definição.
             AND NOT EXISTS (SELECT 1 FROM candidatos_fora_do_automatico f
                              WHERE f.prova_id = p_prova_id AND f.candidato_id = c.id)
           ORDER BY c.nome, c.n_inscricao
           LIMIT v_item.quantidade
        ) sub
    ),
    inseridos AS (
      INSERT INTO candidatos_alocacao (candidato_id, sala_id, prova_id, origem, created_by)
      SELECT e.id, f.sala_id, p_prova_id, 'automatica', auth.uid()
        FROM elegiveis e
        JOIN faixas f ON e.pos > f.ini AND e.pos <= f.fim
      RETURNING sala_id
    )
    SELECT count(*), max(f.ord)
      INTO v_lote, v_max_ord
      FROM inseridos i JOIN faixas f ON f.sala_id = i.sala_id;

    alocados := alocados + coalesce(v_lote, 0);

    -- Bloco novo abre sala nova: o ponteiro DESTA unidade pula para depois da última sala
    -- usada, mesmo que tenha sobrado vaga. É o que dá SALA PRÓPRIA aos blocos especiais.
    v_ptr_map := jsonb_set(
      v_ptr_map,
      ARRAY[v_item.unidade_id::text],
      to_jsonb(coalesce(v_max_ord + 1, v_ptr))
    );
  END LOOP;

  SELECT count(*) INTO preservados
    FROM candidatos_alocacao a
   WHERE a.prova_id = p_prova_id AND a.origem = 'manual';

  -- ⚠️ `pendentes_especiais` conta quem NÃO TEM SALA NENHUMA. Um especial colocado pelo
  -- plano sai desta conta, mas o pedido individual dele continua por conferir — quem
  -- mostra isso é a coluna `origem` de especiais_da_prova, não este número.
  SELECT count(*) INTO pendentes_especiais
    FROM candidatos c
   WHERE c.edital_id = v_edital
     AND candidato_pede_atendimento_especial(c.sala_especial, c.portador_deficiencia)
     AND NOT EXISTS (SELECT 1 FROM candidatos_alocacao a
                      WHERE a.prova_id = p_prova_id AND a.candidato_id = c.id);

  -- 🔴 DOIS números, não um. "Ficou sem sala" (o plano não os cobriu — decisão D3) é
  -- diferente de "foi retirado do automático" (você mesmo tirou). Somá-los mandaria a
  -- pessoa procurar espaço para gente que ela decidiu deixar de fora.
  SELECT count(*) INTO sem_sala
    FROM candidatos c
   WHERE c.edital_id = v_edital
     AND NOT EXISTS (SELECT 1 FROM candidatos_alocacao a
                      WHERE a.prova_id = p_prova_id AND a.candidato_id = c.id)
     AND NOT EXISTS (SELECT 1 FROM candidatos_fora_do_automatico f
                      WHERE f.prova_id = p_prova_id AND f.candidato_id = c.id);

  SELECT count(*) INTO fora_do_automatico
    FROM candidatos_fora_do_automatico f
   WHERE f.prova_id = p_prova_id;

  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.aplicar_plano_de_alocacao(uuid, jsonb) IS
  'Aplica um PLANO montado por arrasto: lista ordenada de '
  '{cargo_id, unidade_id, quantidade, bloco}. Quem esta em '
  'candidatos_fora_do_automatico NAO entra — nem nos elegiveis, nem na validacao AL010, '
  'nem no `sem_sala` (que e um numero DIFERENTE de `fora_do_automatico`: um e "nao coube", '
  'o outro e "voce tirou"). Cada entrada abre SALA NOVA na unidade (ponteiro por unidade). '
  'Apaga so origem=automatica e preserva o manual. Recusa: AL001 sem edital, AL002 sem '
  'elegiveis, AL003 sem vaga, AL004 nao coube nomeando BLOCO e unidade, AL008 plano '
  'invalido, AL009 unidade fora da prova, AL010 plano maior que o bloco.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Grants
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.cargos_pendentes_da_prova(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cargos_pendentes_da_prova(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.cargos_pendentes_da_prova(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.aplicar_plano_de_alocacao(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.aplicar_plano_de_alocacao(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.aplicar_plano_de_alocacao(uuid, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.candidatos_da_prova(uuid, text, uuid, integer, integer, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.candidatos_da_prova(uuid, text, uuid, integer, integer, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.candidatos_da_prova(uuid, text, uuid, integer, integer, boolean) TO authenticated;
