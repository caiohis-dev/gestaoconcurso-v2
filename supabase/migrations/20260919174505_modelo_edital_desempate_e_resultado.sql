-- ═══════════════════════════════════════════════════════════════════════════════════════
-- MODELO — capítulo `desempate_e_resultado` (rodada 16 de 19)
-- ═══════════════════════════════════════════════════════════════════════════════════════
--
-- 🔴 ESTE ARQUIVO É GERADO. A fonte é `src/lib/edital-modelo/desempate-e-resultado.ts`.
--
-- 19 artigos, sem divergência da fonte (10 itens + 6 subitens + 3 alíneas).
--
-- ── 🔴 O DÉCIMO PRIMEIRO defeito: subitem numerado com o CAPÍTULO ERRADO ──────────────
--
-- Dentro do capítulo 14, entre o 14.5 e o 14.6, há um subitem escrito "13.5.1". Não é
-- referência: é o número do próprio subitem, que pertence ao 14.5. O capítulo 11 já numerava
-- "11.8.1" um subitem do 11.10; aqui o erro trocou o capítulo inteiro.
--
-- ⭐ E o 14.6 aponta para ele PELO NÚMERO ERRADO ("o 4º quesito do subitem 13.5.1"), de modo
-- que referência e alvo são consistentes entre si e ambos errados. Documento que se contradiz
-- é detectável; este é coerente e aponta para fora do capítulo.
--
-- ── 🔴 O DÉCIMO SEGUNDO: o 14.9 publica o formulário em branco, como o 12.4 ────────────
--
-- "O Resultado Final será divulgado no dia xx..." — segunda ocorrência da mesma falha no mesmo
-- documento, com o negrito aberto no meio da data. Aqui a data vem da etapa `resultado_final`.
--
-- ── As referências deslocadas ─────────────────────────────────────────────────────────
--
--   14.3.1  "subitem 13.3"      -> 14.3     14.4  "subitem 13.2"     -> 14.2
--   14.3.2  "subitem 13.3.1"    -> 14.3.1   14.6  "subitem 13.5.1"   -> 14.5.1
--
-- ⚠️ O 14.5 ("subitens 13.2 e 13.4") é o ÚNICO que não se resolve pelo deslocamento de um
-- capítulo: a frase fala dos CRITÉRIOS aferidos, que são a idade e o jurado (14.2 e 14.3). O
-- deslocamento literal daria 14.4, que não é critério — é a regra do empate ENTRE idosos.
--
-- ⏳ A ordem de desempate por disciplina existe em `criterios_desempate`, mas não há
-- `quadro_fonte` para ela e fonte nova exige fatia nova: o subitem pede a lista por instrução,
-- nomeando a tabela. No backlog.
--
-- A guarda é `NOT EXISTS` por CAPÍTULO: a rodada entra uma vez e não sobrescreve capítulo que
-- alguém já tenha editado pela tela.
-- ═══════════════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_modelo UUID;
BEGIN
  SELECT id INTO v_modelo FROM public.editais WHERE eh_modelo;
  IF v_modelo IS NULL THEN RETURN; END IF;

  IF EXISTS (SELECT 1 FROM public.edital_itens
             WHERE edital_id = v_modelo AND capitulo_chave = 'desempate_e_resultado') THEN
    RETURN;
  END IF;

  INSERT INTO public.edital_itens
    (edital_id, capitulo_chave, ordem, nivel, tipo, texto, ancora, quadro_fonte)
  VALUES
    (v_modelo, 'desempate_e_resultado', 0, 0, 'item', 'Havendo empate na pontuação final dos candidatos, terá preferência:', NULL, NULL),
    (v_modelo, 'desempate_e_resultado', 1, 0, 'item', 'o candidato com idade igual ou superior a 60 anos até o último dia de inscrição, por aplicação do parágrafo único do artigo 27 da Lei Federal nº 10.741/2003 — Estatuto da Pessoa Idosa;', 'criterio_idoso', NULL),
    (v_modelo, 'desempate_e_resultado', 2, 0, 'item', 'o candidato que tiver exercido a função de jurado, nos termos do artigo 440 do Código de Processo Penal.', 'criterio_jurado', NULL),
    (v_modelo, 'desempate_e_resultado', 3, 1, 'item', 'Para a comprovação da função a que se refere o subitem {{item:criterio_jurado}} serão aceitos certidões, declarações, atestados ou outros documentos públicos, em original ou cópia autenticada em cartório, emitidos pelos Tribunais de Justiça estaduais e pelos Tribunais Regionais Federais do país, relativos à função de jurado, nos termos do artigo 440 do Código de Processo Penal, na redação da Lei nº 11.689/2008.', 'comprovacao_jurado', NULL),
    (v_modelo, 'desempate_e_resultado', 4, 1, 'item', 'Para a verificação do critério mencionado no subitem {{item:comprovacao_jurado}}, o candidato deverá entregar o documento comprobatório em envelope lacrado, com sua identificação e número de inscrição pelo lado de fora, pessoalmente ou por terceiro, na **{{campo:executora_endereco}}**, em {{campo:cronograma_entrega_declaracao_jurado}}, {{redigir:o horário de atendimento para a entrega — ex.: de 9h às 16h}}.', NULL, NULL),
    (v_modelo, 'desempate_e_resultado', 5, 0, 'item', 'Havendo empate entre candidatos amparados pela Lei Federal nº 10.741/2003, o critério de desempate será o mesmo aplicado aos demais candidatos, observando-se o estabelecido no subitem {{item:criterio_idoso}}.', NULL, NULL),
    (v_modelo, 'desempate_e_resultado', 6, 0, 'item', 'Aferidos os critérios de desempate previstos nos subitens {{item:criterio_idoso}} e {{item:criterio_jurado}}, a ordem de classificação do resultado final, para os candidatos de ampla concorrência e para os optantes pelas vagas reservadas, obedecerá aos critérios listados a seguir:', NULL, NULL),
    (v_modelo, 'desempate_e_resultado', 7, 1, 'item', '{{redigir:a ordem de desempate por disciplina deste certame, uma posição por linha, como cadastrada em `criterios_desempate` — a última posição costuma ser a maior idade}}', 'ordem_de_desempate', NULL),
    (v_modelo, 'desempate_e_resultado', 8, 0, 'item', 'Para fins de desempate, os candidatos que seguirem empatados até o último quesito do subitem {{item:ordem_de_desempate}} serão convocados por e-mail, antes da publicação do resultado final, para a apresentação legível da certidão de nascimento, a fim de verificar o horário do nascimento.', NULL, NULL),
    (v_modelo, 'desempate_e_resultado', 9, 1, 'item', 'O candidato convocado que não apresentar a certidão de nascimento, que a apresentar de forma ilegível ou que não preencher o horário do nascimento na ficha de inscrição terá considerada como hora de nascimento **23 horas 59 minutos e 59 segundos**.', NULL, NULL),
    (v_modelo, 'desempate_e_resultado', 10, 1, 'item', 'O candidato convocado deverá enviar a certidão de nascimento em formato PDF, de forma legível, em resposta ao e-mail de convocação, dentro do prazo estipulado na respectiva notificação.', NULL, NULL),
    (v_modelo, 'desempate_e_resultado', 11, 1, 'item', 'É de exclusiva responsabilidade do candidato o acompanhamento de sua caixa de entrada e de spam, bem como a qualidade do arquivo digitalizado enviado, não se responsabilizando a Comissão por falhas técnicas de envio, arquivos corrompidos ou mensagens não entregues.', NULL, NULL),
    (v_modelo, 'desempate_e_resultado', 12, 0, 'item', 'O desempate entre candidatos concorrentes às vagas reservadas a pessoas com deficiência obedecerá a critérios específicos, em conformidade com as **{{campo:leis_pcd}}**, quais sejam:', NULL, NULL),
    (v_modelo, 'desempate_e_resultado', 13, 2, 'item', 'ser arrimo de família;', NULL, NULL),
    (v_modelo, 'desempate_e_resultado', 14, 2, 'item', 'ter maior número de dependentes que vivam exclusivamente sob suas expensas, até o limite de 21 (vinte e um) anos;', NULL, NULL),
    (v_modelo, 'desempate_e_resultado', 15, 2, 'item', 'não ter nenhuma fonte de renda, incluindo pensões ou aposentadorias.', NULL, NULL),
    (v_modelo, 'desempate_e_resultado', 16, 0, 'item', 'Esgotados os critérios estabelecidos para as pessoas com deficiência, serão adotados os mesmos critérios para os candidatos de ampla concorrência.', NULL, NULL),
    (v_modelo, 'desempate_e_resultado', 17, 0, 'item', 'O resultado final será divulgado em {{campo:cronograma_resultado_final}}, no endereço eletrônico **{{campo:site_oficial}}**.', NULL, NULL),
    (v_modelo, 'desempate_e_resultado', 18, 0, 'item', 'Em nenhuma hipótese serão aceitos pedidos de revisão de recurso, recurso de recurso, recurso do gabarito oficial definitivo ou recurso do resultado definitivo, em qualquer das etapas, fora do prazo previsto neste Edital.', NULL, NULL);
END $$;

-- A versão do modelo acompanha a rodada.
UPDATE public.editais SET modelo_versao = '1.0' WHERE eh_modelo;
