-- Prova FINALIZADA congela o valor das funções. SQLSTATE `PF001`.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- POR QUE AGORA: o "valor congelado na alocação" nunca existiu
-- ─────────────────────────────────────────────────────────────────────────────
--
-- A doc do módulo afirmava que `colaboradores_prova.valor_pagamento` era copiado no
-- momento da alocação, e que mudar o valor da função não mexia em quem já estava alocado.
-- MEDIDO (2026-11-27, banco local = cópia de produção): **977 de 977 alocações com
-- `valor_pagamento` NULO**. Nenhuma tela grava a coluna — a alocação manda só unidade,
-- colaborador e função.
--
-- Quem lê o valor, portanto, lê AO VIVO de `valores_funcao_prova`:
--   • a Exportação DAF (`GerenciarProva`), que é a planilha que o módulo Financeiro
--     transforma em remessa PIX — o arquivo que vira dinheiro;
--   • o recibo de pagamento (`DocumentosImpressao`), que cai em R$ 0,00 sem valor.
--
-- DECISÃO DO USUÁRIO (2026-11-27): ASSUMIR o valor ao vivo (não implementar o
-- congelamento por alocação) e TRAVAR a mudança do valor quando a prova está finalizada.
-- Sem isto, mudar um valor depois da prova reescreveria, retroativamente e em silêncio,
-- o pagamento de todos os colaboradores daquela função — e o recibo já assinado
-- divergiria do arquivo pago.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- O NÍVEL: só a PROVA (não a unidade)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- O valor é chaveado por (prova, função) — não existe valor por unidade. Congelar quando
-- UMA unidade fecha travaria o valor das outras unidades, ainda abertas. Diferente das
-- salas (`check_sala_de_prova_finalizada`), que são por unidade e por isso congelam nos
-- dois níveis.
--
-- O caminho de volta é `reabrir_prova` (superadmin ou quem criou a prova): reabrir,
-- ajustar, finalizar de novo. É deliberadamente um gesto explícito.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- O QUE FOI MEDIDO ANTES (2026-11-27)
-- ─────────────────────────────────────────────────────────────────────────────
--
--   • 36 valores: **24 em 2 provas finalizadas** (passam a ficar congelados) e 12 em 1
--     prova aberta. Nada a sanear — o trigger vale para escrita futura.
--   • `valores_funcao_prova_prova_id_fkey` é CASCADE, mas `provas` não se exclui
--     (`check_prova_nao_excluivel`), então nenhum DELETE em cascata passa por aqui.
--   • `seed.pos.sql` não escreve nesta tabela; o dump carrega sob
--     `session_replication_role = replica` (linha 1), que desliga triggers na carga —
--     sem exceção por role, como no precedente `20260803003152`.

CREATE OR REPLACE FUNCTION public.check_valor_de_prova_finalizada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_prova_id uuid;
  v_finalizada boolean;
  v_nome text;
BEGIN
  -- UPDATE é checado dos DOIS lados: mover um valor PARA uma prova finalizada é tão
  -- proibido quanto mexer num que já está lá.
  FOREACH v_prova_id IN ARRAY
    CASE TG_OP
      WHEN 'INSERT' THEN ARRAY[NEW.prova_id]
      WHEN 'DELETE' THEN ARRAY[OLD.prova_id]
      ELSE ARRAY[OLD.prova_id, NEW.prova_id]
    END
  LOOP
    SELECT p.prova_finalizada, coalesce(e.nome, p.prova_edital)
      INTO v_finalizada, v_nome
      FROM provas p LEFT JOIN editais e ON e.id = p.edital_id
     WHERE p.id = v_prova_id;

    IF coalesce(v_finalizada, false) THEN
      RAISE EXCEPTION
        'A prova "%" está finalizada: o valor das funções não pode mais ser alterado, porque é ele que vai para a Exportação DAF e para os recibos. Reabra a prova para editar.',
        coalesce(v_nome, '(sem edital)')
        USING ERRCODE = 'PF001';
    END IF;
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS check_valor_de_prova_finalizada ON public.valores_funcao_prova;

CREATE TRIGGER check_valor_de_prova_finalizada
  BEFORE INSERT OR UPDATE OR DELETE ON public.valores_funcao_prova
  FOR EACH ROW EXECUTE FUNCTION public.check_valor_de_prova_finalizada();

COMMENT ON FUNCTION public.check_valor_de_prova_finalizada() IS
  'PF001 — congela valores_funcao_prova quando a prova esta finalizada: o valor e lido AO VIVO pela Exportacao DAF e pelo recibo (colaboradores_prova.valor_pagamento nunca foi preenchido). Sem excecao de role.';
