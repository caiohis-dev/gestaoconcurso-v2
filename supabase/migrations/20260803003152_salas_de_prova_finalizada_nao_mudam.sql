-- Prova (ou unidade) FINALIZADA congela as salas distribuídas. SQLSTATE `PF001`.
--
-- O que existia até aqui era só a AUSÊNCIA DO LINK: a visão de prova finalizada em
-- `GerenciarProva` não mostra o botão que leva a `/gerenciar-salas-distribuidas`. A rota
-- em si nunca olhou `prova_finalizada`, e o banco também não — URL na mão, aba antiga
-- aberta antes da finalização, PostgREST direto ou script gravavam normalmente. É o caso
-- do §2 do CLAUDE.md: botão escondido é conveniência, barreira é o banco.
--
-- MEDIDO ANTES (2026-08-03, banco local recém-resetado): 58 salas distribuídas em 4 pares
-- (prova, unidade), e **as 2 provas do dump estão finalizadas** — 11 dos 13 vínculos
-- também. Ou seja: o trigger passa a valer sobre TODAS as salas existentes. Vale para
-- escrita futura; nada a sanear.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- O NÍVEL: prova OU unidade — decisão do usuário (03/08)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- O ciclo de vida tem DOIS níveis, e eles divergem no dado real: há unidade aberta dentro
-- de prova já finalizada (medido: 2 de 13 vínculos). Congela-se nos dois:
--
--   • `provas.prova_finalizada`
--   • `prova_unidades.unidade_finalizada` daquela (prova, unidade)
--
-- ⚠️ CONSEQUÊNCIA QUE PRECISA SER DITA: `unidade_finalizada` é escrita por
-- `finalizar_prova_unidade`, que o **COORDENADOR** pode chamar. Ou seja, um coordenador
-- fechando a unidade dele passa a impedir o ADMIN de editar aquelas salas. É reversível
-- por `reabrir_prova_unidade` — mas é uma via nova de "coordenador bloqueia admin", e foi
-- escolha consciente.
--
-- ⚠️ SEGUNDA CONSEQUÊNCIA: `desvincular_unidade_da_prova` apaga as salas do snapshot, e
-- passa a ser recusado quando a unidade (ou a prova) está finalizada. É coerente com
-- "finalizada congela", chega com mensagem legível em vez de falhar calado, e o caminho
-- de volta é reabrir. Se um dia isso incomodar, o lugar de tratar é a RPC de desvincular,
-- não afrouxar este trigger.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- 🔴 POR QUE ISTO NÃO QUEBRA O `db reset` — e o carve-out que NÃO foi preciso
-- ─────────────────────────────────────────────────────────────────────────────
--
-- O dump (`seed.local.sql`) insere as provas JÁ com `prova_finalizada = true` e só depois
-- as salas delas. Um trigger cego recusaria a carga inteira — a mesma armadilha que a
-- constraint DEFERRABLE do 20260803001556 encontrou, e que só aparece rodando o reset.
--
-- Cheguei a escrever um carve-out por superusuário (`usesuper`) para isso. **Era
-- desnecessário e além disso NUNCA dispararia**, e a medição mostrou as duas coisas:
--
--   • o próprio dump abre com `SET session_replication_role = replica` (linha 9) e o
--     devolve a `origin` no fim — isso já desliga TRIGGERS e FK durante a carga;
--   • em Supabase o role `postgres` **não é superusuário** (`usesuper = f`), então a
--     condição do carve-out era falsa exatamente onde ela deveria valer.
--
-- Ficou sem exceção nenhuma: o trigger vale para todo mundo que escreve pelo caminho
-- normal — `authenticated`, `anon` e **`service_role`** (Edge Function, o caminho que já
-- surpreendeu duas vezes aqui). Quem quiser carregar dump segue usando
-- `session_replication_role`, que é explícito e local à sessão.

-- A checagem em si, separada para não repetir a mensagem em três ramos. Nomeia a prova e
-- diz o que fazer: mensagem de banco que só recusa transfere o problema para o usuário.
CREATE OR REPLACE FUNCTION public.recusa_sala_se_finalizada(p_prova_id uuid, p_unidade_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_finalizada boolean;
  v_unidade_finalizada boolean;
  v_nome text;
BEGIN
  SELECT p.prova_finalizada, coalesce(e.nome, p.prova_edital)
    INTO v_finalizada, v_nome
    FROM provas p LEFT JOIN editais e ON e.id = p.edital_id
   WHERE p.id = p_prova_id;

  IF coalesce(v_finalizada, false) THEN
    RAISE EXCEPTION
      'A prova "%" está finalizada: as salas não podem mais ser alteradas. Reabra a prova para editar.',
      coalesce(v_nome, '(sem edital)')
      USING ERRCODE = 'PF001';
  END IF;

  -- ⚠️ Sem vínculo em `prova_unidades` não há o que congelar (`coalesce(..., false)`).
  -- Sala sem vínculo não deveria existir, e inventar bloqueio aqui esconderia esse estado
  -- em vez de mostrá-lo.
  SELECT coalesce(pu.unidade_finalizada, false) INTO v_unidade_finalizada
    FROM prova_unidades pu
   WHERE pu.prova_id = p_prova_id AND pu.unidade_id = p_unidade_id;

  IF coalesce(v_unidade_finalizada, false) THEN
    RAISE EXCEPTION
      'Esta unidade já foi finalizada nesta prova: as salas não podem mais ser alteradas. Reabra a unidade para editar.'
      USING ERRCODE = 'PF001';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_sala_de_prova_finalizada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- UPDATE é checado dos DOIS lados: mover uma sala PARA dentro de uma prova finalizada
  -- é tão proibido quanto mexer numa que já está lá.
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM public.recusa_sala_se_finalizada(OLD.prova_id, OLD.sala_fk_unidade);
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM public.recusa_sala_se_finalizada(NEW.prova_id, NEW.sala_fk_unidade);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS check_sala_de_prova_finalizada ON public.salas_prova_distribuidas;

CREATE TRIGGER check_sala_de_prova_finalizada
  BEFORE INSERT OR UPDATE OR DELETE ON public.salas_prova_distribuidas
  FOR EACH ROW EXECUTE FUNCTION public.check_sala_de_prova_finalizada();

COMMENT ON FUNCTION public.check_sala_de_prova_finalizada() IS
  'PF001 — congela as salas distribuidas quando a prova OU a unidade esta finalizada. Sem excecao de role: a carga do dump se protege com session_replication_role = replica.';
