
CREATE TABLE IF NOT EXISTS public.bancos (
  codigo_compe VARCHAR(3) PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  apelido VARCHAR(100) NOT NULL
);

GRANT SELECT ON public.bancos TO anon, authenticated;
GRANT ALL ON public.bancos TO service_role;

ALTER TABLE public.bancos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Bancos são visíveis publicamente"
  ON public.bancos FOR SELECT
  USING (true);

INSERT INTO public.bancos (codigo_compe, nome, apelido) VALUES
  ('001', 'Banco do Brasil S.A.', 'Banco do Brasil'),
  ('104', 'Caixa Econômica Federal', 'Caixa'),
  ('341', 'Itaú Unibanco S.A.', 'Itaú'),
  ('237', 'Banco Bradesco S.A.', 'Bradesco'),
  ('033', 'Banco Santander (Brasil) S.A.', 'Santander'),
  ('260', 'Nu Pagamentos S.A.', 'Nubank'),
  ('077', 'Banco Inter S.A.', 'Inter'),
  ('336', 'Banco C6 S.A.', 'C6 Bank'),
  ('323', 'Mercado Pago Instituição de Pagamento Ltda.', 'Mercado Pago'),
  ('290', 'PagSeguro Internet Instituição de Pagamento S.A.', 'PagBank'),
  ('380', 'PicPay Serviços S.A.', 'PicPay'),
  ('756', 'Banco Cooperativo Sicoob S.A.', 'Sicoob'),
  ('748', 'Banco Cooperativo Sicredi S.A.', 'Sicredi'),
  ('389', 'Banco Mercantil do Brasil S.A.', 'Mercantil do Brasil')
ON CONFLICT (codigo_compe) DO NOTHING;

ALTER TABLE public.colaboradores
  ADD CONSTRAINT fk_colaboradores_banco
  FOREIGN KEY (codigo_banco) REFERENCES public.bancos(codigo_compe);
