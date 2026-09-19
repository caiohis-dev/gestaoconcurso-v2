-- ═══════════════════════════════════════════════════════════════════════════════════════
-- MODELO — capítulo `inscricao_e_pagamento` (rodada 8 de 19) — o MAIOR do documento
-- ═══════════════════════════════════════════════════════════════════════════════════════
--
-- 🔴 ESTE ARQUIVO É GERADO. A fonte é `src/lib/edital-modelo/inscricao-e-pagamento.ts`.
--
-- 38 artigos aqui contra 39 na fonte: a lista de taxas por cargo (2 alíneas no 004, uma por
-- cargo) virou um molde de 1 alínea.
--
-- ── 🔴 O SÉTIMO achado, e o primeiro no nível de CAPÍTULO ─────────────────────────────
--
-- Três referências deste capítulo apontam para o capítulo errado, todas pelo mesmo
-- deslocamento de um:
--
--   publicado  | manda ver              | o assunto está no capítulo
--   6.31       | "Item 10 deste Edital" | 11 (condições especiais)
--   6.32 a)    | "Item 7. deste Edital" | 8  (vagas PCD)
--   6.32 b)    | "Item 10 deste Edital" | 11 (condições especiais)
--
-- Mais duas de item: o 6.1 manda ver "subitens 6.8 a 6.13" (que tratam de ficha e boleto, não
-- de isenção — o assunto está no capítulo 7), e o 6.35 manda ver "subitens 13.3" (jurado, que
-- está no capítulo 14).
--
-- É o mesmo deslocamento do Edital 002 — onde isenção é 6, PCD é 7 e condições especiais é 10
-- —, agora provado também no nível de capítulo. As cinco foram REAPONTADAS para o alvo real,
-- não traduzidas.
--
-- ── A taxa por cargo, e a substituição de uma decisão do plano ────────────────────────
--
-- O item 6.23 publica "O valor do boleto será: a) Cargo - R$ 80,00 / b) Cargo - R$ 80,00". O
-- modelo leva o caput mais UMA alínea-molde com `{{redigir:}}`.
--
-- 🔵 Isto SUBSTITUI a decisão original do plano, que previa `[ ]` vazio apanhado pela regra
-- `placeholder-nao-preenchido`. O `{{redigir:}}` faz o mesmo trabalho e DIZ o que escrever —
-- era a única coisa que faltava ao `[ ]`.
--
-- ⏳ `edital_cargos.taxa_inscricao` já existe, então a lista de taxas é candidata a
-- `quadro_fonte: 'taxas'`. Acrescentar valor ao domínio da CHECK sem renderizador faz o artigo
-- cair no ramo "fonte desconhecida" — tabela nova exige fatia nova.
--
-- ── O posto presencial ────────────────────────────────────────────────────────────────
--
-- O item 6.9 dá endereço e horário do posto de atendimento. Isso mora em
-- `edital_canais_atendimento`, que é COLEÇÃO — não há marcador escalar para coleção, e o
-- endereço aparece uma vez. Vira `{{redigir:}}`.
-- ═══════════════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_modelo UUID;
BEGIN
  SELECT id INTO v_modelo FROM public.editais WHERE eh_modelo;
  IF v_modelo IS NULL THEN RETURN; END IF;

  IF EXISTS (SELECT 1 FROM public.edital_itens
             WHERE edital_id = v_modelo AND capitulo_chave = 'inscricao_e_pagamento') THEN
    RETURN;
  END IF;

  INSERT INTO public.edital_itens
    (edital_id, capitulo_chave, ordem, nivel, tipo, texto, ancora, quadro_fonte)
  VALUES
    (v_modelo, 'inscricao_e_pagamento', 0, 0, 'item', 'Antes de proceder à Inscrição, o candidato que desejar isenção da taxa deverá aguardar o resultado do seu pedido, conforme o capítulo {{cap:isencao_taxa}}.', NULL, NULL),
    (v_modelo, 'inscricao_e_pagamento', 1, 0, 'item', 'Antes de realizar a Inscrição, o candidato deverá conhecer o Edital e certificar-se de que preenche todos os requisitos exigidos para o cargo.', NULL, NULL),
    (v_modelo, 'inscricao_e_pagamento', 2, 0, 'item', 'As inscrições serão realizadas através da Ficha de Inscrição Eletrônica, disponibilizada no endereço eletrônico **{{campo:site_oficial}}**, no período de {{campo:cronograma_inscricoes}}.', 'ficha_de_inscricao', NULL),
    (v_modelo, 'inscricao_e_pagamento', 3, 0, 'item', 'O candidato deverá realizar sua inscrição via internet, acessando o endereço eletrônico **{{campo:site_oficial}}**, {{redigir:o horário de abertura e de encerramento das inscrições — ex.: das 12 horas do primeiro dia até as 12 horas do último}}.', NULL, NULL),
    (v_modelo, 'inscricao_e_pagamento', 4, 0, 'item', 'O candidato deverá preencher sua Ficha de Inscrição Eletrônica e, antes de enviá-la pela internet, conferir se todos os seus dados (nome, data de nascimento, CPF e outros) estão corretos, pois não poderá haver discordância entre os dados apresentados na Ficha e no boleto de pagamento. Havendo discordância, não caberá recurso e o candidato deverá fazer nova Inscrição dentro do prazo estipulado neste Edital.', NULL, NULL),
    (v_modelo, 'inscricao_e_pagamento', 5, 0, 'item', 'A Ficha de Inscrição deverá ser preenchida exclusivamente com os dados do candidato, o qual assume total responsabilidade pelas informações prestadas, arcando com as consequências de eventuais erros e omissões no preenchimento.', NULL, NULL),
    (v_modelo, 'inscricao_e_pagamento', 6, 0, 'item', 'A **{{campo:entidade_executora}}** não se responsabiliza, quando os motivos de ordem técnica não lhe forem imputáveis, por inscrições não recebidas, falhas de comunicação, erro ou atraso de bancos ou entidades conveniadas, aparelhos incompatíveis, congestionamento nas linhas de transmissão, falhas de impressão, problemas de ordem técnica nos computadores utilizados pelos candidatos, bem como por outros fatores que impossibilitem a transferência dos dados e a impressão do boleto bancário.', NULL, NULL),
    (v_modelo, 'inscricao_e_pagamento', 7, 0, 'item', 'O envio da Ficha de Inscrição Eletrônica implicará o conhecimento e a aceitação tácita das normas e condições estabelecidas neste Edital, em relação às quais o candidato não poderá alegar desconhecimento.', NULL, NULL),
    (v_modelo, 'inscricao_e_pagamento', 8, 0, 'item', 'No caso de dificuldade de acesso à internet, os candidatos poderão realizar suas inscrições {{redigir:o posto de atendimento presencial — endereço completo e horário de funcionamento}}, durante o período de Inscrição.', NULL, NULL),
    (v_modelo, 'inscricao_e_pagamento', 9, 0, 'item', 'Não se exigirá cópia de nenhum documento no ato do preenchimento da Ficha de Inscrição Eletrônica. A veracidade das informações apresentadas é de exclusiva responsabilidade do candidato.', NULL, NULL),
    (v_modelo, 'inscricao_e_pagamento', 10, 0, 'item', 'Após fazer a Inscrição, o candidato deverá gerar e imprimir o boleto bancário para pagamento da Taxa de Inscrição.', NULL, NULL),
    (v_modelo, 'inscricao_e_pagamento', 11, 0, 'item', 'A **{{campo:entidade_executora}}** não se responsabiliza por inscrições pagas duplamente.', NULL, NULL),
    (v_modelo, 'inscricao_e_pagamento', 12, 0, 'item', 'Uma vez impresso o boleto bancário, o candidato deverá efetuar o pagamento do valor da Taxa de Inscrição até {{campo:cronograma_pagamento_boleto}}, preferencialmente em qualquer casa lotérica.', NULL, NULL),
    (v_modelo, 'inscricao_e_pagamento', 13, 0, 'item', 'Não serão aceitos os pagamentos das inscrições por depósito em caixa eletrônico, cartão de crédito, via postal, transferência bancária por chave PIX, ordem de pagamento, condicionais e/ou extemporâneas, ou por qualquer outra via que não as especificadas neste Edital.', NULL, NULL),
    (v_modelo, 'inscricao_e_pagamento', 14, 0, 'item', 'O pagamento da Taxa de Inscrição, por si só, não confere ao candidato o direito de submeter-se às etapas deste certame. Será necessária a confirmação da Inscrição para que ela seja validada.', NULL, NULL),
    (v_modelo, 'inscricao_e_pagamento', 15, 0, 'item', 'A impressão do boleto bancário, ou de sua segunda via, é de exclusiva responsabilidade do candidato, eximindo-se a **{{campo:entidade_executora}}** de eventuais dificuldades na leitura do código de barras e da consequente impossibilidade de efetivação da Inscrição.', NULL, NULL),
    (v_modelo, 'inscricao_e_pagamento', 16, 0, 'item', 'A Inscrição somente será processada e validada após a confirmação, pela instituição bancária, do pagamento do valor da Taxa de Inscrição concernente ao candidato, sendo automaticamente cancelada a Ficha de Inscrição Eletrônica cujo pagamento não for comprovado.', NULL, NULL),
    (v_modelo, 'inscricao_e_pagamento', 17, 0, 'item', 'Serão tornadas sem efeito as inscrições cujos pagamentos forem efetuados após a data estabelecida, não sendo devido ao candidato qualquer ressarcimento da importância paga fora do prazo, não podendo ele alegar direito de participar da prova.', NULL, NULL),
    (v_modelo, 'inscricao_e_pagamento', 18, 0, 'item', 'Só será aceita comprovação de pagamento por meio de boleto bancário.', NULL, NULL),
    (v_modelo, 'inscricao_e_pagamento', 19, 0, 'item', 'Não será aceito, como comprovação de pagamento do valor da inscrição, comprovante de agendamento bancário.', NULL, NULL),
    (v_modelo, 'inscricao_e_pagamento', 20, 0, 'item', 'É vedada a transferência do boleto pago para terceiros, para outros certames ou troca de cargos.', NULL, NULL),
    (v_modelo, 'inscricao_e_pagamento', 21, 0, 'item', 'Efetivada a inscrição, não serão aceitos pedidos para alteração de opção de cargo, podendo o candidato, por sua inteira responsabilidade, realizar nova inscrição e consequente novo pagamento, não cabendo a devolução de valores já pagos.', NULL, NULL),
    (v_modelo, 'inscricao_e_pagamento', 22, 0, 'item', 'O valor do boleto será:', 'valor_do_boleto', NULL),
    (v_modelo, 'inscricao_e_pagamento', 23, 2, 'item', '{{redigir:um cargo e o valor da taxa dele, por extenso — duplique esta alínea para cada cargo do certame}}', NULL, NULL),
    (v_modelo, 'inscricao_e_pagamento', 24, 0, 'item', 'O boleto bancário será emitido em nome do requerente e deverá ser impresso em impressora a laser ou jato de tinta, para possibilitar a correta leitura dos dados e do código de barras.', NULL, NULL),
    (v_modelo, 'inscricao_e_pagamento', 25, 0, 'item', 'O boleto somente estará apto para pagamento 1 (um) dia útil após a efetivação da Inscrição.', NULL, NULL),
    (v_modelo, 'inscricao_e_pagamento', 26, 0, 'item', 'Em caso de feriado que acarrete o fechamento de agências bancárias na localidade em que se encontra, o candidato deverá antecipar o pagamento do boleto ou realizá-lo por outro meio válido, respeitado o prazo limite determinado neste Edital.', NULL, NULL),
    (v_modelo, 'inscricao_e_pagamento', 27, 0, 'item', 'É de livre escolha e inteira responsabilidade do candidato a opção por realizar a inscrição para mais de um cargo neste certame, visto que a **{{campo:entidade_executora}}** não possui qualquer obrigação de adequar, alterar ou desmembrar os turnos e horários de aplicação das provas para viabilizar a participação do candidato em mais de um cargo, prevalecendo estritamente o cronograma oficial.', NULL, NULL),
    (v_modelo, 'inscricao_e_pagamento', 28, 0, 'item', 'Na hipótese de o candidato possuir mais de uma inscrição homologada para cargos cujas provas ocorram no mesmo turno, ele deverá optar expressamente, no momento de ingresso na sala e início da Prova Objetiva, por qual cargo deseja concorrer.', NULL, NULL),
    (v_modelo, 'inscricao_e_pagamento', 29, 0, 'item', 'O candidato será considerado, de forma automática e irrevogável, **AUSENTE** para as provas dos demais cargos para os quais se inscreveu, restando formalizada a sua desistência e eliminação sumária desses cargos no certame.', NULL, NULL),
    (v_modelo, 'inscricao_e_pagamento', 30, 0, 'item', 'Não assistirá ao candidato o direito a reclamações ou recursos posteriores, nem mesmo à devolução ou restituição de quaisquer valores pagos a título de taxa de inscrição, sob qualquer pretexto.', NULL, NULL),
    (v_modelo, 'inscricao_e_pagamento', 31, 0, 'item', 'O candidato que necessite de atendimento especializado ou condição especial para a realização da prova deverá obrigatoriamente especificar sua necessidade no ato da inscrição e entregar o laudo médico comprobatório, conforme as instruções e prazos do capítulo {{cap:condicoes_especiais_prova}}.', NULL, NULL),
    (v_modelo, 'inscricao_e_pagamento', 32, 0, 'item', 'Os candidatos que necessitarem de condições especiais ou adaptações para a realização da prova — tais como prova ampliada, ledor, auxílio para marcação da Folha de Respostas, intérprete de Libras ou local de fácil acesso — deverão seguir estritamente as regras de entrega do laudo médico comprobatório, conforme o caso:', NULL, NULL),
    (v_modelo, 'inscricao_e_pagamento', 33, 2, 'item', 'no capítulo {{cap:vagas_pcd}}, se o candidato possuir deficiência e desejar concorrer às vagas reservadas para pessoas com deficiência;', NULL, NULL),
    (v_modelo, 'inscricao_e_pagamento', 34, 2, 'item', 'no capítulo {{cap:condicoes_especiais_prova}}, se o candidato necessitar apenas do atendimento especial ou de adaptação para o dia da prova, sem concorrer às vagas reservadas para pessoas com deficiência.', NULL, NULL),
    (v_modelo, 'inscricao_e_pagamento', 35, 0, 'item', 'O atendimento especializado solicitado pelo candidato será realizado somente se não incorrer em quebra de sigilo, nem em qualquer situação que permita seu favorecimento.', NULL, NULL),
    (v_modelo, 'inscricao_e_pagamento', 36, 0, 'item', 'Os candidatos optantes por concorrer às vagas destinadas às pessoas com deficiência, bem como aqueles optantes pelas vagas destinadas aos negros, deverão declarar tal condição na Ficha de Inscrição Eletrônica, sendo vedada qualquer solicitação posterior aos prazos estabelecidos. O inscrito que não incluir esta informação no ato da Inscrição participará do certame como pleiteante às vagas destinadas à Ampla Concorrência.', 'declaracao_de_cotas', NULL),
    (v_modelo, 'inscricao_e_pagamento', 37, 0, 'item', 'O candidato que desejar usufruir da função de jurado, nos termos do artigo 440 do Código de Processo Penal, deverá atender ao disposto no capítulo {{cap:desempate_e_resultado}}.', NULL, NULL);
END $$;

-- A versão do modelo acompanha a rodada; é ela que a clonagem grava no destino.
UPDATE public.editais SET modelo_versao = '0.7' WHERE eh_modelo;
