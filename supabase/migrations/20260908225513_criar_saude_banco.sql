-- Sinal de vida diário do banco de produção — mitigação da pausa por inatividade.
--
-- POR QUE ISTO EXISTE (medido em 2026-09-08, não deduzido):
--   O projeto de produção (plano Free) pausou por inatividade e o sistema saiu do ar. O
--   sintoma real NÃO é o que a doc descrevia ("a página carrega e tudo falha"): o hostname
--   `zugigdpuxbpogoepdawm.supabase.co` passou a dar **NXDOMAIN autoritativo**, então o
--   navegador nem chegava a fazer requisição — "Network error when attempting to fetch".
--   Depois do restore manual, o DNS levou ~4min15 para voltar e os serviços internos mais
--   ~2min30 (Auth 502→200 aos 90s; PostgREST 521→404→401 aos 150s).
--
--   O plano Free pausa após 7 dias sem requisição, e `banco-producao.md` já registrava que
--   o perfil de uso deste sistema — rajada perto da prova, meses de silêncio — é exatamente
--   o gatilho. Um cron externo (no servidor que já serve o fevre.online) bate nesta tabela
--   uma vez por dia, via Edge Function `keep-alive`, para que os 7 dias nunca fechem.
--
-- 🔴 O QUE ISTO NÃO PROVA: que o critério de atividade do Supabase é satisfeito. Uma
--    escrita real disparada de fora é a coisa mais próxima disso que dá para construir,
--    mas a confirmação é empírica — passar mais de 7 dias sem uso e o projeto seguir ativo.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. A tabela
-- ─────────────────────────────────────────────────────────────────────────────
-- Formato UPSERT POR DIA, não append cego. A linha do dia nasce na primeira batida e é
-- atualizada nas seguintes, então o crescimento é limitado a 1 linha/dia (~365/ano)
-- INDEPENDENTEMENTE de quantas vezes o endpoint for chamado. Isso importa: o endpoint é
-- alcançável pela internet, e um append puro cresceria sem teto se alguém o martelasse.
--
-- O histórico é o que dá valor diagnóstico: ele mostra, depois do fato, exatamente quando
-- o sinal parou — e `batidas` denuncia chamada em excesso.
--
-- ⚠️ `dia` é a data em UTC, para ser determinística e imune a horário de verão. Os dois
--    timestamps são `timestamptz`, então continuam legíveis em qualquer fuso.
CREATE TABLE public.saude_banco (
  dia date PRIMARY KEY DEFAULT (now() AT TIME ZONE 'utc')::date,
  primeira_batida timestamp with time zone NOT NULL DEFAULT now(),
  ultima_batida timestamp with time zone NOT NULL DEFAULT now(),
  batidas integer NOT NULL DEFAULT 1
);

COMMENT ON TABLE public.saude_banco IS
  'Sinal de vida diario do projeto, gravado por um cron externo via Edge Function '
  'keep-alive. Existe para impedir a pausa por inatividade do plano Free (7 dias). '
  'Uma linha por dia (upsert), com contador de batidas. '
  'DETECTOR: se a linha mais recente tiver mais de 2 dias, o keep-alive esta quebrado.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. RLS — leitura só para admin, escrita só pela service_role
-- ─────────────────────────────────────────────────────────────────────────────
-- `has_role(auth.uid(), 'admin'::app_role)` é a forma canônica do repo e cobre o
-- superadmin: a hierarquia mora DENTRO da função (CLAUDE.md §8). SELECT literal em
-- `user_roles` já quebrou isso 3 vezes.
ALTER TABLE public.saude_banco ENABLE ROW LEVEL SECURITY;

-- ⚠️ `TO authenticated` EXPLÍCITO, ao contrário das migrations vizinhas. Policy sem
-- cláusula `TO` nasce `TO public` no Postgres — foi exatamente isso que a
-- `20260731110000_enxugar_grants_anon_e_fechar_policies_to_public.sql` teve de sair
-- varrendo em 46 policies. Nascer certo é mais barato que ser corrigido depois.
CREATE POLICY "Admins podem ver a saude do banco"
  ON public.saude_banco FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- SEM policy de INSERT/UPDATE/DELETE, de propósito: quem escreve é a `service_role`, que
-- ignora RLS. Sem policy, o PostgREST nega escrita a qualquer outro papel por padrão.

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. A função que grava a batida
-- ─────────────────────────────────────────────────────────────────────────────
-- A lógica mora no banco, não na Edge Function (CLAUDE.md §2): o incremento condicional é
-- uma operação só, atômica, e não se exprime como upsert do supabase-js.
CREATE OR REPLACE FUNCTION public.registrar_batida_saude()
RETURNS timestamp with time zone
LANGUAGE sql
SET search_path = public
AS $$
  INSERT INTO public.saude_banco (dia)
  VALUES ((now() AT TIME ZONE 'utc')::date)
  ON CONFLICT (dia) DO UPDATE
    SET ultima_batida = now(),
        batidas = public.saude_banco.batidas + 1
  RETURNING ultima_batida;
$$;

-- 🔴 O REVOKE NÃO É CERIMÔNIA — é o conserto de um padrão do Postgres que este repo ainda
-- carrega. Toda função nasce com EXECUTE concedido a PUBLIC (o que inclui `anon`), e
-- `anon` TEM `USAGE ON SCHEMA public` (20260712010000, nunca revogado). Sem este REVOKE,
-- a função seria chamável por qualquer um via `POST /rest/v1/rpc/registrar_batida_saude`
-- com a chave publishable, que é pública — e quem quisesse poderia inflar a tabela.
--
-- ⚠️ Os revokes deste repo são caso a caso (36 linhas) e NÃO existe um
-- `REVOKE ... ON ALL FUNCTIONS ... FROM PUBLIC` geral. Isso é dívida conhecida e mais
-- ampla que esta migration — vai para o backlog, e precisa ser MEDIDA contra
-- `pg_proc.proacl` no banco real antes de qualquer varredura.
REVOKE ALL ON FUNCTION public.registrar_batida_saude() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_batida_saude() TO service_role;

COMMENT ON FUNCTION public.registrar_batida_saude() IS
  'Grava a batida do dia em public.saude_banco (upsert, incrementando o contador). '
  'Chamada apenas pela Edge Function keep-alive, com a service_role. '
  'EXECUTE revogado de PUBLIC/anon/authenticated de proposito.';
