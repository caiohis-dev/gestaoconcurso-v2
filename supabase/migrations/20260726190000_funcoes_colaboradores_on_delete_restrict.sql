-- Excluir uma função de colaborador apagava dado em cascata, em silêncio.
--
-- As três FKs que apontam para `funcoes_colaboradores` eram DESTRUTIVAS, não
-- protetivas:
--
--   colaboradores_prova.funcao_id        ON DELETE SET NULL  -> alocações ficavam sem
--                                                              função, inclusive em
--                                                              provas já realizadas
--   meta_colaboradores_unidade.funcao_id ON DELETE CASCADE   -> metas sumiam
--   valores_funcao_prova.funcao_id       ON DELETE CASCADE   -> valores de pagamento
--                                                              sumiam
--
-- Ou seja: excluir uma função em uso NÃO dava erro. Apagava registro financeiro de
-- várias provas sem nada acusar. A única barreira era o cliente (`useFuncoesAssociadas`
-- consulta as três tabelas e a página desabilita o botão) — uma chamada direta ao
-- PostgREST por um admin passava reto.
--
-- É a mesma lacuna que o tema dos CHECKs fechou para FORMATOS, agora em INTEGRIDADE
-- REFERENCIAL: a regra existia na UI e não no banco.
--
-- DECISÃO (2026-07-26): RESTRICT nos três, e NÃO soft delete. Foi considerado que o
-- `SET NULL` pudesse ser deliberado, para permitir aposentar uma função sem travar em
-- histórico antigo; o usuário confirmou que não existe função aposentada — o bloqueio
-- que a UI de /funcoes-colaboradores já faz É o comportamento correto. Esta migration
-- move esse bloqueio para onde ele não pode ser contornado.
--
-- MEDIDO ANTES DE APERTAR (banco local, cópia de produção, 2026-07-26):
--   colaboradores_prova ............ 554 linhas, 0 com funcao_id NULL
--   meta_colaboradores_unidade ..... 186
--   valores_funcao_prova ...........  24
--   funcoes_colaboradores ..........  18
-- Nenhuma linha órfã: o SET NULL nunca chegou a disparar em produção. Trocar para
-- RESTRICT não invalida nada existente e não exige saneamento prévio.
--
-- O erro passa a chegar ao cliente como 23503, que `useFuncoesColaboradores` traduz
-- nomeando QUAL uso está bloqueando (alocação, meta ou valor).

ALTER TABLE public.colaboradores_prova
  DROP CONSTRAINT IF EXISTS colaboradores_prova_funcao_id_fkey;
ALTER TABLE public.colaboradores_prova
  ADD CONSTRAINT colaboradores_prova_funcao_id_fkey
  FOREIGN KEY (funcao_id) REFERENCES public.funcoes_colaboradores(id)
  ON DELETE RESTRICT;

ALTER TABLE public.meta_colaboradores_unidade
  DROP CONSTRAINT IF EXISTS meta_colaboradores_unidade_funcao_id_fkey;
ALTER TABLE public.meta_colaboradores_unidade
  ADD CONSTRAINT meta_colaboradores_unidade_funcao_id_fkey
  FOREIGN KEY (funcao_id) REFERENCES public.funcoes_colaboradores(id)
  ON DELETE RESTRICT;

ALTER TABLE public.valores_funcao_prova
  DROP CONSTRAINT IF EXISTS valores_funcao_prova_funcao_id_fkey;
ALTER TABLE public.valores_funcao_prova
  ADD CONSTRAINT valores_funcao_prova_funcao_id_fkey
  FOREIGN KEY (funcao_id) REFERENCES public.funcoes_colaboradores(id)
  ON DELETE RESTRICT;
