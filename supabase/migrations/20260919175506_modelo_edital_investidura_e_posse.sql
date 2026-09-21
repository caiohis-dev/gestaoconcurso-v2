-- ═══════════════════════════════════════════════════════════════════════════════════════
-- MODELO — capítulo `investidura_e_posse` (rodada 17 de 19)
-- ═══════════════════════════════════════════════════════════════════════════════════════
--
-- 🔴 ESTE ARQUIVO É GERADO. A fonte é `src/lib/edital-modelo/investidura-e-posse.ts`.
--
-- 10 artigos contra 21 elementos na fonte, e a divergência é a mais importante do tema.
--
-- ── 🔴 A LISTA DE DOCUMENTOS NÃO SE TRANSCREVE ────────────────────────────────────────
--
-- As 12 alíneas do item 15.8 são a lista de `documentos_investidura`, que tem dono
-- estruturado desde a fatia 8 e trigger `IN001` recusando conselho de classe que nenhum cargo
-- do edital exige.
--
-- ⭐ É a mesma lista que produziu o defeito de abertura deste módulo: a alínea L do Edital 004
-- exige "Certidão Nada Consta do COREN" de Agente Comunitário de Saúde, cargo de nível médio
-- sem conselho. Medido: o Edital 003 (Enfermagem) tem DOIS documentos de COREN e o 004 herdou
-- só o segundo, com o mesmo texto entre parênteses — linha copiada à mão entre documentos.
--
-- Transcrevê-las aqui reproduziria essa classe de defeito em cada edital novo, e criaria uma
-- segunda fonte para uma lista que o banco já valida. O modelo leva UM artigo de instrução,
-- nomeando a tabela. Backlog: um `quadro_fonte` para ela.
--
-- ── 🔴 O DÉCIMO TERCEIRO defeito: o documento não sabe o que ele é ────────────────────
--
-- O 15.3 fala em "Concurso Público" e o 15.9, seis linhas abaixo, em "Processo Seletivo
-- Público" — o mesmo documento, dois nomes. No capítulo 16 isso se repete oito vezes.
--
-- ── ⭐ E o 15.4 é o segundo caso que a tradução literal erraria ────────────────────────
--
-- Ele diz "conforme subitem 14.1 e estipulado no subitem 14.3". Somar um capítulo daria 15.1 e
-- 15.3 — mas o 15.3 ("a escolha de vagas obedecerá à ordem de classificação") não estipula
-- prazo nenhum. Quem estipula é o 15.5. Relido, não traduzido.
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
             WHERE edital_id = v_modelo AND capitulo_chave = 'investidura_e_posse') THEN
    RETURN;
  END IF;

  INSERT INTO public.edital_itens
    (edital_id, capitulo_chave, ordem, nivel, tipo, texto, ancora, quadro_fonte)
  VALUES
    (v_modelo, 'investidura_e_posse', 0, 0, 'item', 'Os candidatos classificados dentro do número de vagas publicadas serão convocados para a investidura no cargo a que concorreram pelo endereço eletrônico **{{campo:site_oficial}}**, de acordo com o **{{campo:orgao_demandante}}**.', 'convocacao_pelo_site', NULL),
    (v_modelo, 'investidura_e_posse', 1, 0, 'item', 'A convocação para a escolha de vagas será feita pelo **{{campo:orgao_demandante}}**, pelo endereço eletrônico **{{campo:site_oficial}}**.', NULL, NULL),
    (v_modelo, 'investidura_e_posse', 2, 0, 'item', 'A escolha de vagas obedecerá rigorosamente à ordem de classificação dos candidatos no **{{campo:natureza_juridica}}**.', NULL, NULL),
    (v_modelo, 'investidura_e_posse', 3, 0, 'item', 'Decorrido o prazo de apresentação previsto no subitem {{item:prazo_de_apresentacao}}, contado da convocação de que trata o subitem {{item:convocacao_pelo_site}}, o **{{campo:orgao_demandante}}** enviará correspondência aos candidatos que não compareceram, advertindo sobre o novo prazo de 5 (cinco) dias úteis, a partir da emissão da correspondência, para que se apresentem. Após esse período, o candidato que não comparecer será considerado desistente.', NULL, NULL),
    (v_modelo, 'investidura_e_posse', 4, 0, 'item', 'Os convocados deverão se apresentar ao **{{campo:orgao_demandante}}**, {{redigir:o endereço de atendimento do órgão demandante — não é o da entidade executora}}, nos dias úteis e em horário de funcionamento, no prazo improrrogável de **3 (três) dias úteis** a partir da data da convocação.', 'prazo_de_apresentacao', NULL),
    (v_modelo, 'investidura_e_posse', 5, 0, 'item', 'Antes da investidura no cargo, os candidatos classificados serão submetidos a **exame médico admissional**.', NULL, NULL),
    (v_modelo, 'investidura_e_posse', 6, 0, 'item', 'Encaminhado ao exame médico, o candidato terá o prazo máximo de 10 (dez) dias úteis para retornar ao **{{campo:orgao_demandante}}**, nos dias úteis e em horário de funcionamento, com o resultado do exame.', NULL, NULL),
    (v_modelo, 'investidura_e_posse', 7, 0, 'item', 'No ato da investidura, o candidato julgado **apto** no exame médico admissional deverá apresentar, além da documentação legal exigida, os seguintes documentos:', NULL, NULL),
    (v_modelo, 'investidura_e_posse', 8, 1, 'item', '{{redigir:a lista de documentos da investidura, um por linha, como cadastrada em `documentos_investidura` — inclusive os condicionais e os documentos de conselho de classe dos cargos que o exigirem}}', NULL, NULL),
    (v_modelo, 'investidura_e_posse', 9, 0, 'item', 'O candidato que não apresentar, no ato da investidura, a documentação exigida será eliminado do **{{campo:natureza_juridica}}**, e sua vaga será oferecida ao candidato imediatamente classificado.', NULL, NULL);
END $$;

-- A versão do modelo acompanha a rodada.
UPDATE public.editais SET modelo_versao = '1.0' WHERE eh_modelo;
