-- ═══════════════════════════════════════════════════════════════════════════════════════
-- MODELO — capítulo `distribuicao_geografica` (rodada 7 de 19) — CONDICIONAL
-- ═══════════════════════════════════════════════════════════════════════════════════════
--
-- 🔴 ESTE ARQUIVO É GERADO. A fonte é `src/lib/edital-modelo/distribuicao-geografica.ts`.
--
-- ⚠️ O capítulo nasce DESLIGADO no catálogo (`padrao: false`), e é para cá que apontam as
-- referências que as rodadas 4 e 6 deixaram: com ele desligado, aquelas referências acusam
-- `referencia-a-capitulo-excluido` e os artigos territoriais se autodenunciam.
--
-- 9 artigos aqui contra 11 na fonte: a estrutura publicada é um bloco por cargo (5.1 e 5.2) e
-- o modelo não sabe quantos cargos o certame tem, então leva um bloco que o autor duplica.
--
-- ── 🔴 O SEXTO defeito medido do tema, e é o mais eloquente ────────────────────────────
--
-- O item 5.1.1 do Edital 004 diz "…foram destinadas 80 vagas … conforme subitem 5.1.2. -
-- Quadro I". E o subitem 5.1.2, na linha seguinte, se intitula "Quadro II". A mesma frase erra
-- o número do quadro que ela própria acabou de citar corretamente pelo subitem — referência
-- cruzada se contradizendo dentro de uma linha. É o argumento final para o modelo apontar para
-- ÂNCORA e CAPÍTULO, nunca para número de quadro.
--
-- ── As vagas NÃO entram em prosa ──────────────────────────────────────────────────────
--
-- O 004 escreve "80 vagas" (ACS) e "143 vagas" (ACE). São valores por cargo, e a soma deles é o
-- que o quadro de `vagas_por_area` já rende. Repetir o total em prosa cria duas fontes para o
-- mesmo número — e é assim que um edital publica 80 num lugar e 82 no quadro.
--
-- ── Correções silenciosas ─────────────────────────────────────────────────────────────
--
--   5.1.5  `USBF/USB` -> UBSF/UBS (letras trocadas, duas vezes na mesma frase)
--   5.1.5  o trecho final era agramatical: "aqueles que compreende local de divisas não seja
--          prejudicado deverá observar com atenção para não marcar outra região". Reescrito.
--   5.1.4/5.1.5  citavam "Anexo I"; o número de anexo varia entre editais (ver o backlog)
-- ═══════════════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_modelo UUID;
BEGIN
  SELECT id INTO v_modelo FROM public.editais WHERE eh_modelo;
  IF v_modelo IS NULL THEN RETURN; END IF;

  IF EXISTS (SELECT 1 FROM public.edital_itens
             WHERE edital_id = v_modelo AND capitulo_chave = 'distribuicao_geografica') THEN
    RETURN;
  END IF;

  INSERT INTO public.edital_itens
    (edital_id, capitulo_chave, ordem, nivel, tipo, texto, ancora, quadro_fonte)
  VALUES
    (v_modelo, 'distribuicao_geografica', 0, 0, 'item', '**{{redigir:o nome do cargo com restrição territorial}}**', NULL, NULL),
    (v_modelo, 'distribuicao_geografica', 1, 1, 'item', 'As vagas deste cargo estão distribuídas por unidade conforme o quadro abaixo, observadas a ampla concorrência, a reserva para pessoas com deficiência e a reserva para negros.', NULL, NULL),
    (v_modelo, 'distribuicao_geografica', 2, 1, 'quadro', 'Vagas por unidade:', NULL, 'vagas_por_area'),
    (v_modelo, 'distribuicao_geografica', 3, 0, 'prosa', 'OBS.: AC — Ampla Concorrência · PD — Pessoa com Deficiência · CN — Cotas para Negros.', NULL, NULL),
    (v_modelo, 'distribuicao_geografica', 4, 1, 'item', 'Para participar deste certame, o candidato deverá residir na área geográfica da unidade em que vai atuar, **desde a data da publicação deste Edital**.', 'residencia_na_area', NULL),
    (v_modelo, 'distribuicao_geografica', 5, 1, 'item', 'As áreas de abrangência das respectivas unidades onde deverão atuar os aprovados seguem informadas em anexo a este Edital.', 'areas_de_abrangencia', NULL),
    (v_modelo, 'distribuicao_geografica', 6, 1, 'item', 'O candidato deverá observar se sua moradia se encontra em área limítrofe ou de divisa com a unidade que selecionou, conforme o anexo de abrangência, **sendo eliminado do certame quem não cumprir este requisito**. O que vale é o local de residência do inscrito: quem mora em divisa deve conferir com atenção a unidade que marca, para não escolher outra região.', NULL, NULL),
    (v_modelo, 'distribuicao_geografica', 7, 1, 'item', 'É vedada a atuação fora da área geográfica a que se refere o subitem {{item:residencia_na_area}}.', NULL, NULL),
    (v_modelo, 'distribuicao_geografica', 8, 1, 'item', 'Caso o servidor adquira casa própria fora da área geográfica de sua atuação, será excepcionado o disposto no subitem {{item:residencia_na_area}} e mantida sua vinculação à mesma equipe em que esteja atuando, podendo ser remanejado, na forma de regulamento, para equipe atuante na área onde está localizada a casa adquirida.', NULL, NULL);
END $$;

-- A versão do modelo acompanha a rodada; é ela que a clonagem grava no destino.
UPDATE public.editais SET modelo_versao = '0.6' WHERE eh_modelo;
