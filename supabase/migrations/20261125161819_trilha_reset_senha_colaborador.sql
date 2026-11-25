-- Trilha do "Resetar senha" do superadmin em /colaboradores (2026-11-25).
--
-- A Edge Function `resetar-senha-colaborador` define uma SENHA PROVISÓRIA na conta de
-- um colaborador e a devolve ao superadmin, para repassar à pessoa. É a saída para
-- quem não acessa a caixa de e-mail — o fluxo "Estou sem minha senha" não a alcança.
--
-- ⚠️ Isto reabre, POR DECISÃO DO USUÁRIO, um padrão que o repo aposentou duas vezes:
-- gestor conhecendo a senha de outra pessoa (`create-coordenador`, 12/09; `create-admin`,
-- 24/09, que SOBRESCREVIA a senha calado). A diferença é que aqui a sobrescrita é a
-- própria função — explícita, só superadmin, com confirmação — e DEIXA RASTRO. Esta
-- tabela é esse rastro: sem ela, "quem trocou a senha de fulano?" não tem resposta.
--
-- Quem escreve é só a EF (service_role). Não há policy de escrita, de propósito.
--
-- 🔴 ON DELETE SET NULL nas três FKs, e não CASCADE nem RESTRICT — mesmo raciocínio de
-- `log_email_autoinformado` (20260919163646): trilha de segurança que evapora quando se
-- apaga o cadastro ou a conta vira modo de encobrir; e RESTRICT faria um log travar a
-- exclusão de colaborador. Os snapshots de texto mantêm a linha LEGÍVEL depois do
-- SET NULL.

CREATE TABLE IF NOT EXISTS public.log_reset_senha (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id       uuid REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  colab_nome           text NOT NULL,
  -- A conta cuja senha mudou, e o e-mail DELA (é o login; pode divergir de colab_email).
  alvo_user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  alvo_email           text,
  -- Quem executou. A EF resolve pelo JWT, nunca pelo corpo da requisição.
  executado_por        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  executado_por_email  text,
  criado_em            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_log_reset_senha_colab
  ON public.log_reset_senha (colaborador_id);
CREATE INDEX IF NOT EXISTS idx_log_reset_senha_data
  ON public.log_reset_senha (criado_em DESC);

ALTER TABLE public.log_reset_senha ENABLE ROW LEVEL SECURITY;

-- Leitura só para SUPERADMIN — quem pode executar é quem pode auditar. Admin comum
-- não executa e não lê. `has_role`, nunca SELECT em user_roles.
DROP POLICY IF EXISTS "Superadmins veem a trilha de reset de senha" ON public.log_reset_senha;
CREATE POLICY "Superadmins veem a trilha de reset de senha"
  ON public.log_reset_senha FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'superadmin'));

REVOKE ALL ON public.log_reset_senha FROM anon, authenticated;
GRANT SELECT ON public.log_reset_senha TO authenticated;
GRANT ALL    ON public.log_reset_senha TO service_role;
