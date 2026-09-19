-- ═══════════════════════════════════════════════════════════════════════════════════════
-- MODELO — capítulo `condicoes_especiais_prova` (rodada 13 de 19)
-- ═══════════════════════════════════════════════════════════════════════════════════════
--
-- 🔴 ESTE ARQUIVO É GERADO. A fonte é `src/lib/edital-modelo/condicoes-especiais-prova.ts`.
--
-- 27 artigos, sem divergência da fonte (21 itens + 4 subitens + 2 alíneas).
--
-- ── 🔴 O NONO DEFEITO, e é de um tipo NOVO: número repetido ───────────────────────────
--
-- O Edital 004 tem DOIS subitens `11.4.1`, um atrás do outro ("DA DIFERENÇA DE CRITÉRIOS DE
-- AVALIAÇÃO" e "DA ENTREGA SEPARADA DA DOCUMENTAÇÃO"), e o seguinte é 11.4.2 — um dos dois
-- fica sem endereço. E logo depois do item 11.10 (prótese auditiva) vem um subitem numerado
-- `11.8.1`, que trata da prótese do 11.10: posição e número se contradizem.
--
-- Os dois somem por construção — aqui o subitem é nível 1 na posição certa, e `numerarItens`
-- calcula o número a partir do pai.
--
-- ── As duas referências deslocadas, as duas no MESMO item ─────────────────────────────
--
--   11.21  "o prazo no subitem 10.18"                -> 11.20
--   11.21  "o mesmo endereço descrito no subitem 10.18" -> 11.20
--
-- ── 🔴 Os três valores da lactante viraram campo, e um é DERIVADO ─────────────────────
--
-- `idade_maxima_lactente` e `tempo_compensacao_lactante` já tinham coluna em
-- `regras_lactantes`. ⭐ `data_corte_lactante` NÃO tem coluna de propósito: sai da data da
-- prova menos a idade máxima, na renderização. O Edital 003/2026 publicou essa data à mão e
-- errou por 4 dias — derivou de 16/09, que no cronograma dele é o comprovante de local de
-- prova, enquanto a prova é 20/09. Recusaria por engano quem tivesse bebê nascido em 18/03.
--
-- ⚠️ Ficam LITERAIS, por não terem coluna em lugar nenhum: "Arial tamanho 20 em A3", os
-- 60 minutos de tempo adicional e as 72 horas do pedido tardio. Registrado no backlog.
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
             WHERE edital_id = v_modelo AND capitulo_chave = 'condicoes_especiais_prova') THEN
    RETURN;
  END IF;

  INSERT INTO public.edital_itens
    (edital_id, capitulo_chave, ordem, nivel, tipo, texto, ancora, quadro_fonte)
  VALUES
    (v_modelo, 'condicoes_especiais_prova', 0, 0, 'item', 'O candidato que necessitar de condições especiais — gestante, lactante ou qualquer das situações descritas nos subitens deste capítulo — deverá informar sua condição na Ficha de Inscrição Eletrônica, no campo **Necessidade de Atendimento Especial**, opção **Outra**, indicando se necessitará de atendimento diferenciado.', NULL, NULL),
    (v_modelo, 'condicoes_especiais_prova', 1, 0, 'item', 'Somente serão apreciadas as solicitações que especifiquem a condição requerida, apontem as circunstâncias que a justifiquem e estejam acompanhadas do respectivo documento médico comprobatório que ateste a real necessidade do atendimento especializado.', NULL, NULL),
    (v_modelo, 'condicoes_especiais_prova', 2, 0, 'item', 'O laudo médico exigido para o atendimento especial tratado neste capítulo tem finalidade **estritamente operacional** para o dia de aplicação da prova e **não se confunde** com o laudo exigido para concorrer às vagas reservadas a pessoas com deficiência, tratado no {{cap:vagas_pcd}}.', NULL, NULL),
    (v_modelo, 'condicoes_especiais_prova', 3, 0, 'item', 'O candidato com deficiência que desejar concorrer às vagas reservadas do {{cap:vagas_pcd}} e também necessitar de adaptações para o dia da prova deverá, obrigatoriamente, apresentar **dois laudos médicos distintos**.', NULL, NULL),
    (v_modelo, 'condicoes_especiais_prova', 4, 1, 'item', '**Da diferença de critérios de avaliação:** a análise da documentação do {{cap:vagas_pcd}} obedece aos critérios das leis que regulamentam o enquadramento legal como pessoa com deficiência; a avaliação deste capítulo tem caráter **estritamente logístico e de acessibilidade**, sendo aceitos laudos de médicos particulares ou assistentes que atestem a dificuldade ou limitação do candidato, permanente ou temporária, e justifiquem a adaptação necessária para o dia da prova.', NULL, NULL),
    (v_modelo, 'condicoes_especiais_prova', 5, 1, 'item', '**Da entrega separada da documentação:** a entrega ocorre de forma **separada e independente**, devendo o candidato acondicionar os documentos em envelopes lacrados distintos e identificados por fora, sendo:', NULL, NULL),
    (v_modelo, 'condicoes_especiais_prova', 6, 2, 'item', '**Envelope 1 — vagas reservadas:** a documentação exigida no subitem {{item:documentos_pcd}} e seguintes, para a análise do direito à reserva;', NULL, NULL),
    (v_modelo, 'condicoes_especiais_prova', 7, 2, 'item', '**Envelope 2 — atendimento especial:** a documentação exigida neste capítulo, para a montagem da estrutura de acessibilidade no dia da prova.', NULL, NULL),
    (v_modelo, 'condicoes_especiais_prova', 8, 1, 'item', 'A entrega de apenas um dos envelopes não supre a ausência do outro. O candidato que entregar somente o envelope das vagas reservadas e omitir o do atendimento especial realizará a prova em sala comum, sem direito a adaptação.', NULL, NULL),
    (v_modelo, 'condicoes_especiais_prova', 9, 0, 'item', 'A **{{campo:entidade_executora}}** reserva-se o direito de não atender à necessidade que não tenha sido solicitada na Ficha de Inscrição Eletrônica e comprovada por documento na data prevista.', NULL, NULL),
    (v_modelo, 'condicoes_especiais_prova', 10, 0, 'item', 'A solicitação de condição especial deverá ser feita previamente, ficando o atendimento sujeito à análise da legalidade e da razoabilidade do pedido.', NULL, NULL),
    (v_modelo, 'condicoes_especiais_prova', 11, 0, 'item', 'O candidato com deficiência visual que necessitar de prova ampliada ou de auxílio de ledor deverá anexar laudo médico que comprove a condição e justifique a necessidade.', NULL, NULL),
    (v_modelo, 'condicoes_especiais_prova', 12, 0, 'item', 'Na prova ampliada a fonte é Arial, tamanho 20, em papel A3. **Não é possível ampliar o cartão-resposta**; se necessário, o candidato deverá solicitar o auxílio de ledor ou marcador.', NULL, NULL),
    (v_modelo, 'condicoes_especiais_prova', 13, 0, 'item', 'O candidato com deficiência auditiva que necessitar de intérprete de Libras para as orientações gerais de prova deverá anexar laudo médico que comprove a condição e justifique a necessidade.', NULL, NULL),
    (v_modelo, 'condicoes_especiais_prova', 14, 0, 'item', 'O candidato com deficiência auditiva que faça uso de prótese ou aparelho auditivo deverá anexar laudo de médico especialista que ateste a necessidade de uso contínuo, a fim de autorizar a permanência com o aparelho durante a realização da prova.', NULL, NULL),
    (v_modelo, 'condicoes_especiais_prova', 15, 1, 'item', 'Sem essa comprovação, o candidato deverá retirar o aparelho auditivo antes do início da prova e guardá-lo em envelope de segurança, sob pena de eliminação do certame.', NULL, NULL),
    (v_modelo, 'condicoes_especiais_prova', 16, 0, 'item', 'O candidato que necessitar de tempo adicional para a realização da prova poderá solicitar acréscimo de, no máximo, 60 (sessenta) minutos, anexando laudo especializado que comprove a condição e justifique a necessidade.', NULL, NULL),
    (v_modelo, 'condicoes_especiais_prova', 17, 0, 'item', 'Fica assegurado à candidata lactante o direito de amamentar seu filho durante a realização da prova, desde que o lactente tenha nascido a partir de **{{campo:data_corte_lactante}}**, observado o limite de **{{campo:idade_maxima_lactente}}** meses de idade na data de realização da prova.', NULL, NULL),
    (v_modelo, 'condicoes_especiais_prova', 18, 0, 'item', 'A candidata deverá solicitar a condição especial durante o período de inscrição, ao preencher a Ficha de Inscrição Eletrônica, no campo **Necessidade de Atendimento Especial**, opção **Outra**, indicando a condição de lactante.', NULL, NULL),
    (v_modelo, 'condicoes_especiais_prova', 19, 0, 'item', 'O acompanhante e o lactente deverão ingressar no local de prova no mesmo horário estabelecido para os candidatos.', NULL, NULL),
    (v_modelo, 'condicoes_especiais_prova', 20, 0, 'item', 'No dia da prova, a candidata lactante deverá levar a fotocópia da certidão de nascimento do lactente, cujo nascimento deverá ter ocorrido a partir de **{{campo:data_corte_lactante}}**, e um acompanhante com maioridade legal, que ficará em sala reservada e será responsável pela guarda da criança. O acompanhante permanecerá no local designado pela coordenação e se submeterá a todas as normas deste Edital, inclusive quanto ao uso de equipamento eletrônico e de celular.', NULL, NULL),
    (v_modelo, 'condicoes_especiais_prova', 21, 0, 'item', 'Para garantir a isonomia e a organização do certame, haverá **um único período programado** de até **{{campo:tempo_compensacao_lactante}}** minutos durante a prova para a amamentação, a ser definido pela coordenação do local. Esse tempo será integralmente compensado, estendendo-se o horário de término da prova dessas candidatas em **{{campo:tempo_compensacao_lactante}}** minutos além do previsto para os demais.', NULL, NULL),
    (v_modelo, 'condicoes_especiais_prova', 22, 0, 'item', 'Na sala reservada para a amamentação ficarão somente a candidata lactante, a criança e um fiscal, sendo vedada a permanência de babás ou de quaisquer outras pessoas com grau de parentesco ou de amizade com a candidata.', NULL, NULL),
    (v_modelo, 'condicoes_especiais_prova', 23, 0, 'item', 'A candidata lactante que não levar acompanhante para a guarda da criança não fará a prova.', NULL, NULL),
    (v_modelo, 'condicoes_especiais_prova', 24, 0, 'item', 'Em nenhuma hipótese a criança poderá permanecer dentro da sala de aplicação da prova ou sozinha em outro ambiente.', NULL, NULL),
    (v_modelo, 'condicoes_especiais_prova', 25, 0, 'item', 'Toda a documentação comprobatória de necessidade especial no dia da prova deverá ser entregue em envelope lacrado na **{{campo:executora_endereco}}**, em {{campo:cronograma_entrega_atestado_especial}}, {{redigir:o horário de atendimento para a entrega — ex.: de 9h às 16h}}.', 'entrega_documentacao_especial', NULL),
    (v_modelo, 'condicoes_especiais_prova', 26, 0, 'item', 'Caso a necessidade de condição especial surja após o prazo do subitem {{item:entrega_documentacao_especial}}, o candidato poderá encaminhar a solicitação, com o laudo médico que comprove a necessidade, até **72 horas antes** do horário marcado para o início da prova, no mesmo endereço indicado naquele subitem.', NULL, NULL);
END $$;

-- A versão do modelo acompanha a rodada.
UPDATE public.editais SET modelo_versao = '1.0' WHERE eh_modelo;
