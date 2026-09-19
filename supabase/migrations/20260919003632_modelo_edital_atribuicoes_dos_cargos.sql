-- ═══════════════════════════════════════════════════════════════════════════════════════
-- MODELO — capítulo `atribuicoes_dos_cargos` (rodada 5 de 19)
-- ═══════════════════════════════════════════════════════════════════════════════════════
--
-- 🔴 ESTE ARQUIVO É GERADO. A fonte é `src/lib/edital-modelo/atribuicoes-dos-cargos.ts`.
--
-- 🔴 É O PRIMEIRO CAPÍTULO EM QUE O MODELO DIVERGE DA FONTE: 4 artigos aqui contra 28 no
-- Edital 004. A razão é o tema inteiro: os 28 são atribuições de Agente Comunitário de Saúde,
-- em 24 incisos. Transcritos, todo edital novo nasceria com elas, e um edital de magistério
-- publicaria "atuar com adscrição de famílias em base territorial definida". É o defeito do
-- COREN na escala do capítulo.
--
-- O modelo leva um MOLDE de 4 artigos, que o autor duplica por cargo. A divergência está
-- declarada em `artigosNaFonte` + `porQueDiverge`, e um teste exige o par — sem ele, "divergi
-- de propósito" e "esqueci 24 artigos" seriam indistinguíveis.
--
-- ── MEDIDO: os dois cargos do MESMO documento têm formas diferentes ───────────────────
--
--   3.1. AGENTE COMUNITÁRIO DE SAÚDE     |  3.2. ATRIBUIÇÕES DO AGENTE DE COMBATE…
--        (parágrafo de descrição)        |       3.2.1. DESCRIÇÃO SINTÉTICA:
--        3.1.1. Atribuições:             |
--        I. … (24 incisos)               |
--
-- Um bloco nomeia o cargo, o outro escreve "ATRIBUIÇÕES DO"; um rotula "Atribuições:", o outro
-- "DESCRIÇÃO SINTÉTICA:". Quinto achado de copia-e-cola deste tema, e o argumento para o molde
-- ser UM só: o modelo não reproduz a inconsistência, remove.
--
-- ── 🔵 E o caso especial dos NUMERAIS ROMANOS se dissolveu ────────────────────────────
--
-- O plano previa transcrever os 24 incisos como `prosa` com o romano literal, porque `nivel 2`
-- rende LETRA. Com a lista virando `{{redigir:}}`, não há romano a transcrever — e a pergunta
-- vira em que nível o AUTOR escreve a dele. Resposta: `nivel 2`, alínea em letra, porque letra
-- é CALCULADA e romano teria de ser digitado, que é o que o módulo existe para matar.
-- ⏳ Dívida com gatilho: se um segundo capítulo precisar de romano, abrir a fatia de estilo.
-- ═══════════════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_modelo UUID;
BEGIN
  SELECT id INTO v_modelo FROM public.editais WHERE eh_modelo;
  IF v_modelo IS NULL THEN RETURN; END IF;

  IF EXISTS (SELECT 1 FROM public.edital_itens
             WHERE edital_id = v_modelo AND capitulo_chave = 'atribuicoes_dos_cargos') THEN
    RETURN;
  END IF;

  INSERT INTO public.edital_itens
    (edital_id, capitulo_chave, ordem, nivel, tipo, texto, ancora, quadro_fonte)
  VALUES
    (v_modelo, 'atribuicoes_dos_cargos', 0, 0, 'item', '**{{redigir:o nome do cargo a que este bloco se refere}}**', 'atribuicoes_por_cargo', NULL),
    (v_modelo, 'atribuicoes_dos_cargos', 1, 0, 'prosa', '{{redigir:a descrição sumária deste cargo — o que a pessoa faz, em um parágrafo, e sob quais diretrizes legais}}', NULL, NULL),
    (v_modelo, 'atribuicoes_dos_cargos', 2, 1, 'item', 'Atribuições:', NULL, NULL),
    (v_modelo, 'atribuicoes_dos_cargos', 3, 2, 'item', '{{redigir:uma atribuição do cargo — duplique esta alínea para cada atribuição, e o sistema reletra todas sozinho}}', NULL, NULL);
END $$;

-- A versão do modelo acompanha a rodada; é ela que a clonagem grava no destino.
UPDATE public.editais SET modelo_versao = '0.4' WHERE eh_modelo;
