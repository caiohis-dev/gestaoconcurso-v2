-- Subetapa 2D — RLS de verdade em colaboradores, ancorada em auth.uid().
--
-- A policy de SELECT era `USING (true)` para todo `authenticated`: qualquer conta
-- logada — inclusive um colaborador comum, que desde a 2A entra pelo Supabase Auth —
-- lia as 771 linhas inteiras (CPF, PIS, chave PIX, dados bancários). Com o modelo
-- velho isso passava porque o colaborador não era `authenticated`; agora é, então o
-- `USING (true)` virou um vazamento. Esta migration fecha isso.
--
-- Nova regra de leitura:
--   * admin e coordenador continuam vendo todos (via has_role) — a gestão depende
--     disso, e a filtragem por coordenador é feita no client (ver auth-e-permissoes.md);
--   * o colaborador comum passa a ver SÓ a própria linha (user_id = auth.uid()).
--
-- O colaborador lê/escreve o próprio cadastro pelas RPCs SECURITY DEFINER
-- (get_meu_colaborador / update_meu_colaborador / update_meus_dados_bancarios), que
-- rodam como dono e não passam por RLS — então apertar o SELECT não quebra o
-- /perfil-colaborador. A cláusula user_id = auth.uid() é defesa em profundidade: se
-- alguém bater direto na tabela com um token de colaborador, só alcança a si mesmo.
--
-- INSERT/UPDATE/DELETE ficam como estão (já são has_role admin/coordenador). A
-- retirada da trava `AND NOT is_colaborador_logged_in(id)` da policy de UPDATE é um
-- item à parte desta mesma subetapa (2D), não entra aqui.

DROP POLICY IF EXISTS "Authenticated users can view colaboradores" ON public.colaboradores;

CREATE POLICY "Gestao ve todos; colaborador ve so o proprio"
ON public.colaboradores
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'coordenador'::app_role)
  OR user_id = auth.uid()
);
