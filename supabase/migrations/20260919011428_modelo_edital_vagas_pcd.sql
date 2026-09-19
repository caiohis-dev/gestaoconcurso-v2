-- ═══════════════════════════════════════════════════════════════════════════════════════
-- MODELO — capítulo `vagas_pcd` (rodada 10 de 19)
-- ═══════════════════════════════════════════════════════════════════════════════════════
--
-- 🔴 ESTE ARQUIVO É GERADO. A fonte é `src/lib/edital-modelo/vagas-pcd.ts`.
--
-- 43 artigos, e é o maior capítulo transcrito SEM divergência: cada elemento do publicado tem um
-- artigo aqui (27 itens + 5 subitens + 10 alíneas em MAIÚSCULA + a linha do envelope, sem número).
--
-- ── ⚠️ ESTE CAPÍTULO CORRIGIU A MEDIÇÃO DO TEMA INTEIRO ────────────────────────────────
--
-- Minha contagem original dava 27 elementos para ele. São 43: faltavam os 5 subitens (8.4.1,
-- 8.4.2, 8.5.1, 8.6.1, 8.10.1 — a fonte os escreve SEM indentação, e a regex exigia espaço à
-- esquerda), as 10 alíneas em maiúscula e a linha do envelope.
--
-- Remedido o documento inteiro, o total passou de ~334 para 381 elementos. A tabela corrigida
-- está no doc do módulo. Nenhuma rodada anterior ficou errada: as diferenças começam no capítulo
-- 7, e ali a contagem já havia sido refeita à mão.
--
-- ── Cinco referências deslocadas, e uma se denuncia pela palavra "acima" ───────────────
--
--   8.11  "itens D, E e F, do subitem 7.9. ACIMA"  -> 8.9  (a palavra prova a auto-referência)
--   8.13  "conforme subitem 7.12"                  -> 8.12
--   8.15  "deverá ler o item 10. e seus subitens"  -> capítulo 11 (condições especiais)
--   8.16  "subitens 7.4. a 7.9"                    -> 8.4 a 8.9
--   8.26  "data descrita no subitem 7.12"          -> 8.12
--
-- ⚠️ As outras seis referências do capítulo estão CORRETAS — é a melhor taxa de acerto até agora,
-- e mostra que o deslocamento atinge o que foi copiado, não o que foi escrito ali.
--
-- ── Quatro valores que já tinham coluna, e viraram campo ──────────────────────────────
--
--   "10% (dez por cento)"                   -> regras_pcd.percentual_reserva
--   "Leis Municipais 3.113/94 e 3.221/95"   -> regras_pcd.leis_base
--   "últimos 06 (seis) meses"               -> regras_pcd.validade_meses_laudo_temporario
--   "Rua 33, nº 133 … Saúde do Trabalhador" -> regras_pcd.local_pericia
--
-- 🔴 O percentual é o mais importante: `src/lib/edital-cotas.ts` CALCULA a reserva a partir dele.
-- Literal no texto, o documento diria 10% enquanto o Quadro I distribuiria por outro percentual,
-- e ninguém notaria.
--
-- ⚠️ "Concurso Público" aparece em quatro artigos de um edital que é PROCESSO SELETIVO.
-- ═══════════════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_modelo UUID;
BEGIN
  SELECT id INTO v_modelo FROM public.editais WHERE eh_modelo;
  IF v_modelo IS NULL THEN RETURN; END IF;

  IF EXISTS (SELECT 1 FROM public.edital_itens
             WHERE edital_id = v_modelo AND capitulo_chave = 'vagas_pcd') THEN
    RETURN;
  END IF;

  INSERT INTO public.edital_itens
    (edital_id, capitulo_chave, ordem, nivel, tipo, texto, ancora, quadro_fonte)
  VALUES
    (v_modelo, 'vagas_pcd', 0, 0, 'item', 'Em cumprimento às **{{campo:leis_pcd}}**, fica reservado aos candidatos com deficiência o percentual de **{{campo:percentual_pcd}}** do total de vagas por cargo.', 'reserva_pcd', NULL),
    (v_modelo, 'vagas_pcd', 1, 0, 'item', 'O candidato que for concorrer às vagas para candidato com deficiência deverá marcar na ficha de inscrição sua opção como concorrente a essas vagas.', NULL, NULL),
    (v_modelo, 'vagas_pcd', 2, 0, 'item', 'O candidato com deficiência deverá tomar conhecimento da síntese das atribuições do cargo, explícitas no capítulo {{cap:atribuicoes_dos_cargos}}, antes de realizar sua Inscrição. Julgando-se em condições, poderá concorrer, sob sua inteira responsabilidade, às vagas que lhe são reservadas.', NULL, NULL),
    (v_modelo, 'vagas_pcd', 3, 0, 'item', 'Em estrito cumprimento à legislação do Estado do Rio de Janeiro (Lei nº 9.425/2021 e Lei nº 10.186/2023) e à legislação municipal, os laudos médicos que atestem deficiências físicas, sensoriais, mentais ou intelectuais de caráter **IRREVERSÍVEL** (permanentes), bem como o Transtorno do Espectro Autista (TEA) e a Síndrome de Down, serão aceitos por prazo **INDETERMINADO**, não sendo recusados sob alegação de desatualização ou decurso de tempo.', 'laudo_medico_pcd', NULL),
    (v_modelo, 'vagas_pcd', 4, 1, 'item', 'Para as deficiências de caráter **REVERSÍVEL** (temporárias), somente serão considerados válidos os laudos médicos emitidos nos últimos **{{campo:validade_laudo_temporario_meses}}** meses anteriores ao último dia do período de inscrições.', NULL, NULL),
    (v_modelo, 'vagas_pcd', 5, 1, 'item', 'Junto ao laudo médico, o candidato que deseja concorrer às vagas reservadas deverá entregar, obrigatoriamente, cópia de seu documento oficial de identidade e do CPF.', NULL, NULL),
    (v_modelo, 'vagas_pcd', 6, 0, 'item', 'No caso de candidato que pretenda concorrer às vagas reservadas em razão de deficiência auditiva, o laudo solicitado no subitem {{item:laudo_medico_pcd}} deverá ser acompanhado do respectivo exame de audiometria.', NULL, NULL),
    (v_modelo, 'vagas_pcd', 7, 1, 'item', 'O exame de audiometria observará as mesmas regras de validade temporal previstas nos subitens do {{item:laudo_medico_pcd}}, sendo aceito por prazo indeterminado se atestar perda auditiva bilateral de caráter estritamente irreversível e permanente.', NULL, NULL),
    (v_modelo, 'vagas_pcd', 8, 0, 'item', 'No caso de candidato que pretenda concorrer às vagas reservadas em razão de deficiência visual, o laudo solicitado no subitem {{item:laudo_medico_pcd}} deverá ser acompanhado de exame de acuidade visual em ambos os olhos, patologia e campo visual.', NULL, NULL),
    (v_modelo, 'vagas_pcd', 9, 1, 'item', 'O exame visual observará as mesmas regras de validade temporal previstas nos subitens do {{item:laudo_medico_pcd}}, sendo dispensada a atualidade caso comprove condição de cegueira ou baixa visão de caráter estritamente irreversível e permanente.', NULL, NULL),
    (v_modelo, 'vagas_pcd', 10, 0, 'item', 'De acordo com as **{{campo:leis_pcd}}**, o médico designado pelo órgão municipal de saúde examinará o laudo médico apresentado, conforme o subitem {{item:laudo_medico_pcd}} e seguintes, a fim de atestar, sob pena de responsabilidade, a aptidão do candidato.', NULL, NULL),
    (v_modelo, 'vagas_pcd', 11, 0, 'item', 'Para retirar seu atestado, o candidato com deficiência deverá comparecer a **{{campo:local_pericia}}** em um dos seguintes dias: {{campo:cronograma_retirada_atestado_pcd}}, para avaliação médica, {{redigir:o horário de atendimento da perícia}}, portando o laudo médico estabelecido.', NULL, NULL),
    (v_modelo, 'vagas_pcd', 12, 0, 'item', 'Para efeito de cumprimento às **{{campo:leis_pcd}}**, o candidato com deficiência deverá entregar à **{{campo:entidade_executora}}**, em envelope lacrado, os documentos e informações listados a seguir, sendo obrigatória a inclusão do comprovante de inscrição e do atestado original expedido pelo órgão municipal de saúde:', 'documentos_pcd', NULL),
    (v_modelo, 'vagas_pcd', 13, 2, 'item', 'atestado médico do órgão municipal de saúde (documento original obrigatório);', NULL, NULL),
    (v_modelo, 'vagas_pcd', 14, 2, 'item', 'comprovante de inscrição (obrigatório);', NULL, NULL),
    (v_modelo, 'vagas_pcd', 15, 2, 'item', 'fotocópia do documento oficial de identificação com foto e do CPF (obrigatório);', NULL, NULL),
    (v_modelo, 'vagas_pcd', 16, 2, 'item', 'comprovante de ser arrimo de família, quando for o caso (para efeito de desempate);', NULL, NULL),
    (v_modelo, 'vagas_pcd', 17, 2, 'item', 'número de dependentes menores de 21 anos que vivem às suas expensas (para efeito de desempate);', NULL, NULL),
    (v_modelo, 'vagas_pcd', 18, 2, 'item', 'comprovação de que não possui qualquer fonte de renda (para efeito de desempate).', NULL, NULL),
    (v_modelo, 'vagas_pcd', 19, 0, 'item', 'Toda a documentação inserida no envelope lacrado, conforme o subitem {{item:documentos_pcd}}, deverá obrigatoriamente ser rubricada ou assinada pelo próprio candidato em **todas as suas folhas**, devendo a assinatura ser idêntica àquela constante no documento oficial de identificação com foto enviado.', 'rubrica_das_folhas', NULL),
    (v_modelo, 'vagas_pcd', 20, 1, 'item', 'A ausência de assinatura ou rubrica do candidato em qualquer um dos documentos exigidos para a comprovação da deficiência (laudo, exames ou cópias de documentos pessoais) resultará na **invalidação imediata de toda a documentação apresentada** e no consequente indeferimento da inscrição para as vagas reservadas, não sendo admitida a regularização posterior ou a juntada de assinaturas após o encerramento do prazo de entrega.', NULL, NULL),
    (v_modelo, 'vagas_pcd', 21, 0, 'item', 'O candidato que não apresentar a documentação referida nas últimas alíneas do subitem {{item:documentos_pcd}} não se beneficiará das prerrogativas das **{{campo:leis_pcd}}** para o caso de critérios de desempate no resultado final.', NULL, NULL),
    (v_modelo, 'vagas_pcd', 22, 0, 'item', 'Toda a documentação que acompanha o atestado médico deverá ser rubricada ou assinada pelo candidato, conforme o subitem {{item:rubrica_das_folhas}}, e entregue em envelope lacrado, diretamente pelo candidato ou por terceiro, contendo na parte de fora do envelope os seguintes dados:', 'entrega_pcd', NULL),
    (v_modelo, 'vagas_pcd', 23, 2, 'item', '**{{campo:natureza_juridica}}** para a **{{campo:orgao_demandante}}**;', NULL, NULL),
    (v_modelo, 'vagas_pcd', 24, 2, 'item', 'Referência: **CANDIDATO COM DEFICIÊNCIA**;', NULL, NULL),
    (v_modelo, 'vagas_pcd', 25, 2, 'item', 'nome completo e número de inscrição do candidato;', NULL, NULL),
    (v_modelo, 'vagas_pcd', 26, 2, 'item', 'cargo para o qual o candidato está concorrendo.', NULL, NULL),
    (v_modelo, 'vagas_pcd', 27, 0, 'prosa', 'O envelope deverá ser entregue na **{{campo:executora_endereco}}**, em {{campo:cronograma_entrega_atestado_pcd}}, {{redigir:o horário de atendimento para a entrega}}.', NULL, NULL),
    (v_modelo, 'vagas_pcd', 28, 0, 'item', 'O limite de entrega, conforme o subitem {{item:entrega_pcd}}, é de **{{campo:limite_envelopes}}** envelope(s) por candidato.', NULL, NULL),
    (v_modelo, 'vagas_pcd', 29, 0, 'item', 'O candidato que não entregar o atestado médico na data prevista não concorrerá às vagas reservadas, passando a participar do certame como candidato à Ampla Concorrência.', NULL, NULL),
    (v_modelo, 'vagas_pcd', 30, 0, 'item', 'O candidato com deficiência que precisar de atendimento especial no dia da prova deverá observar o capítulo {{cap:condicoes_especiais_prova}}.', NULL, NULL),
    (v_modelo, 'vagas_pcd', 31, 0, 'item', 'O candidato com deficiência que fizer sua Inscrição e não atender às exigências tratadas no subitem {{item:laudo_medico_pcd}} e seguintes participará do **{{campo:natureza_juridica}}** como candidato de Ampla Concorrência e não poderá alegar, posteriormente, sua condição para reivindicar a prerrogativa legal.', NULL, NULL),
    (v_modelo, 'vagas_pcd', 32, 0, 'item', 'Na falta do atestado médico, o candidato perderá o direito de concorrer às vagas destinadas, neste Edital, aos candidatos com deficiência.', NULL, NULL),
    (v_modelo, 'vagas_pcd', 33, 0, 'item', 'O atestado médico mencionado no subitem {{item:documentos_pcd}} terá validade somente para este **{{campo:natureza_juridica}}** e não será devolvido, ficando a sua guarda sob a responsabilidade da **{{campo:entidade_executora}}**.', NULL, NULL),
    (v_modelo, 'vagas_pcd', 34, 0, 'item', 'O candidato com deficiência participará deste **{{campo:natureza_juridica}}** em igualdade de condições com os demais candidatos, no que se refere ao processo de avaliação através de provas previsto neste Edital.', NULL, NULL),
    (v_modelo, 'vagas_pcd', 35, 0, 'item', 'Os candidatos com deficiência, se classificados, além de figurarem na lista geral de classificação, terão seus nomes publicados em relação à parte.', NULL, NULL),
    (v_modelo, 'vagas_pcd', 36, 0, 'item', 'No caso de o candidato com deficiência ter conseguido se classificar para as vagas oferecidas na Ampla Concorrência, seu nome constará apenas da listagem geral, não sendo necessária a divulgação em lista separada.', NULL, NULL),
    (v_modelo, 'vagas_pcd', 37, 0, 'item', 'As vagas para os candidatos com deficiência que não forem providas por falta de candidato serão preenchidas pelos demais candidatos, observada a rigorosa ordem de classificação.', NULL, NULL),
    (v_modelo, 'vagas_pcd', 38, 0, 'item', 'É de inteira responsabilidade do candidato acompanhar a publicação dos atos relativos a este certame, bem como de eventuais retificações do Edital que, se houver, serão divulgadas no endereço eletrônico **{{campo:site_oficial}}**.', NULL, NULL),
    (v_modelo, 'vagas_pcd', 39, 0, 'item', 'O candidato com deficiência que entregar seus documentos, mas não marcar na ficha de inscrição que está concorrendo às vagas reservadas, concorrerá apenas às vagas da Ampla Concorrência.', NULL, NULL),
    (v_modelo, 'vagas_pcd', 40, 0, 'item', 'O candidato com deficiência que não entregar seus documentos, mas marcar na ficha de inscrição que está concorrendo às vagas reservadas, concorrerá apenas às vagas da Ampla Concorrência.', NULL, NULL),
    (v_modelo, 'vagas_pcd', 41, 0, 'item', 'Não será aceita a entrega condicional ou a complementação de documentos após a data descrita no subitem {{item:entrega_pcd}}.', NULL, NULL),
    (v_modelo, 'vagas_pcd', 42, 0, 'item', 'Não serão aceitos documentos postados eletronicamente, via Correios ou por e-mail.', NULL, NULL);
END $$;

-- A versão do modelo acompanha a rodada.
UPDATE public.editais SET modelo_versao = '0.9' WHERE eh_modelo;
