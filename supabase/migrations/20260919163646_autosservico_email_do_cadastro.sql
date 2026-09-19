-- Autosserviço de e-mail: o colaborador sem e-mail informa o próprio.
--
-- O QUE MUDA
-- Até aqui, cadastro sem `colab_email` era beco sem saída: "Procure o coordenador".
-- Agora a pessoa informa o e-mail sozinha, em /auth, com CPF + e-mail.
--
-- 🔴 FRAGILIDADE ACEITA, POR DECISÃO EXPLÍCITA DO USUÁRIO (2026-09-19)
-- Isto NÃO tem prova de posse. O CPF não é credencial — está em documento, em ficha
-- de RH, e o sistema já confirma publicamente se um CPF existe (check-cpf-colaborador).
-- Quem souber o CPF de um dos 243 sem e-mail aponta o cadastro para a PRÓPRIA caixa,
-- recebe o convite, e o trigger handle_new_user lhe concede user_id + papel
-- 'colaborador'. Daí ele reescreve a chave PIX (update_meu_colaborador) e os dados
-- bancários (update_meus_dados_bancarios) daquela pessoa: o desfecho do ataque é
-- REDIRECIONAR PAGAMENTO, não só ver dado alheio.
--
-- Isso foi levantado antes de implementar e o usuário decidiu seguir assim, com a
-- fragilidade registrada para ser desfeita depois. O que a desfaz: OTP no telefone do
-- cadastro — 240 dos 243 têm telefone (medido). Ver
-- my_rules/analises/dividas-auth-colaborador.md §5 e o item no backlog.
--
-- O QUE ESTA MIGRATION FAZ, ENTÃO, É CONTER O QUE DÁ:
--   1. Só alcança cadastro SEM e-mail e NÃO vinculado (nunca substitui e-mail que já
--      existe — sem essa guarda a porta valeria para os 821, não para 243).
--   2. Serializa a corrida com SELECT ... FOR UPDATE: dois reivindicantes do mesmo CPF,
--      o segundo é recusado.
--   3. Deixa TRILHA. É a única chance de alguém perceber e desfazer, porque depois do
--      primeiro registro a porta se fecha e a pessoa legítima passa a ver o e-mail
--      mascarado de OUTRA pessoa sem entender por quê.
--
-- MEDIDO no banco local em 2026-09-19, antes de escrever: 821 colaboradores, 243 em
-- estado A e sem e-mail (o público-alvo), 0 vinculados sem e-mail, 3 admins com e-mail.
--
-- Verificação: docs/bateria-email-autoinformado.sql (8 casos, com controle positivo).

-- ---------------------------------------------------------------------------
-- 1. A trilha.
--
-- ⚠️ `email_atualizacao_log` NÃO serve para isto: tem `prova_id NOT NULL` (é histórico
-- de e-mail em massa por prova) e está morta desde 2026-07-15.
--
-- 🔴 ON DELETE SET NULL, e não CASCADE. O CASCADE de `email_atualizacao_log` é exceção
-- consciente para log de ENTREGA; trilha de SEGURANÇA que evapora quando alguém apaga o
-- cadastro é o oposto do que ela existe para fazer — apagar viraria o modo de encobrir.
CREATE TABLE IF NOT EXISTS public.log_email_autoinformado (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id  uuid REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  -- Snapshot do nome: é o que mantém a linha LEGÍVEL depois de um SET NULL. Sem ele, a
  -- trilha sobrevive à exclusão do cadastro e não diz de quem era — sobreviver sem
  -- significar nada não é trilha.
  colab_nome      text NOT NULL,
  email_informado text NOT NULL,
  origem          text NOT NULL CHECK (origem IN ('auth', 'cadastro-publico')),
  -- Chave de origem já normalizada pelo `chaveDeOrigem` do rate limit (IPv6 colapsado
  -- no /64). ⚠️ A tabela de rate limit deliberadamente NÃO guarda CPF nem e-mail em
  -- claro, para não virar um registro de "quem tentou entrar". Aqui a ponderação é
  -- outra, e vale dizer por quê: o e-mail já é o valor gravado no cadastro (não é dado
  -- novo), e sem a origem ninguém enxerga "estes 12 registros vieram do mesmo lugar" —
  -- que é exatamente o padrão de abuso que esta trilha existe para revelar.
  chave_origem    text,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  -- 🔴 Quando o aviso aos admins saiu. Existe porque o aviso é a ÚNICA detecção desta
  -- porta: se ele falhar calado, o evento vira invisível. Com esta coluna, "auto-registro
  -- sem aviso" é uma consulta, e não uma suposição.
  aviso_admins_em timestamptz
);

CREATE INDEX IF NOT EXISTS idx_log_email_autoinformado_colab
  ON public.log_email_autoinformado (colaborador_id);
CREATE INDEX IF NOT EXISTS idx_log_email_autoinformado_data
  ON public.log_email_autoinformado (criado_em DESC);

ALTER TABLE public.log_email_autoinformado ENABLE ROW LEVEL SECURITY;

-- Leitura só para gestão, como em `email_atualizacao_log`. A escrita não tem policy
-- nenhuma de propósito: quem escreve é a RPC (SECURITY DEFINER), nunca um cliente.
DROP POLICY IF EXISTS "Admins veem o log de e-mail autoinformado" ON public.log_email_autoinformado;
CREATE POLICY "Admins veem o log de e-mail autoinformado"
  ON public.log_email_autoinformado FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

GRANT SELECT ON public.log_email_autoinformado TO authenticated;
GRANT ALL    ON public.log_email_autoinformado TO service_role;

-- ---------------------------------------------------------------------------
-- 2. A RPC. Gravar o e-mail e registrar a trilha são DOIS passos — e "vários passos sem
-- transação" é um dos dois defeitos que mais se repetem neste repo (CLAUDE.md §8). Por
-- isso é uma função, e não duas chamadas do PostgREST.
--
-- Formato e unicidade NÃO são reimplementados aqui: já são do banco
-- (`chk_colab_email_formato` e o índice funcional `colaboradores_colab_email_key`).
CREATE OR REPLACE FUNCTION public.registrar_email_do_proprio_cadastro(
  p_cpf          text,
  p_email        text,
  p_origem       text DEFAULT 'auth',
  p_chave_origem text DEFAULT NULL
)
RETURNS TABLE (colaborador_id uuid, nome text, auditoria_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cpf   text := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');
  v_email text := btrim(coalesce(p_email, ''));
  v_id    uuid;
  v_nome  text;
  v_email_atual text;
  v_user_id     uuid;
  v_log_id uuid;
BEGIN
  IF length(v_cpf) <> 11 THEN
    RAISE EXCEPTION 'CPF inválido.' USING ERRCODE = 'P0001';
  END IF;

  IF v_email = '' OR length(v_email) > 255 THEN
    RAISE EXCEPTION 'Informe um e-mail válido.' USING ERRCODE = 'P0001';
  END IF;

  -- 🔴 O FOR UPDATE é o que resolve a corrida de dois reivindicantes do mesmo CPF:
  -- serializa, e o segundo relê a linha JÁ atualizada, caindo na guarda do e-mail
  -- preenchido. Sem ele, os dois leriam "sem e-mail" e o último a escrever levaria.
  SELECT c.id, c.colab_nome_completo, c.colab_email, c.user_id
    INTO v_id, v_nome, v_email_atual, v_user_id
    FROM public.colaboradores c
   WHERE c.colab_cpf = v_cpf
     FOR UPDATE;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Não encontramos um cadastro com esse CPF.' USING ERRCODE = 'P0001';
  END IF;

  -- 🔴 A guarda que separa 243 de 821: NUNCA substituir e-mail existente. Sem ela, esta
  -- porta deixaria de ser "o cadastro sem e-mail ganha um" e passaria a ser "qualquer
  -- cadastro muda de dono com um CPF".
  IF v_email_atual IS NOT NULL AND btrim(v_email_atual) <> '' THEN
    RAISE EXCEPTION 'Este cadastro já tem um e-mail. Use "Estou sem minha senha" e informe o seu e-mail, ou procure o coordenador.'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'Este cadastro já tem acesso ao sistema.' USING ERRCODE = 'P0001';
  END IF;

  -- 🔴 A guarda do Auth mora AQUI, e não na Edge Function, por três motivos:
  --   1. §2 — um `if` na EF não vale para psql, PostgREST nem script;
  --   2. é atômica com a escrita: não há janela entre perguntar e gravar;
  --   3. é EXATA. A consulta por HTTP (`admin/users?filter=`) é busca PARCIAL e precisa
  --      de conferência manual do e-mail; aqui a comparação é a mesma do índice único.
  -- E some o dilema do "Auth indisponível": não há HTTP a cair — se o banco cai, a
  -- transação inteira falha, fechada por construção.
  --
  -- ⚠️ Sem filtrar `deleted_at`: conta soft-deleted ainda ocupa o e-mail no índice do
  -- GoTrue, e o invite morreria com `email_exists`.
  --
  -- ⚠️ A mensagem é DELIBERADAMENTE a mesma da recusa por e-mail de outro colaborador,
  -- logo abaixo. Distingui-las faria desta porta um oráculo de "quem tem conta no
  -- sistema" — a `recuperar-senha` se recusa a revelar isso, e seria incoerente abrir
  -- aqui o que ela fecha lá.
  IF EXISTS (SELECT 1 FROM auth.users u WHERE lower(btrim(u.email)) = lower(v_email)) THEN
    RAISE EXCEPTION 'Não é possível usar este e-mail neste cadastro. Procure o coordenador.'
      USING ERRCODE = 'P0001';
  END IF;

  BEGIN
    -- As guardas voltam no WHERE, e não é redundância: é o predicado sendo reavaliado
    -- sobre a linha travada. Os IFs acima existem para dar MENSAGEM; este WHERE existe
    -- para dar GARANTIA.
    UPDATE public.colaboradores
       SET colab_email = v_email
     WHERE id = v_id
       AND user_id IS NULL
       AND (colab_email IS NULL OR btrim(colab_email) = '');

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Não foi possível registrar o e-mail neste cadastro.' USING ERRCODE = 'P0001';
    END IF;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'Não é possível usar este e-mail neste cadastro. Procure o coordenador.'
        USING ERRCODE = 'P0001';
    WHEN check_violation THEN
      RAISE EXCEPTION 'E-mail com formato inválido.' USING ERRCODE = 'P0001';
  END;

  -- ⚠️ `p_origem` e `p_chave_origem` vêm do CHAMADOR e são SÓ auditoria: nenhuma guarda
  -- acima os consulta. Parâmetro que o chamador envia não é identidade, nem sob
  -- SECURITY DEFINER — o precedente é a migration 20260912191749.
  INSERT INTO public.log_email_autoinformado
    (colaborador_id, colab_nome, email_informado, origem, chave_origem)
  VALUES (v_id, coalesce(v_nome, '(sem nome)'), v_email, coalesce(p_origem, 'auth'), p_chave_origem)
  RETURNING id INTO v_log_id;

  RAISE LOG 'registrar_email_do_proprio_cadastro: colaborador % recebeu e-mail autoinformado', v_id;

  RETURN QUERY SELECT v_id, v_nome, v_log_id;
END;
$$;

-- 🔴 Ela escreve PII sem autenticação nenhuma e é SECURITY DEFINER: não pode ficar ao
-- alcance do PostgREST. Função nova nasce com EXECUTE para PUBLIC — revogar de `anon`
-- sozinho não bastaria, porque o privilégio vem de PUBLIC.
REVOKE ALL ON FUNCTION public.registrar_email_do_proprio_cadastro(text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.registrar_email_do_proprio_cadastro(text, text, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_email_do_proprio_cadastro(text, text, text, text) TO service_role;

COMMENT ON FUNCTION public.registrar_email_do_proprio_cadastro(text, text, text, text) IS
  'Grava colab_email num cadastro SEM e-mail e NÃO vinculado, e registra a trilha, na mesma transação. Chamada só pela Edge Function incluir-email-cadastro (service_role). 🔴 Não tem prova de posse: fragilidade aceita por decisão em 2026-09-19, ver dividas-auth-colaborador.md §5.';

COMMENT ON TABLE public.log_email_autoinformado IS
  'Trilha de quem informou o próprio e-mail pela porta pública. É a única detecção de abuso dessa porta — ver dividas-auth-colaborador.md §5.';

-- ---------------------------------------------------------------------------
-- 3. Para quem vai o aviso.
--
-- Lê de `auth.users`, e NÃO de `profiles`: o trigger só escreve `profiles.email` no
-- nascimento da conta e não acompanha um rename (é o que a `corrigir-email-acesso`
-- documenta). Hoje os dois coincidem — medi, 0 divergências —, mas o aviso desta porta
-- é a única detecção que ela tem: mandá-lo para um endereço velho seria perdê-lo calado.
--
-- ⚠️ `has_role` NÃO serve aqui: ela responde "esta conta pode?", e o que se quer é a
-- LISTA. O `IN ('admin','superadmin')` é literal de propósito — e note que as mesmas
-- contas costumam ter os dois papéis, então o DISTINCT não é enfeite (medido: 3 contas,
-- e não 5 como a contagem por linha de papel sugere).
CREATE OR REPLACE FUNCTION public.emails_dos_admins()
RETURNS TABLE (email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT u.email::text
    FROM public.user_roles r
    JOIN auth.users u ON u.id = r.user_id
   WHERE r.role IN ('admin', 'superadmin')
     AND u.email IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.emails_dos_admins() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.emails_dos_admins() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.emails_dos_admins() TO service_role;
