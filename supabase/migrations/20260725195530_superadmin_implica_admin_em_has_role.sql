-- superadmin passa a satisfazer, no banco, toda checagem de 'admin'.
--
-- O PROBLEMA
-- `has_role` era um EXISTS literal em user_roles: `role = _role`. Sem hierarquia
-- nenhuma. Já o frontend define `isAdmin = role === 'admin' || role === 'superadmin'`
-- (useAuth.tsx). As duas camadas discordavam: a UI mostrava os botões ao superadmin
-- e o banco recusava a escrita.
--
-- O tamanho real disso, medido no banco local em 2026-07-25: **40 policies em 15
-- tabelas** checam 'admin' sem mencionar 'superadmin' (provas, colaboradores,
-- unidades_prova, sala_prova, editais, user_roles, profiles...). Apenas 3 policies
-- tinham o `OR has_role(..., 'superadmin')` explícito. Ou seja: um superadmin SEM
-- linha 'admin' não conseguia escrever praticamente nada.
--
-- Não explodiu até hoje porque os dois superadmins existentes também têm linha
-- 'admin' — a inconsistência estava armada, não detonada. O primeiro superadmin
-- criado "limpo" descobriria tudo de uma vez.
--
-- POR QUE AQUI, E NÃO NAS 40 POLICIES
-- Corrigir policy a policy seria 40 ALTERs para reafirmar a mesma regra, e deixaria
-- a próxima policy nova livre para repetir o esquecimento — foi exatamente assim que
-- a de `editais` (a mais recente, 2026-07-24) nasceu errada. A hierarquia é UMA regra
-- do domínio; ela pertence à função que define o que é "ter um papel".
--
-- POR QUE SÓ 'admin', E NÃO "superadmin satisfaz tudo"
-- Seria tentador fazer superadmin passar em qualquer checagem. Duas razões contra:
--   1. Espelha o frontend. Lá, admin/superadmin NÃO são `isCoordenador` — coordenador
--      é um papel lateral, e 'colaborador' é outra dimensão ("é uma pessoa cadastrada"),
--      não um degrau de poder. Fazer superadmin "ser colaborador" seria mentira semântica.
--   2. Não é preciso. Auditei o banco: não existe um só ponto onde coordenador é
--      autorizado e admin não. Em `ocorrencias_colaborador`, a única policy sem 'admin'
--      literal ("Coordenadores gerenciam ocorrências de suas provas") convive com a
--      policy "Admins e superadmins gerenciam todas as ocorrências" — e policies do
--      mesmo comando são OR. Logo `superadmin ⇒ admin` já garante que o superadmin não
--      bate em muro nenhum, sem inventar hierarquia onde o sistema não tem.
--
-- SEGURANÇA DA MUDANÇA
-- `has_role` só é usada como PORTEIRA (policies de RLS e `IF NOT has_role(...) THEN
-- RAISE` nas RPCs assign_coordenador_role, encerrar_ocorrencias_unidade,
-- finalizar_prova_unidade, reabrir_prova_unidade) — nunca para FILTRAR linhas num
-- WHERE de listagem. Portanto o efeito só pode ser conceder mais ao superadmin, nunca
-- esconder dado de ninguém. `has_role(x, 'superadmin')` continua estrito: a implicação
-- é de mão única.

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
        -- superadmin herda admin (e só admin) — ver o cabeçalho desta migration
        OR (role = 'superadmin'::app_role AND _role = 'admin'::app_role)
      )
  )
$function$;

COMMENT ON FUNCTION public.has_role(uuid, app_role) IS
  'Checa se o usuario tem o papel. superadmin satisfaz tambem as checagens de admin '
  '(implicacao de mao unica, espelhando isAdmin do useAuth). Coordenador e colaborador '
  'NAO sao herdados: o primeiro e papel lateral, o segundo e outra dimensao.';
