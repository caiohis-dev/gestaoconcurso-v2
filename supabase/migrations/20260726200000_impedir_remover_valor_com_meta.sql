-- Apagar o valor de pagamento de uma função deixava a meta dela órfã.
--
-- `MetaColaboradoresDialog` só lista funções que TÊM valor nesta prova. Quando o valor
-- some, a função desaparece do diálogo — mas a linha em `meta_colaboradores_unidade`
-- continua no banco, com a quantidade que alguém digitou.
--
-- O dano não é abstrato: `ProvaCard` lê a tabela direto e filtra `meta > 0`, então a
-- meta órfã CONTINUA APARECENDO no card da prova como função faltando gente. E a pessoa
-- não consegue zerá-la, porque sem valor ela não aparece mais no diálogo. Demanda
-- fantasma, visível onde se lê e inalcançável onde se edita.
--
-- POR QUE ISTO É TRIGGER, E NÃO FK: a meta é chaveada por (prova_unidade_id, funcao_id)
-- e o valor por (prova_id, funcao_id). A dependência cruza um nível (unidade -> prova),
-- e nenhuma FK expressa isso.
--
-- DECISÃO DO USUÁRIO (2026-07-26): BLOQUEAR a exclusão do valor, em vez de zerar as
-- metas junto. Zerar seria um clique só, mas perderia em silêncio o número planejado
-- ("12 fiscais nesta unidade") — a mesma classe de destruição silenciosa que o RESTRICT
-- das funções acabou de fechar. Bloquear tem atrito, mas o atrito aparece só quando a
-- exclusão é duvidosa: se ninguém planejou aquela função, as metas já são 0 e nada é
-- bloqueado.
--
-- POR QUE `quantidade_meta > 0` E NÃO "existe linha": o diálogo só faz upsert, nunca
-- apaga. Bloquear enquanto EXISTISSE linha criaria impasse — não há como remover a linha
-- pela tela, só zerá-la. Zerar é o gesto disponível, então é ele que destrava.
--
-- MEDIDO ANTES (banco local, cópia de produção, 2026-07-26): 186 metas, 24 valores,
-- **0 órfãs**. A dívida era preventiva; não houve o que sanear, e nenhuma decisão sobre
-- histórico precisou ser tomada.
--
-- SECURITY DEFINER de propósito: sem isso as consultas do trigger rodariam sob a RLS de
-- quem chama, e um coordenador que enxerga só as próprias unidades não veria as metas
-- das outras — a barreira ficaria porosa justamente para o usuário mais restrito.

CREATE OR REPLACE FUNCTION public.impedir_remover_valor_com_meta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM meta_colaboradores_unidade m
    JOIN prova_unidades pu ON pu.id = m.prova_unidade_id
    WHERE pu.prova_id = OLD.prova_id
      AND m.funcao_id = OLD.funcao_id
      AND m.quantidade_meta > 0
  ) THEN
    RAISE EXCEPTION 'Ainda há metas de colaboradores definidas para esta função nesta prova. Zere as metas antes de remover o valor.';
  END IF;

  RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS check_valor_sem_meta ON public.valores_funcao_prova;
CREATE TRIGGER check_valor_sem_meta
  BEFORE DELETE ON public.valores_funcao_prova
  FOR EACH ROW EXECUTE FUNCTION public.impedir_remover_valor_com_meta();
