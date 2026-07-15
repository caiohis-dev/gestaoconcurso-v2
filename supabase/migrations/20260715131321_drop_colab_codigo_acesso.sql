-- Subetapa 2D — fecha o item 5: dropa a coluna colab_codigo_acesso.
--
-- Era a credencial do modelo /auth velho (código de 4 dígitos em texto puro,
-- fragilidade 2). Já não é escrita desde a 2C (o trigger generate_codigo_acesso
-- saiu) nem lida por nenhuma RPC (as antigas foram dropadas no item 3). As últimas
-- pontas no front — o e-mail em massa do PainelDadosColaboradores (aposentado agora,
-- item 6) e a coluna "Código de acesso" de dois exports — foram removidas no mesmo
-- commit. Com isso, nada mais referencia a coluna.
--
-- Sai junto o CHECK de formato colab_codigo_acesso_format (4 dígitos), que não faz
-- sentido sem a coluna. DROP COLUMN já removeria o CHECK em cascata; o DROP explícito
-- do constraint fica só como documentação da intenção.

ALTER TABLE public.colaboradores DROP CONSTRAINT IF EXISTS colab_codigo_acesso_format;
ALTER TABLE public.colaboradores DROP COLUMN IF EXISTS colab_codigo_acesso;
