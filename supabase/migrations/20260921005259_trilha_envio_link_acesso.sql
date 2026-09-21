-- A trilha de envio do link de acesso, que não existia.
--
-- O QUE ESTAVA FALTANDO
-- "O e-mail saiu?" só se respondia INDIRETAMENTE, pelos carimbos de auth.users
-- (invited_at, confirmation_sent_at, recovery_sent_at) — que existem por sorte
-- (são do GoTrue), não por desenho nosso. Sem uma trilha própria: nenhum registro de
-- QUEM disparou, de QUAL porta (reivindicar-acesso? público? autosserviço?), nem dos
-- casos em que o generateLink ou o SMTP falharam — esses hoje só deixam
-- `console.error`, que ninguém lê depois do fato.
-- Ver my_rules/analises/analise-ultimo-acesso-e-convite.md §6.2.
--
-- ONDE ESCREVE: dentro de `_shared/enviarLinkAcesso`, NUM SÓ PONTO — não em cada uma
-- das 5 Edge Functions que a chamam. É a mesma lição do `registrarFalhaDeEnvio`: um
-- `{ ok }` descartado por um chamador já escondeu um defeito real por meses (o invite
-- que morria calado em e-mail com conta, corrigido em 2026-09-19). Repetir a escrita
-- em 5 lugares é repetir o risco de esquecer numa 6ª função futura.
--
-- POR QUE INSERT DIRETO E NÃO RPC (CLAUDE.md §2)
-- A regra "vários passos sem transação" vale para invariante de NEGÓCIO. Aqui não há
-- invariante a proteger: generateLink e o POST para send-email já são duas chamadas
-- HTTP fora de qualquer transação de banco — não há atomicidade a ganhar embrulhando
-- o INSERT numa função. A escrita é best-effort e nunca pode derrubar o envio real:
-- o helper embrulha em try/catch e nunca lança (mesmo contrato que o resto do módulo).
--
-- POR QUE NULLABLE em colaborador_id e colab_nome (diferente de log_email_autoinformado,
-- que exige os dois): a `recuperar-senha` atende QUALQUER conta do Auth, não só
-- colaborador — admin/coordenador não têm linha em `colaboradores`. Exigir NOT NULL
-- excluiria exatamente esses casos da trilha.
--
-- Verificação: supabase/functions/_shared/enviar-link-acesso.test.ts (Deno, dublês,
-- sem rede) e a consulta em docs/consulta-acesso-colaborador.sql.

CREATE TABLE IF NOT EXISTS public.log_envio_link_acesso (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ON DELETE SET NULL, não CASCADE — mesmo raciocínio de log_email_autoinformado:
  -- trilha de segurança que evapora quando o cadastro é apagado é o oposto do que
  -- ela existe para fazer.
  colaborador_id  uuid REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  -- Snapshot: mantém a linha legível depois de um SET NULL, e cobre o caso em que
  -- nunca houve colaborador_id (conta de gestão pura).
  colab_nome      text,

  email           text NOT NULL,

  origem          text NOT NULL CHECK (origem IN (
                    'reivindicar-acesso',
                    'public-create-colaborador',
                    'incluir-email-cadastro',
                    'recuperar-senha',
                    'corrigir-email-acesso'
                  )),

  -- Sempre preenchido: por construção, `enviarLinkAcesso` já resolveu 'invite' ou
  -- 'recovery' (explícito ou pelo 'auto') ANTES de qualquer envio ser tentado.
  tipo_usado      text NOT NULL CHECK (tipo_usado IN ('invite', 'recovery')),

  sucesso         boolean NOT NULL,
  -- Preenchido só quando sucesso = false: a mensagem de erro do generateLink ou do
  -- POST para send-email. É o que hoje só existe em console.error, perdido no log
  -- do runtime.
  motivo_falha    text,

  criado_em       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_log_envio_link_colab
  ON public.log_envio_link_acesso (colaborador_id);
CREATE INDEX IF NOT EXISTS idx_log_envio_link_data
  ON public.log_envio_link_acesso (criado_em DESC);
-- Funcional, no mesmo formato do índice único de colab_email — é por aqui que a
-- consulta de diagnóstico vai casar "essa pessoa" com "os e-mails que ela recebeu".
CREATE INDEX IF NOT EXISTS idx_log_envio_link_email
  ON public.log_envio_link_acesso (lower(trim(email)));

ALTER TABLE public.log_envio_link_acesso ENABLE ROW LEVEL SECURITY;

-- Leitura só para admin (superadmin herda por dentro do has_role — CLAUDE.md §8,
-- não precisa do OR explícito). Mesmo recorte de log_email_autoinformado.
-- A escrita não tem policy nenhuma de propósito: quem escreve é a Edge Function com
-- service_role, nunca um cliente autenticado.
DROP POLICY IF EXISTS "Admins veem a trilha de envio do link de acesso" ON public.log_envio_link_acesso;
CREATE POLICY "Admins veem a trilha de envio do link de acesso"
  ON public.log_envio_link_acesso FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

GRANT SELECT ON public.log_envio_link_acesso TO authenticated;
GRANT ALL    ON public.log_envio_link_acesso TO service_role;

COMMENT ON TABLE public.log_envio_link_acesso IS
  'Trilha de todo disparo de link de acesso (invite/recovery), escrita por _shared/enviar-link-acesso.ts. Responde "o e-mail saiu?" sem depender dos carimbos do GoTrue.';
