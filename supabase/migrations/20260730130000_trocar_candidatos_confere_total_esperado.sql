-- ─────────────────────────────────────────────────────────────────────────────────────
-- A troca passa a CONFERIR o total esperado — a guarda contra lote INCOMPLETO
-- ─────────────────────────────────────────────────────────────────────────────────────
--
-- Continuação imediata da 20260730120000, no mesmo dia. A versão anterior da função
-- ficou 40 minutos no repo e nunca foi chamada por ninguém — mas não se edita migration
-- aplicada, então a troca de assinatura vem aqui.
--
-- ── 🔴 O BURACO QUE ESTA MIGRATION FECHA ────────────────────────────────────────────
--
-- A GUARDA 1 pega o lote VAZIO. Ela NÃO pega o lote INCOMPLETO — e esse é o caso mais
-- provável dos dois, porque acontece sozinho:
--
--     o preparo sobe em blocos (o lote inteiro não cabe numa requisição: 5,40 MB
--     contra o limite de 5 MB — medido). Se um bloco falhar, o preparo fica com,
--     digamos, 6.000 das 7.416 linhas. Para a GUARDA 1 isso é um lote perfeitamente
--     válido: tem linhas, é do edital certo. A troca aconteceria apagando 7.416 e
--     inserindo 6.000.
--
--     🔴 1.416 PESSOAS SUMIRIAM DA LISTA E O RELATÓRIO DIRIA SUCESSO.
--
-- ── Por que a conferência veio parar no BANCO ───────────────────────────────────────
--
-- O desenho original punha esse gate no CLIENTE: "só chame a troca se todos os blocos
-- entraram". Isso é convenção, não regra — não vale para uma chamada via PostgREST, para
-- um script, nem para quem repetir o gesto à mão daqui a um ano. Este repo já pagou por
-- essa distinção mais de uma vez (ver estrutura/transversais/invariantes.md).
--
-- Quem sabe quantas linhas DEVERIAM estar no preparo continua sendo o cliente — não há
-- como o banco descobrir isso sozinho. Mas ele pode exigir que o número seja DECLARADO e
-- conferido, e é isso que muda: o cliente deixa de decidir SE confere, e passa a só
-- informar CONTRA O QUE conferir. A decisão de recusar é do banco.
--
-- Pega os três casos de uma vez:
--     preparo incompleto  (bloco falhou)         → contagem MENOR
--     preparo duplicado   (retentativa sem limpar) → contagem MAIOR
--     preparo vazio                               → GUARDA 1, com mensagem própria
-- ─────────────────────────────────────────────────────────────────────────────────────

-- A assinatura muda (parâmetro novo), então é DROP + CREATE, não CREATE OR REPLACE.
DROP FUNCTION IF EXISTS public.trocar_candidatos_do_edital(uuid, uuid);

CREATE FUNCTION public.trocar_candidatos_do_edital(
  p_edital_id      uuid,
  p_importacao_id  uuid,
  -- Quantas linhas o chamador AFIRMA ter preparado. Não é opcional de propósito: um
  -- default tornaria a conferência pulável, e uma guarda pulável não é guarda.
  p_total_esperado integer
)
RETURNS TABLE (removidos integer, inseridos integer)
LANGUAGE plpgsql
-- SECURITY INVOKER (o padrão, e aqui é decisão): a RLS de `candidatos` continua valendo
-- dentro da função. DEFINER daria a qualquer autenticado o poder de apagar a lista de um
-- edital — é a forma exata da falha que este repo já teve nas Edge Functions duas vezes.
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
  -- Sem isto, um lote vazio (ou já consumido) APAGARIA os inscritos e não inseriria
  -- ninguém — sem erro, porque o DELETE de zero linhas não falha. Parece ter funcionado.
  -- `p_total_esperado <= 0` entra aqui e não na GUARDA 3: esvaziar um edital é gesto
  -- legítimo, mas ele tem tela própria ("limpar edital", com senha). Não passa por aqui.
  IF v_preparadas = 0 OR p_total_esperado <= 0 THEN
    RAISE EXCEPTION
      'Nenhuma linha preparada para esta importação. A troca foi recusada para não apagar a lista atual do edital.'
      USING ERRCODE = 'IM001';
  END IF;

  -- ── GUARDA 2: o preparo tem de ser TODO do edital que se está trocando ─────────────
  -- Sem isto, um edital_id trocado por engano apagaria a lista do edital A e a
  -- substituiria pelos inscritos do edital B. Duas listas perdidas num gesto só.
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
  -- A que fecha o buraco descrito no cabeçalho. A mensagem traz os DOIS números porque
  -- "não bateu" não diz a ninguém o que fazer: faltando linhas, reimporte; sobrando,
  -- houve retentativa sem limpar o preparo.
  IF v_preparadas <> p_total_esperado THEN
    RAISE EXCEPTION
      'O preparo tem % linha(s), mas a importação declarou %. A troca foi recusada para não substituir a lista por uma versão incompleta.',
      v_preparadas, p_total_esperado
      USING ERRCODE = 'IM003';
  END IF;

  -- ── A troca, atômica por ser uma função ────────────────────────────────────────────
  -- Tudo daqui para baixo roda na MESMA transação: se o INSERT falhar por qualquer
  -- motivo (constraint, RLS, trigger), o DELETE volta atrás junto e o edital continua
  -- exatamente como estava.
  DELETE FROM candidatos WHERE edital_id = p_edital_id;
  GET DIAGNOSTICS removidos = ROW_COUNT;

  -- ⚠️ A ORDEM DOS TRÊS `||` É A REGRA INTEIRA, e errá-la é defeito silencioso:
  --
  --   1º  os DEFAULTs  — perdem para a planilha, existem só para o campo que faltar
  --   2º  a linha      — o que a origem afirma
  --   3º  os NOSSOS    — ganham de tudo: identidade e datas não vêm da planilha
  --
  -- 🔴 O 1º bloco NÃO é zelo: `jsonb_populate_record` devolve NULL para chave ausente, e
  -- o DEFAULT da coluna NÃO se aplica quando o INSERT fornece valor explícito — que é o
  -- caso aqui. Sem ele, uma linha sem `portador_deficiencia` derruba a troca INTEIRA no
  -- NOT NULL. Descoberto pelo caso 3 da bateria, que era o controle positivo trivial.
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

  -- O preparo é consumido pela troca. Deixá-lo ali faria a segunda chamada com o mesmo
  -- lote apagar tudo e reinserir — e nenhuma das guardas pegaria.
  DELETE FROM candidatos_importacao WHERE importacao_id = p_importacao_id;

  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.trocar_candidatos_do_edital(uuid, uuid, integer) IS
  'Troca ATÔMICA da lista de inscritos de um edital: apaga todos os candidatos do edital '
  'e insere os do lote preparado em candidatos_importacao, numa transação só. Devolve '
  '(removidos, inseridos). Recusa lote vazio (IM001), lote com edital divergente (IM002) '
  'e lote cuja contagem não bate com p_total_esperado (IM003 — pega bloco que falhou e '
  'retentativa que duplicou). SECURITY INVOKER: a RLS de candidatos vale dentro dela.';

REVOKE ALL ON FUNCTION public.trocar_candidatos_do_edital(uuid, uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trocar_candidatos_do_edital(uuid, uuid, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.trocar_candidatos_do_edital(uuid, uuid, integer) TO authenticated;
