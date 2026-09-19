-- ═══════════════════════════════════════════════════════════════════════════════════════
-- MODELO — capítulo `comprovante_inscricao` (rodada 12 de 19)
-- ═══════════════════════════════════════════════════════════════════════════════════════
--
-- 🔴 ESTE ARQUIVO É GERADO. A fonte é `src/lib/edital-modelo/comprovante-inscricao.ts`.
--
-- 19 artigos, sem divergência da fonte (11 itens + 2 subitens + 4 alíneas MAIÚSCULAS + 2
-- minúsculas).
--
-- ── As DUAS referências cruzadas do capítulo, e as duas estão deslocadas ──────────────
--
--   10.7  "conforme subitem 9.3"  -> 10.3 — a divulgação da listagem de confirmação
--   10.8  "conforme subitem 9.7"  -> 10.7 — a entrega do envelope de recurso
--
-- É o deslocamento de um capítulo inteiro outra vez, e aqui se prova sem sair da página: o
-- 10.7 descreve o prazo como "subsequente à data de divulgação da listagem de confirmação das
-- inscrições" e manda ver o 9.3, que no Edital 004 é a lista de documentos da cota racial.
-- Quem divulga a listagem é o 10.3, três linhas acima.
--
-- ── As quatro datas vêm do CRONOGRAMA ────────────────────────────────────────────────
--
-- 28/07 é `pagamento_boleto`, 05/08 é `confirmacao_inscricao`, 06/08 é `recurso_inscricao` e
-- 11/08 é `decisao_recurso_inscricao`. ⚠️ O 004 escreve o dia do recurso E a expressão
-- "primeiro dia útil subsequente" — duas fontes para a mesma data. Aqui a data sai do
-- cronograma e a expressão fica como a REGRA que a explica.
--
-- ── Correções de transcrição ─────────────────────────────────────────────────────────
--
--   * "Pessoa com Deficiência" -> "pessoa com deficiência" (termo da LBI, como no cap. 4);
--   * "Concurso Público para a Secretaria Municipal de Saúde" -> natureza + órgão demandante;
--   * "dois envelopes no total" -> `{{campo:limite_envelopes}}`, que já tem coluna;
--   * "das 9h às 16 horas" -> `{{redigir:}}`, como nas rodadas 9 a 11;
--   * as alíneas a)/b) do 10.6.1 e A) a D) do 10.7 convivem no MESMO capítulo, em caixas
--     diferentes — o oitavo achado do tema. Aqui são nível 2, reletradas por `numerarItens`.
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
             WHERE edital_id = v_modelo AND capitulo_chave = 'comprovante_inscricao') THEN
    RETURN;
  END IF;

  INSERT INTO public.edital_itens
    (edital_id, capitulo_chave, ordem, nivel, tipo, texto, ancora, quadro_fonte)
  VALUES
    (v_modelo, 'comprovante_inscricao', 0, 0, 'item', 'A inscrição somente será considerada válida após o pagamento do respectivo boleto bancário.', NULL, NULL),
    (v_modelo, 'comprovante_inscricao', 1, 0, 'item', 'O comprovante provisório de inscrição do candidato será o boleto original, devidamente quitado, sem rasuras ou emendas, em que conste a data da efetivação do pagamento, feito até {{campo:cronograma_pagamento_boleto}}.', NULL, NULL),
    (v_modelo, 'comprovante_inscricao', 2, 0, 'item', 'Em {{campo:cronograma_confirmacao_inscricao}} será divulgada, no endereço eletrônico **{{campo:site_oficial}}**, a listagem de confirmação, para que os candidatos possam verificar a efetivação de sua inscrição definitiva.', 'listagem_confirmacao', NULL),
    (v_modelo, 'comprovante_inscricao', 3, 0, 'item', 'O candidato que não tiver a indicação (X) nas colunas de vagas reservadas a pessoas com deficiência ou a negros na listagem de confirmação terá seu pedido considerado **indeferido**.', NULL, NULL),
    (v_modelo, 'comprovante_inscricao', 4, 0, 'item', 'O indeferimento decorre do não cumprimento de qualquer um dos requisitos obrigatórios ou da falta de entrega da documentação exigida para a reserva de vagas pretendida.', NULL, NULL),
    (v_modelo, 'comprovante_inscricao', 5, 0, 'item', 'O candidato que, após o pagamento da taxa, verificar que sua inscrição não foi confirmada ou que sua opção pelas vagas reservadas não consta na listagem oficial deverá interpor recurso, na forma dos subitens seguintes.', NULL, NULL),
    (v_modelo, 'comprovante_inscricao', 6, 1, 'item', 'Para a comprovação da regularidade, o candidato deverá inserir no envelope:', NULL, NULL),
    (v_modelo, 'comprovante_inscricao', 7, 2, 'item', 'o boleto bancário acompanhado do respectivo **comprovante definitivo de quitação**, não sendo aceito agendamento de pagamento;', NULL, NULL),
    (v_modelo, 'comprovante_inscricao', 8, 2, 'item', 'no caso de erro na indicação das vagas reservadas, o protocolo de entrega dos documentos — autodeclaração ou laudo médico — para que sejam verificados.', NULL, NULL),
    (v_modelo, 'comprovante_inscricao', 9, 1, 'item', 'O recurso de que trata este subitem destina-se exclusivamente à correção de erros no processamento de dados ou de pagamentos, não sendo permitida a inclusão de documentos obrigatórios que deixaram de ser entregues no período de inscrição.', NULL, NULL),
    (v_modelo, 'comprovante_inscricao', 10, 0, 'item', 'O recurso deverá ser entregue pelo próprio candidato ou por terceiro em {{campo:cronograma_recurso_inscricao}}, primeiro dia útil subsequente à divulgação da listagem de que trata o subitem {{item:listagem_confirmacao}}, na **{{campo:executora_endereco}}**, {{redigir:o horário de atendimento para a entrega — ex.: de 9h às 16h}}, em envelope lacrado tamanho ofício, contendo na parte externa e frontal os seguintes dados:', 'entrega_recurso_inscricao', NULL),
    (v_modelo, 'comprovante_inscricao', 11, 2, 'item', '**{{campo:natureza_juridica}}** para a **{{campo:orgao_demandante}}**;', NULL, NULL),
    (v_modelo, 'comprovante_inscricao', 12, 2, 'item', 'Referência: **INDEFERIMENTO DA CONFIRMAÇÃO DE INSCRIÇÃO**;', NULL, NULL),
    (v_modelo, 'comprovante_inscricao', 13, 2, 'item', 'nome completo e número de inscrição do candidato;', NULL, NULL),
    (v_modelo, 'comprovante_inscricao', 14, 2, 'item', 'cargo para o qual o candidato está concorrendo.', NULL, NULL),
    (v_modelo, 'comprovante_inscricao', 15, 0, 'item', 'O limite de entrega, conforme o subitem {{item:entrega_recurso_inscricao}}, é de **{{campo:limite_envelopes}}** envelope(s) por candidato.', NULL, NULL),
    (v_modelo, 'comprovante_inscricao', 16, 0, 'item', 'A decisão relativa ao deferimento ou indeferimento do recurso será publicada no endereço eletrônico **{{campo:site_oficial}}** em {{campo:cronograma_decisao_recurso_inscricao}}.', NULL, NULL),
    (v_modelo, 'comprovante_inscricao', 17, 0, 'item', 'Todas as informações de interesse do candidato estarão disponíveis no endereço eletrônico **{{campo:site_oficial}}**.', NULL, NULL),
    (v_modelo, 'comprovante_inscricao', 18, 0, 'item', 'Não serão aceitos documentos postados eletronicamente, via Correios ou por e-mail.', NULL, NULL);
END $$;

-- A versão do modelo acompanha a rodada.
UPDATE public.editais SET modelo_versao = '1.0' WHERE eh_modelo;
