-- ═══════════════════════════════════════════════════════════════════════════════════════
-- PE001 — o edital de uma prova é IMUTÁVEL depois de definido
-- ═══════════════════════════════════════════════════════════════════════════════════════
--
-- Decisão do usuário (item de backlog aberto em 2026-07-26): *"uma prova nunca pode ter
-- seu Edital modificado. O campo de vinculação ao Edital deve ser permitido apenas no
-- momento do cadastro/criação da prova"*.
--
-- POR QUE NO BANCO E NÃO SÓ NA TELA: o `ProvaDialog` deixa o campo em leitura na edição,
-- mas isso é CONVENIÊNCIA. A escrita de `provas` é PostgREST direto — um `PATCH
-- /provas?id=eq.X` com `edital_id` novo passaria pela RLS (o admin pode atualizar prova) e
-- gravaria. Regra que mora só no `if` do componente não é regra. Ver a lista de 6
-- perguntas em my_rules/estrutura/transversais/invariantes.md.
--
-- ── 🔴 A CONDIÇÃO NÃO É "edital_id mudou" — É "edital_id JÁ TINHA VALOR e mudou" ──────
--
-- Uma trava cega em `edital_id` quebraria TODO `db reset`. O backfill do `seed.pos.sql`
-- (linhas 96-99) faz exatamente isto:
--
--     UPDATE provas p SET edital_id = e.id ... WHERE p.edital_id IS NULL;
--
-- Ele reconstrói o vínculo a partir da coluna velha `prova_edital` a cada carga do dump do
-- v1, e roda DEPOIS das migrations — ou seja, com o trigger já instalado. Bloquear
-- `NULL -> valor` deixaria as provas do dump permanentemente sem edital, e o sintoma
-- apareceria como "o seed falhou", não como "o trigger está errado".
--
-- Atribuir pela primeira vez não é MODIFICAR. A regra do usuário é sobre trocar o edital
-- de uma prova que já tem um, e é só isso que o trigger recusa — incluindo o caminho de
-- volta (`valor -> NULL`), que apagaria o vínculo em silêncio.
--
-- ── MEDIDO antes de apertar (regra da casa) ──────────────────────────────────────────
--
--   banco local (cópia de produção): 2 provas, 2 com edital, 0 sem.
--   Nenhuma linha existente viola a regra — não há saneamento a fazer, e o
--   `NULL -> valor` continua aberto para o backfill.
--
-- ⚠️ `provas.edital_id` é NULLABLE de propósito (a ordem migration -> seed impede o NOT
-- NULL) e é o APP que o exige (`z.string().min(1, "Selecione um edital")`). Este trigger
-- NÃO muda isso: ele não obriga a ter edital, só congela o que já foi definido.
--
-- ⚠️ A coluna velha `prova_edital` (CHAR(30), cópia denormalizada) fica FORA desta regra,
-- de propósito. Ela é dívida de transição que o `seed.pos.sql` ainda lê, e amarrá-la aqui
-- criaria uma segunda regra sobre uma coluna que deve sumir. Consequência aceita: ela pode
-- divergir do nome real do edital — o que já era verdade, já está documentado, e é o
-- motivo de nenhum código novo poder lê-la.
-- ═══════════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.provas_recusa_trocar_edital()
RETURNS trigger
LANGUAGE plpgsql
-- SECURITY INVOKER (padrão): a regra é de COERÊNCIA, não de permissão. Ela vale para
-- qualquer um que consiga escrever na tabela, inclusive `service_role` — que é justamente
-- quem uma Edge Function ou um script usaria para contornar a tela.
SET search_path = public
AS $$
BEGIN
  IF OLD.edital_id IS NOT NULL AND NEW.edital_id IS DISTINCT FROM OLD.edital_id THEN
    RAISE EXCEPTION
      'O edital de uma prova não pode ser alterado depois da criação.'
      USING ERRCODE = 'PE001',
            HINT =
              'O vínculo com o edital é definido ao criar a prova. Se esta prova foi '
              'ligada ao edital errado, crie a prova correta no edital certo — os '
              'documentos já emitidos e a alocação leem os dados desta prova.';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.provas_recusa_trocar_edital() IS
  'PE001: recusa UPDATE que troque `provas.edital_id` quando ele JÁ TEM valor. Permite '
  'NULL -> valor de propósito — é o backfill do seed.pos.sql, que roda depois das '
  'migrations e reconstrói o vínculo a partir da coluna velha prova_edital.';

DROP TRIGGER IF EXISTS check_prova_edital_imutavel ON public.provas;

CREATE TRIGGER check_prova_edital_imutavel
  BEFORE UPDATE ON public.provas
  FOR EACH ROW
  EXECUTE FUNCTION public.provas_recusa_trocar_edital();

COMMENT ON TRIGGER check_prova_edital_imutavel ON public.provas IS
  'PE001 — o edital de uma prova é imutável depois de definido. A tela apenas reflete '
  'isso (ProvaDialog mostra o edital em leitura ao editar); a garantia é este trigger.';
