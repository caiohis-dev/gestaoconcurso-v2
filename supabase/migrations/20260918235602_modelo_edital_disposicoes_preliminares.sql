-- ═══════════════════════════════════════════════════════════════════════════════════════
-- MODELO — capítulo `disposicoes_preliminares` (rodada 3 de 19)
-- ═══════════════════════════════════════════════════════════════════════════════════════
--
-- 🔴 ESTE ARQUIVO É GERADO. A fonte é `src/lib/edital-modelo/disposicoes-preliminares.ts`, e
-- o bloco abaixo sai de `sqlDoCapitulo("disposicoes_preliminares")`. O teste
-- `edital-modelo.test.ts` confere que os dois batem — editar aqui à mão faz o modelo nascer
-- diferente do que a suíte afirma. Ver `src/lib/edital-modelo/tipos.ts`.
--
-- 6 artigos, do capítulo 1 do Edital 004/2026. Sem referência cruzada a auditar: é o
-- primeiro capítulo, e ninguém aponta para trás dele.
--
-- ── DUAS COISAS DESTE CAPÍTULO QUE VALEM SABER ────────────────────────────────────────
--
-- 1. O item 1.1 carrega DOIS `{{redigir:}}` — o fundamento legal e a finalidade do cargo. No
--    Edital 004 eles são de Agente Comunitário de Saúde (Lei Federal 11.350/2006, Estratégia
--    Saúde da Família), e cada uma dessas leis aparece UMA vez no documento: pela regra do
--    catálogo não viram campo, e literais fariam o modelo publicar fundamento de saúde num
--    edital de magistério. O marcador carrega a instrução e o linter o trata como ERRO.
--
-- 2. O item 1.6 NÃO cita o número do anexo. Medido: o conteúdo programático é o Anexo I no
--    002 e no 003, e o Anexo II no 004 — porque lá o Anexo I é a abrangência territorial. É
--    referência calculada sem mecanismo, e "como anexo deste Edital" é impreciso e nunca
--    falso, contra um número errado em 2 dos 3 editais reais. Lacuna no backlog.
-- ═══════════════════════════════════════════════════════════════════════════════════════
--
-- 🔵 REGERADO na rodada 4, quando a numeração dos QUADROS foi medida. O item 1.1 dizia
--    "conforme indicado no Quadro I abaixo" — um número de quadro literal, o mesmo erro que
--    esta rodada evitou para os anexos. Medido: "Quadro II" é a prova no 002 e no 003 e as
--    vagas por UBSF no 004, que ainda chama a tabela da prova de Quadro II também. Agora o
--    artigo referencia o CAPÍTULO, cujo número é calculado.
--    ⚠️ Foi possível REGERAR porque esta migration ainda não estava commitada. Depois do
--    commit, "nunca edite uma migration já aplicada" é absoluto: a correção passa a ser uma
--    migration NOVA com UPDATE, e o teste de sincronia foi desenhado para sobreviver a isso.
-- ═══════════════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_modelo UUID;
BEGIN
  SELECT id INTO v_modelo FROM public.editais WHERE eh_modelo;
  IF v_modelo IS NULL THEN RETURN; END IF;

  IF EXISTS (SELECT 1 FROM public.edital_itens
             WHERE edital_id = v_modelo AND capitulo_chave = 'disposicoes_preliminares') THEN
    RETURN;
  END IF;

  INSERT INTO public.edital_itens
    (edital_id, capitulo_chave, ordem, nivel, tipo, texto, ancora, quadro_fonte)
  VALUES
    (v_modelo, 'disposicoes_preliminares', 0, 0, 'item', 'O **{{campo:natureza_juridica}}**, objeto deste Edital, a ser realizado sob a responsabilidade da **{{campo:entidade_executora}}**, nos termos do **{{campo:decreto_autorizador}}** e em estrita observância a {{redigir:o fundamento legal específico deste certame — os artigos da Constituição, leis federais e leis municipais que o autorizam}}, visa ao preenchimento de **cargos públicos** para **{{campo:cargos_do_edital}}**, {{redigir:a finalidade do cargo neste certame — que serviço público estas vagas atendem}}, conforme indicado no capítulo {{cap:quadro_de_cargos}}, bem como à formação de Cadastro de Reserva para as vagas que surgirem ou forem criadas dentro do prazo de validade do certame e de sua prorrogação, se houver, a contar da data de sua homologação.', 'objeto_do_certame', NULL),
    (v_modelo, 'disposicoes_preliminares', 1, 0, 'item', 'O **{{campo:natureza_juridica}}** será realizado através de Provas Objetivas de acordo com a habilitação exigida e os programas divulgados, e terá caráter eliminatório e classificatório.', NULL, NULL),
    (v_modelo, 'disposicoes_preliminares', 2, 0, 'item', 'O conhecimento prévio das normas contidas neste Edital é requisito essencial para a inscrição e participação neste certame. O candidato que, por qualquer motivo, deixar de atender às normas estabelecidas neste Edital será eliminado.', NULL, NULL),
    (v_modelo, 'disposicoes_preliminares', 3, 0, 'item', 'Os dados pessoais dos candidatos serão utilizados em conformidade com a Lei Federal nº 13.709/2018 (Lei Geral de Proteção de Dados Pessoais — LGPD) exclusivamente para as finalidades deste certame.', NULL, NULL),
    (v_modelo, 'disposicoes_preliminares', 4, 0, 'item', 'Ao inscrever-se, o candidato declara estar ciente e concordar com a utilização de seus dados pessoais para as etapas necessárias à realização deste certame.', NULL, NULL),
    (v_modelo, 'disposicoes_preliminares', 5, 0, 'item', 'O Conteúdo Programático deste certame será disponibilizado no endereço eletrônico **{{campo:site_oficial}}**, como anexo deste Edital.', 'conteudo_programatico_anexo', NULL);
END $$;

-- A versão do modelo acompanha a rodada; é ela que a clonagem grava no destino.
UPDATE public.editais SET modelo_versao = '0.3' WHERE eh_modelo;
