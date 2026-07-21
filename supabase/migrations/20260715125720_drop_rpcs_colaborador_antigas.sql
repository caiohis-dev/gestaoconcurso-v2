-- Subetapa 2D — DROP das RPCs mortas do portal /auth velho.
--
-- Item 3 da 2D: aposentar de vez as funções que o modelo CPF+código usava. Já
-- estavam sem uso desde a 2A (o fluxo passou a resolver por auth.uid()) e tiveram o
-- EXECUTE revogado de PUBLIC no item 1 (migration 20260715072758). Agora somem.
--
-- Verificado antes de dropar: nenhuma função mantida as chama no corpo, nenhum
-- trigger aponta para elas, nenhuma policy as referencia, e o front só as menciona
-- num comentário (PerfilColaborador.tsx) e no types.ts gerado (regenerado à parte).
--
-- Escopo: as 15 assinaturas mortas (as três da fragilidade 1 + as da mesma classe,
-- exatamente o conjunto que o item 1 revogou). FICAM, vivas:
--   * is_colaborador_logged_in  — ainda referenciada na policy de UPDATE; sai junto
--                                 com a retirada da trava (item à parte da 2D).
--   * get_coordenador_colaboradores — RPC do lado gestão.
--   * check-cpf-colaborador (Edge Function) — checagem sem efeito colateral do
--                                 pré-cadastro, decidido manter na 2C.
--
-- IF EXISTS para o bootstrap da v2 ser idempotente.

-- Leitura de dados / conta (núcleo da fragilidade 1)
DROP FUNCTION IF EXISTS public.get_colaborador_full_data(uuid);
DROP FUNCTION IF EXISTS public.get_colaborador_by_id(uuid);
DROP FUNCTION IF EXISTS public.set_colaborador_password(uuid, text);

-- Escrita de cadastro (todos os overloads)
DROP FUNCTION IF EXISTS public.update_colaborador_data_full(uuid, text, text, text, date, text, text, text, integer, text, text, text, bigint, bigint, smallint, smallint, smallint, boolean, text, text);
DROP FUNCTION IF EXISTS public.update_colaborador_data(uuid, text, text, text, integer, text, text, text, bigint, bigint, smallint, smallint, smallint, boolean, text, text);
DROP FUNCTION IF EXISTS public.update_colaborador_data(uuid, text, integer, text, text, text, bigint, bigint, smallint, smallint, smallint, boolean);
DROP FUNCTION IF EXISTS public.update_colaborador_data(uuid, text, text, text, integer, text, text, text, bigint, bigint, smallint, smallint, smallint, boolean);
DROP FUNCTION IF EXISTS public.update_colaborador_bank_data(uuid, text, text, text, text, text, text);

-- Autenticação do modelo velho (código de 4 dígitos, senha, primeiro acesso)
DROP FUNCTION IF EXISTS public.verify_colaborador_codigo_acesso(text, text);
DROP FUNCTION IF EXISTS public.verify_colaborador_password(text, text);
DROP FUNCTION IF EXISTS public.verify_colaborador_first_access(text, date);
DROP FUNCTION IF EXISTS public.check_colaborador_has_password(text);

-- Sessão forjável (fragilidade 8)
DROP FUNCTION IF EXISTS public.register_colaborador_session(uuid);
DROP FUNCTION IF EXISTS public.unregister_colaborador_session(uuid);
DROP FUNCTION IF EXISTS public.update_colaborador_session_activity(uuid);
