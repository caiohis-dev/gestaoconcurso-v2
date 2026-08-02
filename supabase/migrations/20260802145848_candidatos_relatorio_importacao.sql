-- ═══════════════════════════════════════════════════════════════════════════════════════
-- O relatório de importação de candidatos passa a PERSISTIR no banco
-- ═══════════════════════════════════════════════════════════════════════════════════════
--
-- Decisão do usuário (2026-08-02): "uma base de dados de relatório salvo para cada
-- importação. A reimportação apaga os candidatos e por isso deve apagar e escrever novo
-- relatório."
--
-- ESCOPO DECIDIDO (as três perguntas que definiam o schema, respondidas antes de escrever
-- uma linha de SQL — errar aqui custaria uma migration nova, já que não se edita uma
-- aplicada):
--   1. Só o ÚLTIMO relatório por edital, sobrescrito a cada reimportação — NÃO histórico
--      de todas as importações já feitas.
--   2. Só os PROBLEMAS (Não importada / Importada com ressalva / Substituída / Não
--      importada por pagamento) — NÃO a Associação de Cargos (o de-para continua só no
--      export; nada persiste dela).
--   3. Só persistência agora — sem tela de consulta nesta etapa.
--
-- ── Por que não precisa do padrão de "preparo em blocos" que candidatos usa ───────────
--
-- MEDIDO contra o arquivo real (7.416 linhas): somando as quatro origens do relatório
-- (comErro + comAviso + repetidas + naoPagantes), o volume fica na casa das centenas —
-- nada perto dos 5,40 MB que forçaram `candidatos_importacao` a existir. Uma única
-- chamada com o relatório inteiro como jsonb cabe folgado no limite do Kong.
--
-- ── Por que o relatório é escrito DENTRO da mesma função que troca os candidatos ──────
--
-- O relatório é inteiramente conhecível ANTES da troca acontecer — ele descreve o que o
-- CLIENTE classificou ao ler a planilha (erro/aviso/repetida/não-pagante), e isso não
-- depende do resultado da troca no servidor. Mas ele só pode ser gravado SE a troca de
-- fato acontecer: se qualquer guarda da função recusar, nem candidatos nem relatório
-- podem mudar — "ou tudo muda, ou nada muda" vale para os dois juntos, não só para
-- `candidatos`. Por isso o relatório entra como mais um parâmetro da MESMA função, e não
-- como uma chamada separada do cliente depois do sucesso da troca: uma chamada separada
-- deixaria uma janela em que candidatos já trocaram mas o relatório ainda é o antigo (ou
-- pior, se a segunda chamada nunca acontecer — aba fechada, queda de rede).
--
-- ── Por que os nomes de coluna do relatório são snake_case, e NÃO os rótulos do export ──
--
-- `ProblemaDoRelatorio` (candidatos-import.ts) tem chaves como "Nº de Inscrição" e
-- "Situação" — com acento e espaço, porque viram CABEÇALHO da planilha XLS
-- (`json_to_sheet` usa o nome da propriedade). Usar essas chaves como o formato de
-- persistência acoplaria o schema do banco ao RÓTULO de uma coluna de exportação — e
-- rótulo de export muda por motivo cosmético (foi renomeado de "Linha" para "Nº de
-- Inscrição" há poucos dias). O cliente traduz para um formato próprio antes de mandar
-- (`paraRelatorioPersistido` em candidatos-import.ts), com chaves estáveis que não têm
-- nada a ver com o que a tela mostra.
--
-- ── Por que edital_id é ON DELETE CASCADE aqui, ao contrário de candidatos/provas ─────
--
-- `candidatos.edital_id` e `provas.edital_id` são RESTRICT: apagar um edital com dados
-- operacionais é destruir registro que interessa por si (inscritos, alocações, valores).
-- Este relatório é o OPOSTO por natureza — é o log transiente da ÚLTIMA importação,
-- descartável e reescrito a cada nova. Se o edital deixa de existir, não há mais nada
-- para o relatório descrever. CASCADE aqui não é atalho: é a semântica certa.
--
-- ⚠️ NÃO é tocado por "limpar edital" nem por excluir um candidato avulso — só a RPC de
-- troca mexe nele. Ele descreve a ÚLTIMA IMPORTAÇÃO, não "o estado atual de candidatos";
-- as duas coisas podem divergir se alguém limpar a lista sem reimportar, e é aceito.
-- ═══════════════════════════════════════════════════════════════════════════════════════

-- ── 1. A tabela ────────────────────────────────────────────────────────────────────────
CREATE TABLE public.candidatos_relatorio_importacao (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edital_id    uuid NOT NULL REFERENCES public.editais(id) ON DELETE CASCADE,
  -- '—' quando a própria inscrição é o que falta na linha (só linha com erro chega
  -- nesse caso) — mesmo valor que o export mostra. TEXT sem CHECK: mesma filosofia da
  -- migration 20260730100000 (dado inválido entra cru; não se valida formato no banco).
  n_inscricao  text NOT NULL,
  situacao     text NOT NULL,
  campo        text NOT NULL,
  detalhe      text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.candidatos_relatorio_importacao IS
  'O relatório da ÚLTIMA importação de cada edital — só os problemas (comErro, comAviso, '
  'repetidas, naoPagantes), sem a Associação de Cargos. Reescrito por inteiro a cada '
  'importação (DELETE + INSERT dentro de trocar_candidatos_do_edital), nunca por '
  '"limpar edital" nem por excluir um candidato avulso.';

CREATE INDEX idx_candidatos_relatorio_importacao_edital
  ON public.candidatos_relatorio_importacao (edital_id);

ALTER TABLE public.candidatos_relatorio_importacao ENABLE ROW LEVEL SECURITY;

-- Mesma régua de candidatos_importacao (a tabela de preparo mais próxima): admin
-- autenticado, sem UPDATE — o ciclo de vida é sempre DELETE + INSERT, nunca alteração de
-- linha existente.
CREATE POLICY "Admins can view candidatos_relatorio_importacao"
  ON public.candidatos_relatorio_importacao FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert candidatos_relatorio_importacao"
  ON public.candidatos_relatorio_importacao FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete candidatos_relatorio_importacao"
  ON public.candidatos_relatorio_importacao FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- ⚠️ Sem GRANT explícito para `authenticated`: `ALTER DEFAULT PRIVILEGES FOR ROLE postgres
-- IN SCHEMA public` (migration 20260712010000) já concede DML a toda tabela nova, e
-- `anon` NÃO herda nada disso desde 20260731110000 — nasce sem privilégio algum.

-- ── 2. A RPC ganha o relatório, na MESMA transação da troca ─────────────────────────────
-- Assinatura muda (parâmetro novo), então é DROP + CREATE — não se edita função já usada
-- em produção sem trocar a identidade dela.
DROP FUNCTION IF EXISTS public.trocar_candidatos_do_edital(uuid, uuid, integer);

CREATE FUNCTION public.trocar_candidatos_do_edital(
  p_edital_id      uuid,
  p_importacao_id  uuid,
  p_total_esperado integer,
  -- Array de objetos {n_inscricao, situacao, campo, detalhe}. SEM DEFAULT, de propósito:
  -- mesma razão de p_total_esperado não ter — um default tornaria "esquecer de mandar o
  -- relatório" indistinguível de "mandar relatório vazio porque não houve problema
  -- nenhum", e as duas coisas têm de ser decisões EXPLÍCITAS de quem chama.
  p_relatorio      jsonb
)
RETURNS TABLE (removidos integer, inseridos integer)
LANGUAGE plpgsql
-- SECURITY INVOKER: mesma razão de sempre. A RLS de `candidatos` E a de
-- `candidatos_relatorio_importacao` continuam valendo dentro da função.
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_preparadas   integer;
  v_outro_edital integer;
BEGIN
  SELECT count(*) INTO v_preparadas
    FROM candidatos_importacao
   WHERE importacao_id = p_importacao_id;

  -- ── GUARDA 1: não trocar a lista por NADA ──────────────────────────────────────────
  IF v_preparadas = 0 OR p_total_esperado <= 0 THEN
    RAISE EXCEPTION
      'Nenhuma linha preparada para esta importação. A troca foi recusada para não apagar a lista atual do edital.'
      USING ERRCODE = 'IM001';
  END IF;

  -- ── GUARDA 2: o preparo tem de ser TODO do edital que se está trocando ─────────────
  SELECT count(*) INTO v_outro_edital
    FROM candidatos_importacao
   WHERE importacao_id = p_importacao_id
     AND edital_id <> p_edital_id;

  IF v_outro_edital > 0 THEN
    RAISE EXCEPTION
      'O preparo desta importação tem % linha(s) de outro edital. A troca foi recusada.',
      v_outro_edital
      USING ERRCODE = 'IM002';
  END IF;

  -- ── 🔴 GUARDA 3: o preparo tem de estar COMPLETO ──────────────────────────────────
  IF v_preparadas <> p_total_esperado THEN
    RAISE EXCEPTION
      'O preparo tem % linha(s), mas a importação declarou %. A troca foi recusada para não substituir a lista por uma versão incompleta.',
      v_preparadas, p_total_esperado
      USING ERRCODE = 'IM003';
  END IF;

  -- ── A troca, atômica por ser uma função ────────────────────────────────────────────
  -- Tudo daqui para baixo roda na MESMA transação: se qualquer INSERT falhar (constraint,
  -- RLS, trigger), TUDO volta atrás junto — candidatos E relatório — e o edital continua
  -- exatamente como estava, com o relatório ANTIGO intacto.
  DELETE FROM candidatos WHERE edital_id = p_edital_id;
  GET DIAGNOSTICS removidos = ROW_COUNT;

  INSERT INTO candidatos
  SELECT (jsonb_populate_record(
            null::public.candidatos,
            jsonb_build_object(
              'portador_deficiencia', false,
              'confirmado',           false
            )
            || linha
            || jsonb_build_object(
              'id',         gen_random_uuid(),
              'edital_id',  p_edital_id,
              'created_at', now(),
              'updated_at', now()
            )
         )).*
    FROM candidatos_importacao
   WHERE importacao_id = p_importacao_id;
  GET DIAGNOSTICS inseridos = ROW_COUNT;

  DELETE FROM candidatos_importacao WHERE importacao_id = p_importacao_id;

  -- 🔴 O RELATÓRIO: apaga o da importação ANTERIOR deste edital e grava o novo — sempre
  -- os dois passos juntos, mesmo quando p_relatorio é '[]' (importação sem problema
  -- nenhum precisa LIMPAR um relatório velho que sobrou de uma importação suja anterior).
  DELETE FROM candidatos_relatorio_importacao WHERE edital_id = p_edital_id;

  INSERT INTO candidatos_relatorio_importacao (edital_id, n_inscricao, situacao, campo, detalhe)
  SELECT p_edital_id, r.n_inscricao, r.situacao, r.campo, r.detalhe
    FROM jsonb_to_recordset(p_relatorio)
      AS r(n_inscricao text, situacao text, campo text, detalhe text);

  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.trocar_candidatos_do_edital(uuid, uuid, integer, jsonb) IS
  'Troca ATÔMICA da lista de inscritos de um edital E do relatório da importação: apaga '
  'candidatos e candidatos_relatorio_importacao do edital, insere os do lote preparado '
  'e as linhas de p_relatorio, numa transação só. Devolve (removidos, inseridos) — só de '
  'candidatos, o relatório não entra na contagem. Recusa lote vazio (IM001), lote com '
  'edital divergente (IM002) e lote cuja contagem não bate com p_total_esperado (IM003). '
  'SECURITY INVOKER: a RLS das duas tabelas vale dentro dela.';

REVOKE ALL ON FUNCTION public.trocar_candidatos_do_edital(uuid, uuid, integer, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trocar_candidatos_do_edital(uuid, uuid, integer, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.trocar_candidatos_do_edital(uuid, uuid, integer, jsonb) TO authenticated;
