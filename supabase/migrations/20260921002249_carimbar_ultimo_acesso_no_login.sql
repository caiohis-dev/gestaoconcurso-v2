-- O "Último Acesso" volta a ser escrito — a partir daqui, sem corrigir o passado.
--
-- O QUE ESTAVA QUEBRADO
-- `colaboradores.colab_ultimo_acesso` perdeu os seus dois únicos escritores em
-- 2026-07-15: `register_colaborador_session` e `update_colaborador_session_activity`
-- eram do portal de login por código de 4 dígitos e foram dropadas na migration
-- 20260715125720_drop_rpcs_colaborador_antigas.sql. A LEITURA ficou — a coluna é
-- exibida em `/colaboradores` (ColaboradoresList) e em `/painel-dados-colaboradores`
-- (PainelDadosColaboradores) — e ninguém notou, porque a coluna continuou existindo
-- COM DADO DENTRO. É a perda silenciosa do §8 do CLAUDE.md: não dá erro, e parece
-- informação.
--
-- MEDIDO EM PRODUÇÃO em 2026-09-20, antes de escrever: das 274 contas vinculadas,
-- 263 entraram de verdade — e as 263 estão descritas errado. 71 aparecem como
-- "Nunca acessou" e 192 exibem uma data congelada de junho/julho. Não é a maioria,
-- é a TOTALIDADE. O carimbo mais recente da coluna era 2026-07-09; o login mais
-- recente de verdade, do próprio dia da medição.
--
-- O QUE MUDA: só o corpo de `vincular_colaborador_no_signin`, que já dispara
-- `AFTER UPDATE OF last_sign_in_at, email_confirmed_at ON auth.users` e já tem o
-- valor em mãos. O trigger em si NÃO é recriado — mesma condição `WHEN`, mesma
-- função. Nenhuma coluna nasce, nenhuma é dropada: o dump não é tocado (§3).
--
-- 🔵 SEM BACKFILL, POR DECISÃO DO USUÁRIO (2026-09-20): "o erro de informação
-- 'nunca acessou' não precisa ser corrigido para informações passadas". Cada pessoa
-- se corrige sozinha no primeiro login seguinte. Isso elimina o único passo manual
-- em produção que o conserto teria — um backfill iria para `seed.pos.sql` (§3:
-- migration de dado roda com a tabela ainda vazia), e lá ele NÃO roda sozinho.
-- Esquecê-lo seria falha silenciosa: schema certo, dado errado.
-- ⚠️ Não reabra propondo backfill "para deixar consistente": foi recusado com motivo.
--
-- Verificação: docs/bateria-vinculo-colaborador.sql (casos 9 a 12, mais os 8 antigos
-- como controle positivo de que o VÍNCULO não regrediu).

-- ---------------------------------------------------------------------------
-- 🔴 POR QUE O CARIMBO NÃO ENTRA NO `handle_new_user`
-- Seria o erro que esta migration existe para consertar, com outro nome. O
-- `generateLink` CRIA a conta no momento do ENVIO do convite, antes de qualquer
-- clique — foi medido contra o GoTrue em 2026-09-20. Carimbar no nascimento diria
-- "acessou" para quem só recebeu um e-mail. Acesso é `last_sign_in_at`, e mais nada.
--
-- 🔴 POR QUE DOIS BLOCOS `EXCEPTION` SEPARADOS, E NÃO UM
-- Esta função roda DENTRO da transação de login do GoTrue: exceção não tratada
-- impede a pessoa de entrar. O bloco já existia para o vínculo. Pendurar o carimbo
-- no MESMO bloco faria o vínculo falhar levar o carimbo junto (e vice-versa) — duas
-- coisas independentes com um destino só. Separados, cada um falha sozinho, e o
-- login sobrevive aos dois. O contrapeso de engolir erro continua sendo o
-- RAISE WARNING, que vai para o log do Postgres.
--
-- ⚠️ EFEITO COLATERAL CONHECIDO E ACEITO: `colaboradores` tem um BEFORE UPDATE
-- (`update_colaboradores_updated_at`) que faz `NEW.updated_at = now()`. Como
-- consequência, `updated_at` passa a significar "cadastro alterado OU pessoa logou".
-- Medido antes de aceitar: NENHUMA tela ou RPC lê `colaboradores.updated_at` hoje —
-- ele existe no tipo e em fixtures de teste, e mais nada. Preservá-lo exigiria
-- desarmar um trigger genérico dentro da transação de login, o que é mais risco do
-- que a deriva vale. **Se um dia alguém exibir "última alteração do cadastro", esta
-- é a linha que explica por que o valor não bate.**
--
-- MEDIDO antes de escrever: um `UPDATE public.colaboradores SET colab_ultimo_acesso
-- = now()` em TODAS as 821 linhas do banco local passa sem erro (em transação, com
-- ROLLBACK). Nenhuma CHECK e nenhum trigger da tabela barra a escrita — se barrasse,
-- o login de alguém morreria no WARNING sem ninguém saber.
CREATE OR REPLACE FUNCTION public.vincular_colaborador_no_signin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- 1. O vínculo colaborador↔conta. Vem PRIMEIRO de propósito: no primeiro login
  --    de uma conta que ainda não está vinculada, é ele que preenche `user_id` —
  --    e sem `user_id` o carimbo abaixo não encontraria a linha. Nesta ordem, o
  --    primeiro acesso vincula E carimba no mesmo disparo.
  BEGIN
    PERFORM public.vincular_colaborador_a_conta(NEW.id, NEW.email);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'vincular_colaborador_no_signin: vínculo falhou para a conta % (%) — login preservado',
      NEW.id, SQLERRM;
  END;

  -- 2. O carimbo do último acesso.
  --    ⚠️ A guarda dupla importa: o trigger também dispara quando muda
  --    `email_confirmed_at`, e confirmar e-mail NÃO é acesso. Sem o teste de
  --    DISTINCT FROM, uma confirmação sem sessão reescreveria o carimbo com o valor
  --    velho (ou com NULL) e a coluna voltaria a mentir, por outro caminho.
  BEGIN
    IF NEW.last_sign_in_at IS NOT NULL
       AND NEW.last_sign_in_at IS DISTINCT FROM OLD.last_sign_in_at THEN
      UPDATE public.colaboradores
         SET colab_ultimo_acesso = NEW.last_sign_in_at
       WHERE user_id = NEW.id;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'vincular_colaborador_no_signin: carimbo de último acesso falhou para a conta % (%) — login preservado',
      NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.vincular_colaborador_no_signin() IS
  'Gatilho de login/confirmação em auth.users: vincula o cadastro de colaborador à conta e carimba colaboradores.colab_ultimo_acesso com o last_sign_in_at. As duas partes rodam em blocos EXCEPTION separados porque a função executa dentro da transação de login do GoTrue — exceção ali impediria a pessoa de entrar.';
