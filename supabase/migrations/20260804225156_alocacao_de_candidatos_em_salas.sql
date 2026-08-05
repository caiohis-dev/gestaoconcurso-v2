-- Módulo Alocação de Candidatos: o vínculo candidato ↔ sala de prova.
--
-- É a feature que o backlog previa como "nova, com desenho próprio" (item 1 de
-- Candidatos): até aqui NADA ligava candidato a prova ou sala. A tabela nova é o vínculo;
-- a RPC distribui os inscritos do edital nas salas da prova.
--
-- DECISÕES DO USUÁRIO (2026-08-04), que este schema materializa:
--   1. Distribuição automática POR CARGO (blocos contíguos de salas), alfabética dentro
--      do cargo — e CARGO NOVO ABRE SALA NOVA: a sala de fronteira fica com vagas
--      ociosas, salas não se dividem entre cargos.
--   2. Quem pediu atendimento especial (`sala_especial` preenchida) ou é PCD fica FORA
--      do automático e entra À MÃO (origem = 'manual').
--   3. Reimportar candidatos com alocação de pé é RECUSADO — FK RESTRICT. Reimportar
--      deixa de ser "sempre seguro" quando há alocação: vira ação em dois passos
--      conscientes (desfazer a alocação, reimportar).
--   4. Ajuste manual: incluir e retirar um candidato de uma sala (INSERT/DELETE direto
--      via PostgREST; as barreiras são os triggers, não a tela).
--
-- MEDIDO ANTES (banco local, 2026-08-04): 7.231 candidatos (todos do edital 001, 122
-- PCD, 0 com sala_especial — a coluna nasceu hoje), e a única prova desse edital está
-- FINALIZADA com 480 vagas. Ou seja: no dado real de hoje toda distribuição é recusada
-- pelas guardas, e as MENSAGENS delas são a tela mais vista do módulo. A tabela nasce
-- vazia — nada a sanear, nenhuma cirurgia no dump.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. A tabela
-- ─────────────────────────────────────────────────────────────────────────────

-- Pré-requisito da FK composta abaixo: (id, prova_id) precisa ser único na tabela de
-- salas. É trivialmente verdade (id já é PK); o índice existe para a FK poder apontar.
ALTER TABLE public.salas_prova_distribuidas
  ADD CONSTRAINT salas_prova_distribuidas_id_prova_key UNIQUE (id, prova_id);

CREATE TABLE public.candidatos_alocacao (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- RESTRICT é a decisão 3: a troca total (DELETE + INSERT de `trocar_candidatos_do_edital`)
  -- passa a ser barrada enquanto houver alocação. Quem traduz o 23503 para o usuário é
  -- `mensagemErroImportacao` (src/lib/candidatos-import.ts), casando pelo nome desta FK.
  candidato_id  uuid NOT NULL REFERENCES public.candidatos (id) ON DELETE RESTRICT,

  sala_id       uuid NOT NULL,

  -- Denormalizado de propósito: é ele que permite o UNIQUE (prova_id, candidato_id) —
  -- "um candidato tem UMA sala por prova" — sem join. A coerência com a sala vem da FK
  -- composta logo abaixo, não de disciplina.
  prova_id      uuid NOT NULL REFERENCES public.provas (id) ON DELETE RESTRICT,

  -- 'automatica' = escrita pela RPC de distribuição; 'manual' = incluída por uma pessoa.
  -- A distinção é o que torna o REFAZER seguro: redistribuir apaga SÓ as automáticas e
  -- preserva o trabalho manual (inclusive os especiais alocados à mão). "O que você fez
  -- à mão, só você desfaz."
  origem        text NOT NULL CHECK (origem IN ('automatica', 'manual')),

  created_at    timestamp with time zone NOT NULL DEFAULT now(),
  created_by    uuid DEFAULT auth.uid(),

  -- A FK composta dá DE GRAÇA metade da coerência: "a sala pertence à prova declarada"
  -- é garantido declarativamente, sem trigger e sem corrida. A outra metade
  -- (candidato.edital = prova.edital) fica no trigger, porque FK não a expressa.
  CONSTRAINT candidatos_alocacao_sala_prova_fkey
    FOREIGN KEY (sala_id, prova_id)
    REFERENCES public.salas_prova_distribuidas (id, prova_id) ON DELETE RESTRICT,

  CONSTRAINT candidatos_alocacao_prova_candidato_key UNIQUE (prova_id, candidato_id)
);

-- Sem `updated_at`, e é decisão: o ciclo de vida é DELETE + INSERT (mesmo precedente de
-- `candidatos_relatorio_importacao`) — uma linha de alocação não se edita, se refaz.

-- O índice em candidato_id NÃO é zelo: sem um índice iniciado por essa coluna, o
-- `DELETE FROM candidatos` da troca total (7.231 linhas) varreria esta tabela UMA VEZ
-- POR LINHA APAGADA para checar a FK. O UNIQUE acima começa por prova_id e não serve.
CREATE INDEX candidatos_alocacao_candidato_id_idx ON public.candidatos_alocacao (candidato_id);
-- Serve a FK composta (desvincular unidade apaga salas) e a contagem de ocupação.
CREATE INDEX candidatos_alocacao_sala_id_idx ON public.candidatos_alocacao (sala_id);

COMMENT ON TABLE public.candidatos_alocacao IS
  'Vinculo candidato x sala de prova (salas_prova_distribuidas). origem distingue a '
  'distribuicao automatica do ajuste manual: redistribuir apaga so as automaticas. '
  'RESTRICT em candidato_id barra a troca total de candidatos enquanto houver alocacao '
  '(decisao do usuario 2026-08-04).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. RLS — fechada em admin, como `candidatos`
-- ─────────────────────────────────────────────────────────────────────────────
-- A alocação só faz sentido junto do nome/CPF do inscrito, e `candidatos` é fechado em
-- admin (cada linha lá é PII de um cidadão). Abrir a alocação a mais gente daria a ler
-- "quantos e onde" sem o "quem" — meia informação que só confunde. Consequência a
-- lembrar em tela futura de coordenador: para ele as consultas voltam VAZIAS SEM ERRO
-- (mesma armadilha do painel `isAdmin &&` de GerenciarProva).
--
-- `has_role(..., 'admin')` cobre o superadmin: a hierarquia mora dentro da função.
-- GRANTs de tabela: herdam do ALTER DEFAULT PRIVILEGES (20260712010000); `anon` não
-- recebe nada desde 20260731110000.
ALTER TABLE public.candidatos_alocacao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view candidatos_alocacao"
  ON public.candidatos_alocacao FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert candidatos_alocacao"
  ON public.candidatos_alocacao FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete candidatos_alocacao"
  ON public.candidatos_alocacao FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

-- SEM policy de UPDATE, de propósito: o ciclo de vida é DELETE + INSERT. Sem policy, a
-- RLS nega UPDATE por padrão para o PostgREST. O trigger abaixo cobre UPDATE mesmo
-- assim, porque psql e service_role passam por cima da RLS.

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. A elegibilidade tem UMA definição
-- ─────────────────────────────────────────────────────────────────────────────
-- "Especial" = pediu atendimento (sala_especial preenchida) OU é PCD. É a linha que
-- separa quem entra no automático de quem entra à mão — e ela é usada pela RPC de
-- distribuição E pela de pendentes. Duas cópias da expressão divergiriam em silêncio
-- (mesma razão de `motivoCpfInvalido` ser público em cpf.ts).
CREATE FUNCTION public.candidato_pede_atendimento_especial(p_sala_especial text, p_pcd boolean)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (p_sala_especial IS NOT NULL AND btrim(p_sala_especial) <> '') OR coalesce(p_pcd, false);
$$;

COMMENT ON FUNCTION public.candidato_pede_atendimento_especial(text, boolean) IS
  'A UNICA definicao de "candidato especial" (fora da distribuicao automatica): pediu '
  'sala especial ou e PCD. Usada pela RPC de distribuicao e pela de pendentes — mexer '
  'aqui muda as duas juntas, que e o ponto.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. O trigger da tabela de alocação: congelamento → coerência → capacidade
-- ─────────────────────────────────────────────────────────────────────────────

-- Espelho de `recusa_sala_se_finalizada` (20260803003152), com mensagem PRÓPRIA: a
-- existente diz "as salas não podem mais ser alteradas", que para quem mexe em alocação
-- de candidato fala da coisa errada. Mesmo SQLSTATE PF001 — é a mesma regra de ciclo de
-- vida, dita para outra operação.
CREATE FUNCTION public.recusa_alocacao_se_finalizada(p_prova_id uuid, p_unidade_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_finalizada boolean;
  v_unidade_finalizada boolean;
  v_nome text;
BEGIN
  SELECT p.prova_finalizada, coalesce(e.nome, p.prova_edital)
    INTO v_finalizada, v_nome
    FROM provas p LEFT JOIN editais e ON e.id = p.edital_id
   WHERE p.id = p_prova_id;

  IF coalesce(v_finalizada, false) THEN
    RAISE EXCEPTION
      'A prova "%" está finalizada: a alocação de candidatos não pode mais ser alterada. Reabra a prova para editar.',
      coalesce(v_nome, '(sem edital)')
      USING ERRCODE = 'PF001';
  END IF;

  SELECT coalesce(pu.unidade_finalizada, false) INTO v_unidade_finalizada
    FROM prova_unidades pu
   WHERE pu.prova_id = p_prova_id AND pu.unidade_id = p_unidade_id;

  IF coalesce(v_unidade_finalizada, false) THEN
    RAISE EXCEPTION
      'Esta unidade já foi finalizada nesta prova: a alocação de candidatos não pode mais ser alterada. Reabra a unidade para editar.'
      USING ERRCODE = 'PF001';
  END IF;
END;
$$;

-- UM trigger com as três checagens em ordem explícita, em vez de três triggers cuja
-- ordem seria a alfabética dos nomes: congelamento → coerência → capacidade. Uma única
-- leitura da sala (com FOR UPDATE) serve às três — e o lock é o que serializa duas
-- inclusões concorrentes na mesma sala, sem o qual a checagem de capacidade seria uma
-- corrida ("leio e então decido").
CREATE FUNCTION public.check_candidato_alocacao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sala record;
  v_edital_prova uuid;
  v_edital_candidato uuid;
  v_ocupadas bigint;
BEGIN
  -- Retirar (ou mexer no lado antigo de um UPDATE) exige a prova/unidade abertas.
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    SELECT s.prova_id, s.sala_fk_unidade INTO v_sala
      FROM salas_prova_distribuidas s WHERE s.id = OLD.sala_id;
    IF FOUND THEN
      PERFORM recusa_alocacao_se_finalizada(v_sala.prova_id, v_sala.sala_fk_unidade);
    END IF;
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
  END IF;

  -- O lado novo: lock da sala + as três checagens.
  SELECT s.prova_id, s.sala_fk_unidade, s.sala_capacidade INTO v_sala
    FROM salas_prova_distribuidas s WHERE s.id = NEW.sala_id
    FOR UPDATE;
  -- Sala inexistente: deixa a FK composta recusar com a mensagem dela (23503).
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- 1. Congelamento.
  PERFORM recusa_alocacao_se_finalizada(v_sala.prova_id, v_sala.sala_fk_unidade);

  -- 2. Coerência (a metade que a FK composta não expressa): o candidato tem de ser do
  -- edital da prova. Sem isto, um INSERT via psql alocaria um inscrito do edital A numa
  -- sala do edital B — e toda lista impressa daquela sala nomearia a pessoa errada.
  SELECT p.edital_id INTO v_edital_prova FROM provas p WHERE p.id = NEW.prova_id;
  SELECT c.edital_id INTO v_edital_candidato FROM candidatos c WHERE c.id = NEW.candidato_id;
  IF v_edital_candidato IS DISTINCT FROM v_edital_prova THEN
    RAISE EXCEPTION
      'O candidato não é do edital desta prova. A alocação foi recusada.'
      USING ERRCODE = 'AL005';
  END IF;

  -- 3. Capacidade. O count enxerga as linhas já inseridas pelo MESMO comando (função
  -- volátil, snapshot por statement) — um INSERT em massa que estoure a sala é recusado
  -- na linha que estoura, e a transação desfaz o resto. Com a guarda AL004 da RPC isto é
  -- redundante DE PROPÓSITO: a guarda explica com números, o trigger garante para quem
  -- não passa pela RPC.
  SELECT count(*) INTO v_ocupadas
    FROM candidatos_alocacao a
   WHERE a.sala_id = NEW.sala_id AND a.id <> NEW.id;
  IF v_ocupadas >= v_sala.sala_capacidade THEN
    RAISE EXCEPTION
      'A sala está lotada (% de % lugares ocupados). Escolha outra sala ou aumente a capacidade desta.',
      v_ocupadas, v_sala.sala_capacidade
      USING ERRCODE = 'AL006';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER check_candidato_alocacao
  BEFORE INSERT OR UPDATE OR DELETE ON public.candidatos_alocacao
  FOR EACH ROW EXECUTE FUNCTION public.check_candidato_alocacao();

COMMENT ON FUNCTION public.check_candidato_alocacao() IS
  'As tres barreiras da alocacao, em ordem explicita: congelamento (PF001, prova ou '
  'unidade finalizada), coerencia de edital (AL005) e capacidade da sala (AL006). '
  'O FOR UPDATE na sala serializa inclusoes concorrentes. Sem excecao de role: a carga '
  'do dump se protege com session_replication_role = replica.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. A sala não encolhe por baixo dos alocados
-- ─────────────────────────────────────────────────────────────────────────────
-- O trigger acima pega alocação entrando em sala cheia; este pega o caminho inverso —
-- a CAPACIDADE descendo abaixo da ocupação (updateSala avulso ou o passo 2 da RPC de
-- renumeração, que regrava capacidade). Sala overbooked é estado incoerente de verdade,
-- não falta de transparência: barreira, não aviso.
--
-- O nome começa com `check_sala_r...` DE PROPÓSITO: dispara DEPOIS do
-- `check_sala_de_prova_finalizada` (ordem alfabética de triggers), então prova
-- finalizada continua respondendo PF001 — regra nova não ofusca a antiga.
-- Só roda quando a capacidade MUDA: o passo 1 da renumeração (só sala_numero) nem
-- consulta a ocupação.
CREATE FUNCTION public.check_sala_reducao_capacidade()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ocupadas bigint;
BEGIN
  IF NEW.sala_capacidade IS DISTINCT FROM OLD.sala_capacidade THEN
    SELECT count(*) INTO v_ocupadas FROM candidatos_alocacao a WHERE a.sala_id = NEW.id;
    IF v_ocupadas > NEW.sala_capacidade THEN
      RAISE EXCEPTION
        'A sala % tem % candidato(s) alocado(s) e a capacidade não pode ficar abaixo disso. Retire candidatos da sala ou mantenha a capacidade.',
        NEW.sala_numero, v_ocupadas
        USING ERRCODE = 'AL007';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER check_sala_reducao_capacidade
  BEFORE UPDATE ON public.salas_prova_distribuidas
  FOR EACH ROW EXECUTE FUNCTION public.check_sala_reducao_capacidade();

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. A RPC de distribuição
-- ─────────────────────────────────────────────────────────────────────────────
-- Roda INTEIRA no banco: com 7.231 inscritos, calcular no cliente e subir o resultado
-- repetiria o payload de 5,40 MB que já inviabilizou um RPC aqui. Aqui o payload é um
-- uuid.
--
-- "Cargo novo abre sala nova" torna o problema SEQUENCIAL (o bloco de um cargo depende
-- de onde o anterior terminou), daí o laço por cargo — não dá para resolver numa única
-- soma cumulativa global.
CREATE FUNCTION public.distribuir_candidatos_da_prova(p_prova_id uuid)
RETURNS TABLE (alocados integer, preservados integer, pendentes_especiais integer)
LANGUAGE plpgsql
-- SECURITY INVOKER: a RLS de `candidatos` e de `candidatos_alocacao` vale DENTRO da
-- função. A guarda explícita de admin logo abaixo existe porque, sem ela, um não-admin
-- não levaria erro — a RLS faria o SELECT voltar vazio e a recusa diria "não há
-- candidatos", mentindo o motivo.
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_edital uuid;
  v_cargo record;
  v_n integer;
  v_vagas_restantes bigint;
  v_ptr bigint := 1;
  v_max_ord bigint;
  v_lote integer;
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

  -- Serializa duas distribuições concorrentes da mesma prova e congela as capacidades
  -- durante o cálculo.
  PERFORM 1 FROM salas_prova_distribuidas s WHERE s.prova_id = p_prova_id FOR UPDATE;

  -- Refaz SÓ o automático. O trigger de congelamento roda aqui e recusa prova
  -- finalizada antes de qualquer outra coisa.
  DELETE FROM candidatos_alocacao a WHERE a.prova_id = p_prova_id AND a.origem = 'automatica';

  SELECT count(*) INTO v_n
    FROM candidatos c
   WHERE c.edital_id = v_edital
     AND NOT candidato_pede_atendimento_especial(c.sala_especial, c.portador_deficiencia)
     AND NOT EXISTS (SELECT 1 FROM candidatos_alocacao a
                      WHERE a.prova_id = p_prova_id AND a.candidato_id = c.id);
  IF v_n = 0 THEN
    RAISE EXCEPTION
      'Não há candidatos a distribuir neste edital (fora os de atendimento especial, que entram manualmente).'
      USING ERRCODE = 'AL002';
  END IF;

  SELECT coalesce(sum(greatest(s.sala_capacidade - coalesce(o.ocupadas, 0), 0)), 0)
    INTO v_vagas_restantes
    FROM salas_prova_distribuidas s
    LEFT JOIN (SELECT a.sala_id, count(*) AS ocupadas
                 FROM candidatos_alocacao a WHERE a.prova_id = p_prova_id
                GROUP BY a.sala_id) o ON o.sala_id = s.id
   WHERE s.prova_id = p_prova_id;
  IF v_vagas_restantes = 0 THEN
    RAISE EXCEPTION
      'Nenhuma sala com vaga nesta prova. Vincule unidades com salas cadastradas em Gerenciar Prova antes de distribuir.'
      USING ERRCODE = 'AL003';
  END IF;

  -- O laço: cargos em ordem alfabética do nome canônico (sem cargo por último), e cada
  -- cargo começa na sala seguinte à última usada pelo anterior (v_ptr). Dentro do cargo,
  -- alfabético por nome, com o nº de inscrição desempatando homônimos.
  FOR v_cargo IN
    SELECT c.cargo_id, coalesce(cg.nome, '(sem cargo)') AS nome
      FROM candidatos c
      LEFT JOIN cargos cg ON cg.id = c.cargo_id
     WHERE c.edital_id = v_edital
       AND NOT candidato_pede_atendimento_especial(c.sala_especial, c.portador_deficiencia)
       AND NOT EXISTS (SELECT 1 FROM candidatos_alocacao a
                        WHERE a.prova_id = p_prova_id AND a.candidato_id = c.id)
     GROUP BY c.cargo_id, cg.nome
     ORDER BY (c.cargo_id IS NULL), cg.nome
  LOOP
    SELECT count(*) INTO v_n
      FROM candidatos c
     WHERE c.edital_id = v_edital
       AND c.cargo_id IS NOT DISTINCT FROM v_cargo.cargo_id
       AND NOT candidato_pede_atendimento_especial(c.sala_especial, c.portador_deficiencia)
       AND NOT EXISTS (SELECT 1 FROM candidatos_alocacao a
                        WHERE a.prova_id = p_prova_id AND a.candidato_id = c.id);

    -- As vagas que restam DA SALA ATUAL EM DIANTE (ocupação recontada: os INSERTs dos
    -- cargos anteriores contam, mas estão todos atrás do ponteiro).
    WITH salas AS (
      SELECT s.id AS sala_id,
             greatest(s.sala_capacidade - coalesce(o.ocupadas, 0), 0) AS vagas,
             row_number() OVER (ORDER BY u.unid_nome, s.sala_andar NULLS LAST, s.sala_numero) AS ord
        FROM salas_prova_distribuidas s
        JOIN unidades_prova u ON u.id = s.sala_fk_unidade
        LEFT JOIN (SELECT a.sala_id, count(*) AS ocupadas
                     FROM candidatos_alocacao a WHERE a.prova_id = p_prova_id
                    GROUP BY a.sala_id) o ON o.sala_id = s.id
       WHERE s.prova_id = p_prova_id
    )
    SELECT coalesce(sum(vagas), 0) INTO v_vagas_restantes
      FROM salas WHERE ord >= v_ptr;

    IF v_n > v_vagas_restantes THEN
      RAISE EXCEPTION
        'Faltou espaço ao alocar o cargo "%": precisa de % vaga(s) e restam % (cargo novo começa em sala nova, e as salas não se dividem entre cargos). Vincule mais unidades à prova ou aumente capacidades. Nada foi alterado.',
        v_cargo.nome, v_n, v_vagas_restantes
        USING ERRCODE = 'AL004';
    END IF;

    -- O miolo: posição alfabética do candidato × faixa cumulativa de vagas de cada sala
    -- a partir do ponteiro. O join por intervalo (pos ∈ (ini, fim]) é o que preenche as
    -- salas em sequência até a capacidade restante de cada uma.
    WITH salas AS (
      SELECT s.id AS sala_id,
             greatest(s.sala_capacidade - coalesce(o.ocupadas, 0), 0) AS vagas,
             row_number() OVER (ORDER BY u.unid_nome, s.sala_andar NULLS LAST, s.sala_numero) AS ord
        FROM salas_prova_distribuidas s
        JOIN unidades_prova u ON u.id = s.sala_fk_unidade
        LEFT JOIN (SELECT a.sala_id, count(*) AS ocupadas
                     FROM candidatos_alocacao a WHERE a.prova_id = p_prova_id
                    GROUP BY a.sala_id) o ON o.sala_id = s.id
       WHERE s.prova_id = p_prova_id
    ),
    faixas AS (
      SELECT sala_id, ord,
             sum(vagas) OVER (ORDER BY ord) - vagas AS ini,
             sum(vagas) OVER (ORDER BY ord)         AS fim
        FROM salas
       WHERE ord >= v_ptr AND vagas > 0
    ),
    elegiveis AS (
      SELECT c.id,
             row_number() OVER (ORDER BY c.nome, c.n_inscricao) AS pos
        FROM candidatos c
       WHERE c.edital_id = v_edital
         AND c.cargo_id IS NOT DISTINCT FROM v_cargo.cargo_id
         AND NOT candidato_pede_atendimento_especial(c.sala_especial, c.portador_deficiencia)
         AND NOT EXISTS (SELECT 1 FROM candidatos_alocacao a
                          WHERE a.prova_id = p_prova_id AND a.candidato_id = c.id)
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
    -- Cargo novo abre sala nova: o ponteiro pula para DEPOIS da última sala usada,
    -- mesmo que ela tenha sobrado vaga — é a vaga ociosa da decisão 2.
    v_ptr := coalesce(v_max_ord + 1, v_ptr);
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

  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.distribuir_candidatos_da_prova(uuid) IS
  'Distribui os inscritos do edital da prova nas salas distribuidas: por CARGO (ordem '
  'alfabetica do nome canonico), alfabetico dentro do cargo, e CARGO NOVO ABRE SALA NOVA '
  '(a sala de fronteira fica com vagas ociosas). Especiais (sala_especial ou PCD) ficam '
  'fora e entram a mao. Apaga so origem=automatica e preserva o manual. Recusa: prova '
  'sem edital (AL001), sem elegiveis (AL002), sem vaga (AL003), espaco insuficiente '
  'nomeando o cargo (AL004). SECURITY INVOKER: RLS de admin vale dentro dela.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. As RPCs de leitura
-- ─────────────────────────────────────────────────────────────────────────────
-- SECURITY INVOKER como `contar_candidatos_por_edital`: para quem não é admin, a RLS
-- faz voltar VAZIO SEM ERRO — quem consumir precisa ser admin (anotado no doc do módulo).

-- O PostgREST não agrega com GROUP BY; contar no cliente exigiria baixar as 7 mil linhas.
CREATE FUNCTION public.contar_alocados_por_sala(p_prova_id uuid)
RETURNS TABLE (sala_id uuid, total bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT a.sala_id, count(*) AS total
    FROM candidatos_alocacao a
   WHERE a.prova_id = p_prova_id
   GROUP BY a.sala_id;
$$;

-- Os especiais da prova e o estado de cada um (pendente ou já alocado à mão). O
-- anti-join "especial SEM alocação" não é exprimível em PostgREST puro — daí a RPC.
-- Devolve TODOS os especiais (com sala_id nulo nos pendentes): a tela mostra os dois
-- estados, e a distinção pendente/atendido é do consumidor.
CREATE FUNCTION public.especiais_da_prova(p_prova_id uuid)
RETURNS TABLE (
  candidato_id uuid,
  n_inscricao varchar,
  nome text,
  cargo text,
  sala_especial text,
  portador_deficiencia boolean,
  sala_id uuid
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT c.id, c.n_inscricao, c.nome, cg.nome, c.sala_especial, c.portador_deficiencia,
         a.sala_id
    FROM candidatos c
    LEFT JOIN cargos cg ON cg.id = c.cargo_id
    LEFT JOIN candidatos_alocacao a
           ON a.candidato_id = c.id AND a.prova_id = p_prova_id
   WHERE c.edital_id = (SELECT p.edital_id FROM provas p WHERE p.id = p_prova_id)
     AND candidato_pede_atendimento_especial(c.sala_especial, c.portador_deficiencia)
   ORDER BY c.nome, c.n_inscricao;
$$;

COMMENT ON FUNCTION public.especiais_da_prova(uuid) IS
  'Os candidatos de atendimento especial do edital da prova (mesma definicao da '
  'distribuicao: candidato_pede_atendimento_especial), com a sala se ja alocados a mao. '
  'sala_id nulo = pendente. SECURITY INVOKER: para nao-admin volta vazio sem erro.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Grants das funções chamáveis
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.distribuir_candidatos_da_prova(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.distribuir_candidatos_da_prova(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.distribuir_candidatos_da_prova(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.contar_alocados_por_sala(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.contar_alocados_por_sala(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.contar_alocados_por_sala(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.especiais_da_prova(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.especiais_da_prova(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.especiais_da_prova(uuid) TO authenticated;
