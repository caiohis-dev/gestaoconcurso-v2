-- ═══════════════════════════════════════════════════════════════════════════════════════
-- MODELO — capítulo `requisitos_investidura` (rodada 6 de 19)
-- ═══════════════════════════════════════════════════════════════════════════════════════
--
-- 🔴 ESTE ARQUIVO É GERADO. A fonte é `src/lib/edital-modelo/requisitos-investidura.ts`.
--
-- 15 artigos, do capítulo 4 do Edital 004/2026 — e é o PRIMEIRO capítulo transcrito por
-- inteiro, sem molde e sem nenhum `{{redigir:}}`. O contraste com o capítulo 3 é o que explica
-- a regra: estes requisitos são condições jurídicas de investidura em cargo público
-- (nacionalidade, idade, quitação eleitoral e militar, ausência de penalidade), e valem para
-- QUALQUER certame desta banca. Não há nada do cargo a redigir.
--
-- Conteúdo genérico o modelo entrega pronto; conteúdo do certame vira `{{redigir:}}`. É a mesma
-- pergunta que o catálogo de campos faz sobre dado, aplicada a prosa.
--
-- ── A territorialidade se AUTODENUNCIA, como no capítulo 2 ───────────────────────────
--
-- O 4.1.3 do 004 exige "residir dentro da área geográfica oferecida dentro do Quadro II". Aqui
-- ele referencia `{{cap:distribuicao_geografica}}`: num edital sem restrição territorial o
-- capítulo está desligado, o linter acusa `referencia-a-capitulo-excluido` como ERRO, e o
-- requisito diz sozinho que não se aplica. Sem isso, o modelo exigiria residência numa área que
-- o edital não define.
--
-- ── Correções silenciosas, registradas ───────────────────────────────────────────────
--
--   4.1.8          "portador de deficiência" -> "pessoa com deficiência" (o termo da LBI, e o
--                  que o resto do documento usa)
--   4.1.8, 4.1.12  terminavam sem ponto
--   4.1.9          terminava com ponto; a lista foi uniformizada com ponto e vírgula
--
-- ⚠️ O QUE NÃO MEXI, e pede revisão jurídica: o 4.1.8 recusa quem tenha "deficiência
-- incompatível com o exercício do cargo", o que convive mal com o capítulo de reserva de vagas
-- para PCD, que prevê perícia de compatibilidade. É decisão de mérito, não de transcrição.
-- ═══════════════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_modelo UUID;
BEGIN
  SELECT id INTO v_modelo FROM public.editais WHERE eh_modelo;
  IF v_modelo IS NULL THEN RETURN; END IF;

  IF EXISTS (SELECT 1 FROM public.edital_itens
             WHERE edital_id = v_modelo AND capitulo_chave = 'requisitos_investidura') THEN
    RETURN;
  END IF;

  INSERT INTO public.edital_itens
    (edital_id, capitulo_chave, ordem, nivel, tipo, texto, ancora, quadro_fonte)
  VALUES
    (v_modelo, 'requisitos_investidura', 0, 0, 'item', 'São requisitos básicos exigidos para a investidura no cargo público:', 'requisitos_de_investidura', NULL),
    (v_modelo, 'requisitos_investidura', 1, 1, 'item', 'Ser brasileiro nato ou naturalizado, ou cidadão português que tenha adquirido a igualdade de direitos e obrigações civis e o gozo dos direitos políticos;', NULL, NULL),
    (v_modelo, 'requisitos_investidura', 2, 1, 'item', 'Comprovar que possui o pré-requisito (habilitação) para o cargo pretendido;', NULL, NULL),
    (v_modelo, 'requisitos_investidura', 3, 1, 'item', 'Residir dentro da área geográfica oferecida, quando o cargo tiver restrição territorial, conforme o capítulo {{cap:distribuicao_geografica}};', NULL, NULL),
    (v_modelo, 'requisitos_investidura', 4, 1, 'item', 'Ter 18 (dezoito) anos completos na data da posse;', NULL, NULL),
    (v_modelo, 'requisitos_investidura', 5, 1, 'item', 'Conhecer as exigências contidas neste Edital, atender a elas e acatá-las;', NULL, NULL),
    (v_modelo, 'requisitos_investidura', 6, 1, 'item', 'Estar em dia com as obrigações eleitorais;', NULL, NULL),
    (v_modelo, 'requisitos_investidura', 7, 1, 'item', 'Gozar de boa saúde física e mental;', NULL, NULL),
    (v_modelo, 'requisitos_investidura', 8, 1, 'item', 'Não ser pessoa com deficiência incompatível com o exercício do cargo;', NULL, NULL),
    (v_modelo, 'requisitos_investidura', 9, 1, 'item', 'Não ter sofrido, no exercício de função em órgão público, penalidade incompatível com a nova investidura;', NULL, NULL),
    (v_modelo, 'requisitos_investidura', 10, 1, 'item', 'Estar em pleno gozo de seus direitos civis e políticos;', NULL, NULL),
    (v_modelo, 'requisitos_investidura', 11, 1, 'item', 'Não ter sido demitido por justa causa de órgão público federal, estadual ou municipal;', NULL, NULL),
    (v_modelo, 'requisitos_investidura', 12, 1, 'item', 'Não ser aposentado por invalidez;', NULL, NULL),
    (v_modelo, 'requisitos_investidura', 13, 1, 'item', 'Estar em dia com o Serviço Militar obrigatório, quando for o caso;', NULL, NULL),
    (v_modelo, 'requisitos_investidura', 14, 1, 'item', 'Não estar em acumulação de cargo, emprego ou função pública vedada pelo artigo 37, inciso XVI, da Constituição Federal.', NULL, NULL);
END $$;

-- A versão do modelo acompanha a rodada; é ela que a clonagem grava no destino.
UPDATE public.editais SET modelo_versao = '0.5' WHERE eh_modelo;
