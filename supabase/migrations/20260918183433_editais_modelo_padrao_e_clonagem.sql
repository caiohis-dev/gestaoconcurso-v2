-- ═══════════════════════════════════════════════════════════════════════════════════════
-- O EDITAL MODELO, e a clonagem dele para um edital novo
-- ═══════════════════════════════════════════════════════════════════════════════════════
--
-- Rodada 1 do tema "Edital padrão". A rodada 0 deu ao documento o marcador de dado
-- variável (`{{campo:}}`, migration 20260918103305). Esta dá o MECANISMO do modelo:
-- ele existe, é editável pela própria tela, e um edital novo o absorve com um clique.
--
-- 🔴 **O modelo é um edital de VERDADE**, uma linha em `editais` com `eh_modelo = true`.
-- Decisão do usuário em 2026-09-18, contra a alternativa de guardá-lo em código: assim a
-- FEVRE ajusta o texto padrão pela tela, sem desenvolvedor no caminho.
--
-- ⚠️ Ele entra VAZIO. Nenhum artigo nasce aqui — o texto vem uma rodada por capítulo, e
-- cada uma acrescenta os artigos daquele capítulo a esta linha. Modelo vazio é estado
-- CORRETO, não meio-estado: a clonagem funciona desde já e copia exatamente o que existe.
--
-- ── POR QUE MIGRATION, e não `seed.pos.sql` ───────────────────────────────────────────
--
-- O precedente está escrito neste repo, em 20260712134220_seed_funcoes_basicas_sistema.sql:
-- *"seeds só rodam em `supabase db reset` (local); `supabase db push` aplica apenas
-- migrations. Enquanto estas linhas viviam só no seed.sql, um banco de produção novo
-- nasceria sem elas — e sem erro visível em lugar nenhum."*
--
-- O modelo está na mesma situação, e o sintoma seria pior que invisível: o botão "Aplicar
-- o edital padrão" apareceria e não teria o que copiar. Por isso a linha nasce aqui, com
-- `ON CONFLICT (id) DO NOTHING`, exatamente como as 7 funções básicas.
--
-- ⚠️ CONSEQUÊNCIA ACEITA: quem editar o modelo pela tela faz o banco divergir desta
-- migration. Ela é o NASCIMENTO, não o espelho — igual às 7 funções. Não tente
-- "sincronizar" depois: o dono do texto, depois de nascido, é o banco.
--
-- ── MEDIDO antes de criar (regra da casa) ─────────────────────────────────────────────
--
--   banco local (cópia de produção, 2026-09-18):
--     3 editais · 3 provas · 0 inscritos · 0 artigos · 0 linhas de capítulo
--
--   Nenhuma linha existente viola nada do que esta migration aperta, e o nome escolhido
--   não colide com o índice funcional `editais_nome_key` (os três se chamam
--   "Edital 00X/2026…"). Não há saneamento a fazer.
-- ═══════════════════════════════════════════════════════════════════════════════════════

-- ── 1. As colunas ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.editais
  ADD COLUMN IF NOT EXISTS eh_modelo          BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS modelo_aplicado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS modelo_versao      TEXT;

COMMENT ON COLUMN public.editais.eh_modelo IS
  'true só na linha do edital modelo. Índice parcial garante no máximo uma.';
COMMENT ON COLUMN public.editais.modelo_aplicado_em IS
  'Quando este edital absorveu o modelo. Registra o FATO — ver o porquê na migration.';
COMMENT ON COLUMN public.editais.modelo_versao IS
  'Na linha do MODELO, a versão do texto padrão. Num edital comum, a versão que ele absorveu.';

-- ── 2. No máximo UM modelo, garantido pelo banco ──────────────────────────────────────
--
-- Índice único sobre uma expressão constante, com WHERE parcial: duas linhas com
-- `eh_modelo = true` colidiriam na mesma chave `(true)`. É o jeito de expressar "no
-- máximo uma linha satisfaz este predicado" sem tabela de apoio.
--
-- ⚠️ Zero modelos continua sendo estado válido para o BANCO — e é o que um `db reset` tem
-- no instante anterior a esta migration. Quem cobra a existência é a RPC (`EM005`), com
-- mensagem acionável, não uma constraint que impediria o próprio bootstrap.
CREATE UNIQUE INDEX IF NOT EXISTS editais_um_modelo_key
  ON public.editais ((true))
  WHERE eh_modelo;

-- ── 3. A linha do modelo, com UUID FIXO ───────────────────────────────────────────────
--
-- ⚠️ O UUID é sinteticamente óbvio de propósito. Os UUIDs de 20260712134220 vieram de
-- produção e precisavam ser preservados; este é MINTADO aqui, e um valor claramente
-- artificial anuncia "linha de sistema, não dado de ninguém" para quem topar com ele num
-- `select`. Não o troque: é ele que torna a migration idempotente e reexecutável.
INSERT INTO public.editais (id, nome, eh_modelo, modelo_versao)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  'Modelo padrão de edital',
  true,
  '0.0'   -- sobe a cada rodada de capítulo; '0.0' = ainda sem texto nenhum
)
ON CONFLICT (id) DO NOTHING;

-- ── 4. O modelo não recebe prova nem inscrito ─────────────────────────────────────────
--
-- 🔴 Barreira do BANCO, e não só filtro de tela (§2 do CLAUDE.md). O front vai esconder o
-- modelo dos quatro seletores de edital que existem, mas isso é CONVENIÊNCIA: a escrita de
-- `provas` e `candidatos` é PostgREST direto, e um POST com `edital_id` do modelo passaria
-- pela RLS (o admin pode criar prova) e gravaria.
--
-- O molde é `20260802045221_prova_edital_imutavel.sql`: SECURITY INVOKER porque a regra é
-- de COERÊNCIA, não de permissão — vale inclusive para `service_role`, que é justamente
-- quem uma Edge Function ou um script usaria para contornar a tela.
--
-- ⚠️ Olha só o `edital_id` que ESTÁ ENTRANDO, nunca o que já estava. O backfill do
-- `seed.pos.sql` faz `UPDATE provas SET edital_id = …` DEPOIS das migrations, com o
-- trigger já instalado — e ele aponta para editais reais, nunca para o modelo. Uma trava
-- mais larga (recusar qualquer UPDATE) quebraria todo `db reset`, que é como a constraint
-- `DEFERRABLE` foi reprovada em 03/08.
CREATE OR REPLACE FUNCTION public.recusa_vinculo_ao_edital_modelo()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.edital_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.editais WHERE id = NEW.edital_id AND eh_modelo) THEN
    RAISE EXCEPTION
      'O edital modelo não recebe prova nem inscrito: ele é só o texto padrão que os editais novos copiam.'
      USING ERRCODE = 'EM010',
            HINT = 'Crie um edital para o concurso e aplique o modelo padrão nele.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS provas_recusa_edital_modelo ON public.provas;
CREATE TRIGGER provas_recusa_edital_modelo
  BEFORE INSERT OR UPDATE OF edital_id ON public.provas
  FOR EACH ROW EXECUTE FUNCTION public.recusa_vinculo_ao_edital_modelo();

DROP TRIGGER IF EXISTS candidatos_recusa_edital_modelo ON public.candidatos;
CREATE TRIGGER candidatos_recusa_edital_modelo
  BEFORE INSERT OR UPDATE OF edital_id ON public.candidatos
  FOR EACH ROW EXECUTE FUNCTION public.recusa_vinculo_ao_edital_modelo();

-- ── 5. Não se promove a modelo um edital que já é de um concurso ──────────────────────
--
-- O outro lado da regra acima. Sem isto, marcar `eh_modelo` num edital com 7.000 inscritos
-- deixaria o sistema num estado que nenhuma das duas regras descreve: um modelo com
-- dependentes, escondido dos seletores, e com prova apontando para ele.
CREATE OR REPLACE FUNCTION public.recusa_modelo_com_dependentes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.eh_modelo AND NOT COALESCE(OLD.eh_modelo, false) THEN
    IF EXISTS (SELECT 1 FROM public.provas WHERE edital_id = NEW.id)
       OR EXISTS (SELECT 1 FROM public.candidatos WHERE edital_id = NEW.id) THEN
      RAISE EXCEPTION
        'Este edital já tem prova ou inscrito, então não pode virar o modelo padrão.'
        USING ERRCODE = 'EM011',
              HINT = 'O modelo é um edital sem concurso próprio, que serve de texto-base para os outros.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS editais_recusa_modelo_com_dependentes ON public.editais;
CREATE TRIGGER editais_recusa_modelo_com_dependentes
  BEFORE UPDATE OF eh_modelo ON public.editais
  FOR EACH ROW EXECUTE FUNCTION public.recusa_modelo_com_dependentes();

-- ── 6. A clonagem, em UMA transação ───────────────────────────────────────────────────
--
-- 🔴 **SECURITY INVOKER, e é escolha.** A migration 20260916225307 já escreveu o motivo
-- para este módulo: *"um DEFINER aqui criaria uma SEGUNDA cópia da regra de quem pode
-- escrever — o padrão que já quebrou o superadmin três vezes neste repo."* A autorização
-- são as policies de `edital_itens` (INSERT só de admin via `has_role`) e de `editais`.
--
-- 🔴 **Não recebe o texto por parâmetro, e isso é o ganho de o modelo morar no banco.** A
-- cópia é `INSERT … SELECT` de uma linha de `editais` para outra, tudo dentro do servidor:
-- nenhum byte de texto atravessa o PostgREST. Some com o problema que o roadmap previa —
-- ~110 KB de jsonb contra o teto de 5 MB do Kong — e, com ele, qualquer conversa sobre
-- tabela de preparo ou chunking (o precedente de `trocar_candidatos_do_edital`, que
-- precisou dos dois para 5,40 MB, não se aplica aqui).
--
-- 🔴 **A VERSÃO também não vem do cliente.** Ela é lida da própria linha do modelo. É o
-- §8 em ação: *"parâmetro que o chamador envia não é identidade"* — e versão declarada
-- pelo cliente é a mesma classe de erro, com o agravante de ficar gravada como se fosse
-- fato. O precedente é 20260912191749.
--
-- ── As guardas, em ordem, e por que a ORDEM é a regra ────────────────────────────────
--
--   EM001  o destino não existe
--   EM002  o destino já absorveu o modelo (só na aplicação TOTAL)
--   EM003  o capítulo alvo já tem artigo — e a mensagem NOMEIA as chaves ocupadas
--   EM004  o destino é o próprio modelo
--   EM005  não existe edital modelo neste banco
--
-- ⚠️ A renumeração em relação ao roadmap é deliberada: as guardas da RPC ficaram em
-- EM001–EM005 e as dos triggers em EM010–EM011, para o bloco de siglas dizer sozinho de
-- onde a recusa veio.
--
-- 🔴 **O `FOR UPDATE` da primeira linha é o que separa este desenho de um teste de "está
-- vazio?".** Sem ele, duas abas leem "ainda não aplicado" ao mesmo tempo e as duas
-- escrevem — o edital termina com o dobro dos artigos, e a colisão de âncora (abaixo) é
-- que salvaria o dia, por acidente.
--
-- 🔴 **E a colisão de âncora é a barreira mais importante, de graça.** O índice parcial
-- `edital_itens_ancora_key (edital_id, ancora)` levanta `23505` aqui dentro; como a função
-- É a transação, NADA é inserido. Se um dia o modelo ganhar duas âncoras iguais em rodadas
-- diferentes, a absorção falha inteira em vez de deixar meio documento no edital de
-- alguém. O CASO 5 da bateria prova que `count(*) = 0` depois da recusa.
CREATE OR REPLACE FUNCTION public.aplicar_edital_modelo(
  p_destino        UUID,
  -- NULL = o documento inteiro, que é a primeira absorção. Preenchido = só estes
  -- capítulos, que é como uma rodada NOVA alcança um edital que já absorveu o modelo
  -- antigo, sem tocar no que já foi redigido.
  p_capitulos_alvo TEXT[] DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_eh_modelo BOOLEAN;
  v_aplicado  TIMESTAMPTZ;
  v_modelo    UUID;
  v_versao    TEXT;
  v_ocupados  TEXT;
  v_inseridos INTEGER;
BEGIN
  -- Travar ANTES de testar. Ver o comentário acima.
  SELECT eh_modelo, modelo_aplicado_em
    INTO v_eh_modelo, v_aplicado
  FROM public.editais
  WHERE id = p_destino
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Edital não encontrado.' USING ERRCODE = 'EM001';
  END IF;

  IF v_eh_modelo THEN
    RAISE EXCEPTION 'Este é o próprio edital modelo — ele não absorve a si mesmo.'
      USING ERRCODE = 'EM004',
            HINT = 'Edite o texto padrão aqui; a absorção acontece nos editais dos concursos.';
  END IF;

  IF p_capitulos_alvo IS NULL AND v_aplicado IS NOT NULL THEN
    RAISE EXCEPTION 'Este edital já absorveu o modelo padrão em %.', v_aplicado::date
      USING ERRCODE = 'EM002',
            HINT = 'Para trazer um capítulo novo do modelo, aplique só aquele capítulo.';
  END IF;

  SELECT id, modelo_versao INTO v_modelo, v_versao
  FROM public.editais WHERE eh_modelo;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Não existe edital modelo neste banco.'
      USING ERRCODE = 'EM005',
            HINT = 'A linha do modelo nasce por migration; confira se as migrations foram aplicadas.';
  END IF;

  -- ⚠️ Recusa NOMEANDO os capítulos ocupados. "Não foi possível aplicar" mandaria o autor
  -- procurar em 19 capítulos qual deles tem texto — a dívida do §2 que este repo já pagou
  -- duas vezes.
  SELECT string_agg(DISTINCT capitulo_chave, ', ' ORDER BY capitulo_chave)
    INTO v_ocupados
  FROM public.edital_itens
  WHERE edital_id = p_destino
    AND (p_capitulos_alvo IS NULL OR capitulo_chave = ANY (p_capitulos_alvo));

  IF v_ocupados IS NOT NULL THEN
    RAISE EXCEPTION 'Estes capítulos já têm texto redigido e não serão sobrescritos: %.', v_ocupados
      USING ERRCODE = 'EM003',
            HINT = 'Apague os artigos do capítulo antes de trazer a versão do modelo.';
  END IF;

  INSERT INTO public.edital_itens
    (edital_id, capitulo_chave, ordem, nivel, tipo, texto, ancora, quadro_fonte, created_by)
  SELECT p_destino, capitulo_chave, ordem, nivel, tipo, texto, ancora, quadro_fonte, auth.uid()
  FROM public.edital_itens
  WHERE edital_id = v_modelo
    AND (p_capitulos_alvo IS NULL OR capitulo_chave = ANY (p_capitulos_alvo));

  GET DIAGNOSTICS v_inseridos = ROW_COUNT;

  -- 🔴 NENHUMA linha de `edital_capitulos` é escrita, e isso é decisão registrada.
  --
  -- A linha de capítulo é um OVERRIDE: capítulo sem linha vale pelo padrão do catálogo. Se
  -- o modelo copiasse os overrides, ele LIGARIA `distribuicao_geografica` em todo edital
  -- novo — porque o Edital 004, que é a base do texto, tem territorialidade. Isso é
  -- exatamente o mapa carreira→funcionalidade que o usuário desmentiu em 2026-09-16: toda
  -- peculiaridade é ortogonal, e a carreira pode no máximo sugerir.
  --
  -- O modelo entrega TEXTO para todos os capítulos, inclusive os que nascem desligados. Em
  -- capítulo desligado o texto fica dormente e invisível — `analisarCapitulo` não analisa
  -- capítulo excluído —, e aparece no dia em que o autor ligar o capítulo. O CASO 8 da
  -- bateria guarda esta ausência.

  IF p_capitulos_alvo IS NULL THEN
    UPDATE public.editais
       SET modelo_aplicado_em = now(),
           modelo_versao      = v_versao
     WHERE id = p_destino;
  END IF;

  RETURN v_inseridos;
END;
$$;

REVOKE ALL ON FUNCTION public.aplicar_edital_modelo(UUID, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aplicar_edital_modelo(UUID, TEXT[]) TO authenticated, service_role;

COMMENT ON FUNCTION public.aplicar_edital_modelo(UUID, TEXT[]) IS
  'Copia os artigos do edital modelo para um edital, em uma transação. Guardas EM001-EM005.';
