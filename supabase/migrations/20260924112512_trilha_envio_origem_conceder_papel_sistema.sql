-- A Edge Function `conceder-papel-sistema` (substituta da `create-admin`) também envia o
-- link de acesso pelo helper `enviarLinkAcesso`, que grava a trilha em
-- `log_envio_link_acesso`. A gravação é BEST-EFFORT: sem a origem nova nesta CHECK, o
-- INSERT seria recusado e só restaria um console.error — o convite sairia e a trilha
-- não o registraria. Perda silenciosa, exatamente o que a trilha existe para evitar.
ALTER TABLE public.log_envio_link_acesso
  DROP CONSTRAINT log_envio_link_acesso_origem_check;

ALTER TABLE public.log_envio_link_acesso
  ADD CONSTRAINT log_envio_link_acesso_origem_check CHECK (origem IN (
    'reivindicar-acesso',
    'public-create-colaborador',
    'incluir-email-cadastro',
    'recuperar-senha',
    'corrigir-email-acesso',
    'conceder-papel-sistema'
  ));
