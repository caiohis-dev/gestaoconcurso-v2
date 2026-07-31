-- ─────────────────────────────────────────────────────────────────────────────────────
-- Cargo com QUALQUER menção em outra tabela vira IMUTÁVEL: não se altera nem se exclui
-- ─────────────────────────────────────────────────────────────────────────────────────
--
-- DECISÃO DO USUÁRIO, 2026-07-31: "Cargos que tenham menção em qualquer outra tabela não
-- podem ser modificados nem deletados."
--
-- A regra mora AQUI, no banco, e não num `if` da tela: um `disabled` no botão não vale
-- para PostgREST, script nem chamada manual. A UI apenas ANTECIPA o que a barreira faz.
--
-- ── 🔴 O QUE ESTA MIGRATION CUSTA, dito por extenso ─────────────────────────────────
--
-- Ela REVERTE, na prática, o ganho central do tema Cargos (etapas 1-6, 27–29/07).
--
-- Aquele tema existiu porque os cargos chegam SUJOS da origem: medido no arquivo real,
-- **7 dos 9 cargos trazem `¿`** (travessão em dash de cp1252 lido como latin-1). A etapa 5
-- tirou o texto da identidade justamente para que corrigir esses nomes virasse um UPDATE
-- inofensivo — antes, a mesma correção criava 481 registros novos. A etapa 6 fez o efeito
-- aparecer na tela. A página `/candidatos/cargos` (30/07) foi construída para isso.
--
-- ⚠️ MEDIDO, e é a consequência que precisa estar escrita: **os 9 cargos do arquivo real
-- têm candidatos** (de 195 a 3.756). Depois da primeira importação, portanto, NENHUM
-- deles poderá ser renomeado — e os 7 `¿` ficam permanentes.
--
--     3.756  DOCENTE II
--       730  DOCENTE I ¿ EDUCAÇÃO FÍSICA      ← sujo, e agora imutável
--       650  DOCENTE I ¿ MATEMÁTICA           ← sujo, e agora imutável
--       639  DOCENTE I ¿ LÍNGUA PORTUGUESA    ← sujo, e agora imutável
--       481  DOCENTE I ¿ HISTÓRIA             ← sujo, e agora imutável
--       386  DOCENTE I ¿ CIÊNCIAS             ← sujo, e agora imutável
--       331  DOCENTE I ¿ GEOGRAFIA            ← sujo, e agora imutável
--       248  DOCENTE I ¿ LÍNGUA INGLESA       ← sujo, e agora imutável
--       195  ARTE
--
-- Isto foi apresentado ao usuário com os números acima e escolhido assim mesmo. É decisão
-- tomada, não descuido — quem for reverter precisa saber o que está revertendo, e quem
-- for mantê-la precisa saber que a janela para limpar um nome é ANTES de o cargo ter
-- qualquer menção.
--
-- ⚠️ Consequência lateral: `cargos.ativo` também fica travado em cargo com menção. A
-- coluna já não tinha consumidor; agora, quando ganhar um, ele só vai funcionar para
-- cargo sem uso.
-- ─────────────────────────────────────────────────────────────────────────────────────

-- ── 1. Excluir: os apelidos deixam de ser levados em silêncio e passam a BARRAR ──────
--
-- `cargo_apelidos.cargo_id` era ON DELETE CASCADE — e a assimetria com `candidatos`
-- (RESTRICT) era deliberada: "apelido é atalho de digitação, candidato é gente". A regra
-- nova não admite a distinção: menção é menção.
--
-- Efeito prático: um cargo cujo único vínculo é a memória de pré-preenchimento deixa de
-- ser excluível. O apelido tem de ser removido antes, à mão.
ALTER TABLE public.cargo_apelidos
  DROP CONSTRAINT IF EXISTS cargo_apelidos_cargo_id_fkey;

ALTER TABLE public.cargo_apelidos
  ADD CONSTRAINT cargo_apelidos_cargo_id_fkey
  FOREIGN KEY (cargo_id) REFERENCES public.cargos(id) ON DELETE RESTRICT;

COMMENT ON CONSTRAINT cargo_apelidos_cargo_id_fkey ON public.cargo_apelidos IS
  'RESTRICT desde 2026-07-31 (era CASCADE): pela regra de "cargo com menção é imutável", '
  'o apelido passou a BARRAR a exclusão em vez de ser apagado junto.';

-- ── 2. Alterar: o trigger que recusa UPDATE em cargo com menção ─────────────────────
--
-- ⚠️ É BEFORE UPDATE e olha OLD.id, não NEW: o que importa é o que já aponta para esta
-- linha. Não há coluna isenta — a regra é sobre a LINHA, então trocar `ativo` também é
-- recusado. Se um dia alguém quiser isentar uma coluna, o lugar é aqui, explicitamente.
CREATE OR REPLACE FUNCTION public.cargos_recusa_alterar_em_uso()
RETURNS trigger
LANGUAGE plpgsql
-- SECURITY INVOKER (o padrão): a função não precisa de privilégio nenhum além do de quem
-- já está alterando a linha. DEFINER aqui seria poder desnecessário.
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_candidatos integer;
  v_apelidos   integer;
BEGIN
  -- As duas contagens usam os índices de apoio a FK criados na etapa 1
  -- (`idx_candidatos_cargo` e `idx_cargo_apelidos_cargo`). Sem eles isto seria seq scan
  -- em `candidatos` a cada UPDATE.
  SELECT count(*) INTO v_candidatos FROM candidatos      WHERE cargo_id = OLD.id;
  SELECT count(*) INTO v_apelidos   FROM cargo_apelidos  WHERE cargo_id = OLD.id;

  IF v_candidatos > 0 OR v_apelidos > 0 THEN
    -- Barrar sem orientar só troca um problema por outro (lição da etapa 4 do roadmap de
    -- cargos): a mensagem diz O QUE menciona, QUANTO, e qual é a única saída.
    RAISE EXCEPTION
      'O cargo "%" tem menção em outra tabela (% inscrito(s), % texto(s) memorizado(s)) e não pode ser alterado. Só cargo sem nenhuma menção é editável.',
      OLD.nome, v_candidatos, v_apelidos
      USING ERRCODE = 'CG001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_cargo_nao_alteravel_em_uso ON public.cargos;
CREATE TRIGGER check_cargo_nao_alteravel_em_uso
  BEFORE UPDATE ON public.cargos
  FOR EACH ROW EXECUTE FUNCTION public.cargos_recusa_alterar_em_uso();

COMMENT ON FUNCTION public.cargos_recusa_alterar_em_uso() IS
  'Recusa UPDATE em cargo que tenha menção em candidatos ou cargo_apelidos (SQLSTATE '
  'CG001). Decisão do usuário em 2026-07-31. ⚠️ Torna PERMANENTE o nome sujo de qualquer '
  'cargo já importado — ver o cabeçalho da migration 20260731100000.';

-- ── 3. O que NÃO é afetado, e é o que mantém a importação de pé ─────────────────────
--
-- `useCriarCargo` faz `INSERT ... ON CONFLICT DO NOTHING` (upsert com ignoreDuplicates),
-- e um BEFORE UPDATE não dispara nisso. O passo 3 do assistente continua criando cargo
-- normalmente — verificado antes de escrever esta migration, varrendo os caminhos de
-- escrita em `cargos`: só existem o INSERT do criarCargo, o UPDATE do renomear e o DELETE.
