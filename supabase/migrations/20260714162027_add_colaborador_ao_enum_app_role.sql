-- Acrescenta 'colaborador' ao enum `app_role` (que hoje tem admin, user, coordenador,
-- superadmin). É o papel concedido a quem reivindica ou cria a conta do portal do
-- colaborador, na refatoração descrita em
-- my_rules/analises/roadmap-auth-colaborador.md (etapa 1).
--
-- POR QUE UM PAPEL EM `user_roles`, E NÃO UMA COLUNA DE TIPO EM `profiles`
-- Ser colaborador e ter papel de gestão não são valores concorrentes de um mesmo
-- campo: dos 15 usuários existentes, 11 são colaboradores — e são exatamente os 2
-- admins e os 9 coordenadores. Um campo único forçaria escolher entre os dois e
-- rebaixaria a cúpula. `user_roles` já é multi-papel (UNIQUE (user_id, role)) e já é
-- o que a RLS entende via has_role().
--
-- POR QUE SOZINHO NUM ARQUIVO
-- No Postgres, um valor novo de enum não pode ser USADO na mesma transação em que é
-- criado, e cada migration roda na sua própria transação. Logo, qualquer migration
-- que grave 'colaborador' em user_roles (o backfill, por exemplo) precisa vir num
-- arquivo posterior a este.

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'colaborador';
