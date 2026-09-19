-- ═══════════════════════════════════════════════════════════════════════════════════════
-- MODELO — capítulo `vagas_cotas_raciais` (rodada 11 de 19)
-- ═══════════════════════════════════════════════════════════════════════════════════════
--
-- 🔴 ESTE ARQUIVO É GERADO. A fonte é `src/lib/edital-modelo/vagas-cotas-raciais.ts`.
--
-- 26 artigos, sem divergência da fonte (19 itens + 1 subitem + 4 alíneas MAIÚSCULAS + 2
-- minúsculas).
--
-- ── 🔴 É O CAPÍTULO QUE MOSTRA A INCONSISTÊNCIA DE ALÍNEA DENTRO DE SI MESMO ──────────
--
-- O item 9.3 usa `a)` e `b)`; o item 9.7, quatro linhas abaixo, usa `A)` a `D)`. Minúscula e
-- maiúscula no MESMO capítulo, para a mesma função. É a forma mais crua do oitavo achado do
-- tema, e a razão de o modelo não escolher: `numerarItens` rende letra minúscula CALCULADA.
--
-- ── Seis referências deslocadas, todas para o capítulo 8 ──────────────────────────────
--
--   9.4 · 9.6 · 9.10  "subitem 8.3"            -> 9.3
--   9.8               "subitens 8.7. e 8.7.1"  -> 9.7 e 9.7.1
--   9.9               "subitens 8.2. a 8.7.1"  -> 9.2 a 9.7.1
--   9.18              "subitem 8.7.1"          -> 9.7.1
--
-- ── 🔴 E uma referência de ANEXO que aponta para o anexo errado ────────────────────────
--
-- O item 9.2 manda retirar "o formulário de autodeclaração constante do Anexo II". Mas o Edital
-- 004 tem dois anexos: Anexo I é a abrangência territorial e Anexo II é o conteúdo programático.
-- O formulário de autodeclaração NÃO É ANEXO de edital nenhum — e o Edital 003 traz a mesma
-- frase, com o mesmo número, e também não tem esse anexo. A referência foi copiada junto.
--
-- Aqui o artigo diz que o formulário está no endereço eletrônico, que é onde ele de fato está.
--
-- ── Dois valores que já tinham coluna ────────────────────────────────────────────────
--
--   "20% (vinte por cento)"        -> regras_cotas_raciais.percentual_reserva
--   "Lei Municipal nº 5.309/2017"  -> regras_cotas_raciais.lei_base
--
-- 🔴 O percentual alimenta `edital-cotas.ts`, que calcula a reserva do Quadro I. Literal no
-- texto, o documento e o quadro divergiriam em silêncio.
-- ═══════════════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_modelo UUID;
BEGIN
  SELECT id INTO v_modelo FROM public.editais WHERE eh_modelo;
  IF v_modelo IS NULL THEN RETURN; END IF;

  IF EXISTS (SELECT 1 FROM public.edital_itens
             WHERE edital_id = v_modelo AND capitulo_chave = 'vagas_cotas_raciais') THEN
    RETURN;
  END IF;

  INSERT INTO public.edital_itens
    (edital_id, capitulo_chave, ordem, nivel, tipo, texto, ancora, quadro_fonte)
  VALUES
    (v_modelo, 'vagas_cotas_raciais', 0, 0, 'item', 'Em cumprimento à **{{campo:lei_cotas_raciais}}**, fica reservado aos candidatos que queiram concorrer às cotas para negros o percentual de **{{campo:percentual_cotas_raciais}}** do total de vagas por cargo.', 'reserva_cotas', NULL),
    (v_modelo, 'vagas_cotas_raciais', 1, 0, 'item', 'O candidato que desejar concorrer às vagas reservadas às pessoas negras deverá informar, na Ficha de Inscrição Eletrônica, sua condição de pessoa negra e retirar o formulário de autodeclaração no endereço eletrônico **{{campo:site_oficial}}**.', NULL, NULL),
    (v_modelo, 'vagas_cotas_raciais', 2, 0, 'item', 'O pleiteante às vagas reservadas aos negros deverá entregar, em envelope lacrado, os seguintes documentos:', 'documentos_cotas', NULL),
    (v_modelo, 'vagas_cotas_raciais', 3, 2, 'item', 'a autodeclaração (original) de sua condição, **assinada e datada**;', NULL, NULL),
    (v_modelo, 'vagas_cotas_raciais', 4, 2, 'item', 'comprovante de inscrição, realizado após o preenchimento da Ficha de Inscrição Eletrônica neste certame.', NULL, NULL),
    (v_modelo, 'vagas_cotas_raciais', 5, 0, 'item', 'O candidato que não colocar os documentos do subitem {{item:documentos_cotas}} dentro do envelope não concorrerá às vagas de cotistas, passando a concorrer com a Ampla Concorrência.', NULL, NULL),
    (v_modelo, 'vagas_cotas_raciais', 6, 0, 'item', 'O candidato que só assinar e não datar sua autodeclaração participará do certame na Ampla Concorrência.', NULL, NULL),
    (v_modelo, 'vagas_cotas_raciais', 7, 0, 'item', 'O candidato que não anexar seu comprovante de inscrição, conforme o subitem {{item:documentos_cotas}}, participará do certame na Ampla Concorrência.', NULL, NULL),
    (v_modelo, 'vagas_cotas_raciais', 8, 0, 'item', 'O candidato que se autodeclarar negro ou pardo, nos termos da **{{campo:lei_cotas_raciais}}**, deverá entregar os documentos supracitados, pessoalmente ou por terceiro, em envelope lacrado, contendo na parte de fora do envelope os seguintes dados:', 'entrega_cotas', NULL),
    (v_modelo, 'vagas_cotas_raciais', 9, 2, 'item', '**{{campo:natureza_juridica}}** para a **{{campo:orgao_demandante}}**;', NULL, NULL),
    (v_modelo, 'vagas_cotas_raciais', 10, 2, 'item', 'Referência: **COTA PARA NEGROS**;', NULL, NULL),
    (v_modelo, 'vagas_cotas_raciais', 11, 2, 'item', 'nome completo e número de inscrição do candidato;', NULL, NULL),
    (v_modelo, 'vagas_cotas_raciais', 12, 2, 'item', 'cargo para o qual o candidato está concorrendo.', NULL, NULL),
    (v_modelo, 'vagas_cotas_raciais', 13, 1, 'item', 'O envelope deverá ser entregue pessoalmente ou por terceiro na **{{campo:executora_endereco}}**, em {{campo:cronograma_entrega_autodeclaracao}}, {{redigir:o horário de atendimento para a entrega}}.', 'endereco_entrega_cotas', NULL),
    (v_modelo, 'vagas_cotas_raciais', 14, 0, 'item', 'O limite de entrega, conforme os subitens {{item:entrega_cotas}} e {{item:endereco_entrega_cotas}}, é de **{{campo:limite_envelopes}}** envelope(s) por candidato.', NULL, NULL),
    (v_modelo, 'vagas_cotas_raciais', 15, 0, 'item', 'O candidato cotista que não cumprir o estabelecido no subitem {{item:reserva_cotas}} e seguintes participará do **{{campo:natureza_juridica}}** como candidato de Ampla Concorrência, não podendo alegar, posteriormente, o direito às vagas destinadas aos cotistas.', NULL, NULL),
    (v_modelo, 'vagas_cotas_raciais', 16, 0, 'item', 'O candidato negro que declarar sua condição no ato da inscrição, mas não entregar os documentos citados no subitem {{item:documentos_cotas}}, ou ainda que o fizer fora do prazo estabelecido, concorrerá exclusivamente às vagas de Ampla Concorrência, estando impedido de pleitear as vagas destinadas aos negros.', NULL, NULL),
    (v_modelo, 'vagas_cotas_raciais', 17, 0, 'item', 'O candidato negro que entregar seus documentos, mas não marcar na ficha de inscrição que está concorrendo à cota para negros, concorrerá apenas às vagas da Ampla Concorrência.', NULL, NULL),
    (v_modelo, 'vagas_cotas_raciais', 18, 0, 'item', 'O candidato negro que não entregar seus documentos, mas marcar na ficha de inscrição que está concorrendo à cota para negros, concorrerá apenas às vagas da Ampla Concorrência.', NULL, NULL),
    (v_modelo, 'vagas_cotas_raciais', 19, 0, 'item', 'O candidato que não tiver reconhecida sua condição de negro, devido ao não cumprimento das exigências deste Edital, concorrerá exclusivamente às vagas de Ampla Concorrência, estando impedido de pleitear as vagas destinadas aos negros.', NULL, NULL),
    (v_modelo, 'vagas_cotas_raciais', 20, 0, 'item', 'Não serão aceitas inscrições ou entrega de documentos fora do prazo estabelecido neste Edital, sob qualquer alegação.', NULL, NULL),
    (v_modelo, 'vagas_cotas_raciais', 21, 0, 'item', 'Os candidatos cotistas, se classificados, além de figurarem na lista geral de classificação, terão seus nomes publicados em relação à parte.', NULL, NULL),
    (v_modelo, 'vagas_cotas_raciais', 22, 0, 'item', 'No caso de o candidato cotista ter conseguido se classificar para as vagas oferecidas na Ampla Concorrência, seu nome constará apenas da listagem geral, não sendo necessária a divulgação em lista separada.', NULL, NULL),
    (v_modelo, 'vagas_cotas_raciais', 23, 0, 'item', 'As vagas para os candidatos cotistas que não forem providas por falta de candidato serão preenchidas pelos demais candidatos, observada a rigorosa ordem de classificação.', NULL, NULL),
    (v_modelo, 'vagas_cotas_raciais', 24, 0, 'item', 'Não será aceita a entrega condicional ou a complementação de documentos após a data descrita no subitem {{item:endereco_entrega_cotas}}.', NULL, NULL),
    (v_modelo, 'vagas_cotas_raciais', 25, 0, 'item', 'Não serão aceitos documentos postados eletronicamente, via Correios ou por e-mail.', NULL, NULL);
END $$;

-- A versão do modelo acompanha a rodada.
UPDATE public.editais SET modelo_versao = '1.0' WHERE eh_modelo;
