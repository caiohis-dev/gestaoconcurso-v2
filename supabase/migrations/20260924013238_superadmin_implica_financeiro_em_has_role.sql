-- superadmin passa a satisfazer, no banco, toda checagem de 'financeiro' — mesma
-- filosofia da migration 20260725195530_superadmin_implica_admin_em_has_role.sql,
-- estendida para o novo papel do módulo Financeiro.
--
-- POR QUE AGORA, SEM NENHUMA TABELA `financeiro_*` AINDA
-- Esta fase (1 do roadmap) não cria tabela nenhuma para o módulo Financeiro — só o
-- papel e o guard de rota no front. Mas a decisão de hierarquia (D5 do roadmap) é do
-- domínio de "o que é ter um papel", não de uma tabela específica, e resolvê-la agora
-- evita repetir a classe de bug "superadmin não bate em muro" (já ocorreu 3x neste
-- repo) quando a fase de persistência escrever RLS sobre `financeiro_*` com
-- `has_role(auth.uid(), 'financeiro')`.
--
-- POR QUE SÓ SUPERADMIN ⇒ FINANCEIRO, E NÃO ADMIN ⇒ FINANCEIRO
-- `financeiro` é papel PARALELO a admin (como coordenador), não um degrau que admin
-- deve herdar — é a assimetria D1 do roadmap: admin comum não acessa o módulo. Só
-- superadmin, que já é o topo da hierarquia de gestão, ganha a implicação.
--
-- SEGURANÇA DA MUDANÇA
-- Mesma garantia da migration anterior: `has_role` só é usada como PORTEIRA (RLS e
-- `IF NOT has_role(...) THEN RAISE` em RPCs), nunca para filtrar linhas num WHERE de
-- listagem. O efeito só pode ser conceder mais ao superadmin, nunca esconder dado.

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND (
        role = _role
        -- superadmin herda admin — ver 20260725195530_superadmin_implica_admin_em_has_role.sql
        OR (role = 'superadmin'::app_role AND _role = 'admin'::app_role)
        -- superadmin herda financeiro — ver o cabeçalho desta migration
        OR (role = 'superadmin'::app_role AND _role = 'financeiro'::app_role)
      )
  )
$function$;

COMMENT ON FUNCTION public.has_role(uuid, app_role) IS
  'Checa se o usuario tem o papel. superadmin satisfaz tambem as checagens de admin e '
  'de financeiro (implicacoes de mao unica). Coordenador e colaborador NAO sao '
  'herdados: o primeiro e papel lateral, o segundo e outra dimensao.';
