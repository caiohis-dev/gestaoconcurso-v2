-- Subetapa 2D (= etapa 3), item 1 — REVOKE dos GRANT EXECUTE ... TO PUBLIC.
--
-- Fragilidade 1 do laudo (my_rules/analises/fragilidades-auth-colaborador.md), o
-- coração do problema: as RPCs SECURITY DEFINER do modelo /auth velho nasceram com
-- o EXECUTE padrão do Postgres para PUBLIC e não checam identidade nenhuma — recebem
-- um p_colaborador_id escolhido pelo cliente e obedecem. Como a anon key é pública,
-- qualquer um lê/edita/sequestra qualquer colaborador sabendo só o UUID.
--
-- O fluxo já não chama mais nenhuma destas (2A/2B/2C substituíram tudo pelas RPCs
-- ancoradas em auth.uid(): get_meu_colaborador / update_meu_colaborador /
-- update_meus_dados_bancarios). Aqui só trancamos a porta pública; o DROP destas
-- funções mortas é o item 3 desta mesma subetapa.
--
-- Escopo: TODAS as RPCs mortas do portal do colaborador, não só as três nomeadas na
-- fragilidade 1 — deixar verify_colaborador_password ou update_colaborador_data com
-- EXECUTE para PUBLIC manteria buracos da mesma classe abertos.
--
-- Deliberadamente FORA deste REVOKE (ainda vivas):
--   * is_colaborador_logged_in  — chamada em useColaboradores.tsx e referenciada na
--                                 policy de UPDATE de colaboradores; sai no item 4/DROP.
--   * get_coordenador_colaboradores — RPC do lado gestão, fora deste refactor.
--
-- REVOKE (ao contrário de DROP) não pode quebrar dependências internas: chamadas
-- feitas de dentro de outra função SECURITY DEFINER executam como o dono, não como
-- PUBLIC. O único risco seria uma chamada viva de anon/authenticated — e não há.

-- Leitura de dados / conta (o núcleo da fragilidade 1)
REVOKE EXECUTE ON FUNCTION public.get_colaborador_full_data(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_colaborador_by_id(uuid)      FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_colaborador_password(uuid, text) FROM PUBLIC;

-- Escrita de cadastro (todos os overloads que existem no banco)
REVOKE EXECUTE ON FUNCTION public.update_colaborador_data_full(uuid, text, text, text, date, text, text, text, integer, text, text, text, bigint, bigint, smallint, smallint, smallint, boolean, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_colaborador_data(uuid, text, text, text, integer, text, text, text, bigint, bigint, smallint, smallint, smallint, boolean, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_colaborador_data(uuid, text, integer, text, text, text, bigint, bigint, smallint, smallint, smallint, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_colaborador_data(uuid, text, text, text, integer, text, text, text, bigint, bigint, smallint, smallint, smallint, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_colaborador_bank_data(uuid, text, text, text, text, text, text) FROM PUBLIC;

-- Autenticação do modelo velho (código de 4 dígitos, senha, primeiro acesso)
REVOKE EXECUTE ON FUNCTION public.verify_colaborador_codigo_acesso(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.verify_colaborador_password(text, text)       FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.verify_colaborador_first_access(text, date)    FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_colaborador_has_password(text)           FROM PUBLIC;

-- Sessão forjável (fragilidade 8)
REVOKE EXECUTE ON FUNCTION public.register_colaborador_session(uuid)         FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.unregister_colaborador_session(uuid)       FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_colaborador_session_activity(uuid)  FROM PUBLIC;
