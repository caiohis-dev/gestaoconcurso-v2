-- ═══════════════════════════════════════════════════════════════════════════════════════
-- MODELO — capítulo `prova_objetiva` (rodada 14 de 19)
-- ═══════════════════════════════════════════════════════════════════════════════════════
--
-- 🔴 ESTE ARQUIVO É GERADO. A fonte é `src/lib/edital-modelo/prova-objetiva.ts`.
--
-- 42 artigos contra 43 elementos na fonte. O maior capítulo do documento.
--
-- ── A divergência: os itens 12.1 e 12.2 são a MESMA FRASE, uma por cargo ──────────────
--
-- "A Prova Objetiva para os candidatos às vagas de <cargo> constará de 10 questões de Língua
-- Portuguesa, 10 de Matemática e 30 de Conhecimentos Específicos…" — e o 12.2 repete tudo,
-- com os mesmos números, para o outro cargo. Num edital de oito cargos seriam oito itens.
-- É o que o QUADRO GERADO resolve: a matriz vem de `provas_disciplinas`, uma linha por cargo
-- × disciplina. O modelo leva UM item apontando para ele.
--
-- ── 🔴 O DÉCIMO defeito: o item 12.4 publica um campo de FORMULÁRIO ───────────────────
--
--   "…estão previstas para o **dia XX/xx/2026* em local e horário a ser informado…"
--
-- A data não foi preenchida no edital publicado, e o asterisco de negrito nem fecha. É o
-- defeito que o `{{campo:}}` torna impossível: a data vem da etapa `prova_objetiva` do
-- cronograma, e o linter acusa `campo-sem-valor` enquanto ela faltar.
--
-- ── A referência deslocada ────────────────────────────────────────────────────────────
--
--   12.18  "subitens de 11.10 a 11.15"  -> 12.10 a 12.15 (documento de identificação)
--
-- No capítulo 11 essa faixa é a da lactante, que nada tem com identificação.
--
-- ── ⏳ O que NÃO virou campo, e por quê ───────────────────────────────────────────────
--
-- Duração, tempo mínimo de permanência, tempo para levar o caderno e nota de corte moram em
-- `provas_objetivas_config`, cuja PK é `edital_cargo_id` — são POR CARGO, e `{{campo:}}` é
-- escalar e por edital (qualificador por cargo foi medido e rejeitado). O quadro gerado ainda
-- não rende essas colunas, então os três tempos são `{{redigir:}}` nomeando de onde o número
-- sai, e a nota de corte é "a pontuação mínima indicada para o seu cargo". No backlog.
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
             WHERE edital_id = v_modelo AND capitulo_chave = 'prova_objetiva') THEN
    RETURN;
  END IF;

  INSERT INTO public.edital_itens
    (edital_id, capitulo_chave, ordem, nivel, tipo, texto, ancora, quadro_fonte)
  VALUES
    (v_modelo, 'prova_objetiva', 0, 0, 'item', 'A prova objetiva de cada cargo é composta pelas disciplinas, pelo número de questões e pelo peso por questão indicados no quadro deste capítulo.', NULL, NULL),
    (v_modelo, 'prova_objetiva', 1, 0, 'quadro', 'Número de questões por disciplina e peso por questão, por cargo. O conteúdo programático sobre o qual as questões se baseiam segue como anexo deste Edital.', NULL, 'disciplinas'),
    (v_modelo, 'prova_objetiva', 2, 0, 'item', 'A prova objetiva está prevista para {{campo:cronograma_prova_objetiva}}, em local e horário a serem informados no comprovante de local de prova.', NULL, NULL),
    (v_modelo, 'prova_objetiva', 3, 0, 'item', 'Será considerado aprovado o candidato que atingir a pontuação mínima indicada para o seu cargo, **sem zerar em qualquer uma das áreas**.', NULL, NULL),
    (v_modelo, 'prova_objetiva', 4, 0, 'item', 'Nenhum candidato prestará o exame fora do local e do horário indicados, sob nenhuma hipótese.', NULL, NULL),
    (v_modelo, 'prova_objetiva', 5, 0, 'item', 'É de responsabilidade exclusiva do candidato a identificação correta do local indicado para a realização de sua prova e o comparecimento no horário estabelecido.', NULL, NULL),
    (v_modelo, 'prova_objetiva', 6, 0, 'item', 'Os locais de prova serão publicados no endereço eletrônico **{{campo:site_oficial}}**, para todos os candidatos, em {{campo:cronograma_comprovante_local_prova}}, {{redigir:o horário a partir do qual a publicação fica disponível}}.', NULL, NULL),
    (v_modelo, 'prova_objetiva', 7, 0, 'item', 'A folha de respostas é o **único documento válido para a correção da prova** e deverá ser preenchida com o devido cuidado, pois não haverá substituição.', NULL, NULL),
    (v_modelo, 'prova_objetiva', 8, 0, 'item', 'O candidato deverá chegar ao local da prova com **uma hora de antecedência** do horário previsto para o início, munido do documento original de identificação com foto, do comprovante de local de prova e de caneta esferográfica azul ou preta, de corpo transparente.', 'documentos_no_dia', NULL),
    (v_modelo, 'prova_objetiva', 9, 0, 'item', 'É de responsabilidade exclusiva do candidato o comparecimento no local correto indicado para a realização de sua prova, no horário estabelecido no comprovante de local de prova.', NULL, NULL),
    (v_modelo, 'prova_objetiva', 10, 0, 'item', 'Nenhum candidato entrará no prédio onde a prova será realizada após o horário estabelecido para o fechamento dos portões, sob qualquer alegação.', NULL, NULL),
    (v_modelo, 'prova_objetiva', 11, 0, 'item', 'Somente será admitido no local de prova o candidato munido do original de documento oficial de identidade, sendo aceitos passaporte, carteira de motorista com foto, carteira de trabalho e carteira oficial de órgão de classe.', NULL, NULL),
    (v_modelo, 'prova_objetiva', 12, 0, 'item', 'O documento oficial deverá estar em perfeitas condições, de forma a permitir a identificação do candidato pela foto e pela assinatura.', NULL, NULL),
    (v_modelo, 'prova_objetiva', 13, 0, 'item', 'No caso de perda ou roubo do documento de identificação, o candidato deverá apresentar certidão que ateste o registro da ocorrência em órgão policial, expedida há no máximo 30 (trinta) dias da data da prova objetiva, e ainda ser submetido à identificação especial, consistente na coleta de impressão digital.', 'perda_do_documento', NULL),
    (v_modelo, 'prova_objetiva', 14, 0, 'item', '**Não serão aceitos** como documento de identidade: protocolos de solicitação de documentos, certidão de nascimento, título eleitoral, carteira de estudante, carteira de agremiação desportiva, fotocópia de documento de identidade, ainda que autenticada, e documento ilegível ou não identificável.', NULL, NULL),
    (v_modelo, 'prova_objetiva', 15, 0, 'item', '**Documentos digitais não serão aceitos**, porque a autenticação depende de consulta a sistemas governamentais pela internet, o que pode comprometer a agilidade e a segurança do certame — seja por indisponibilidade de acesso, seja pelo tempo demandado diante do volume de candidatos —, além de haver momentos em que o candidato está impedido de utilizar o telefone celular.', NULL, NULL),
    (v_modelo, 'prova_objetiva', 16, 0, 'item', 'O candidato que não atender a um dos subitens {{item:documentos_no_dia}} a {{item:perda_do_documento}} não fará a prova.', NULL, NULL),
    (v_modelo, 'prova_objetiva', 17, 0, 'item', 'Será eliminado do **{{campo:natureza_juridica}}** o candidato que:', NULL, NULL),
    (v_modelo, 'prova_objetiva', 18, 2, 'item', 'for surpreendido em comunicação verbal, escrita ou por qualquer outro meio com outro candidato ou com pessoa estranha ao certame;', NULL, NULL),
    (v_modelo, 'prova_objetiva', 19, 2, 'item', 'utilizar-se de qualquer modalidade de consulta, tal como legislação, livros, impressos ou anotações;', NULL, NULL),
    (v_modelo, 'prova_objetiva', 20, 2, 'item', 'utilizar-se de sinais, marcações ou de quaisquer outras formas que quebrem o sigilo da prova ou que possibilitem sua identificação;', NULL, NULL),
    (v_modelo, 'prova_objetiva', 21, 2, 'item', 'utilizar-se de qualquer meio de comunicação externa;', NULL, NULL),
    (v_modelo, 'prova_objetiva', 22, 2, 'item', 'deixar de entregar a folha de respostas;', NULL, NULL),
    (v_modelo, 'prova_objetiva', 23, 2, 'item', 'ausentar-se do local de prova sem permissão;', NULL, NULL),
    (v_modelo, 'prova_objetiva', 24, 2, 'item', 'praticar ato de incorreção com qualquer fiscal ou auxiliar incumbido da aplicação da prova;', NULL, NULL),
    (v_modelo, 'prova_objetiva', 25, 2, 'item', 'ausentar-se do local de prova sem o acompanhamento do fiscal, após ter assinado a lista de presença;', NULL, NULL),
    (v_modelo, 'prova_objetiva', 26, 2, 'item', 'deixar de assinar a lista de presença ou a folha de respostas;', NULL, NULL),
    (v_modelo, 'prova_objetiva', 27, 2, 'item', 'entrar no local de aplicação da prova portando aparelho eletrônico, boné, óculos escuros, relógio ou quaisquer outros meios que sugiram possibilidade de comunicação, bem como equipamentos que possam causar danos a terceiros;', NULL, NULL),
    (v_modelo, 'prova_objetiva', 28, 2, 'item', 'recusar-se a desligar o telefone celular antes de colocá-lo no envelope de segurança;', NULL, NULL),
    (v_modelo, 'prova_objetiva', 29, 2, 'item', 'recusar-se a colocar qualquer outro objeto no local determinado pelo fiscal;', NULL, NULL),
    (v_modelo, 'prova_objetiva', 30, 2, 'item', 'sair da sala portando qualquer objeto, ainda que em caráter de emergência e acompanhado pelo fiscal;', NULL, NULL),
    (v_modelo, 'prova_objetiva', 31, 2, 'item', 'tirar fotos ou fazer gravações no recinto de aplicação da prova;', NULL, NULL),
    (v_modelo, 'prova_objetiva', 32, 2, 'item', 'copiar o gabarito;', NULL, NULL),
    (v_modelo, 'prova_objetiva', 33, 2, 'item', 'recusar-se a entregar a folha de respostas no horário em que o fiscal anunciar o término da prova.', NULL, NULL),
    (v_modelo, 'prova_objetiva', 34, 0, 'item', 'Os três últimos candidatos de cada sala só poderão sair juntos.', NULL, NULL),
    (v_modelo, 'prova_objetiva', 35, 0, 'item', 'O tempo máximo de duração da prova objetiva é de {{redigir:a duração da prova, como configurada para este cargo em `provas_objetivas_config`}}.', NULL, NULL),
    (v_modelo, 'prova_objetiva', 36, 0, 'item', 'O candidato só poderá deixar a sala depois de {{redigir:o tempo mínimo de permanência, como configurado para este cargo em `provas_objetivas_config`}} do início da prova, entregando ao fiscal a folha de respostas e o caderno de questões.', NULL, NULL),
    (v_modelo, 'prova_objetiva', 37, 0, 'item', 'O candidato só poderá levar o caderno de questões depois de {{redigir:o tempo mínimo para levar o caderno, como configurado para este cargo em `provas_objetivas_config`}} do início da prova, mediante a entrega da folha de respostas ao fiscal.', NULL, NULL),
    (v_modelo, 'prova_objetiva', 38, 0, 'item', 'Após o término da prova, o candidato deverá retirar-se imediatamente do local de aplicação, sendo proibida a permanência no prédio.', NULL, NULL),
    (v_modelo, 'prova_objetiva', 39, 0, 'item', 'Não haverá funcionamento de guarda-volumes, e a **{{campo:entidade_executora}}** não se responsabilizará por danos ou extravio de documentos ou objetos dos candidatos.', NULL, NULL),
    (v_modelo, 'prova_objetiva', 40, 0, 'item', 'A **{{campo:entidade_executora}}** não se responsabiliza por pertences esquecidos, perdidos, extraviados ou danificados.', NULL, NULL),
    (v_modelo, 'prova_objetiva', 41, 0, 'item', 'Não haverá, sob qualquer pretexto, segunda chamada de prova nem justificativa de falta, sendo o candidato faltoso eliminado do **{{campo:natureza_juridica}}**.', NULL, NULL);
END $$;

-- A versão do modelo acompanha a rodada.
UPDATE public.editais SET modelo_versao = '1.0' WHERE eh_modelo;
