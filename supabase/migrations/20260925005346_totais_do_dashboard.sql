-- Os dois totais do `/dashboard` que dependiam de ler tabela inteira, agregados NO BANCO.
--
-- ⚠️ O timestamp deste arquivo é UTC: foi criado em 2026-09-24, à noite (horário local).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- POR QUE EXISTE
-- ─────────────────────────────────────────────────────────────────────────────
-- `Dashboard.tsx` fazia `select('colaborador_id')` em `colaboradores_prova` inteira para
-- contar distintos num `Set`, e `select('sala_capacidade')` em `sala_prova` inteira para
-- somar. O PostgREST corta em `max_rows` (1000) SEM ERRO: acima disso o card mostra número
-- errado e ninguém percebe.
--
-- MEDIDO em 2026-09-24 contra o banco local (cópia de produção): `colaboradores_prova` com
-- **977** linhas — eram 555 em 12/09, e provas não se apagam. O corte chegaria na próxima
-- prova. Esta função devolve os dois números já agregados: uma linha, imune ao teto.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- SEGURANÇA: `SECURITY INVOKER` (o padrão) — NÃO `DEFINER`
-- ─────────────────────────────────────────────────────────────────────────────
-- Mesmo raciocínio da `totais_da_prova` (20260911012952): em INVOKER a RLS de
-- `colaboradores_prova` continua valendo, e cada um só soma o que já podia ler. O admin vê
-- tudo pelo `has_role` (que carrega a hierarquia do superadmin); o coordenador, só as
-- provas que coordena. A rota `/dashboard` é `admin`, então para quem a tela serve o
-- número é o total — mas a função não vira atalho para ninguém ler além do que lê hoje.

CREATE OR REPLACE FUNCTION public.totais_do_dashboard()
RETURNS TABLE (
  colaboradores_atuaram bigint,
  capacidade_total bigint
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    (SELECT count(DISTINCT cp.colaborador_id) FROM public.colaboradores_prova cp),
    (SELECT coalesce(sum(sp.sala_capacidade), 0)::bigint FROM public.sala_prova sp);
$$;

COMMENT ON FUNCTION public.totais_do_dashboard() IS
  'Totais do /dashboard agregados no banco: colaboradores distintos que já atuaram e a '
  'capacidade somada das salas. SECURITY INVOKER — a RLS segue valendo. Existe porque ler as '
  'tabelas inteiras batia no max_rows (1000) do PostgREST, que corta sem erro.';

-- 🔴 Revogar de PUBLIC, não só de anon: o acesso de anon vem de ser membro de PUBLIC
-- (padrão da 20260908231620).
REVOKE ALL ON FUNCTION public.totais_do_dashboard() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.totais_do_dashboard() TO authenticated;
