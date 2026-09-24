-- Acrescenta 'financeiro' ao enum `app_role` (hoje: admin, user, coordenador,
-- superadmin, colaborador). É o papel do módulo Financeiro (gerador de remessa
-- CNAB 240 / PIX) — ver my_rules/analises/roadmap-modulo-financeiro.yaml, fase 1.
--
-- POR QUE UM PAPEL NOVO, E NÃO REAPROVEITAR 'admin'
-- O módulo é restrito a superadmin + financeiro; admin comum NÃO tem acesso — é a
-- assimetria D1 do roadmap, diferente de todos os módulos existentes (que são
-- superadmin+admin, ou +coordenador). Isso só é representável com um papel próprio.
--
-- POR QUE SOZINHO NUM ARQUIVO
-- No Postgres, um valor novo de enum não pode ser USADO na mesma transação em que é
-- criado, e cada migration roda na sua própria transação. Logo, qualquer migration
-- que grave ou compare 'financeiro' (a próxima, que estende has_role) precisa vir num
-- arquivo posterior a este.

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'financeiro';
