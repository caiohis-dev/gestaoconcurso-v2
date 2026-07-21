-- Subetapa 2D — item 4 + parte do item 5: tira a trava de edição concorrente da
-- policy de UPDATE e apaga o que a sustentava.
--
-- A policy de UPDATE de colaboradores tinha `AND NOT is_colaborador_logged_in(id)`,
-- que impedia admin/coordenador de editar enquanto o colaborador estivesse "logado"
-- no portal. Esse mecanismo se apoiava em colaborador_sessions, alimentada pelas
-- funções register/unregister/update_colaborador_session_activity — todas já dropadas
-- no item 3. Sem ninguém escrevendo na tabela, is_colaborador_logged_in já devolvia
-- sempre false (a trava se auto-expirava). Decisão do roadmap: a proteção contra
-- edição concorrente vira dívida assumida; a cláusula sai para não deixar no banco um
-- texto que parece proteger e não protege.
--
-- Ordem: recriar a policy sem a trava PRIMEIRO (remove a referência à função), depois
-- dropar a função e a tabela. O pré-check equivalente no front (useColaboradores) sai
-- no mesmo commit.
--
-- NÃO entra aqui: o DROP da coluna colab_codigo_acesso (o resto do item 5). Ela ainda
-- é referenciada por dois exports (GerenciarProva, GerenciarColaboradoresProva) e pelo
-- e-mail em massa do PainelDadosColaboradores (o item 6, que é uma decisão de produto).
-- A coluna cai junto com o item 6.

-- 1) Policy de UPDATE sem a trava
DROP POLICY IF EXISTS "Admins and coordenadores can update colaboradores if not logged" ON public.colaboradores;

CREATE POLICY "Admins and coordenadores can update colaboradores"
ON public.colaboradores
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'coordenador'::app_role)
);

-- 2) A função da trava
DROP FUNCTION IF EXISTS public.is_colaborador_logged_in(uuid);

-- 3) A tabela órfã (suas policies caem junto)
DROP TABLE IF EXISTS public.colaborador_sessions;
