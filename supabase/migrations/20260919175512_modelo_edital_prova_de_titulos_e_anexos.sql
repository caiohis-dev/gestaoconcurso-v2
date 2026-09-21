-- ═══════════════════════════════════════════════════════════════════════════════════════
-- MODELO — `prova_de_titulos` e `anexos` (rodada 19 de 19 — A ÚLTIMA)
-- ═══════════════════════════════════════════════════════════════════════════════════════
--
-- 🔴 ESTE ARQUIVO É GERADO. As fontes são `src/lib/edital-modelo/prova-de-titulos.ts` e
-- `src/lib/edital-modelo/anexos.ts`. São DOIS capítulos numa migration porque fecham o tema
-- juntos: com eles o modelo passa a ter os 19 capítulos do catálogo.
--
-- ── `prova_de_titulos` — 28 artigos, e o único vindo do EDITAL 002 ────────────────────
--
-- O 003 e o 004 não têm prova de títulos; foi decisão do usuário em 18/09 que ela entra assim
-- mesmo. O capítulo nasce DESLIGADO no catálogo (`padrao: false`) e é ligável em qualquer
-- edital — como a territorialidade.
--
-- O item 13.4 do 002 vira o artigo `quadro` (`quadro_fonte: 'titulos'`), que é o que os
-- Quadros III e IV são. Os 12 pontos máximos NÃO entram em prosa: pontuação é por cargo em
-- `titulos_itens`, e o quadro gerado já a rende — escrita no texto, seria a terceira cópia.
--
-- ⚠️ O 13.8 e o 13.9 diziam "o subitem anterior". Vizinhança não é referência: basta inserir
-- um artigo entre os dois para a frase apontar para outra coisa, sem quebrar teste nenhum.
--
-- ── `anexos` — os pós-textuais, e a QUINTA fonte de quadro ────────────────────────────
--
-- Não é numerado, como o preâmbulo: nenhum artigo é `item`, só `prosa` e `quadro`. O
-- cronograma entra por `quadro_fonte: 'cronograma'` — a última das cinco fontes a ser usada
-- pelo modelo. Nenhum artigo cita NÚMERO de anexo: o conteúdo programático é Anexo I no 002 e
-- no 003 e Anexo II no 004.
--
-- ⚠️ O fecho do 004 publicado traz "Volta Redonda, ___ de ___________ de 2026" — a TERCEIRA
-- ocorrência de formulário em branco no mesmo documento, depois do 12.4 e do 14.9. Aqui a data
-- vem de `editais.data_publicacao`, e o linter cobra enquanto ela faltar.
--
-- A guarda é `NOT EXISTS` por CAPÍTULO, uma vez para cada um dos dois.
-- ═══════════════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_modelo UUID;
BEGIN
  SELECT id INTO v_modelo FROM public.editais WHERE eh_modelo;
  IF v_modelo IS NULL THEN RETURN; END IF;

  IF EXISTS (SELECT 1 FROM public.edital_itens
             WHERE edital_id = v_modelo AND capitulo_chave = 'prova_de_titulos') THEN
    RETURN;
  END IF;

  INSERT INTO public.edital_itens
    (edital_id, capitulo_chave, ordem, nivel, tipo, texto, ancora, quadro_fonte)
  VALUES
    (v_modelo, 'prova_de_titulos', 0, 0, 'item', 'A avaliação de títulos tem caráter **apenas classificatório**.', NULL, NULL),
    (v_modelo, 'prova_de_titulos', 1, 0, 'item', 'A pontuação por títulos só ocorrerá para os candidatos aos cargos com títulos parametrizados neste Edital que tenham atingido a pontuação mínima exigida para aprovação na prova objetiva, sem zerar em qualquer uma das áreas.', NULL, NULL),
    (v_modelo, 'prova_de_titulos', 2, 0, 'item', 'Os candidatos deverão entregar seus títulos para avaliação em {{campo:cronograma_entrega_titulos}}, na **{{campo:executora_endereco}}**, {{redigir:o horário de atendimento para a entrega — ex.: de 9h às 16h}}.', 'entrega_dos_titulos', NULL),
    (v_modelo, 'prova_de_titulos', 3, 0, 'quadro', 'Títulos aferíveis, pontuação por título e pontuação máxima, por cargo. Serão considerados para avaliação apenas os títulos deste quadro.', 'quadro_de_titulos', 'titulos'),
    (v_modelo, 'prova_de_titulos', 4, 0, 'item', 'Para receber a pontuação relativa aos títulos de pós-graduação relacionados no quadro serão aceitos somente os certificados ou declarações acompanhados, obrigatoriamente, do histórico escolar e nos quais conste a carga horária do curso.', NULL, NULL),
    (v_modelo, 'prova_de_titulos', 5, 0, 'item', 'Na impossibilidade de entrega do diploma ou do certificado, o candidato poderá apresentar declaração expedida por instituição de ensino que demonstre, de forma inequívoca, a conclusão do curso de pós-graduação, lato ou stricto sensu, e a obtenção do título. A declaração deverá estar acompanhada do histórico escolar do curso a que se refere, com a respectiva carga horária.', NULL, NULL),
    (v_modelo, 'prova_de_titulos', 6, 0, 'item', 'Para receber a pontuação relativa aos títulos, o certificado deverá informar que o curso foi realizado de acordo com as normas do Conselho Nacional de Educação ou do Ministério da Educação.', 'normas_do_curso', NULL),
    (v_modelo, 'prova_de_titulos', 7, 0, 'item', 'Caso o certificado não informe o exigido no subitem {{item:normas_do_curso}}, deverá ser anexada declaração da instituição atestando que o curso atende àquelas normas.', 'declaracao_da_instituicao', NULL),
    (v_modelo, 'prova_de_titulos', 8, 0, 'item', 'Não receberá pontuação o candidato que apresentar certificado sem a comprovação do subitem {{item:normas_do_curso}} e sem a declaração referida no subitem {{item:declaracao_da_instituicao}}.', NULL, NULL),
    (v_modelo, 'prova_de_titulos', 9, 0, 'item', 'Os diplomas expedidos por instituição estrangeira deverão ser revalidados por instituição de ensino superior no Brasil.', NULL, NULL),
    (v_modelo, 'prova_de_titulos', 10, 0, 'item', 'Todo documento expedido em língua estrangeira somente será considerado para fins de avaliação e pontuação quando traduzido para a língua portuguesa por tradutor juramentado.', NULL, NULL),
    (v_modelo, 'prova_de_titulos', 11, 0, 'item', 'Outros comprovantes de conclusão de curso ou disciplina — tais como comprovantes de pagamento de taxa para obtenção de documentação, cópias de requerimentos e atas de apresentação e defesa de dissertação ou tese — ou documentos que não estejam em consonância com as disposições deste Edital não serão considerados para efeito de pontuação.', NULL, NULL),
    (v_modelo, 'prova_de_titulos', 12, 0, 'item', 'Não serão analisados nem pontuados os títulos, declarações e documentos ilegíveis, com digitalização truncada, com sinais de rasura, não identificados como sendo do próprio candidato, sem carimbo, sem assinatura do emitente, em papel não timbrado, não datados ou indevidamente preenchidos.', NULL, NULL),
    (v_modelo, 'prova_de_titulos', 13, 0, 'item', 'Não serão considerados outros títulos além dos mencionados no subitem {{item:quadro_de_titulos}}.', NULL, NULL),
    (v_modelo, 'prova_de_titulos', 14, 0, 'item', 'Os documentos obtidos por meio digital apenas serão pontuados se atenderem a uma das seguintes condições:', NULL, NULL),
    (v_modelo, 'prova_de_titulos', 15, 2, 'item', 'conter assinatura digital ou eletrônica e a identificação do assinante com o devido código de autenticação;', NULL, NULL),
    (v_modelo, 'prova_de_titulos', 16, 2, 'item', 'conter código de verificação de autenticidade e assinatura, devidamente identificada, do responsável por sua emissão;', NULL, NULL),
    (v_modelo, 'prova_de_titulos', 17, 2, 'item', 'conter QR Code;', NULL, NULL),
    (v_modelo, 'prova_de_titulos', 18, 2, 'item', 'conter certificado digital assinado com certificado ICP-Brasil.', NULL, NULL),
    (v_modelo, 'prova_de_titulos', 19, 0, 'item', 'Não serão aceitos títulos encaminhados via fax, por e-mail ou pelos Correios.', NULL, NULL),
    (v_modelo, 'prova_de_titulos', 20, 0, 'item', 'Todos os cursos previstos para pontuação na avaliação de títulos deverão estar concluídos até 30 (trinta) dias antes do último dia de inscrição.', NULL, NULL),
    (v_modelo, 'prova_de_titulos', 21, 0, 'item', 'Após a análise dos títulos, os pontos referentes a essa avaliação serão divulgados em {{campo:cronograma_resultado_titulos}}, no endereço eletrônico **{{campo:site_oficial}}**.', NULL, NULL),
    (v_modelo, 'prova_de_titulos', 22, 0, 'item', 'O candidato que se julgar prejudicado na aferição dos títulos terá **um dia útil**, em {{campo:cronograma_recurso_titulos}}, a contar da divulgação do resultado dessa avaliação, para requerer a revisão de sua pontuação, por requerimento de próprio punho, com a argumentação devida, sem anexar qualquer outro documento além do comprovante de inscrição.', NULL, NULL),
    (v_modelo, 'prova_de_titulos', 23, 0, 'item', 'O requerimento deverá ser entregue pelo candidato ou por terceiro na **{{campo:executora_endereco}}**, {{redigir:o horário de atendimento para a entrega — ex.: de 9h às 16h}}.', 'entrega_do_recurso_titulos', NULL),
    (v_modelo, 'prova_de_titulos', 24, 0, 'item', 'O limite de entrega, conforme o subitem {{item:entrega_do_recurso_titulos}}, é de **{{campo:limite_envelopes}}** envelope(s) por candidato.', NULL, NULL),
    (v_modelo, 'prova_de_titulos', 25, 0, 'item', 'Julgados procedentes os recursos apresentados, será processado o novo resultado que, somado aos pontos da prova objetiva, determinará o resultado final do certame.', NULL, NULL),
    (v_modelo, 'prova_de_titulos', 26, 0, 'item', 'Ao final dessas duas etapas, os candidatos serão classificados e listados em ordem decrescente de pontos, de acordo com as vagas a que concorrem.', NULL, NULL),
    (v_modelo, 'prova_de_titulos', 27, 0, 'item', 'Não serão pontuados os títulos utilizados para comprovação da habilitação exigida para o cargo.', NULL, NULL);
END $$;

DO $$
DECLARE
  v_modelo UUID;
BEGIN
  SELECT id INTO v_modelo FROM public.editais WHERE eh_modelo;
  IF v_modelo IS NULL THEN RETURN; END IF;

  IF EXISTS (SELECT 1 FROM public.edital_itens
             WHERE edital_id = v_modelo AND capitulo_chave = 'anexos') THEN
    RETURN;
  END IF;

  INSERT INTO public.edital_itens
    (edital_id, capitulo_chave, ordem, nivel, tipo, texto, ancora, quadro_fonte)
  VALUES
    (v_modelo, 'anexos', 0, 0, 'prosa', 'Integram este Edital, para todos os fins, o cronograma e o conteúdo programático apresentados a seguir.', NULL, NULL),
    (v_modelo, 'anexos', 1, 0, 'quadro', 'Cronograma do certame:', NULL, 'cronograma'),
    (v_modelo, 'anexos', 2, 0, 'prosa', 'O conteúdo programático sobre o qual se baseiam as questões da prova objetiva segue como anexo deste Edital, por cargo e por disciplina.', NULL, NULL),
    (v_modelo, 'anexos', 3, 0, 'prosa', 'As áreas de abrangência das unidades, quando houver restrição territorial, seguem como anexo deste Edital, nos termos do capítulo {{cap:distribuicao_geografica}}.', NULL, NULL),
    (v_modelo, 'anexos', 4, 0, 'prosa', 'Volta Redonda, {{campo:data_publicacao}}.', NULL, NULL),
    (v_modelo, 'anexos', 5, 0, 'prosa', '**{{campo:signatario_nome}}**
{{campo:signatario_cargo}}', NULL, NULL);
END $$;

-- A versão do modelo acompanha a rodada — o texto padrão está COMPLETO.
UPDATE public.editais SET modelo_versao = '1.0' WHERE eh_modelo;
