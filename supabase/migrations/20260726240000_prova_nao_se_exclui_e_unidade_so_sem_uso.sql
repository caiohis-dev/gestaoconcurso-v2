-- Duas decisões do usuário em 2026-07-26, tomadas depois da segunda rodada da auditoria
-- de invariantes (ver estrutura/transversais/invariantes.md).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. PROVA NÃO SE EXCLUI. NEM COM SENHA.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `provas` era a raiz de SETE cascatas: prova_unidades (que por sua vez cascateia para
-- alocações, metas e ocorrências), valores_funcao_prova, coordenadores_prova,
-- salas_prova_distribuidas, email_atualizacao_log, ocorrencias_colaborador e
-- prova_edit_locks. Medido na prova principal: excluí-la levaria 531 alocações, as 19
-- ocorrências do banco, 17 valores de pagamento, 172 metas, 42 salas e 10 acessos de
-- coordenador.
--
-- Havia um portão forte no cliente — `PasswordConfirmDialog`, que exige a senha. A
-- decisão do usuário foi que **nem isso basta**: uma prova é o registro operacional e
-- financeiro de um concurso, e não deve existir caminho de exclusão.
--
-- DUAS CAMADAS, de propósito:
--   a) a policy de DELETE cai -> sem policy, a RLS nega por padrão (PostgREST, cliente);
--   b) o trigger recusa -> pega quem passa POR CIMA da RLS, isto é `service_role`, que é
--      como rodam as Edge Functions. Sem (b), qualquer EF ainda apagaria uma prova.
--
-- Consequência assumida: uma prova criada por engano também não pode ser apagada pelo
-- app. Se isso vier a incomodar, a saída é um conceito de "cancelada"/arquivada, não
-- reabrir o DELETE.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- 2. UNIDADE SÓ SE EXCLUI SE NÃO TIVER NENHUM USO.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `unidades_prova` cascateava para `prova_unidades`, que cascateia para alocações, metas
-- e ocorrências. A guarda era um AlertDialog genérico, sem checagem de uso. As 11
-- unidades do catálogo estão todas em uso: excluir a "ICT" levaria 110 alocações e 10
-- ocorrências, em silêncio.
--
-- "Uso" = estar vinculada a alguma prova. As duas FKs que representam isso viram
-- RESTRICT.
--
-- ⚠️ `sala_prova` CONTINUA CASCADE, de propósito: as salas cadastradas são parte da
-- unidade, não uso dela. Excluir uma unidade SEM prova nenhuma leva junto as salas dela
-- — que é o comportamento desejado, senão nenhuma unidade com sala cadastrada poderia
-- ser removida do catálogo.

-- ── 1. provas ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can delete provas" ON public.provas;

CREATE OR REPLACE FUNCTION public.impedir_exclusao_de_prova()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RAISE EXCEPTION 'Provas não podem ser excluídas. O registro de uma prova é permanente — ele guarda alocações, ocorrências e valores de pagamento.';
END;
$function$;

DROP TRIGGER IF EXISTS check_prova_nao_excluivel ON public.provas;
CREATE TRIGGER check_prova_nao_excluivel
  BEFORE DELETE ON public.provas
  FOR EACH ROW EXECUTE FUNCTION public.impedir_exclusao_de_prova();

-- ── 2. unidades_prova ────────────────────────────────────────────────────────
ALTER TABLE public.prova_unidades
  DROP CONSTRAINT IF EXISTS prova_unidades_unidade_id_fkey;
ALTER TABLE public.prova_unidades
  ADD CONSTRAINT prova_unidades_unidade_id_fkey
  FOREIGN KEY (unidade_id) REFERENCES public.unidades_prova(id)
  ON DELETE RESTRICT;

ALTER TABLE public.salas_prova_distribuidas
  DROP CONSTRAINT IF EXISTS salas_prova_distribuidas_sala_fk_unidade_fkey;
ALTER TABLE public.salas_prova_distribuidas
  ADD CONSTRAINT salas_prova_distribuidas_sala_fk_unidade_fkey
  FOREIGN KEY (sala_fk_unidade) REFERENCES public.unidades_prova(id)
  ON DELETE RESTRICT;
