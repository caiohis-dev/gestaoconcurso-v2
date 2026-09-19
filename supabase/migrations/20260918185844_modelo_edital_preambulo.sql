-- ═══════════════════════════════════════════════════════════════════════════════════════
-- MODELO — capítulo `preambulo` (rodada 2 de 19)
-- ═══════════════════════════════════════════════════════════════════════════════════════
--
-- 🔴 ESTE ARQUIVO É GERADO. A fonte é `src/lib/edital-modelo/preambulo.ts`, e o bloco
-- abaixo sai de `sqlDoCapitulo("preambulo")`. O teste `edital-modelo.test.ts` confere que
-- os dois batem — editar aqui à mão faz o modelo nascer diferente do que a suíte afirma.
--
-- Por que o texto é autorado em TS se o modelo mora no banco: 300+ artigos escritos direto
-- num INSERT não passam por `npm test`, e a transcrição é justamente onde se erra. O fluxo
-- tem uma direção só — TS → migration → banco —, e depois do nascimento o banco é o dono.
-- Ver o cabeçalho de `src/lib/edital-modelo/tipos.ts`.
--
-- ── O QUE ESTE CAPÍTULO CONTÉM, E O QUE NÃO ───────────────────────────────────────────
--
-- Só o PARÁGRAFO de abertura. O cabeçalho empilhado (município · secretaria · natureza ·
-- número), que o 002 e o 003 publicam e o 004 não traz na transcrição, é identificação pura
-- derivável dos metadados — vem da exportação, não de artigo digitado.
--
-- 🔴 E ele sozinho já mata um defeito medido: `MUNICÍPIO DE V0LTA REDONDA`, com ZERO no
-- lugar do O, aparece 3× no Edital 002 e 1× no 003, e nenhuma vez no 004. Presente em dois
-- documentos e ausente no terceiro é a assinatura de copia-e-cola. Aqui o nome do município
-- é escrito uma vez e revisado em diff.
--
-- ── A GUARDA É POR CAPÍTULO, não por edital ───────────────────────────────────────────
--
-- `NOT EXISTS` olha os artigos DESTE capítulo. Guardando pelo edital, a rodada 2 semearia e
-- as rodadas 3 a 20 seriam no-op em qualquer banco que já tivesse o modelo. Guardando pelo
-- capítulo, cada rodada entra uma vez — e NENHUMA sobrescreve capítulo que alguém já editou
-- pela tela, que é o direito que a decisão de pôr o modelo no banco concedeu.
--
-- E se o modelo não existir (banco a meio caminho das migrations), o bloco simplesmente
-- retorna: é no-op, nunca erro.
-- ═══════════════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_modelo UUID;
BEGIN
  SELECT id INTO v_modelo FROM public.editais WHERE eh_modelo;
  IF v_modelo IS NULL THEN RETURN; END IF;

  IF EXISTS (SELECT 1 FROM public.edital_itens
             WHERE edital_id = v_modelo AND capitulo_chave = 'preambulo') THEN
    RETURN;
  END IF;

  INSERT INTO public.edital_itens
    (edital_id, capitulo_chave, ordem, nivel, tipo, texto, ancora, quadro_fonte)
  VALUES
    (v_modelo, 'preambulo', 0, 0, 'prosa', 'O **MUNICÍPIO DE VOLTA REDONDA**, através do **{{campo:signatario_cargo}}**, no uso de suas atribuições legais, torna público que estarão abertas as inscrições para o **{{campo:natureza_juridica}}** para **{{campo:cargos_do_edital}}**, visando ao provimento de vagas e formação de Cadastro de Reserva nos quadros da Administração Pública Municipal de Volta Redonda, a ser realizado sob o regime {{campo:regime_trabalho}}, nos termos do presente Edital.', NULL, NULL);
END $$;

-- A versão do modelo acompanha a rodada. É ela que a clonagem grava no edital de destino,
-- e é ela que responde "este edital nasceu antes de o capítulo X existir?".
UPDATE public.editais SET modelo_versao = '0.1' WHERE eh_modelo;
