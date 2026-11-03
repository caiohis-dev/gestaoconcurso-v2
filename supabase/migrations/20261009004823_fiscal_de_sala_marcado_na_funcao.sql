-- "Fiscal de sala" passa a ser uma MARCAÇÃO da função no banco, não um palpite sobre o nome.
--
-- O DEFEITO: `useFiscaisSala` decidia quem pode ser fiscal de sala por
-- `nome.includes("fiscal") && nome.includes("sala")`, no JS. A função cadastrada chama-se
-- só "Fiscal" — então os seletores "Fiscal 1/2" de /gerenciar-salas-distribuidas
-- ofereciam apenas "Nenhum" em todas as provas. Medido em 2026-10-08: 812 alocações como
-- Fiscal, 0 fiscais atribuídos nas 100 salas. Era o padrão "o NOME mente" (CLAUDE.md §8).
--
-- O QUE MUDA:
--   1. `funcoes_colaboradores.fiscal_de_sala` — a marcação, editável em /funcoes-colaboradores.
--   2. A função de referência "Fiscal" nasce marcada (decisão do usuário em 08/10: só ela).
--   3. O banco RECUSA atribuir como fiscal de sala (decisão do usuário em 08/10):
--        FS001 — alocação cuja função não está marcada;
--        FS002 — a mesma alocação como fiscal em duas salas (ou nos dois postos da mesma);
--        FS003 — alocação de OUTRA prova.
--      Até aqui a única barreira era a lista do seletor, e a deduplicação dele só olhava
--      as salas da unidade ABERTA: duas unidades da mesma prova aceitavam a mesma pessoa.
--   4. `excluir_ocorrencia_colaborador` trata essas três recusas como "posto não
--      devolvido" (conta e segue), em vez de desfazer a exclusão inteira.
--
-- POR QUE AFTER, e não BEFORE: `salvar_salas_distribuidas` grava o lote num ÚNICO UPDATE.
-- Um trigger BEFORE ... FOR EACH ROW ("recuse antes de gravar", a forma natural) veria as
-- salas ainda não processadas no estado antigo, e uma TROCA legítima (X da sala A para a
-- B, Y da B para a A) seria recusada no meio — a mesma armadilha que a renumeração teve
-- (20260803001556). Medido ao escrever: a versão BEFORE ROW reprova o caso 5 da bateria.
-- Um AFTER dispara no fim do comando e confere o estado FINAL. ⚠️ AFTER ... FOR EACH ROW
-- também passaria (medido: ele também só roda no fim do comando); a escolha por COMANDO
-- é para ter as transition tables e conferir só os postos que mudaram numa passada.
--
-- SÓ O POSTO QUE MUDOU é conferido. Editar a capacidade de uma sala não reprova um fiscal
-- atribuído antes de a função ser desmarcada: a regra vale no momento da atribuição.
-- Desmarcar uma função em uso é permitido e não desaloja ninguém.
--
-- CONCORRÊNCIA: a conferência trava (FOR UPDATE) a linha da alocação antes de contar.
-- Duas gravações simultâneas da mesma pessoa em salas diferentes se serializam, e a
-- segunda vê a primeira já confirmada.
--
-- POR QUE A MARCAÇÃO DA "FISCAL" É MIGRATION, e não seed.pos.sql: a linha é DADO DE
-- REFERÊNCIA, criada com UUID fixo por 20260712134220 (o mesmo de produção). No local, o
-- dump a reinsere com ON CONFLICT DO NOTHING, então a linha desta migration sobrevive à
-- carga. Em produção, a linha já existe quando o `db push` roda. Se não achar a linha, a
-- migration FALHA — marcar zero linhas em silêncio deixaria o seletor vazio de novo.

ALTER TABLE public.funcoes_colaboradores
  ADD COLUMN IF NOT EXISTS fiscal_de_sala boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.funcoes_colaboradores.fiscal_de_sala IS
  'Quem está alocado nesta função pode ser fiscal de sala (salas_prova_distribuidas.sala_fiscal_1/2). Conferido pelo trigger check_fiscais_de_sala no momento da atribuição.';

DO $$
DECLARE
  v_marcadas integer;
BEGIN
  UPDATE public.funcoes_colaboradores
     SET fiscal_de_sala = true
   WHERE id = 'd62fe957-3868-4d8d-bd61-848a09396088'; -- "Fiscal" (20260712134220)
  GET DIAGNOSTICS v_marcadas = ROW_COUNT;

  IF v_marcadas <> 1 THEN
    RAISE EXCEPTION 'A função de referência "Fiscal" (d62fe957-…) não foi encontrada: nada foi marcado como fiscal de sala.';
  END IF;
END $$;

-- Confere UM posto (sala, alocação). Chamada pelos triggers abaixo, depois do comando.
CREATE OR REPLACE FUNCTION public.recusa_fiscal_de_sala_invalido(p_sala_id uuid, p_fiscal uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prova_sala uuid;
  v_prova_fiscal uuid;
  v_marcada boolean;
  v_nome text;
  v_funcao text;
  v_postos integer;
  v_outra_numero integer;
  v_outra_sigla text;
BEGIN
  SELECT prova_id INTO v_prova_sala FROM public.salas_prova_distribuidas WHERE id = p_sala_id;

  -- Trava a alocação ANTES de contar: serializa duas atribuições simultâneas da mesma
  -- pessoa (ver o cabeçalho).
  SELECT pu.prova_id, coalesce(f.fiscal_de_sala, false), c.colab_nome_completo, f.cargo_nome
    INTO v_prova_fiscal, v_marcada, v_nome, v_funcao
    FROM public.colaboradores_prova cp
    JOIN public.prova_unidades pu ON pu.id = cp.prova_unidade_id
    JOIN public.colaboradores c ON c.id = cp.colaborador_id
    LEFT JOIN public.funcoes_colaboradores f ON f.id = cp.funcao_id
   WHERE cp.id = p_fiscal
     FOR UPDATE OF cp;

  v_nome := coalesce(nullif(btrim(v_nome), ''), 'Este colaborador');

  IF v_prova_fiscal IS DISTINCT FROM v_prova_sala THEN
    RAISE EXCEPTION '% não está alocado(a) nesta prova e não pode ser fiscal de sala aqui.', v_nome
      USING ERRCODE = 'FS003';
  END IF;

  IF NOT v_marcada THEN
    RAISE EXCEPTION '% está alocado(a) como "%", que não é uma função de fiscal de sala. Marque a função como fiscal de sala em Funções, ou altere a alocação.',
      v_nome, coalesce(v_funcao, 'sem função')
      USING ERRCODE = 'FS001';
  END IF;

  SELECT count(*) FILTER (WHERE sala_fiscal_1 = p_fiscal) + count(*) FILTER (WHERE sala_fiscal_2 = p_fiscal)
    INTO v_postos
    FROM public.salas_prova_distribuidas
   WHERE sala_fiscal_1 = p_fiscal OR sala_fiscal_2 = p_fiscal;

  IF v_postos > 1 THEN
    SELECT s.sala_numero, nullif(btrim(u.unid_sigla), '')
      INTO v_outra_numero, v_outra_sigla
      FROM public.salas_prova_distribuidas s
      LEFT JOIN public.unidades_prova u ON u.id = s.sala_fk_unidade
     WHERE (s.sala_fiscal_1 = p_fiscal OR s.sala_fiscal_2 = p_fiscal)
       AND s.id <> p_sala_id
     LIMIT 1;

    IF v_outra_numero IS NULL THEN
      RAISE EXCEPTION '% não pode ser Fiscal 1 e Fiscal 2 da mesma sala.', v_nome
        USING ERRCODE = 'FS002';
    END IF;

    RAISE EXCEPTION '% já é fiscal da sala % (%) nesta prova. Cada pessoa só pode ser fiscal de uma sala: retire-a de lá antes.',
      v_nome, v_outra_numero, coalesce(v_outra_sigla, 'unidade sem sigla')
      USING ERRCODE = 'FS002';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_fiscais_de_sala()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  -- Transition table só existe no evento que a declarou; cada ramo lê só a sua.
  IF TG_OP = 'INSERT' THEN
    FOR r IN
      SELECT n.id, x.fiscal
        FROM novas n
        CROSS JOIN LATERAL (VALUES (n.sala_fiscal_1), (n.sala_fiscal_2)) AS x(fiscal)
       WHERE x.fiscal IS NOT NULL
    LOOP
      PERFORM public.recusa_fiscal_de_sala_invalido(r.id, r.fiscal);
    END LOOP;
  ELSE
    FOR r IN
      SELECT n.id, n.sala_fiscal_1 AS fiscal
        FROM novas n JOIN antigas a ON a.id = n.id
       WHERE n.sala_fiscal_1 IS NOT NULL AND n.sala_fiscal_1 IS DISTINCT FROM a.sala_fiscal_1
      UNION ALL
      SELECT n.id, n.sala_fiscal_2
        FROM novas n JOIN antigas a ON a.id = n.id
       WHERE n.sala_fiscal_2 IS NOT NULL AND n.sala_fiscal_2 IS DISTINCT FROM a.sala_fiscal_2
    LOOP
      PERFORM public.recusa_fiscal_de_sala_invalido(r.id, r.fiscal);
    END LOOP;
  END IF;

  RETURN NULL;
END;
$$;

-- Dois triggers: transition tables não se declaram num trigger de vários eventos.
CREATE TRIGGER check_fiscais_de_sala_insert
  AFTER INSERT ON public.salas_prova_distribuidas
  REFERENCING NEW TABLE AS novas
  FOR EACH STATEMENT EXECUTE FUNCTION public.check_fiscais_de_sala();

CREATE TRIGGER check_fiscais_de_sala_update
  AFTER UPDATE ON public.salas_prova_distribuidas
  REFERENCING OLD TABLE AS antigas NEW TABLE AS novas
  FOR EACH STATEMENT EXECUTE FUNCTION public.check_fiscais_de_sala();

-- Nenhuma das duas é RPC: só os triggers (que rodam como dono) as chamam. Ver o aviso
-- sobre EXECUTE para PUBLIC em 20260923232343.
REVOKE ALL ON FUNCTION public.recusa_fiscal_de_sala_invalido(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_fiscais_de_sala() FROM PUBLIC, anon, authenticated;

-- A devolução do posto de fiscal (20261008222929) agora passa por esses triggers. Uma
-- recusa deles (função desmarcada no meio-tempo, por exemplo) NÃO desfaz a exclusão: o
-- colaborador volta à lista e o posto conta como não devolvido. PF001 (prova ou unidade
-- finalizada) continua propagando — aquela recusa é sobre a prova, não sobre o posto.
CREATE OR REPLACE FUNCTION public.excluir_ocorrencia_colaborador(
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
  v_sala uuid;
  v_devolvidos integer := 0;
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

    -- Só posto VAGO volta: quem o ocupou no meio-tempo não é desalojado. Sala a sala,
    -- para que a recusa de um posto não leve os outros junto.
    FOREACH v_sala IN ARRAY v_oc.salas_fiscal_1_congeladas LOOP
      BEGIN
        UPDATE public.salas_prova_distribuidas
           SET sala_fiscal_1 = v_nova_alocacao
         WHERE id = v_sala AND sala_fiscal_1 IS NULL;
        IF FOUND THEN v_devolvidos := v_devolvidos + 1; END IF;
      EXCEPTION WHEN SQLSTATE 'FS001' OR SQLSTATE 'FS002' OR SQLSTATE 'FS003' THEN
        NULL; -- conta como não devolvido, abaixo
      END;
    END LOOP;

    FOREACH v_sala IN ARRAY v_oc.salas_fiscal_2_congeladas LOOP
      BEGIN
        UPDATE public.salas_prova_distribuidas
           SET sala_fiscal_2 = v_nova_alocacao
         WHERE id = v_sala AND sala_fiscal_2 IS NULL;
        IF FOUND THEN v_devolvidos := v_devolvidos + 1; END IF;
      EXCEPTION WHEN SQLSTATE 'FS001' OR SQLSTATE 'FS002' OR SQLSTATE 'FS003' THEN
        NULL;
      END;
    END LOOP;

    v_nao_devolvidos := cardinality(v_oc.salas_fiscal_1_congeladas)
                      + cardinality(v_oc.salas_fiscal_2_congeladas)
                      - v_devolvidos;
  END IF;

  DELETE FROM public.ocorrencias_colaborador WHERE id = p_ocorrencia_id;

  RETURN jsonb_build_object('postos_fiscal_nao_devolvidos', v_nao_devolvidos);
END;
$$;

REVOKE ALL ON FUNCTION public.excluir_ocorrencia_colaborador(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.excluir_ocorrencia_colaborador(uuid) TO authenticated;
