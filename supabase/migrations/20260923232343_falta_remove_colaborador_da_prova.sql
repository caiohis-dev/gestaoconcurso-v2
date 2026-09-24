-- Falta em Nova Ocorrência remove o colaborador da lista de trabalhadores da prova.
--
-- Até aqui o único efeito de uma ocorrência sobre `colaboradores_prova` era a
-- substituição, e ela rodava em MÚLTIPLOS PASSOS SEM TRANSAÇÃO, direto no componente de
-- página (`OcorrenciasProva.tsx`): SELECT, INSERT do substituto, DELETE do original —
-- três chamadas soltas ao PostgREST. Se o DELETE falhasse (por exemplo, RESTRICT de
-- `coordenadores_prova`, ver 20260726250000), o INSERT já tinha acontecido: ocorrência
-- nunca chegava a ser criada, mas o substituto já estava alocado — estado inconsistente.
--
-- Esta migration acrescenta um terceiro estado, "falta" (sem substituto: o colaborador
-- só sai da lista), e move os dois efeitos (substituição e falta) para dentro de dois
-- RPCs transacionais, fechando o buraco acima de saída.
--
-- CONGELAMENTO: a reversão (excluir a ocorrência) precisa saber com que função/valor
-- reinstalar o colaborador removido. O código antigo lia isso da linha do SUBSTITUTO no
-- momento da exclusão — se o substituto tivesse mudado de função nesse meio-tempo, a
-- reversão reinstalava o original com o valor errado. As duas colunas novas
-- (`funcao_id_congelada`, `valor_pagamento_congelado`) capturam o estado no momento da
-- remoção, para os dois efeitos, e a reversão lê delas — nunca de outra linha viva.
--
-- `funcao_id_congelada` é RESTRICT, não SET NULL: é a mesma decisão de
-- `20260726210000_colaborador_com_historico_nao_se_exclui` para `substituto_id` — ser
-- citado numa ocorrência (mesmo congelada) É histórico, e apagar a função em silêncio
-- reproduziria em miniatura o defeito que aquela migration fechou. Com RESTRICT, uma
-- função referenciada por uma ocorrência congelada não pode ser excluída do catálogo, e
-- a coluna só é NULL quando a alocação original de fato não tinha função — o mesmo
-- significado que `colaboradores_prova.funcao_id IS NULL` já tem hoje. Não há ambiguidade
-- a resolver na reversão.

ALTER TABLE public.ocorrencias_colaborador
  ADD COLUMN IF NOT EXISTS falta boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS funcao_id_congelada uuid REFERENCES public.funcoes_colaboradores(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS valor_pagamento_congelado DECIMAL(10, 2);

ALTER TABLE public.ocorrencias_colaborador
  ADD CONSTRAINT chk_ocorrencia_falta_substituicao_mutuamente_exclusivas
  CHECK (NOT (substituido = 1 AND falta));

-- RPC: registra uma ocorrência, com efeito opcional sobre `colaboradores_prova`
-- ('nenhum' | 'substituicao' | 'falta'). SECURITY DEFINER — a autorização é manual,
-- abaixo, e é a MESMA regra da policy de escrita de `colaboradores_prova` (por unidade,
-- via `get_coordenador_prova_unidade_ids`), não a de `ocorrencias_colaborador`
-- (`is_coordenador_prova`, por prova inteira): quem mexe na alocação precisa ter
-- vínculo NAQUELA unidade especificamente. Isso já é o que a tela restringe hoje
-- (`OcorrenciasProva.tsx` monta `allowedUnidades` a partir de `useCoordenadorUnidades`,
-- que chama a mesma `get_coordenador_prova_unidade_ids`) — este RPC só formaliza no
-- banco o que o cliente já oferecia como opção.
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

    -- O DELETE pode esbarrar no RESTRICT de `coordenadores_prova` (o colaborador que
    -- sai é também coordenador vinculado desta unidade). Traduz a mensagem — o mesmo
    -- texto que `mensagemErroDesalocacao` já dá em `useColaboradoresProva.tsx` — e
    -- deixa a exceção propagar: por estar FORA de qualquer sub-bloco com handler, ela
    -- aborta a transação inteira desta chamada, desfazendo também o INSERT do
    -- substituto acima. É o ganho de virar RPC: pela tela antiga, essa falha deixava o
    -- substituto alocado sem a ocorrência ter sido criada.
    BEGIN
      DELETE FROM public.colaboradores_prova WHERE id = v_alocacao_id;
    EXCEPTION WHEN foreign_key_violation THEN
      RAISE EXCEPTION 'Este colaborador possui acesso como Coordenador desta prova. Remova o acesso em "Acesso dos Coordenadores" antes de registrar esta ocorrência.' USING ERRCODE = 'P0002';
    END;
  END IF;

  INSERT INTO public.ocorrencias_colaborador (
    colaborador_id, prova_id, prova_unidade_id, descricao, tipo_ocorrencia,
    data_ocorrencia, substituido, substituto_id, falta,
    funcao_id_congelada, valor_pagamento_congelado, created_by
  ) VALUES (
    p_colaborador_id, v_prova_id, p_prova_unidade_id, p_descricao, p_tipo_ocorrencia,
    COALESCE(p_data_ocorrencia, now()), v_substituido,
    CASE WHEN p_efeito = 'substituicao' THEN p_substituto_id ELSE NULL END,
    v_falta,
    CASE WHEN p_efeito IN ('substituicao', 'falta') THEN v_funcao_id ELSE NULL END,
    CASE WHEN p_efeito IN ('substituicao', 'falta') THEN v_valor_pagamento ELSE NULL END,
    auth.uid()
  )
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

-- ⚠️ `ALTER DEFAULT PRIVILEGES FOR ROLE postgres` (20260908231620) NÃO impede uma função
-- NOVA de nascer com EXECUTE para PUBLIC (medido: uma função de teste, criada como
-- `postgres` depois daquela migration, saiu com `anon`/`authenticated` executáveis por
-- padrão). O REVOKE explícito abaixo é o que `conceder_coordenador` já faz por isso —
-- sem ele, `anon` chamaria a função (a checagem de papel dentro dela ainda recusaria,
-- mas não é para o `anon` alcançar RPC nenhuma com a chave pública).
REVOKE ALL ON FUNCTION public.registrar_ocorrencia_colaborador(uuid, uuid, text, timestamptz, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_ocorrencia_colaborador(uuid, uuid, text, timestamptz, text, text, uuid) TO authenticated;

-- RPC: exclui uma ocorrência e reverte o efeito que ela teve sobre `colaboradores_prova`
-- (reinstala o colaborador original com a função/valor CONGELADOS no momento em que
-- saiu — nunca relidos de outra linha). Mesma regra de autorização do RPC acima.
CREATE OR REPLACE FUNCTION public.excluir_ocorrencia_colaborador(
  p_ocorrencia_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_oc public.ocorrencias_colaborador;
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

  IF v_oc.substituido = 1 THEN
    IF v_oc.substituto_id IS NOT NULL THEN
      DELETE FROM public.colaboradores_prova
       WHERE prova_unidade_id = v_oc.prova_unidade_id
         AND colaborador_id = v_oc.substituto_id;
    END IF;

    INSERT INTO public.colaboradores_prova (prova_unidade_id, colaborador_id, funcao_id, valor_pagamento, created_by)
    VALUES (v_oc.prova_unidade_id, v_oc.colaborador_id, v_oc.funcao_id_congelada, v_oc.valor_pagamento_congelado, auth.uid());
  ELSIF v_oc.falta THEN
    INSERT INTO public.colaboradores_prova (prova_unidade_id, colaborador_id, funcao_id, valor_pagamento, created_by)
    VALUES (v_oc.prova_unidade_id, v_oc.colaborador_id, v_oc.funcao_id_congelada, v_oc.valor_pagamento_congelado, auth.uid());
  END IF;

  DELETE FROM public.ocorrencias_colaborador WHERE id = p_ocorrencia_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.excluir_ocorrencia_colaborador(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.excluir_ocorrencia_colaborador(uuid) TO authenticated;
