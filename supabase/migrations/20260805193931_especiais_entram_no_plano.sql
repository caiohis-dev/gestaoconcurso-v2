-- Cada cargo passa a ter TRÊS blocos arrastáveis: comuns, PCD e sala especial.
--
-- 🔴 ISTO REVERTE METADE DA DECISÃO 3 DO MÓDULO (2026-08-04), que dizia: "atendimento
-- especial fica FORA do automático; a tela lista os pendentes com o texto do pedido e
-- eles entram À MÃO". Decisão do usuário em 2026-08-05: cada cargo passa a ter TRÊS
-- blocos arrastáveis — comuns, PCD e sala especial — e o plano coloca os três.
--
-- O que SOBREVIVE da decisão 3, e é o ponto: o pedido individual ("sala térrea e ledor")
-- continua sendo coisa de gente. Planejar move o especial para a UNIDADE certa e lhe dá
-- sala própria; NÃO afirma que o pedido dele foi atendido. Por isso `especiais_da_prova`
-- passa a devolver a ORIGEM: sem ela, um especial colocado pelo plano apareceria na tela
-- como "atendido" e ninguém mais olharia o texto do pedido — perda silenciosa, que é o
-- formato de erro que este repositório mais teme.
--
-- MEDIDO (banco local, 2026-08-05): 7.231 inscritos — 122 PCD, 0 com sala_especial
-- (a coluna nasceu em 04/08) e ZERO sobreposição. O bloco de sala especial nasce vazio
-- no dado de hoje, mas a regra de desempate abaixo precisa existir antes de encher.
--
-- 🔴 OS TRÊS BLOCOS SÃO DISJUNTOS, e o desempate é uma DECISÃO: quem tem texto de pedido
-- vai para `sala_especial` MESMO SENDO PCD. O texto ("sala térrea e ledor") é o que
-- decide a sala; enterrá-lo no bloco genérico de PCD esconderia o pedido de quem vai
-- montar a logística. Sem esse desempate, quem fosse os dois seria contado duas vezes e
-- o plano tentaria alocá-lo em duas salas — a segunda morreria no UNIQUE, depois de a
-- tela já ter prometido o número errado.
--
-- Consequência boa de graça: como cada entrada do plano é um bloco e o ponteiro por
-- unidade pula para a sala seguinte, o bloco de especiais SEMPRE cai em sala própria —
-- que é o que a logística de atendimento especial quer.

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. O bloco de um candidato tem UMA definição
-- ─────────────────────────────────────────────────────────────────────────────
-- Mesma razão de `candidato_pede_atendimento_especial` existir: a linha que separa os
-- blocos é usada pela RPC da faixa E pela de aplicação, e duas cópias divergiriam em
-- silêncio. As duas funções são coerentes por construção:
--   bloco_do_candidato(...) <> 'comum'  ⟺  candidato_pede_atendimento_especial(...)
CREATE FUNCTION public.bloco_do_candidato(p_sala_especial text, p_pcd boolean)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    -- Ordem IMPORTA: o texto do pedido ganha do PCD (ver o cabeçalho).
    WHEN p_sala_especial IS NOT NULL AND btrim(p_sala_especial) <> '' THEN 'sala_especial'
    WHEN coalesce(p_pcd, false) THEN 'pcd'
    ELSE 'comum'
  END;
$$;

COMMENT ON FUNCTION public.bloco_do_candidato(text, boolean) IS
  'A UNICA definicao de qual dos TRES blocos arrastaveis o candidato ocupa: comum, pcd '
  'ou sala_especial. Sao DISJUNTOS, e o desempate e decisao: quem tem texto de pedido vai '
  'para sala_especial mesmo sendo PCD, porque o texto e o que decide a sala. Coerente com '
  'candidato_pede_atendimento_especial: bloco <> comum equivale a pedir atendimento.';

-- O rótulo humano do bloco, usado nas mensagens de recusa. Fica aqui e não espalhado
-- pelos RAISE porque uma recusa que não diga QUAL bloco estourou manda a pessoa mexer no
-- card errado.
CREATE FUNCTION public.rotulo_do_bloco(p_bloco text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_bloco
    WHEN 'pcd' THEN ' — PCD'
    WHEN 'sala_especial' THEN ' — sala especial'
    ELSE ''
  END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. A faixa de arrasto passa a ter TRÊS números por cargo
-- ─────────────────────────────────────────────────────────────────────────────
-- Um "a distribuir" por bloco. `especiais` (o total dos dois blocos especiais) continua
-- só como contexto — não serve para arrastar, porque inclui quem já foi colocado à mão.
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
    -- ⚠️ Os três "a distribuir" descontam só os alocados À MÃO, nunca os do plano:
    -- aplicar um plano apaga origem='automatica' e reinsere, então quem está lá volta a
    -- estar disponível. Descontá-los abriria a tela com a faixa vazia numa prova já
    -- distribuída — número plausível e errado.
    -- Os três são DISJUNTOS por construção (bloco_do_candidato devolve um valor só), então
    -- a soma deles + os manuais fecha com `total`.
    count(*) FILTER (
      WHERE bloco_do_candidato(c.sala_especial, c.portador_deficiencia) = 'comum'
        AND NOT EXISTS (SELECT 1 FROM candidatos_alocacao a
                         WHERE a.prova_id = p_prova_id AND a.candidato_id = c.id
                           AND a.origem = 'manual')
    ) AS a_distribuir,
    count(*) FILTER (
      WHERE bloco_do_candidato(c.sala_especial, c.portador_deficiencia) = 'pcd'
        AND NOT EXISTS (SELECT 1 FROM candidatos_alocacao a
                         WHERE a.prova_id = p_prova_id AND a.candidato_id = c.id
                           AND a.origem = 'manual')
    ) AS pcd_a_distribuir,
    count(*) FILTER (
      WHERE bloco_do_candidato(c.sala_especial, c.portador_deficiencia) = 'sala_especial'
        AND NOT EXISTS (SELECT 1 FROM candidatos_alocacao a
                         WHERE a.prova_id = p_prova_id AND a.candidato_id = c.id
                           AND a.origem = 'manual')
    ) AS sala_especial_a_distribuir,
    count(*) FILTER (
      WHERE candidato_pede_atendimento_especial(c.sala_especial, c.portador_deficiencia)
    ) AS especiais,
    count(*) FILTER (
      WHERE EXISTS (SELECT 1 FROM candidatos_alocacao a
                     WHERE a.prova_id = p_prova_id AND a.candidato_id = c.id
                       AND a.origem = 'automatica')
    ) AS ja_alocados,
    count(*) AS total
    FROM candidatos c
    LEFT JOIN cargos cg ON cg.id = c.cargo_id
   WHERE c.edital_id = (SELECT p.edital_id FROM provas p WHERE p.id = p_prova_id)
   GROUP BY c.cargo_id, cg.nome
   ORDER BY (c.cargo_id IS NULL), cg.nome;
$$;

COMMENT ON FUNCTION public.cargos_pendentes_da_prova(uuid) IS
  'Os cargos do edital para a faixa de arrasto, com os TRES blocos DISJUNTOS: '
  'a_distribuir (comuns), pcd_a_distribuir e sala_especial_a_distribuir. Os tres '
  'descontam so os alocados A MAO, nunca os do plano (aplicar apaga origem=automatica e '
  'reinsere). `especiais` = total dos dois blocos especiais, so contexto. `ja_alocados` = '
  'o que o plano atual fez. SECURITY INVOKER: para nao-admin volta vazio sem erro.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Os especiais da prova passam a dizer COMO foram parar na sala
-- ─────────────────────────────────────────────────────────────────────────────
-- 🔴 A coluna `origem` é a razão de esta migration não ser só sobre arrastar.
-- 'manual'     → alguém olhou o pedido e escolheu a sala. ATENDIDO.
-- 'automatica' → o plano o colocou numa sala da unidade certa. Está em sala, mas NINGUÉM
--                conferiu se ela atende ao pedido. A tela precisa dizer isso.
-- NULL         → pendente.
DROP FUNCTION IF EXISTS public.especiais_da_prova(uuid);

CREATE FUNCTION public.especiais_da_prova(p_prova_id uuid)
RETURNS TABLE (
  candidato_id uuid,
  n_inscricao varchar,
  nome text,
  cargo text,
  sala_especial text,
  portador_deficiencia boolean,
  sala_id uuid,
  origem text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT c.id, c.n_inscricao, c.nome, cg.nome, c.sala_especial, c.portador_deficiencia,
         a.sala_id, a.origem
    FROM candidatos c
    LEFT JOIN cargos cg ON cg.id = c.cargo_id
    LEFT JOIN candidatos_alocacao a
           ON a.candidato_id = c.id AND a.prova_id = p_prova_id
   WHERE c.edital_id = (SELECT p.edital_id FROM provas p WHERE p.id = p_prova_id)
     AND candidato_pede_atendimento_especial(c.sala_especial, c.portador_deficiencia)
   ORDER BY c.nome, c.n_inscricao;
$$;

COMMENT ON FUNCTION public.especiais_da_prova(uuid) IS
  'Os candidatos de atendimento especial do edital da prova, com a sala e a ORIGEM. '
  'sala_id nulo = pendente; origem=manual = alguem conferiu o pedido e escolheu a sala; '
  'origem=automatica = o PLANO o colocou numa sala, mas o pedido individual NAO foi '
  'conferido. Confundir os dois faria a tela dar por resolvido o que nao esta. '
  'SECURITY INVOKER: para nao-admin volta vazio sem erro.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. O plano ganha o bloco de especiais
-- ─────────────────────────────────────────────────────────────────────────────
-- Cada entrada agora traz `bloco` ('comum' | 'pcd' | 'sala_especial'). É a única
-- diferença de assinatura; a ordem continua sendo a de arrasto e continua decidindo quem
-- cai onde quando um bloco se divide entre unidades.
DROP FUNCTION IF EXISTS public.aplicar_plano_de_alocacao(uuid, jsonb);

CREATE FUNCTION public.aplicar_plano_de_alocacao(p_prova_id uuid, p_plano jsonb)
RETURNS TABLE (alocados integer, preservados integer, pendentes_especiais integer, sem_sala integer)
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
  v_rotulo text;
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
        -- que pegou (CASO 1d), não a leitura.
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

  -- A partir daqui "elegível" = sem alocação (que, após o DELETE, significa sem alocação
  -- MANUAL). Toda recusa abaixo aborta a transação, então "nada foi alterado" é verdade.
  IF NOT EXISTS (
    SELECT 1 FROM candidatos c
     WHERE c.edital_id = v_edital
       AND NOT EXISTS (SELECT 1 FROM candidatos_alocacao a
                        WHERE a.prova_id = p_prova_id AND a.candidato_id = c.id)
  ) THEN
    RAISE EXCEPTION
      'Não há candidatos a distribuir neste edital.'
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

  -- O plano não pode pedir mais gente do que o BLOCO tem. Agrupa por (cargo, bloco):
  -- os três blocos do mesmo cargo são estoques separados, e somá-los deixaria passar um
  -- plano que pede 40 comuns onde há 5 comuns, 20 PCD e 15 de sala especial.
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
    ) cnt
    LEFT JOIN cargos cg ON cg.id = pl.cargo_id
   WHERE pl.pedido > cnt.tem
   LIMIT 1;

  IF v_bloco_estourado IS NOT NULL THEN
    RAISE EXCEPTION
      'O plano pede % vaga(s) para "%", mas só há % inscrito(s) esperando sala nesse bloco. Recarregue a página e monte o plano de novo. Nada foi alterado.',
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
    -- usada, mesmo que tenha sobrado vaga. É o que dá SALA PRÓPRIA ao bloco de especiais.
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

  -- Plano incompleto é PERMITIDO (decisão D3 de 05/08): quem não coube fica aqui, e a
  -- tela diz o número. Agora conta os DOIS blocos, porque os dois são planejáveis.
  SELECT count(*) INTO sem_sala
    FROM candidatos c
   WHERE c.edital_id = v_edital
     AND NOT EXISTS (SELECT 1 FROM candidatos_alocacao a
                      WHERE a.prova_id = p_prova_id AND a.candidato_id = c.id);

  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.aplicar_plano_de_alocacao(uuid, jsonb) IS
  'Aplica um PLANO montado por arrasto: lista ordenada de '
  '{cargo_id, unidade_id, quantidade, bloco}. `bloco` escolhe qual dos TRES estoques do '
  'cargo: comum, pcd ou sala_especial (desde 05/08 os tres entram no plano). Cada entrada '
  'e um bloco e abre SALA NOVA na unidade (ponteiro por unidade), entao PCD e sala '
  'especial sempre ganham sala propria. Apaga so origem=automatica e preserva o manual. '
  'Plano incompleto e permitido: o retorno traz sem_sala. Recusa: AL001 sem edital, AL002 '
  'sem elegiveis, AL003 sem vaga, AL004 nao coube nomeando BLOCO e unidade, AL008 plano '
  'invalido, AL009 unidade fora da prova, AL010 plano maior que o bloco. '
  'SECURITY INVOKER: RLS de admin vale dentro dela.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Grants (o DROP + CREATE os perde)
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.cargos_pendentes_da_prova(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cargos_pendentes_da_prova(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.cargos_pendentes_da_prova(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.especiais_da_prova(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.especiais_da_prova(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.especiais_da_prova(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.aplicar_plano_de_alocacao(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.aplicar_plano_de_alocacao(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.aplicar_plano_de_alocacao(uuid, jsonb) TO authenticated;
