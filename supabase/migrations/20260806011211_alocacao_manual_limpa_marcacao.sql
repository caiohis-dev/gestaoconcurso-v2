-- Alocação MANUAL e marcação de "fora do automático" passam a ser mutuamente exclusivas.
--
-- Pedido do usuário (2026-08-05): quem foi colocado numa sala específica pelo botão "+"
-- não deve poder ser marcado como "fora da alocação automática", e a marcação que ele
-- tivesse passa a valer FALSO automaticamente.
--
-- 🔴 POR QUE ISSO É COERÊNCIA, E NÃO SÓ UI: as duas coisas dizem a MESMA coisa por
-- caminhos diferentes — "o plano não mexe nesta pessoa". `aplicar_plano_de_alocacao`
-- apaga só `origem='automatica'`, então quem tem alocação manual JÁ está fora do
-- automático por construção. Deixar a marcação ligada em cima disso é estado redundante,
-- e estado redundante diverge: bastaria retirar a pessoa da sala para sobrar uma marcação
-- que ninguém pôs conscientemente.
--
-- ⚠️ A marcação volta a ter sentido DEPOIS de a pessoa sair da sala: aí ela não tem mais
-- alocação nenhuma, entra de novo em `a_distribuir`, e marcar é a forma de mantê-la fora.
-- Por isso a regra é "enquanto houver alocação manual", não "para sempre".
--
-- As duas metades, porque uma sozinha deixa a porta aberta:
--   1. INSERT de alocação manual APAGA a marcação (a que o usuário pediu).
--   2. INSERT de marcação em quem tem alocação manual é RECUSADO (AL011) — a tela
--      desabilita o switch, mas tela é conveniência; a barreira é esta.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Colocar à mão limpa a marcação
-- ─────────────────────────────────────────────────────────────────────────────
-- AFTER INSERT: só faz sentido depois que a linha de alocação existe. E só para
-- `origem='manual'` — o plano insere milhares de linhas 'automatica' de uma vez, e
-- limpar marcação ali seria errado (a pessoa marcada nem entra no plano) além de caro.
CREATE FUNCTION public.alocacao_manual_limpa_marcacao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.origem = 'manual' THEN
    DELETE FROM candidatos_fora_do_automatico f
     WHERE f.prova_id = NEW.prova_id AND f.candidato_id = NEW.candidato_id;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.alocacao_manual_limpa_marcacao() IS
  'Colocar alguem numa sala A MAO apaga a marcacao de "fora do automatico" dele: as duas '
  'dizem a mesma coisa (o plano nao mexe nesta pessoa) e manter as duas seria estado '
  'redundante. So para origem=manual — o plano insere milhares de linhas automatica.';

CREATE TRIGGER alocacao_manual_limpa_marcacao
  AFTER INSERT ON public.candidatos_alocacao
  FOR EACH ROW EXECUTE FUNCTION public.alocacao_manual_limpa_marcacao();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. E o caminho inverso é recusado
-- ─────────────────────────────────────────────────────────────────────────────
-- A tela desabilita o switch de quem tem alocação manual, mas botão desabilitado é
-- CONVENIÊNCIA (CLAUDE.md §2). Sem esta metade, um INSERT por PostgREST recria o estado
-- redundante que a metade 1 existe para evitar.
--
-- ⚠️ Substitui a função do trigger de `candidatos_fora_do_automatico`, criada em
-- 20260805205719. As checagens antigas (PF001 e AL005) seguem inteiras — a nova entra
-- DEPOIS delas de propósito: prova finalizada continua respondendo PF001, e a regra nova
-- não ofusca a antiga.
CREATE OR REPLACE FUNCTION public.check_candidato_fora_do_automatico()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_prova_id uuid;
  v_candidato_id uuid;
  v_prova record;
BEGIN
  v_prova_id := coalesce(NEW.prova_id, OLD.prova_id);
  v_candidato_id := coalesce(NEW.candidato_id, OLD.candidato_id);

  SELECT p.prova_finalizada, p.edital_id, coalesce(e.nome, p.prova_edital) AS nome
    INTO v_prova
    FROM provas p LEFT JOIN editais e ON e.id = p.edital_id
   WHERE p.id = v_prova_id;

  IF v_prova.prova_finalizada THEN
    RAISE EXCEPTION
      'A prova "%" está finalizada: não é possível mudar quem fica fora da alocação automática. Reabra a prova para editar.',
      v_prova.nome
      USING ERRCODE = 'PF001';
  END IF;

  -- Só no INSERT: no DELETE o candidato pode até já ter mudado de edital, e impedir a
  -- limpeza seria prender a linha para sempre.
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (
      SELECT 1 FROM candidatos c
       WHERE c.id = v_candidato_id AND c.edital_id = v_prova.edital_id
    ) THEN
      RAISE EXCEPTION
        'O candidato não é do edital desta prova. A marcação foi recusada.'
        USING ERRCODE = 'AL005';
    END IF;

    -- 🔴 A regra nova (2026-08-05). Quem está numa sala À MÃO já está fora do automático
    -- por construção: o plano só apaga `origem='automatica'`. Marcar em cima disso é
    -- estado redundante — e sobraria uma marcação órfã no dia em que a pessoa saísse da
    -- sala, sem ninguém ter pedido.
    IF EXISTS (
      SELECT 1 FROM candidatos_alocacao a
       WHERE a.prova_id = v_prova_id
         AND a.candidato_id = v_candidato_id
         AND a.origem = 'manual'
    ) THEN
      RAISE EXCEPTION
        'Este inscrito já está numa sala escolhida à mão, então a distribuição automática não o toca. Retire-o da sala antes de marcá-lo como fora do automático.'
        USING ERRCODE = 'AL011';
    END IF;
  END IF;

  RETURN coalesce(NEW, OLD);
END;
$$;
