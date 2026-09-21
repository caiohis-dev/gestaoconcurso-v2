-- ═══════════════════════════════════════════════════════════════════════════════════════
-- MODELO — capítulo `disposicoes_gerais` (rodada 18 de 19)
-- ═══════════════════════════════════════════════════════════════════════════════════════
--
-- 🔴 ESTE ARQUIVO É GERADO. A fonte é `src/lib/edital-modelo/disposicoes-gerais.ts`.
--
-- 17 artigos, sem divergência da fonte (13 itens + 4 subitens).
--
-- ── 🔴 É AQUI QUE O DÉCIMO TERCEIRO DEFEITO FICA INDEFENSÁVEL ─────────────────────────
--
-- O Edital 004 é um Processo Seletivo Público. Neste capítulo ele se chama:
--
--   "Concurso Público"           nos itens 16.2, 16.6, 16.7 e 16.11
--   "Processo Seletivo (Público)" nos itens 16.5, 16.10 e 16.12
--   OS DOIS NA MESMA FRASE        no 16.3 — "O Concurso Público contará com … dentro da
--                                 validade deste Processo"
--
-- Oito ocorrências, duas naturezas, um documento só. Some por construção: o modelo escreve
-- `{{campo:natureza_juridica}}`, que vem da mesma coluna que a tela usa para tudo.
--
-- ⚠️ Ficam como `{{redigir:}}` por não terem coluna: o e-mail da impugnação (o da vista é de
-- outra finalidade e emprestá-lo mandaria o pedido para a caixa errada), o órgão oficial de
-- publicação e o endereço do órgão demandante.
--
-- A guarda é `NOT EXISTS` por CAPÍTULO.
-- ═══════════════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_modelo UUID;
BEGIN
  SELECT id INTO v_modelo FROM public.editais WHERE eh_modelo;
  IF v_modelo IS NULL THEN RETURN; END IF;

  IF EXISTS (SELECT 1 FROM public.edital_itens
             WHERE edital_id = v_modelo AND capitulo_chave = 'disposicoes_gerais') THEN
    RETURN;
  END IF;

  INSERT INTO public.edital_itens
    (edital_id, capitulo_chave, ordem, nivel, tipo, texto, ancora, quadro_fonte)
  VALUES
    (v_modelo, 'disposicoes_gerais', 0, 0, 'item', 'O candidato poderá impugnar os termos deste Edital perante a **{{campo:entidade_executora}}** no prazo de **5 (cinco) dias úteis**, contados da data de sua publicação.', 'prazo_de_impugnacao', NULL),
    (v_modelo, 'disposicoes_gerais', 1, 1, 'item', 'A impugnação deverá ser fundamentada e acompanhada de cópia do documento de identidade do impugnante, protocolada por {{redigir:o e-mail institucional para protocolo de impugnação — não é o e-mail da vista da folha de respostas}}.', NULL, NULL),
    (v_modelo, 'disposicoes_gerais', 2, 1, 'item', 'Não serão aceitas impugnações intempestivas, fora do prazo do subitem {{item:prazo_de_impugnacao}}, ou que não apresentem fundamentação lógica e jurídica.', NULL, NULL),
    (v_modelo, 'disposicoes_gerais', 3, 1, 'item', 'A decisão sobre a impugnação será divulgada oficialmente até a véspera do início das inscrições, no endereço eletrônico **{{campo:site_oficial}}**, não cabendo recurso administrativo contra tal decisão.', NULL, NULL),
    (v_modelo, 'disposicoes_gerais', 4, 1, 'item', 'Os itens deste Edital poderão sofrer eventuais retificações, atualizações ou acréscimos enquanto não consumada a providência ou o evento que lhes disser respeito.', NULL, NULL),
    (v_modelo, 'disposicoes_gerais', 5, 0, 'item', 'O **{{campo:natureza_juridica}}** terá validade de **{{campo:prazo_validade_anos}}** ano(s), a contar da data da homologação do resultado, podendo ser prorrogado por igual período, a critério do **{{campo:orgao_demandante}}**.', 'validade_do_certame', NULL),
    (v_modelo, 'disposicoes_gerais', 6, 0, 'item', 'O **{{campo:natureza_juridica}}** contará com um **cadastro de reserva** de candidatos, que poderão ser convocados de acordo com as necessidades do **{{campo:orgao_demandante}}**, dentro da validade deste certame.', NULL, NULL),
    (v_modelo, 'disposicoes_gerais', 7, 0, 'item', 'As vagas que surgirem durante o prazo previsto no subitem {{item:validade_do_certame}} serão preenchidas pelos candidatos aprovados, obedecendo-se rigorosamente à ordem de classificação.', NULL, NULL),
    (v_modelo, 'disposicoes_gerais', 8, 0, 'item', 'A aprovação no **{{campo:natureza_juridica}}** não significa contratação imediata do candidato, que só será efetivada segundo os critérios de conveniência e oportunidade do **{{campo:orgao_demandante}}**, dentro do prazo de validade da homologação.', NULL, NULL),
    (v_modelo, 'disposicoes_gerais', 9, 0, 'item', 'Serão considerados estáveis após 3 (três) anos de efetivo exercício no cargo os servidores nomeados em virtude de aprovação no **{{campo:natureza_juridica}}**, nos termos do artigo 41 da Constituição Federal.', NULL, NULL),
    (v_modelo, 'disposicoes_gerais', 10, 0, 'item', 'Será excluído do **{{campo:natureza_juridica}}** o candidato que fizer declaração falsa ou inexata na Ficha de Inscrição.', NULL, NULL),
    (v_modelo, 'disposicoes_gerais', 11, 0, 'item', 'É de exclusiva responsabilidade do candidato a atualização de seus dados pessoais junto ao **{{campo:orgao_demandante}}**.', NULL, NULL),
    (v_modelo, 'disposicoes_gerais', 12, 0, 'item', 'O candidato que necessitar alterar os dados constantes de sua ficha de inscrição, como endereço e telefone, no período de validade do **{{campo:natureza_juridica}}**, deverá entregar ao **{{campo:orgao_demandante}}**, {{redigir:o endereço de atendimento do órgão demandante — não é o da entidade executora}}, nos dias úteis e em horário de funcionamento, requerimento especificando as alterações.', NULL, NULL),
    (v_modelo, 'disposicoes_gerais', 13, 0, 'item', 'Não será fornecido ao candidato qualquer documento comprobatório de classificação ou aprovação neste **{{campo:natureza_juridica}}**, valendo para esse fim a homologação divulgada em {{redigir:o órgão oficial de publicação do município}}.', NULL, NULL),
    (v_modelo, 'disposicoes_gerais', 14, 0, 'item', 'A inscrição no **{{campo:natureza_juridica}}** implicará a plena aceitação das condições estabelecidas no presente Edital, sobre o qual nenhum candidato poderá alegar desconhecimento.', NULL, NULL),
    (v_modelo, 'disposicoes_gerais', 15, 0, 'item', 'É também de inteira responsabilidade do candidato acompanhar, no endereço eletrônico **{{campo:site_oficial}}**, a publicação de todos os atos, comunicados e termos aditivos referentes a este **{{campo:natureza_juridica}}**.', NULL, NULL),
    (v_modelo, 'disposicoes_gerais', 16, 0, 'item', 'Os casos omissos serão resolvidos pela Comissão do certame.', NULL, NULL);
END $$;

-- A versão do modelo acompanha a rodada.
UPDATE public.editais SET modelo_versao = '1.0' WHERE eh_modelo;
