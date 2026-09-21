-- ═══════════════════════════════════════════════════════════════════════════════════════
-- MODELO — capítulo `recursos_prova_objetiva` (rodada 15 de 19)
-- ═══════════════════════════════════════════════════════════════════════════════════════
--
-- 🔴 ESTE ARQUIVO É GERADO. A fonte é `src/lib/edital-modelo/recursos-prova-objetiva.ts`.
--
-- 35 artigos, sem divergência da fonte (25 itens + 10 alíneas, em dois blocos de cinco).
--
-- ── As cinco referências deslocadas, todas de um capítulo ─────────────────────────────
--
--   13.7   "conforme subitem 12.6"                -> 13.6 (a entrega do envelope)
--   13.8   "não cumprirem os itens 12.2 a 12.6"   -> 13.2 a 13.6
--   13.20  "os subitens 12.17, 12.18 e 12.19"     -> 13.17 a 13.19 (proibições da vista)
--
-- No capítulo 12 essas faixas são outra coisa: 12.6 é "nenhum candidato prestará o exame fora
-- do local" e 12.17 a 12.19 tratam de documento digital e de eliminação. O 13.8 é o mais
-- grave: manda indeferir recurso por descumprimento de itens que não falam de recurso.
--
-- ── 🔴 O e-mail da vista é o ÚNICO valor que o teste do modelo PROÍBE como literal ─────
--
-- `regras_vista_prova.email_solicitacao` já guarda esse endereço, e o linter o cruza com os
-- canais de inscrição (`email-da-vista-fora-dos-canais`). Literal no texto, o documento
-- publicaria um endereço e o sistema conferiria outro. O interstício de 72 horas veio junto,
-- de `intersticio_minimo_horas`.
--
-- ⚠️ Ficam literais: "01 (um) dia útil" (é o prazo que explica a data do cronograma) e o
-- horário-limite do pedido, que não tem coluna e vira `{{redigir:}}`.
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
             WHERE edital_id = v_modelo AND capitulo_chave = 'recursos_prova_objetiva') THEN
    RETURN;
  END IF;

  INSERT INTO public.edital_itens
    (edital_id, capitulo_chave, ordem, nivel, tipo, texto, ancora, quadro_fonte)
  VALUES
    (v_modelo, 'recursos_prova_objetiva', 0, 0, 'item', 'O **gabarito** da prova estará disponível no endereço eletrônico **{{campo:site_oficial}}** em {{campo:cronograma_divulgacao_gabarito}}.', NULL, NULL),
    (v_modelo, 'recursos_prova_objetiva', 1, 0, 'item', 'O candidato que se julgar prejudicado terá **um dia útil**, em {{campo:cronograma_recurso_gabarito}}, para recorrer, a contar da divulgação do gabarito de sua prova.', 'prazo_do_recurso', NULL),
    (v_modelo, 'recursos_prova_objetiva', 2, 0, 'item', 'O recurso deverá ser **individual e fundamentado**, com documentos comprobatórios devidamente identificados, que deverão ser anexados ao **Formulário de Recurso ao Gabarito da Prova**, disponível no endereço eletrônico **{{campo:site_oficial}}**.', NULL, NULL),
    (v_modelo, 'recursos_prova_objetiva', 3, 0, 'item', 'Cada Formulário de Recurso ao Gabarito da Prova deverá conter **uma única questão**; o candidato que recorrer de mais de uma questão deverá utilizar tantos formulários quantos forem necessários.', NULL, NULL),
    (v_modelo, 'recursos_prova_objetiva', 4, 0, 'item', 'Os formulários de recurso, acompanhados da fundamentação, deverão ser entregues em envelope lacrado contendo, do lado de fora, as seguintes informações:', NULL, NULL),
    (v_modelo, 'recursos_prova_objetiva', 5, 2, 'item', '**{{campo:natureza_juridica}}** para a **{{campo:orgao_demandante}}**;', NULL, NULL),
    (v_modelo, 'recursos_prova_objetiva', 6, 2, 'item', 'nome completo do candidato;', NULL, NULL),
    (v_modelo, 'recursos_prova_objetiva', 7, 2, 'item', 'cargo para o qual o candidato está concorrendo;', NULL, NULL),
    (v_modelo, 'recursos_prova_objetiva', 8, 2, 'item', 'número de inscrição;', NULL, NULL),
    (v_modelo, 'recursos_prova_objetiva', 9, 2, 'item', 'números das questões recorridas.', NULL, NULL),
    (v_modelo, 'recursos_prova_objetiva', 10, 0, 'item', 'Os documentos deverão ser entregues pelo candidato ou por terceiro, em **envelope lacrado**, na **{{campo:executora_endereco}}**, em {{campo:cronograma_recurso_gabarito}}, {{redigir:o horário de atendimento para a entrega — ex.: de 9h às 16h}}.', 'entrega_do_recurso', NULL),
    (v_modelo, 'recursos_prova_objetiva', 11, 0, 'item', 'O limite de entrega, conforme o subitem {{item:entrega_do_recurso}}, é de **{{campo:limite_envelopes}}** envelope(s) por candidato.', NULL, NULL),
    (v_modelo, 'recursos_prova_objetiva', 12, 0, 'item', 'Serão indeferidos pela Comissão do certame os recursos dos candidatos que não cumprirem os subitens {{item:prazo_do_recurso}} a {{item:entrega_do_recurso}}.', NULL, NULL),
    (v_modelo, 'recursos_prova_objetiva', 13, 0, 'item', 'Caso o recurso seja julgado procedente e acarrete a anulação de questão, o ponto correspondente será atribuído a **todos os candidatos que realizaram a prova**, independentemente de terem recorrido.', NULL, NULL),
    (v_modelo, 'recursos_prova_objetiva', 14, 0, 'item', 'Não serão aceitos documentos postados eletronicamente, via Correios ou por e-mail.', NULL, NULL),
    (v_modelo, 'recursos_prova_objetiva', 15, 0, 'item', 'O recurso julgado procedente acarretará a retificação do gabarito oficial divulgado. Nesse caso, o gabarito retificado será divulgado novamente no endereço eletrônico **{{campo:site_oficial}}**, junto com o **resultado preliminar da prova objetiva**, contendo as notas de todos os candidatos, em {{campo:cronograma_resultado_preliminar}}.', NULL, NULL),
    (v_modelo, 'recursos_prova_objetiva', 16, 0, 'item', 'O candidato que desejar contestar a nota do resultado preliminar deverá solicitar a **vista da folha de respostas** pelo e-mail **{{campo:email_vista_folha}}**, {{redigir:o horário-limite do pedido, no horário oficial de Brasília — ex.: até as 17 horas}}, em {{campo:cronograma_vista_folha_respostas}}, um dia útil após a publicação do resultado preliminar.', 'pedido_de_vista', NULL),
    (v_modelo, 'recursos_prova_objetiva', 17, 0, 'item', 'Pedidos enviados após o horário estabelecido no subitem {{item:pedido_de_vista}} serão automaticamente desconsiderados, servindo o registro de recebimento do servidor de e-mail da **{{campo:entidade_executora}}** como prova do horário de envio.', NULL, NULL),
    (v_modelo, 'recursos_prova_objetiva', 18, 0, 'item', 'Para fins de agendamento presencial, o e-mail enviado pelo candidato deverá conter:', NULL, NULL),
    (v_modelo, 'recursos_prova_objetiva', 19, 2, 'item', 'assunto: **Vista da Folha de Respostas** e o nome completo do candidato;', NULL, NULL),
    (v_modelo, 'recursos_prova_objetiva', 20, 2, 'item', 'nome completo do candidato;', NULL, NULL),
    (v_modelo, 'recursos_prova_objetiva', 21, 2, 'item', 'número de CPF;', NULL, NULL),
    (v_modelo, 'recursos_prova_objetiva', 22, 2, 'item', 'número de inscrição;', NULL, NULL),
    (v_modelo, 'recursos_prova_objetiva', 23, 2, 'item', 'cópia digitalizada de documento de identidade oficial com foto.', NULL, NULL),
    (v_modelo, 'recursos_prova_objetiva', 24, 0, 'item', 'Em resposta ao e-mail, a **{{campo:entidade_executora}}** agendará o dia e o horário para que o candidato compareça à **{{campo:executora_endereco}}**, garantido o interstício mínimo de **{{campo:intersticio_vista_horas}}** horas úteis a contar do envio da resposta de agendamento.', NULL, NULL),
    (v_modelo, 'recursos_prova_objetiva', 25, 0, 'item', 'Para a realização da vista será disponibilizada **exclusivamente a cópia da imagem impressa** da folha de respostas do candidato, permanecendo o documento original sob a guarda e a segurança da Comissão Organizadora.', NULL, NULL),
    (v_modelo, 'recursos_prova_objetiva', 26, 0, 'item', 'No momento da consulta **não será permitido** ao candidato o porte ou o uso de aparelhos celulares, tablets, relógios eletrônicos, câmeras fotográficas ou qualquer outro equipamento de gravação e imagem, bem como o uso de corretivos textuais, lápis ou borrachas.', 'proibicoes_na_vista', NULL),
    (v_modelo, 'recursos_prova_objetiva', 27, 0, 'item', 'Os aparelhos eletrônicos deverão permanecer **desligados e guardados** no interior de bolsas ou mochilas do candidato, mantidas afastadas da mesa de atendimento durante todo o período da vista.', NULL, NULL),
    (v_modelo, 'recursos_prova_objetiva', 28, 0, 'item', 'Será permitida apenas a utilização de papel em branco e de caneta esferográfica de material transparente, com tinta azul ou preta, para anotações que subsidiarão o respectivo recurso.', 'material_na_vista', NULL),
    (v_modelo, 'recursos_prova_objetiva', 29, 0, 'item', 'O descumprimento de qualquer das proibições previstas nos subitens {{item:proibicoes_na_vista}} a {{item:material_na_vista}} acarretará o encerramento imediato do atendimento e o respectivo registro no Termo de Visita, mantendo-se o resultado preliminar.', NULL, NULL),
    (v_modelo, 'recursos_prova_objetiva', 30, 0, 'item', 'A vista da folha de respostas será realizada presencialmente, de forma assistida, pela Comissão do certame.', NULL, NULL),
    (v_modelo, 'recursos_prova_objetiva', 31, 0, 'item', 'Todo o procedimento de vista será registrado no **Termo de Visita** pela Comissão, fazendo-se constar as eventuais contestações apontadas pelo candidato ou por seu procurador, ou a expressa concordância com a nota apresentada, sendo o documento assinado por ambas as partes ao final do atendimento.', NULL, NULL),
    (v_modelo, 'recursos_prova_objetiva', 32, 0, 'item', 'Para a realização da vista, o candidato ou seu procurador deverá portar documento de identidade original com foto; no caso de procurador, também procuração simples e o documento de identidade original deste.', NULL, NULL),
    (v_modelo, 'recursos_prova_objetiva', 33, 0, 'item', 'O não comparecimento do candidato ou de seu procurador no dia e horário agendados implicará a perda do direito à vista presencial e a **preclusão do direito de recorrer** contra a nota da prova objetiva.', NULL, NULL),
    (v_modelo, 'recursos_prova_objetiva', 34, 0, 'item', 'O resultado da análise das contestações registradas nos Termos de Visita será divulgado no endereço eletrônico **{{campo:site_oficial}}** em {{campo:cronograma_resultado_final}}, contendo exclusivamente o número de inscrição dos candidatos que apresentaram contestação e o respectivo status do pedido, deferido ou indeferido, junto com o resultado final do certame.', NULL, NULL);
END $$;

-- A versão do modelo acompanha a rodada.
UPDATE public.editais SET modelo_versao = '1.0' WHERE eh_modelo;
