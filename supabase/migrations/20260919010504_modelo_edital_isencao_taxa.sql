-- ═══════════════════════════════════════════════════════════════════════════════════════
-- MODELO — capítulo `isencao_taxa` (rodada 9 de 19)
-- ═══════════════════════════════════════════════════════════════════════════════════════
--
-- 🔴 ESTE ARQUIVO É GERADO. A fonte é `src/lib/edital-modelo/isencao-taxa.ts`.
--
-- 28 artigos aqui contra 30 elementos na fonte (22 numerados + 7 alíneas em MAIÚSCULA + 1
-- parágrafo sem número). A diferença não é omissão: os itens 7.2, 7.3 e 7.4 repetem o MESMO
-- parágrafo de "imprimir o formulário e anexar RG e CPF" uma vez por requisito, variando só o
-- documento de cada opção. Viraram um caput com cinco subitens, um por documento.
--
-- ── 🔴 É O CAPÍTULO QUE MELHOR PROVA O DEFEITO DO TEMA ────────────────────────────────
--
-- 12 referências cruzadas, e 11 ERRADAS:
--
--   7.2    "Letra A do subitem 6.1"        -> 7.1
--   7.2.2  "letra A do subitem 7.1"        -> ✅ a ÚNICA correta
--   7.3    "letra B do subitem 6.1"        -> 7.1
--   7.3.2  "subitem 6.1 letra B"           -> 7.1
--   7.4    "letra C do subitem 6.1"        -> 7.1
--   7.5    "subitens 6.2 a 6.4"            -> 7.2 a 7.4
--   7.6    "conforme subitem 6.6"          -> 7.5
--   7.7    "subitens 6.2 a 6.6"            -> 7.2 a 7.5
--   7.11   "item 6.10"                     -> 7.10
--   7.12   "subitens de 6.1 a 6.6"         -> 7.1 a 7.5
--   7.13   "subitens de 5.3 até 5.32"      -> 🔴 FAIXA QUE NÃO EXISTE (o cap. 5 termina em
--                                              5.2.2); o assunto está no capítulo 6
--   7.16   "subitem 6.6"                   -> 7.5
--
-- O documento CONTRADIZ A SI MESMO: o 7.2 diz "subitem 6.1" e o 7.2.2 diz "subitem 7.1" para o
-- MESMO alvo, a duas linhas de distância. Todas foram reapontadas por âncora ou capítulo.
--
-- ── As alíneas ficam em MINÚSCULA, e isso resolve outra inconsistência medida ──────────
--
-- O Edital 004 usa `a)` nos capítulos 6, 11, 12, 13 e 14; `A)` nos 7, 8, 10 e 15; e AS DUAS
-- formas no capítulo 9. O modelo não escolhe: `numerarItens` rende letra minúscula, calculada,
-- e a inconsistência desaparece por construção.
--
-- ── Dois números que já tinham coluna, e viraram campo ────────────────────────────────
--
-- "mínimo de 03 doações em 12 meses" é `regras_isencao.minimo_doacoes_sangue_12m`; "dois
-- envelopes" é `inscricao_config.limite_envelopes_por_candidato`. Literais, criariam duas fontes
-- para o mesmo número — o painel diria 3 e o documento, 5.
--
-- ⚠️ As três leis dos requisitos ficam LITERAIS: `CRITERIOS_DE_ISENCAO`, em
-- `src/lib/edital-inscricao.ts`, já as carrega como `leiPadrao` no catálogo em código.
--
-- ⚠️ E o envelope do 004 manda escrever "Concurso Público para a Secretaria Municipal de Saúde"
-- num edital que é PROCESSO SELETIVO. Virou natureza + órgão demandante.
-- ═══════════════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_modelo UUID;
BEGIN
  SELECT id INTO v_modelo FROM public.editais WHERE eh_modelo;
  IF v_modelo IS NULL THEN RETURN; END IF;

  IF EXISTS (SELECT 1 FROM public.edital_itens
             WHERE edital_id = v_modelo AND capitulo_chave = 'isencao_taxa') THEN
    RETURN;
  END IF;

  INSERT INTO public.edital_itens
    (edital_id, capitulo_chave, ordem, nivel, tipo, texto, ancora, quadro_fonte)
  VALUES
    (v_modelo, 'isencao_taxa', 0, 0, 'item', 'O candidato poderá requerer a Isenção da Taxa de Inscrição, desde que atenda a um dos requisitos abaixo:', 'requisitos_de_isencao', NULL),
    (v_modelo, 'isencao_taxa', 1, 2, 'item', 'estar inscrito no Cadastro Único para Programas Sociais do Governo Federal (CadÚnico) e ser membro de família de baixa renda, nos termos do art. 11 da Lei nº 8.112/90 e dos Decretos Federais nº 6.593/2008 e nº 11.016/2022;', NULL, NULL),
    (v_modelo, 'isencao_taxa', 2, 2, 'item', 'nos termos da Lei Municipal nº 5.989/2022, ser doador regular de sangue ou estar cadastrado no Registro Brasileiro de Doadores de Medula Óssea (REDOME);', NULL, NULL),
    (v_modelo, 'isencao_taxa', 3, 2, 'item', 'nos termos da Lei Municipal nº 6.359/2024, ter prestado serviço eleitoral.', NULL, NULL),
    (v_modelo, 'isencao_taxa', 4, 0, 'item', 'O candidato interessado em obter a isenção deverá imprimir o Formulário do Requerimento de Isenção, disponível em **{{campo:site_oficial}}**, preenchê-lo corretamente com seus dados pessoais e anexar fotocópias do Documento de Identidade e do CPF, mais a documentação própria do requisito de que trata o subitem {{item:requisitos_de_isencao}}, conforme os subitens seguintes.', NULL, NULL),
    (v_modelo, 'isencao_taxa', 5, 1, 'item', 'Quem optar pelo CadÚnico deverá anexar o Comprovante de Cadastro Único contendo a chave de validação eletrônica, emitido oficialmente em **https://cadunico.dataprev.gov.br**, e informar o Número de Identificação Social (NIS).', NULL, NULL),
    (v_modelo, 'isencao_taxa', 6, 1, 'item', 'O comprovante do CadÚnico deverá, obrigatoriamente, apresentar data da última atualização cadastral igual ou inferior a 24 (vinte e quatro) meses da data de publicação deste Edital.', NULL, NULL),
    (v_modelo, 'isencao_taxa', 7, 1, 'item', 'Quem optar pelo REDOME deverá anexar cópia da carteira de doador emitida oficialmente pelo REDOME, por seu sítio eletrônico ou aplicativo oficial, contendo obrigatoriamente o código de autenticidade ou QR Code verificável e emitida no ano vigente de publicação deste Edital, para comprovação da manutenção do cadastro ativo.', NULL, NULL),
    (v_modelo, 'isencao_taxa', 8, 1, 'item', 'Quem optar pela doação regular de sangue deverá anexar cópia do comprovante com, no mínimo, **{{campo:minimo_doacoes_sangue}}** doações no período de 12 (doze) meses, expedido por órgão oficial ou entidade credenciada pela União, Estado ou Município.', NULL, NULL),
    (v_modelo, 'isencao_taxa', 9, 1, 'item', 'Quem optar pelo serviço eleitoral deverá anexar declaração expedida pela Justiça Eleitoral, com o nome completo do candidato, o número de sua inscrição eleitoral, as datas dos eventos eleitorais de que participou e a função desempenhada.', NULL, NULL),
    (v_modelo, 'isencao_taxa', 10, 0, 'item', 'O Formulário de Isenção, com a fotocópia de todos os documentos exigidos, deverá ser entregue pelo próprio candidato ou por terceiro, em envelope tamanho ofício, lacrado, contendo na parte de fora os seguintes dados:', 'entrega_do_envelope', NULL),
    (v_modelo, 'isencao_taxa', 11, 2, 'item', '**{{campo:natureza_juridica}}** para a **{{campo:orgao_demandante}}**;', NULL, NULL),
    (v_modelo, 'isencao_taxa', 12, 2, 'item', 'Referência: **ISENÇÃO DE TAXA**;', NULL, NULL),
    (v_modelo, 'isencao_taxa', 13, 2, 'item', 'nome completo;', NULL, NULL),
    (v_modelo, 'isencao_taxa', 14, 2, 'item', 'cargo para o qual o candidato está concorrendo.', NULL, NULL),
    (v_modelo, 'isencao_taxa', 15, 0, 'prosa', 'O envelope deverá ser entregue na **{{campo:executora_endereco}}**, em {{campo:cronograma_entrega_isencao}}, {{redigir:o horário de atendimento para a entrega — ex.: de 9h às 16h}}.', NULL, NULL),
    (v_modelo, 'isencao_taxa', 16, 0, 'item', 'O limite de entrega, conforme o subitem {{item:entrega_do_envelope}}, é de **{{campo:limite_envelopes}}** envelope(s) por candidato.', NULL, NULL),
    (v_modelo, 'isencao_taxa', 17, 0, 'item', 'O candidato que desejar a isenção, após cumprir o disposto no subitem {{item:requisitos_de_isencao}} e seguintes, deverá aguardar o resultado da análise de sua documentação para efetivar sua inscrição.', NULL, NULL),
    (v_modelo, 'isencao_taxa', 18, 0, 'item', 'Cada pedido de Isenção será analisado e julgado com vistas ao deferimento ou indeferimento, conforme a documentação apresentada.', NULL, NULL),
    (v_modelo, 'isencao_taxa', 19, 0, 'item', 'A documentação apresentada é válida para apenas um cargo. O candidato que pretender solicitar isenção para mais de um cargo deverá realizar procedimentos independentes para cada pedido, com a entrega de envelopes distintos e documentação completa em cada um deles.', NULL, NULL),
    (v_modelo, 'isencao_taxa', 20, 0, 'item', 'O resultado da análise da documentação será divulgado em {{campo:cronograma_resultado_isencao}}, no endereço eletrônico **{{campo:site_oficial}}**, {{redigir:o horário a partir do qual o resultado fica disponível}}.', 'resultado_da_isencao', NULL),
    (v_modelo, 'isencao_taxa', 21, 0, 'item', 'Os candidatos com isenção concedida na listagem divulgada conforme o subitem {{item:resultado_da_isencao}} terão, ao lado do seu nome, um código de isenção a ser digitado na Ficha de Inscrição Eletrônica no ato de seu preenchimento; automaticamente aparecerá **CONFIRMADA SUA INSCRIÇÃO**.', NULL, NULL),
    (v_modelo, 'isencao_taxa', 22, 0, 'item', 'A não apresentação de qualquer documento estabelecido para comprovar a condição de que tratam os subitens {{item:requisitos_de_isencao}} a {{item:entrega_do_envelope}}, ou a apresentação de documentos fora dos padrões e prazos estabelecidos, implicará o indeferimento do pedido de Isenção.', NULL, NULL),
    (v_modelo, 'isencao_taxa', 23, 0, 'item', 'O candidato que tiver o pedido de Isenção indeferido deverá, para efetivar sua inscrição, acessar o endereço eletrônico **{{campo:site_oficial}}** e proceder conforme o capítulo {{cap:inscricao_e_pagamento}}.', NULL, NULL),
    (v_modelo, 'isencao_taxa', 24, 0, 'item', 'Comprovada a ocorrência de fraude nas declarações e documentos apresentados pelo candidato interessado na Isenção, este será automaticamente eliminado do **{{campo:natureza_juridica}}**, em qualquer uma de suas fases, sem prejuízo das medidas cíveis e criminais eventualmente cabíveis.', NULL, NULL),
    (v_modelo, 'isencao_taxa', 25, 0, 'item', 'Não caberá recurso da decisão pelo indeferimento da solicitação de Isenção.', NULL, NULL),
    (v_modelo, 'isencao_taxa', 26, 0, 'item', 'Não será aceita a entrega condicional ou a complementação de documentos após a data descrita no subitem {{item:entrega_do_envelope}}.', NULL, NULL),
    (v_modelo, 'isencao_taxa', 27, 0, 'item', 'Não serão aceitos documentos postados eletronicamente, via Correios ou por e-mail.', NULL, NULL);
END $$;

-- A versão do modelo acompanha a rodada; é ela que a clonagem grava no destino.
UPDATE public.editais SET modelo_versao = '0.8' WHERE eh_modelo;
