-- colaboradores_backup_20260701 era um snapshot manual único (CREATE TABLE ... LIKE +
-- INSERT ... SELECT * FROM colaboradores), feito em 20260701211430_adcc92ea-*.sql antes
-- de alguma operação arriscada da época. Não é usada em nenhum lugar do código
-- (ver my_rules/estrutura/colaboradores.md) e ficou obsoleta. Removendo.
DROP TABLE IF EXISTS public.colaboradores_backup_20260701;
