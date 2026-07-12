ALTER TABLE public.colaboradores
  ADD COLUMN codigo_banco VARCHAR(3),
  ADD COLUMN agencia VARCHAR(8),
  ADD COLUMN agencia_dv VARCHAR(2),
  ADD COLUMN conta VARCHAR(20),
  ADD COLUMN conta_dv VARCHAR(2),
  ADD COLUMN tipo_conta VARCHAR(20),
  ADD CONSTRAINT chk_codigo_banco_numeros CHECK (codigo_banco ~ '^\d{3}$'),
  ADD CONSTRAINT chk_agencia_apenas_numeros CHECK (agencia ~ '^\d{1,8}$'),
  ADD CONSTRAINT chk_agencia_dv_formato CHECK (agencia_dv IS NULL OR agencia_dv ~* '^[0-9x]{1,2}$'),
  ADD CONSTRAINT chk_conta_apenas_numeros CHECK (conta ~ '^\d{1,20}$'),
  ADD CONSTRAINT chk_conta_dv_formato CHECK (conta_dv ~* '^[0-9x]{1,2}$'),
  ADD CONSTRAINT chk_tipo_conta_valido CHECK (tipo_conta IN ('corrente', 'poupanca'));