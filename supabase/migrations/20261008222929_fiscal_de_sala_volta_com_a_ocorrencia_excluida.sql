-- Excluir uma ocorrência de falta/substituição devolve ao colaborador o POSTO DE FISCAL
-- de sala que ele perdeu ao sair.
--
-- O DEFEITO: `salas_prova_distribuidas.sala_fiscal_1/2` apontam para
-- `colaboradores_prova(id)` com ON DELETE SET NULL. Registrar falta ou substituição apaga
-- a alocação do colaborador (20260923232343), e os postos de fiscal que ele ocupava
-- ficam vazios. A exclusão da ocorrência o reinstalava com função e valor congelados —
-- mas numa linha NOVA, com outro id, e nada religava as salas. Ele voltava para a lista
-- de trabalhadores e não para a sala: recolocação que parecia completa e não era.
--
-- ⚠️ Latente quando escrito: em 2026-10-08 nenhuma das 100 salas distribuídas tinha
-- fiscal atribuído (o seletor de fiscal está vazio desde 03/08 — item do backlog). A
-- correção vale para quando aquele seletor voltar.
--
-- A CORREÇÃO segue o mesmo princípio do congelamento de função/valor: o RPC de registro
-- grava, ANTES do DELETE, em quais salas a pessoa era fiscal 1 e fiscal 2; a exclusão lê
-- daí — nunca reconstrói a partir do estado vivo.
--
-- 🔴 A devolução só acontece se o posto AINDA ESTIVER VAGO. Se alguém o ocupou no
-- meio-tempo, foi decisão de uma pessoa, não resíduo da remoção — sobrescrever seria
-- desfazer trabalho alheio calado. Também não volta posto de sala que deixou de existir.
-- Para que a recusa não seja silenciosa, `excluir_ocorrencia_colaborador` passa a
-- devolver quantos postos NÃO voltaram, e a tela avisa.
--
-- Prova ou unidade finalizada: devolver o posto é UPDATE em `salas_prova_distribuidas` e
-- esbarra no `check_sala_de_prova_finalizada` (PF001, "Reabra a prova para editar"),
-- desfazendo a exclusão inteira. É simétrico ao registro: o SET NULL da saída já esbarra
-- no mesmo trigger. Só dispara quando há posto vago a devolver.
--
-- Arrays sem FK: sala apagada depois só deixa de ser devolvida (e é contada como não
-- devolvida). FK em array não existe, e uma tabela-ponte com RESTRICT travaria a
-- redistribuição de salas por causa de uma ocorrência.
--
-- Ocorrências anteriores a esta migration nascem com os arrays vazios: não há de onde
-- reconstruir em que sala a pessoa era fiscal (o SET NULL já apagou), e hoje não havia
-- fiscal nenhum atribuído — não há backfill a fazer.

ALTER TABLE public.ocorrencias_colaborador
  ADD COLUMN IF NOT EXISTS salas_fiscal_1_congeladas uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS salas_fiscal_2_congeladas uuid[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.ocorrencias_colaborador.salas_fiscal_1_congeladas IS
  'Salas (salas_prova_distribuidas.id) em que o colaborador era fiscal 1 quando saiu por falta/substituição. Lido por excluir_ocorrencia_colaborador para devolver o posto.';
COMMENT ON COLUMN public.ocorrencias_colaborador.salas_fiscal_2_congeladas IS
  'Salas (salas_prova_distribuidas.id) em que o colaborador era fiscal 2 quando saiu por falta/substituição. Lido por excluir_ocorrencia_colaborador para devolver o posto.';

-- Corpo idêntico ao de 20260923232343, exceto a captura dos postos de fiscal antes do
-- DELETE e as duas colunas no INSERT da ocorrência.
CREATE OR REPLACE FUNCTION public.registrar_ocorrencia_colaborador(
  p_prova_unidade_id uuid,
  p_colaborador_id uuid,
  p_tipo_ocorrencia text,
  p_data_ocorrencia timestamptz,
  p_descricao text,
  p_efeito text DEFAULT 'nenhum',
  p_substituto_id uuid DEFAULT NULL
)
RETURNS public.ocorrencias_colaborador
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prova_id uuid;
  v_alocacao_id uuid;
  v_funcao_id uuid;
  v_valor_pagamento DECIMAL(10, 2);
  v_substituido smallint := 0;
  v_falta boolean := false;
  v_salas_fiscal_1 uuid[] := '{}';
  v_salas_fiscal_2 uuid[] := '{}';
  v_result public.ocorrencias_colaborador;
BEGIN
  IF p_efeito NOT IN ('nenhum', 'substituicao', 'falta') THEN
    RAISE EXCEPTION 'Efeito de ocorrência inválido: %.', p_efeito USING ERRCODE = 'P0001';
  END IF;

  SELECT prova_id INTO v_prova_id
  FROM public.prova_unidades
  WHERE id = p_prova_unidade_id;

  IF v_prova_id IS NULL THEN
    RAISE EXCEPTION 'Unidade de prova não encontrada.' USING ERRCODE = 'P0001';
  END IF;

  IF NOT (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (
      public.has_role(auth.uid(), 'coordenador'::app_role)
      AND p_prova_unidade_id IN (SELECT public.get_coordenador_prova_unidade_ids(auth.uid()))
    )
  ) THEN
    RAISE EXCEPTION 'Você não tem permissão para registrar ocorrências nesta unidade.' USING ERRCODE = 'P0002';
  END IF;

  IF p_efeito IN ('substituicao', 'falta') THEN
    SELECT id, funcao_id, valor_pagamento
      INTO v_alocacao_id, v_funcao_id, v_valor_pagamento
    FROM public.colaboradores_prova
    WHERE prova_unidade_id = p_prova_unidade_id
      AND colaborador_id = p_colaborador_id;

    IF v_alocacao_id IS NULL THEN
      RAISE EXCEPTION 'Este colaborador não está alocado nesta unidade.' USING ERRCODE = 'P0001';
    END IF;

    IF p_efeito = 'substituicao' THEN
      IF p_substituto_id IS NULL THEN
        RAISE EXCEPTION 'Selecione um substituto para registrar a substituição.' USING ERRCODE = 'P0001';
      END IF;

      INSERT INTO public.colaboradores_prova (prova_unidade_id, colaborador_id, funcao_id, valor_pagamento, created_by)
      VALUES (p_prova_unidade_id, p_substituto_id, v_funcao_id, v_valor_pagamento, auth.uid());

      v_substituido := 1;
    ELSE
      v_falta := true;
    END IF;

    -- Congela os postos de fiscal ANTES do DELETE: o ON DELETE SET NULL de
    -- `sala_fiscal_1/2` os apaga junto com a alocação, e depois não há de onde lê-los.
    SELECT coalesce(array_agg(id) FILTER (WHERE sala_fiscal_1 = v_alocacao_id), '{}'),
           coalesce(array_agg(id) FILTER (WHERE sala_fiscal_2 = v_alocacao_id), '{}')
      INTO v_salas_fiscal_1, v_salas_fiscal_2
    FROM public.salas_prova_distribuidas
    WHERE sala_fiscal_1 = v_alocacao_id OR sala_fiscal_2 = v_alocacao_id;

    -- O DELETE pode esbarrar no RESTRICT de `coordenadores_prova` (o colaborador que
    -- sai é também coordenador vinculado desta unidade). Traduz a mensagem — o mesmo
    -- texto que `mensagemErroDesalocacao` já dá em `useColaboradoresProva.tsx` — e
    -- deixa a exceção propagar: por estar FORA de qualquer sub-bloco com handler, ela
    -- aborta a transação inteira desta chamada, desfazendo também o INSERT do
    -- substituto acima.
    BEGIN
      DELETE FROM public.colaboradores_prova WHERE id = v_alocacao_id;
    EXCEPTION WHEN foreign_key_violation THEN
      RAISE EXCEPTION 'Este colaborador possui acesso como Coordenador desta prova. Remova o acesso em "Acesso dos Coordenadores" antes de registrar esta ocorrência.' USING ERRCODE = 'P0002';
    END;
  END IF;

  INSERT INTO public.ocorrencias_colaborador (
    colaborador_id, prova_id, prova_unidade_id, descricao, tipo_ocorrencia,
    data_ocorrencia, substituido, substituto_id, falta,
    funcao_id_congelada, valor_pagamento_congelado,
    salas_fiscal_1_congeladas, salas_fiscal_2_congeladas, created_by
  ) VALUES (
    p_colaborador_id, v_prova_id, p_prova_unidade_id, p_descricao, p_tipo_ocorrencia,
    COALESCE(p_data_ocorrencia, now()), v_substituido,
    CASE WHEN p_efeito = 'substituicao' THEN p_substituto_id ELSE NULL END,
    v_falta,
    CASE WHEN p_efeito IN ('substituicao', 'falta') THEN v_funcao_id ELSE NULL END,
    CASE WHEN p_efeito IN ('substituicao', 'falta') THEN v_valor_pagamento ELSE NULL END,
    v_salas_fiscal_1, v_salas_fiscal_2,
    auth.uid()
  )
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

-- CREATE OR REPLACE preserva os privilégios; reafirmados por clareza (ver o aviso sobre
-- EXECUTE para PUBLIC em 20260923232343).
REVOKE ALL ON FUNCTION public.registrar_ocorrencia_colaborador(uuid, uuid, text, timestamptz, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_ocorrencia_colaborador(uuid, uuid, text, timestamptz, text, text, uuid) TO authenticated;

-- O retorno muda de boolean para jsonb, e CREATE OR REPLACE não troca tipo de retorno.
DROP FUNCTION IF EXISTS public.excluir_ocorrencia_colaborador(uuid);

CREATE FUNCTION public.excluir_ocorrencia_colaborador(
  p_ocorrencia_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_oc public.ocorrencias_colaborador;
  v_nova_alocacao uuid;
  v_devolvidos_1 integer := 0;
  v_devolvidos_2 integer := 0;
  v_nao_devolvidos integer := 0;
BEGIN
  SELECT * INTO v_oc FROM public.ocorrencias_colaborador WHERE id = p_ocorrencia_id;

  IF v_oc.id IS NULL THEN
    RAISE EXCEPTION 'Ocorrência não encontrada.' USING ERRCODE = 'P0001';
  END IF;

  IF NOT (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (
      public.has_role(auth.uid(), 'coordenador'::app_role)
      AND v_oc.prova_unidade_id IN (SELECT public.get_coordenador_prova_unidade_ids(auth.uid()))
    )
  ) THEN
    RAISE EXCEPTION 'Você não tem permissão para excluir esta ocorrência.' USING ERRCODE = 'P0002';
  END IF;

  IF v_oc.substituido = 1 OR v_oc.falta THEN
    -- O substituto sai ANTES da devolução: se ele tiver assumido o posto de fiscal, o
    -- SET NULL o esvazia e o posto volta ao original logo abaixo.
    IF v_oc.substituido = 1 AND v_oc.substituto_id IS NOT NULL THEN
      DELETE FROM public.colaboradores_prova
       WHERE prova_unidade_id = v_oc.prova_unidade_id
         AND colaborador_id = v_oc.substituto_id;
    END IF;

    INSERT INTO public.colaboradores_prova (prova_unidade_id, colaborador_id, funcao_id, valor_pagamento, created_by)
    VALUES (v_oc.prova_unidade_id, v_oc.colaborador_id, v_oc.funcao_id_congelada, v_oc.valor_pagamento_congelado, auth.uid())
    RETURNING id INTO v_nova_alocacao;

    -- Só posto VAGO volta: quem o ocupou no meio-tempo não é desalojado.
    WITH devolvidos AS (
      UPDATE public.salas_prova_distribuidas
         SET sala_fiscal_1 = v_nova_alocacao
       WHERE id = ANY (v_oc.salas_fiscal_1_congeladas)
         AND sala_fiscal_1 IS NULL
      RETURNING 1
    )
    SELECT count(*) INTO v_devolvidos_1 FROM devolvidos;

    WITH devolvidos AS (
      UPDATE public.salas_prova_distribuidas
         SET sala_fiscal_2 = v_nova_alocacao
       WHERE id = ANY (v_oc.salas_fiscal_2_congeladas)
         AND sala_fiscal_2 IS NULL
      RETURNING 1
    )
    SELECT count(*) INTO v_devolvidos_2 FROM devolvidos;

    v_nao_devolvidos := cardinality(v_oc.salas_fiscal_1_congeladas)
                      + cardinality(v_oc.salas_fiscal_2_congeladas)
                      - v_devolvidos_1 - v_devolvidos_2;
  END IF;

  DELETE FROM public.ocorrencias_colaborador WHERE id = p_ocorrencia_id;

  RETURN jsonb_build_object('postos_fiscal_nao_devolvidos', v_nao_devolvidos);
END;
$$;

REVOKE ALL ON FUNCTION public.excluir_ocorrencia_colaborador(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.excluir_ocorrencia_colaborador(uuid) TO authenticated;
