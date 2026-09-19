-- ═══════════════════════════════════════════════════════════════════════════════════════
-- MODELO — capítulo `quadro_de_cargos` (rodada 4 de 19)
-- ═══════════════════════════════════════════════════════════════════════════════════════
--
-- 🔴 ESTE ARQUIVO É GERADO. A fonte é `src/lib/edital-modelo/quadro-de-cargos.ts`, e o bloco
-- abaixo sai de `sqlDoCapitulo("quadro_de_cargos")`. Ver `src/lib/edital-modelo/tipos.ts`.
--
-- 4 artigos, do capítulo 2 do Edital 004/2026. É o PRIMEIRO capítulo do modelo com artigo
-- `tipo = 'quadro'`: o texto é só a legenda, e a tabela nasce de `edital_cargos` na
-- renderização. A CHECK `chk_edital_item_quadro` é bicondicional, então este artigo vem com
-- `quadro_fonte` preenchido e os outros três vêm com NULL.
--
-- ── 🔴 NENHUM NÚMERO DE QUADRO, e a medição é contundente ─────────────────────────────
--
--        | Quadro I | Quadro II   | Quadro III
--   002  | cargos   | provas      | títulos
--   003  | cargos   | provas      | —
--   004  | cargos   | vagas UBSF  | vagas do 2º cargo
--
-- O mesmo número designa coisas diferentes em editais diferentes. E o 004 vai além: chama de
-- "Quadro II" TANTO as vagas de ACS (item 5.1.2) QUANTO a tabela de composição da prova —
-- dois quadros com o mesmo número no mesmo documento publicado. Por isso a legenda aqui não
-- tem número, e quem aponta para o quadro referencia o CAPÍTULO, cujo número é calculado.
--
-- ── O vencimento NÃO entra em prosa ──────────────────────────────────────────────────
--
-- O item 2.4 do 004 escreve "O vencimento é de R$ 3.036,00" — e só funciona porque os dois
-- cargos daquele edital têm o mesmo valor. Aqui o artigo aponta para o quadro, e a lista de
-- vantagens (específica da carreira: insalubridade na saúde, FUNDEB no magistério) virou
-- `{{redigir:}}`, que o linter cobra como erro.
--
-- ── A territorialidade se AUTODENUNCIA ───────────────────────────────────────────────
--
-- Os artigos 2 e 3 referenciam `{{cap:distribuicao_geografica}}`. Com aquele capítulo
-- desligado, o linter acusa `referencia-a-capitulo-excluido` como ERRO — o artigo diz sozinho
-- que está fora de lugar, em vez de sair publicado em silêncio. O modelo não precisa de
-- "artigo condicional" para isso.
-- ═══════════════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_modelo UUID;
BEGIN
  SELECT id INTO v_modelo FROM public.editais WHERE eh_modelo;
  IF v_modelo IS NULL THEN RETURN; END IF;

  IF EXISTS (SELECT 1 FROM public.edital_itens
             WHERE edital_id = v_modelo AND capitulo_chave = 'quadro_de_cargos') THEN
    RETURN;
  END IF;

  INSERT INTO public.edital_itens
    (edital_id, capitulo_chave, ordem, nivel, tipo, texto, ancora, quadro_fonte)
  VALUES
    (v_modelo, 'quadro_de_cargos', 0, 0, 'quadro', 'Do cargo, habilitação, carga horária e vencimentos:', 'quadro_dos_cargos', 'cargos'),
    (v_modelo, 'quadro_de_cargos', 1, 0, 'item', 'O número de vagas oferecidas por unidade está descrito no capítulo {{cap:distribuicao_geografica}}.', NULL, NULL),
    (v_modelo, 'quadro_de_cargos', 2, 0, 'item', 'Para os cargos com restrição territorial, o candidato só poderá concorrer **à vaga da unidade correspondente à sua área de residência**, devendo comprovar o domicílio fixo na localidade **desde a data de publicação deste Edital**, conforme as delimitações territoriais indicadas no capítulo {{cap:distribuicao_geografica}}.', NULL, NULL),
    (v_modelo, 'quadro_de_cargos', 3, 0, 'item', 'O vencimento de cada cargo é o indicado no quadro deste capítulo, acrescido de {{redigir:as vantagens que este certame oferece — auxílio alimentação, gratificação social, adicionais por titulação ou insalubridade, triênio e demais gratificações previstas em lei, com os respectivos valores ou percentuais}}.', NULL, NULL);
END $$;
