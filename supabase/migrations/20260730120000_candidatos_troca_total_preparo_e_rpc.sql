-- ─────────────────────────────────────────────────────────────────────────────────────
-- ETAPA 1 — a base da TROCA TOTAL: tabela de preparo + o RPC transacional
-- ─────────────────────────────────────────────────────────────────────────────────────
--
-- DECISÃO DO USUÁRIO, 2026-07-30: a importação de candidatos passa a ser DELETE TOTAL do
-- edital + INSERT TOTAL da planilha, em vez do upsert atual. A planilha é a fonte de
-- verdade ("sempre planilhas inteiras, nunca planilhas de adição"), e é isso que resolve
-- o registro órfão na raiz: corrigir CPF, cargo OU inscrição na origem deixa de criar
-- linha nova e abandonar a antiga.
--
-- ⚠️ ESTA MIGRATION NÃO MUDA COMPORTAMENTO NENHUM. Ela só cria a tabela e a função;
-- ninguém as chama ainda. A importação continua sendo o upsert de hoje até a etapa 2.
-- Roadmap: my_rules/analises/roadmap-importacao-espelho.yaml
--
-- ── 🔴 POR QUE O DESENHO ÓBVIO NÃO SERVE, e é MEDIÇÃO, não opinião ──────────────────
--
-- O caminho natural seria um RPC recebendo `(edital_id, jsonb com todos os candidatos)`
-- e fazendo DELETE + INSERT lá dentro. MEDIDO em 2026-07-30 contra o arquivo real:
--
--     7.416 registros, JSON completo ......... 5,40 MB
--     idem, omitindo as chaves nulas ......... 5,11 MB   (economiza só 5%)
--     limite padrão do Kong/PostgREST ........ 5 MB      → 🔴 NÃO CABE
--
-- E piora com o edital: 10.000 inscritos dariam 6,9 MB; 15.000, 10,3 MB. Não é um
-- problema de folga, é de forma — mandar o lote inteiro numa requisição não escala.
--
-- ── A saída: preparo em blocos + UMA troca atômica ──────────────────────────────────
--
-- Os blocos continuam subindo de 500 em 500, como hoje, mas para uma tabela de PREPARO.
-- Depois, UMA chamada ao RPC faz DELETE + INSERT dentro de UMA transação, no servidor,
-- sem payload nenhum. O resultado é exatamente delete total + insert total, atômico:
-- ou o edital inteiro é trocado, ou nada acontece.
--
-- ⚠️ É por isso que a atomicidade some do cliente e vai para o banco. No fluxo de hoje
-- cada bloco é uma transação própria e um bloco falho não desfaz os anteriores. Isso
-- deixa de valer para a TROCA: subir o preparo pela metade é inofensivo (o preparo não é
-- a lista), e a troca só acontece se o preparo estiver completo — quem garante isso é a
-- etapa 2, do lado do cliente, mais as duas guardas desta função.
--
-- ── Por que a linha vai como JSONB, e não em colunas tipadas ────────────────────────
--
-- A tabela de preparo NÃO espelha as 31 colunas de `candidatos`. Se espelhasse, toda
-- coluna nova em `candidatos` teria de ser acrescentada aqui e no INSERT da função — e
-- esquecer disso perderia o campo novo em SILÊNCIO, no meio de uma troca total. Guardando
-- a linha como `jsonb` e reidratando com `jsonb_populate_record(null::candidatos, ...)`,
-- o mapeamento é por NOME de coluna e se mantém sozinho.
-- ─────────────────────────────────────────────────────────────────────────────────────

-- ── 1. A tabela de preparo ───────────────────────────────────────────────────────────
-- Área de rascunho, não histórico: as linhas são apagadas pela própria troca, e o que
-- sobrar é resto de importação abandonada.
CREATE TABLE public.candidatos_importacao (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- A marca do lote. Gerada no cliente, uma por importação, repetida em todos os blocos.
  importacao_id uuid NOT NULL,
  -- Redundante com o que está dentro de `linha`, e de propósito: é o que permite a
  -- GUARDA 2 da função conferir o edital sem abrir o jsonb linha a linha.
  edital_id     uuid NOT NULL REFERENCES public.editais(id) ON DELETE CASCADE,
  -- O candidato inteiro, no mesmo formato que o cliente já monta hoje para o upsert.
  linha         jsonb NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES auth.users(id)
);

-- O índice do fluxo: tudo é filtrado por lote (as duas guardas, o INSERT e a limpeza).
CREATE INDEX idx_candidatos_importacao_lote
  ON public.candidatos_importacao (importacao_id);

-- Apoio ao ON DELETE CASCADE de `editais`. Sem ele, apagar um edital varre a tabela.
CREATE INDEX idx_candidatos_importacao_edital
  ON public.candidatos_importacao (edital_id);

COMMENT ON TABLE public.candidatos_importacao IS
  'Área de PREPARO da importação de candidatos — rascunho, não histórico. Os blocos de '
  '500 sobem para cá e a RPC trocar_candidatos_do_edital consome e limpa. Existe porque '
  'o lote inteiro em JSON dá 5,4 MB e não cabe numa requisição (medido em 2026-07-30). '
  'Linha sobrando aqui é resto de importação abandonada e pode ser apagada.';

COMMENT ON COLUMN public.candidatos_importacao.linha IS
  'O candidato inteiro em jsonb, reidratado por jsonb_populate_record(null::candidatos). '
  'É jsonb e não colunas tipadas para o mapeamento se manter sozinho: coluna nova em '
  'candidatos passa a ser transportada sem ninguém alterar esta tabela nem a RPC.';

-- ── 2. Grants enxutos, no padrão inaugurado por `cargos` ─────────────────────────────
-- ⚠️ NÃO herdar o pacote da era Lovable. `candidatos` tem os sete privilégios para `anon`
-- (inclusive TRUNCATE, que NÃO passa por RLS) e isso é item aberto do backlog. Tabela
-- nova nasce enxuta — aqui a carga é a mesma da outra: CPF, e-mail e endereço de milhares.
REVOKE ALL ON public.candidatos_importacao FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.candidatos_importacao FROM authenticated;

-- ── 3. RLS — só admin, igual a `candidatos` ──────────────────────────────────────────
-- `has_role(..., 'admin')` já cobre o superadmin: a hierarquia mora dentro da função.
-- ⚠️ Nunca trocar por SELECT literal em user_roles — é a falha que já bloqueou o
-- superadmin três vezes neste repo.
ALTER TABLE public.candidatos_importacao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view candidatos_importacao"
  ON public.candidatos_importacao FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert candidatos_importacao"
  ON public.candidatos_importacao FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete candidatos_importacao"
  ON public.candidatos_importacao FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Sem policy de UPDATE, e é decisão: preparo não se edita. Uma linha errada se apaga e
-- sobe de novo — o lote inteiro é descartável por construção.

-- ── 4. A troca ───────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trocar_candidatos_do_edital(
  p_edital_id     uuid,
  p_importacao_id uuid
)
RETURNS TABLE (removidos integer, inseridos integer)
LANGUAGE plpgsql
-- ⚠️ SECURITY INVOKER (o padrão, e aqui é decisão, como em contar_candidatos_por_edital):
-- a função roda com os direitos de quem chama, então a RLS de `candidatos` continua
-- valendo dentro dela. Marcá-la DEFINER "para funcionar" daria a qualquer autenticado o
-- poder de apagar a lista inteira de um edital — é a forma exata da falha que este repo
-- já teve nas Edge Functions duas vezes.
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_preparadas   integer;
  v_outro_edital integer;
BEGIN
  -- ── GUARDA 1: não trocar a lista por NADA ──────────────────────────────────────────
  -- Sem isto, chamar a função com um lote vazio (ou já consumido) APAGARIA os 7.416
  -- inscritos e não inseriria ninguém — e pareceria ter funcionado, porque o DELETE não
  -- dá erro. É o modo de falha mais grave que a troca total introduz, e a única defesa
  -- em nível de banco é esta.
  SELECT count(*) INTO v_preparadas
    FROM candidatos_importacao
   WHERE importacao_id = p_importacao_id;

  IF v_preparadas = 0 THEN
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

  -- ── A troca, atômica por ser uma função ────────────────────────────────────────────
  -- Tudo daqui para baixo roda na MESMA transação: se o INSERT falhar por qualquer
  -- motivo (constraint, RLS, trigger), o DELETE volta atrás junto e o edital continua
  -- exatamente como estava. É a propriedade que a troca total EXIGE e que o cliente,
  -- mandando bloco a bloco, não consegue oferecer.
  DELETE FROM candidatos WHERE edital_id = p_edital_id;
  GET DIAGNOSTICS removidos = ROW_COUNT;

  -- ⚠️ A ORDEM DOS TRÊS `||` É A REGRA INTEIRA, e errá-la é defeito silencioso:
  --
  --   1º  os DEFAULTs  — perdem para a planilha, existem só para o campo que faltar
  --   2º  a linha      — o que a origem afirma
  --   3º  os NOSSOS    — ganham de tudo: identidade e datas não vêm da planilha
  --
  -- 🔴 O 1º bloco NÃO é zelo: `jsonb_populate_record` devolve NULL para a chave ausente,
  -- e o DEFAULT da coluna NÃO se aplica quando o INSERT fornece um valor explícito — que
  -- é o caso aqui. Sem ele, uma linha de preparo sem `portador_deficiencia` derruba a
  -- troca INTEIRA no NOT NULL. O cliente sempre manda os dois hoje; depender disso seria
  -- pendurar a troca total de 7.416 pessoas numa convenção do chamador.
  -- Descoberto pelo CASO 3 da bateria, que era para ser o controle positivo trivial.
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
  -- lote apagar tudo e reinserir — e a GUARDA 1 não pegaria, porque haveria linhas.
  DELETE FROM candidatos_importacao WHERE importacao_id = p_importacao_id;

  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.trocar_candidatos_do_edital(uuid, uuid) IS
  'Troca ATÔMICA da lista de inscritos de um edital: apaga todos os candidatos do edital '
  'e insere os do lote preparado em candidatos_importacao, numa transação só. Devolve '
  '(removidos, inseridos). Recusa lote vazio (IM001) e lote com edital divergente '
  '(IM002). SECURITY INVOKER: a RLS de candidatos vale dentro dela.';

-- ⚠️ EXECUTE só para autenticado. A RLS de `candidatos` já barraria quem não é admin,
-- mas deixar `anon` chegar a EXECUTAR é superfície que não precisa existir.
REVOKE ALL ON FUNCTION public.trocar_candidatos_do_edital(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trocar_candidatos_do_edital(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.trocar_candidatos_do_edital(uuid, uuid) TO authenticated;
