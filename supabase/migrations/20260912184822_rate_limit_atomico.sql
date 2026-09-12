-- Rate limit dos fluxos de acesso: atômico, falhando FECHADO, com retenção.
--
-- ⚠️ O timestamp do nome é UTC: isto foi escrito em 2026-09-12, à tarde (horário local).
--
-- Executa a ETAPA 1 de `my_rules/analises/roadmap-rate-limit-fluxos-de-acesso.yaml`
-- (o porquê está em `analise-rate-limit-login.md`, no mesmo diretório). As premissas do
-- roadmap, que é de 13/08, foram CONFERIDAS contra o código em 2026-09-12 — as quatro
-- continuavam valendo, letra por letra.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- OS TRÊS DEFEITOS DE MECÂNICA QUE ISTO FECHA
-- ─────────────────────────────────────────────────────────────────────────────
-- O desenho do teto sempre esteve certo; a engrenagem é que não estava. As duas Edge
-- Functions que já tinham teto (`reivindicar-acesso` e `recuperar-senha`) traziam ESTE
-- trecho, idêntico nas duas:
--
--     const { count } = await supabase
--       .from('reivindicacao_rate_limit')
--       .select('*', { count: 'exact', head: true })
--       .eq('ip', ip).gte('created_at', desde);
--     if ((count ?? 0) >= RATE_LIMIT_MAX) { ...429... }
--     await supabase.from('reivindicacao_rate_limit').insert({ ip });
--
--   🔴 D1 — FALHA ABERTO. O `error` da consulta é DESCARTADO. Se ela falhar (rede,
--      permissão, tabela indisponível), `count` vem `undefined`, `0 >= 5` é falso e a
--      requisição PASSA. O teto some exatamente quando o banco está em apuros.
--   🔴 D2 — NÃO É ATÔMICO. Checar e inserir são duas idas ao banco: 50 chamadas em
--      paralelo leem `count = 0` antes de qualquer INSERT e furam o teto de 5 juntas.
--   🔴 D4 — CRESCE PARA SEMPRE. Nada apaga linha velha.
--
-- A RPC abaixo resolve os três de uma vez, porque o corpo de uma função roda dentro de
-- UMA transação: o DELETE de retenção, o INSERT da tentativa e a contagem acontecem sem
-- janela entre eles, e um erro em qualquer ponto propaga para o chamador — que agora
-- BLOQUEIA em vez de liberar (o oposto exato do código de hoje; ver `_shared/rate-limit.ts`).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- A TABELA GANHA ESCOPO
-- ─────────────────────────────────────────────────────────────────────────────
-- Ela nasceu (20260714201650) para UMA porta e só tinha `ip`. Com quatro portas e tetos
-- diferentes, sem `escopo` o orçamento do cadastro público sairia do mesmo bolso do
-- "esqueci minha senha" — e apertar um apertaria o outro.
--
-- ⚠️ `ip` vira `chave`, e o nome importa: a Etapa 4 do roadmap usará a mesma tabela com
-- chave por ALVO (hash), não por origem. Chamá-la de `ip` convidaria alguém a gravar
-- CPF ou e-mail em claro ali — e a tabela viraria um registro de "quem tentou entrar",
-- que hoje não existe e que ninguém pediu.
--
-- Seguro para o `db reset`: medido em 2026-09-12, a tabela NÃO aparece em `seed.local.sql`
-- nem em `seed.pos.sql`, e está vazia no local. Em produção tinha 2 linhas, ambas de
-- teste (medido em 13/08) — não há dado a preservar.
-- 🔴 E a migration 20260714201650 NÃO é editada: o histórico é intocável.

ALTER TABLE public.reivindicacao_rate_limit RENAME COLUMN ip TO chave;

ALTER TABLE public.reivindicacao_rate_limit
  ADD COLUMN IF NOT EXISTS escopo text NOT NULL DEFAULT 'acesso';

-- O DEFAULT existiu só para a coluna nascer NOT NULL numa tabela que podia ter linhas.
-- Mantê-lo deixaria passar um INSERT sem escopo, que é o erro que a coluna veio impedir.
ALTER TABLE public.reivindicacao_rate_limit ALTER COLUMN escopo DROP DEFAULT;

DROP INDEX IF EXISTS public.idx_reivindicacao_rate_limit_ip_data;
CREATE INDEX IF NOT EXISTS idx_rate_limit_escopo_chave_data
  ON public.reivindicacao_rate_limit (escopo, chave, created_at DESC);

-- Para o expurgo global, que varre por data e ignora escopo/chave.
CREATE INDEX IF NOT EXISTS idx_rate_limit_data
  ON public.reivindicacao_rate_limit (created_at);

COMMENT ON TABLE public.reivindicacao_rate_limit IS
  'Tentativas dos fluxos publicos de acesso, para rate limit. Uma linha por tentativa. '
  '⚠️ `chave` NUNCA guarda CPF ou e-mail em claro: por origem e o IP (IPv6 normalizado '
  'para /64), por alvo e o HASH. Sem isso a tabela vira registro de quem tentou entrar.';


-- ─────────────────────────────────────────────────────────────────────────────
-- A RPC
-- ─────────────────────────────────────────────────────────────────────────────
-- Devolve TRUE quando a tentativa pode seguir; FALSE quando estourou o teto.
--
-- A tentativa é SEMPRE registrada, inclusive a que estoura — é o que mantém alguém que
-- martela do outro lado do teto enquanto continuar martelando. Contar depois de inserir
-- também é o que torna a decisão atômica: não há instante entre "contei" e "gravei".

CREATE OR REPLACE FUNCTION public.registrar_tentativa(
  p_escopo  text,
  p_chave   text,
  p_max     int,
  p_janela  interval
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total int;
BEGIN
  IF p_escopo IS NULL OR btrim(p_escopo) = '' OR p_chave IS NULL OR btrim(p_chave) = '' THEN
    RAISE EXCEPTION 'registrar_tentativa exige escopo e chave'
      USING ERRCODE = '22023';
  END IF;

  -- Retenção, nas duas escalas. A primeira condição mantém a janela desta chave enxuta;
  -- a segunda é o expurgo de verdade — sem ela, a chave que nunca mais volta ficaria na
  -- tabela para sempre (D4). 24h cobre com folga a maior janela em uso (60 min).
  DELETE FROM public.reivindicacao_rate_limit
   WHERE (escopo = p_escopo AND chave = p_chave AND created_at < now() - p_janela)
      OR created_at < now() - interval '24 hours';

  INSERT INTO public.reivindicacao_rate_limit (escopo, chave)
  VALUES (p_escopo, p_chave);

  SELECT count(*) INTO v_total
    FROM public.reivindicacao_rate_limit
   WHERE escopo = p_escopo
     AND chave = p_chave
     AND created_at >= now() - p_janela;

  RETURN v_total <= p_max;
END;
$$;

COMMENT ON FUNCTION public.registrar_tentativa(text, text, int, interval) IS
  'Registra uma tentativa e diz se ela pode seguir (true) ou estourou o teto (false). '
  'Atomica: retencao, insercao e contagem na mesma transacao. A tentativa bloqueada '
  'TAMBEM e registrada, entao quem martela continua barrado. Chamada so por '
  'service_role, de dentro das Edge Functions — ver supabase/functions/_shared/rate-limit.ts.';

-- 🔴 Só `service_role`. Esta função ESCREVE e decide barreira: se `anon` pudesse
-- executá-la, qualquer um consumiria o orçamento de um IP alheio (ou o próprio, para
-- limpar a janela). O padrão de revogar de PUBLIC vem da 20260908231620 — revogar de
-- `anon` diretamente não faria nada, porque o acesso dele vem de ser membro de PUBLIC.
REVOKE ALL ON FUNCTION public.registrar_tentativa(text, text, int, interval) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_tentativa(text, text, int, interval)
  TO service_role;
