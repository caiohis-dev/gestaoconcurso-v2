-- A distribuição passa a ser um PLANO montado por arrasto.
--
-- Até aqui `distribuir_candidatos_da_prova` varria TODAS as salas da prova de uma vez, na
-- ordem física, e não tinha noção de "este cargo vai para aquela unidade". A tela nova de
-- arrasto pede exatamente isso, e esta migration é a capacidade nova.
--
-- DECISÕES DO USUÁRIO (2026-08-05):
--   D1. RASCUNHO: arrastar não grava. O plano inteiro chega numa chamada, em transação.
--   D2. O ARRASTO SUBSTITUI o automático — `distribuir_candidatos_da_prova` é DROPADA.
--   D3. Plano INCOMPLETO é permitido; o retorno informa quantos ficaram sem sala.
--
-- O QUE NÃO MUDA — as regras do módulo seguem inteiras. Muda só o POOL DE SALAS: deixa de
-- ser "a prova inteira" e passa a ser "a unidade escolhida".
--   · por cargo, alfabético dentro do cargo (n_inscricao desempata homônimos)
--   · CARGO NOVO ABRE SALA NOVA — agora DENTRO de cada unidade
--   · especiais (sala_especial ou PCD) fora, entram à mão
--   · apaga só origem='automatica' e PRESERVA o manual
--
-- MEDIDO ANTES (banco local, 2026-08-05) — e a medição mudou o desenho:
--   7 unidades · 231 salas · 7.955 vagas · 7.231 inscritos · 122 especiais
--   9 cargos, de 182 a 3.663 inscritos
--   🔴 DOCENTE II tem 3.663 e a MAIOR unidade (UGB-III) tem 3.200: o maior cargo NÃO CABE
--      em nenhuma unidade sozinho. Dividir um cargo entre unidades é o caso PRINCIPAL, não
--      a borda — é por isso que o plano carrega QUANTIDADE, e não só o par cargo→unidade.
--   🔴 NÃO É GREENFIELD: 7.109 linhas de alocação já existem, todas 'automatica'. O
--      primeiro "Aplicar" vai apagá-las e reinseri-las.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Os cargos que ainda esperam sala
-- ─────────────────────────────────────────────────────────────────────────────
-- A faixa de arrasto da tela. Anti-join agregado por cargo, que o PostgREST não expressa.
--
-- 🔴 `a_distribuir` desconta os ESPECIAIS e os alocados À MÃO — mas NÃO os alocados pela
-- distribuição, e isso é a semântica correta, não um descuido. Aplicar um plano APAGA
-- todo `origem='automatica'` e reinsere: quem está lá hoje volta a estar disponível. Se
-- esta contagem descontasse os automáticos, uma prova já distribuída (7.109 linhas no
-- banco local de 05/08) abriria a tela com a faixa VAZIA e nada para arrastar — número
-- plausível e errado, o defeito que este repo mais teme.
--
-- `ja_alocados` vem junto para a tela poder dizer o que a distribuição ATUAL fez, sem
-- confundir isso com o que o rascunho vai fazer.
CREATE FUNCTION public.cargos_pendentes_da_prova(p_prova_id uuid)
RETURNS TABLE (
  cargo_id uuid,
  cargo_nome text,
  a_distribuir bigint,
  especiais bigint,
  ja_alocados bigint,
  total bigint
)
LANGUAGE sql
STABLE
-- SECURITY INVOKER como as irmãs: para quem não é admin, a RLS de `candidatos` faz voltar
-- VAZIO SEM ERRO. Está anotado no doc do módulo; uma tela de coordenador que consumisse
-- isto mostraria "nada pendente" com convicção.
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT
    c.cargo_id,
    coalesce(cg.nome, '(sem cargo)') AS cargo_nome,
    count(*) FILTER (
      WHERE NOT candidato_pede_atendimento_especial(c.sala_especial, c.portador_deficiencia)
        AND NOT EXISTS (SELECT 1 FROM candidatos_alocacao a
                         WHERE a.prova_id = p_prova_id AND a.candidato_id = c.id
                           AND a.origem = 'manual')
    ) AS a_distribuir,
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
   -- A MESMA ordem do laço da aplicação: sem cargo por último, depois alfabética.
   ORDER BY (c.cargo_id IS NULL), cg.nome;
$$;

COMMENT ON FUNCTION public.cargos_pendentes_da_prova(uuid) IS
  'Os cargos do edital da prova para a faixa de arrasto. `a_distribuir` = o que o plano '
  'pode colocar: exclui especiais e alocados A MAO, mas NAO os alocados pela distribuicao '
  '(aplicar um plano apaga origem=automatica e reinsere — se descontasse, uma prova ja '
  'distribuida abriria a tela sem nada para arrastar). `ja_alocados` = o que a '
  'distribuicao atual fez. SECURITY INVOKER: para nao-admin volta vazio sem erro.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 1b. Ocupação por UNIDADE, separando o que o plano preserva do que ele refaz
-- ─────────────────────────────────────────────────────────────────────────────
-- O quadro de arrasto raciocina em unidades, não em salas, e precisa da distinção que
-- `contar_alocados_por_sala` não faz: o rascunho parte da ocupação MANUAL (que o plano
-- preserva) e ignora a automática (que o plano apaga). Somar as duas faria a tela dizer
-- "sem vaga" numa unidade que o plano vai esvaziar.
--
-- Não altera `contar_alocados_por_sala`: aquela função é de uma migration já aplicada e
-- serve outra tela (a lista por sala), onde o total é o que interessa.
CREATE FUNCTION public.contar_alocados_por_unidade(p_prova_id uuid)
RETURNS TABLE (unidade_id uuid, total bigint, manuais bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT s.sala_fk_unidade,
         count(*) AS total,
         count(*) FILTER (WHERE a.origem = 'manual') AS manuais
    FROM candidatos_alocacao a
    JOIN salas_prova_distribuidas s ON s.id = a.sala_id
   WHERE a.prova_id = p_prova_id
   GROUP BY s.sala_fk_unidade;
$$;

COMMENT ON FUNCTION public.contar_alocados_por_unidade(uuid) IS
  'Ocupacao por unidade, separando `manuais` (que o plano PRESERVA) do total (que inclui '
  'as automaticas, que o plano APAGA). O quadro de arrasto parte das manuais. '
  'SECURITY INVOKER: para nao-admin volta vazio sem erro.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Aplicar o plano
-- ─────────────────────────────────────────────────────────────────────────────
-- `p_plano` é uma lista ORDENADA de {cargo_id, unidade_id, quantidade}. A ordem é a ordem
-- em que a pessoa arrastou, e é ela que decide quem cai onde quando um cargo se divide:
-- a primeira entrada leva os primeiros N alfabéticos, a segunda os N seguintes.
--
-- 🔴 O PONTEIRO É POR UNIDADE, não global. É isso que preserva "cargo novo abre sala
-- nova" quando dois cargos caem na mesma unidade: o segundo começa depois da última sala
-- que o primeiro usou, mesmo que tenha sobrado vaga nela. Um ponteiro global (como o da
-- RPC antiga) daria o resultado errado assim que o plano voltasse a uma unidade já usada.
--
-- O payload é minúsculo (teto de 9 cargos × 7 unidades = 63 entradas) — nada da lição dos
-- 5,40 MB se aplica aqui, jsonb direto resolve.
CREATE FUNCTION public.aplicar_plano_de_alocacao(p_prova_id uuid, p_plano jsonb)
RETURNS TABLE (alocados integer, preservados integer, pendentes_especiais integer, sem_sala integer)
LANGUAGE plpgsql
-- SECURITY INVOKER: a RLS de `candidatos` e de `candidatos_alocacao` vale DENTRO. A
-- guarda explícita de admin existe porque, sem ela, um não-admin não levaria erro — a RLS
-- faria o SELECT voltar vazio e a recusa diria "não há candidatos", mentindo o motivo.
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
  v_cargo_estourado text;
  v_pedido bigint;
  v_tem bigint;
  -- O ponteiro por unidade mora num jsonb, não numa temp table. Ver o comentário do laço.
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

  -- Serializa duas aplicações concorrentes da mesma prova e congela as capacidades
  -- durante o cálculo.
  PERFORM 1 FROM salas_prova_distribuidas s WHERE s.prova_id = p_prova_id FOR UPDATE;

  -- 🔴 O plano NÃO é materializado em tabela temporária, e isso é decisão.
  -- `CREATE TEMP TABLE ... ON COMMIT DROP` só cai no COMMIT: chamar esta RPC DUAS VEZES
  -- na mesma transação — exatamente o que a bateria faz — quebraria na segunda com
  -- "relation already exists". As validações leem o jsonb direto; o laço usa
  -- `WITH ORDINALITY` para preservar a ordem de arrasto.
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_plano) e
     WHERE nullif(e.value->>'unidade_id', '') IS NULL
        OR nullif(e.value->>'quantidade', '') IS NULL
        OR (e.value->>'quantidade')::integer <= 0
  ) THEN
    RAISE EXCEPTION
      'O plano de alocação tem entrada inválida (unidade ausente ou quantidade não positiva). Nada foi alterado.'
      USING ERRCODE = 'AL008';
  END IF;

  -- Unidade que não é desta prova: a FK composta pegaria isso lá na frente, mas com a
  -- mensagem genérica de violação de chave. Recusar aqui nomeia o problema.
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

  -- A partir daqui, "elegível" já considera o DELETE acima. Toda recusa abaixo aborta a
  -- transação inteira, então "nada foi alterado" continua verdade.
  IF NOT EXISTS (
    SELECT 1 FROM candidatos c
     WHERE c.edital_id = v_edital
       AND NOT candidato_pede_atendimento_especial(c.sala_especial, c.portador_deficiencia)
       AND NOT EXISTS (SELECT 1 FROM candidatos_alocacao a
                        WHERE a.prova_id = p_prova_id AND a.candidato_id = c.id)
  ) THEN
    RAISE EXCEPTION
      'Não há candidatos a distribuir neste edital (fora os de atendimento especial, que entram manualmente).'
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

  -- O plano não pode pedir mais gente do que o cargo tem. Conferido por cargo (somando as
  -- entradas do mesmo cargo em unidades diferentes) e ANTES do laço: recusar no meio
  -- deixaria a mensagem falando de um cargo qualquer em vez do que estourou.
  -- A contagem de elegíveis é LATERAL, não subconsulta correlacionada dentro do
  -- agregado: `cargo_id` só existe depois do GROUP BY, e referenciá-lo lá dentro é
  -- "subquery uses ungrouped column" (42803).
  SELECT coalesce(cg.nome, '(sem cargo)'), pl.pedido, cnt.tem
    INTO v_cargo_estourado, v_pedido, v_tem
    FROM (
      SELECT nullif(e.value->>'cargo_id', '')::uuid AS cargo_id,
             sum((e.value->>'quantidade')::integer) AS pedido
        FROM jsonb_array_elements(p_plano) e
       GROUP BY nullif(e.value->>'cargo_id', '')::uuid
    ) pl
    CROSS JOIN LATERAL (
      SELECT count(*) AS tem
        FROM candidatos c
       WHERE c.edital_id = v_edital
         AND c.cargo_id IS NOT DISTINCT FROM pl.cargo_id
         AND NOT candidato_pede_atendimento_especial(c.sala_especial, c.portador_deficiencia)
         AND NOT EXISTS (SELECT 1 FROM candidatos_alocacao a
                          WHERE a.prova_id = p_prova_id AND a.candidato_id = c.id)
    ) cnt
    LEFT JOIN cargos cg ON cg.id = pl.cargo_id
   WHERE pl.pedido > cnt.tem
   LIMIT 1;

  IF v_cargo_estourado IS NOT NULL THEN
    RAISE EXCEPTION
      'O plano pede % vaga(s) para o cargo "%", mas só há % inscrito(s) esperando sala (os de atendimento especial não entram aqui). Recarregue a página e monte o plano de novo. Nada foi alterado.',
      v_pedido, v_cargo_estourado, v_tem
      USING ERRCODE = 'AL010';
  END IF;

  -- O ponteiro POR UNIDADE (a próxima sala livre para um cargo NOVO naquela unidade) vive
  -- num jsonb {unidade_id: ord}, pela mesma razão do plano: temp table não sobrevive a
  -- duas chamadas na mesma transação.
  FOR v_item IN
    SELECT nullif(e.value->>'cargo_id', '')::uuid AS cargo_id,
           (e.value->>'unidade_id')::uuid         AS unidade_id,
           (e.value->>'quantidade')::integer      AS quantidade
      FROM jsonb_array_elements(p_plano) WITH ORDINALITY AS e(value, ord)
     ORDER BY e.ord
  LOOP
    v_ptr := coalesce((v_ptr_map ->> v_item.unidade_id::text)::bigint, 1);

    -- As vagas desta unidade, do ponteiro em diante. A ocupação é RECONTADA a cada
    -- entrada: os INSERTs anteriores já contam.
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
        'Faltou espaço: o cargo "%" precisa de % vaga(s) na unidade "%" e restam % (cargo novo começa em sala nova, e as salas não se dividem entre cargos). Tire gente dessa unidade, aumente capacidades ou use outra unidade. Nada foi alterado.',
        (SELECT coalesce(cg.nome, '(sem cargo)') FROM cargos cg WHERE cg.id = v_item.cargo_id),
        v_item.quantidade,
        -- btrim: `unid_sigla` é char(n) e chega preenchida com espaços — sem isto a
        -- mensagem sai com 'CGV       ' entre aspas, na cara do usuário.
        (SELECT btrim(u.unid_sigla) FROM unidades_prova u WHERE u.id = v_item.unidade_id),
        v_vagas
        USING ERRCODE = 'AL004';
    END IF;

    -- O miolo, igual ao da RPC antiga em espírito: posição alfabética × faixa cumulativa
    -- de vagas. O que mudou é que as salas são SÓ as desta unidade, e os elegíveis vêm
    -- LIMITADOS à quantidade desta entrada do plano — é o que permite dividir um cargo
    -- entre unidades sem repetir ninguém (os já inseridos saem pelo NOT EXISTS).
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
             AND NOT candidato_pede_atendimento_especial(c.sala_especial, c.portador_deficiencia)
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

    -- Cargo novo abre sala nova: o ponteiro DESTA unidade pula para depois da última sala
    -- usada, mesmo que tenha sobrado vaga nela — é a vaga ociosa da decisão 2 do módulo.
    v_ptr_map := jsonb_set(
      v_ptr_map,
      ARRAY[v_item.unidade_id::text],
      to_jsonb(coalesce(v_max_ord + 1, v_ptr))
    );
  END LOOP;

  SELECT count(*) INTO preservados
    FROM candidatos_alocacao a
   WHERE a.prova_id = p_prova_id AND a.origem = 'manual';

  SELECT count(*) INTO pendentes_especiais
    FROM candidatos c
   WHERE c.edital_id = v_edital
     AND candidato_pede_atendimento_especial(c.sala_especial, c.portador_deficiencia)
     AND NOT EXISTS (SELECT 1 FROM candidatos_alocacao a
                      WHERE a.prova_id = p_prova_id AND a.candidato_id = c.id);

  -- Plano incompleto é PERMITIDO (decisão 3): quem não coube no plano fica aqui, e a tela
  -- diz o número. Recusar obrigaria a alocar 7.231 pessoas num gesto só.
  SELECT count(*) INTO sem_sala
    FROM candidatos c
   WHERE c.edital_id = v_edital
     AND NOT candidato_pede_atendimento_especial(c.sala_especial, c.portador_deficiencia)
     AND NOT EXISTS (SELECT 1 FROM candidatos_alocacao a
                      WHERE a.prova_id = p_prova_id AND a.candidato_id = c.id);

  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.aplicar_plano_de_alocacao(uuid, jsonb) IS
  'Aplica um PLANO de alocacao montado por arrasto: lista ordenada de '
  '{cargo_id, unidade_id, quantidade}. Dentro de cada entrada, alfabetico por nome '
  '(n_inscricao desempata) nas salas DAQUELA unidade em ordem fisica, e CARGO NOVO ABRE '
  'SALA NOVA (ponteiro POR UNIDADE). Especiais ficam fora. Apaga so origem=automatica e '
  'preserva o manual. Plano incompleto e permitido: o retorno traz sem_sala. Recusa: sem '
  'edital (AL001), sem elegiveis (AL002), sem vaga (AL003), nao coube nomeando cargo E '
  'unidade (AL004), plano invalido (AL008), unidade fora da prova (AL009), plano maior '
  'que o cargo (AL010). SECURITY INVOKER: RLS de admin vale dentro dela.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Grants
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.cargos_pendentes_da_prova(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cargos_pendentes_da_prova(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.cargos_pendentes_da_prova(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.contar_alocados_por_unidade(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.contar_alocados_por_unidade(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.contar_alocados_por_unidade(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.aplicar_plano_de_alocacao(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.aplicar_plano_de_alocacao(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.aplicar_plano_de_alocacao(uuid, jsonb) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. A RPC antiga sai
-- ─────────────────────────────────────────────────────────────────────────────
-- Decisão D2: o arrasto SUBSTITUI o automático, não convive com ele. Manter as duas
-- custaria duas implementações da mesma regra, e a segunda envelheceria calada.
--
-- 🔴 `docs/bateria-alocacao-candidatos.sql` chamava esta função em 5 pontos e foi
-- reescrita no MESMO passe. Não repetir 02/08: naquele dia uma RPC ganhou um parâmetro, a
-- migration dropou a assinatura antiga, e as 9 chamadas da bateria ficaram na forma velha
-- — o arquivo falhava na primeira linha e NENHUM dos 10 casos rodava. Ficou assim 2 dias.
DROP FUNCTION IF EXISTS public.distribuir_candidatos_da_prova(uuid);
