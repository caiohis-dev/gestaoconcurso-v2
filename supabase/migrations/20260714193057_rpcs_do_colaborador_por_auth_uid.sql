-- Etapa 2A da refatoração do acesso do colaborador: a identidade passa a vir do Auth.
--
-- As RPCs antigas (get_colaborador_full_data, update_colaborador_data_full,
-- update_colaborador_bank_data) recebem p_colaborador_id DO CLIENTE e confiam nele —
-- é a fragilidade central do laudo: com a anon key, que é pública, qualquer um lê e
-- edita qualquer colaborador sabendo só o UUID.
--
-- Estas três nascem sem esse parâmetro: elas resolvem o colaborador por
-- auth.uid() -> colaboradores.user_id. Não há o que forjar — o id vem do JWT.
--
-- As antigas continuam existindo por ora (o fluxo velho ainda depende delas). Elas
-- são aposentadas na etapa D, junto com o REVOKE dos GRANTs a PUBLIC.
--
-- Ver my_rules/analises/roadmap-auth-colaborador.md.

-- ---------------------------------------------------------------------------
-- O resolvedor. Uma fonte única para "quem sou eu", usada pelas três RPCs abaixo.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.meu_colaborador_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT c.id
  FROM colaboradores c
  WHERE c.user_id = auth.uid()
$$;

COMMENT ON FUNCTION public.meu_colaborador_id() IS
  'O colaborador da sessão atual, resolvido por auth.uid(). NULL se o usuário não '
  'estiver vinculado a nenhum cadastro (o normal para admins que não são colaboradores). '
  'auth.uid() NULL não casa com nada: user_id = NULL é sempre falso.';

-- ---------------------------------------------------------------------------
-- Leitura. Espelha get_colaborador_full_data, sem o parâmetro.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_meu_colaborador()
RETURNS TABLE(
  id uuid, colab_matricula text, colab_nome_completo text, colab_cpf text,
  colab_nacionalidade text, colab_pis text, colab_rua text, colab_numero_casa integer,
  colab_complemento_endereco text, colab_bairro text, colab_cidade text, colab_cep bigint,
  colab_telefone bigint, colab_grau_instrucao smallint, colab_estado_civil smallint,
  colab_raca smallint, colab_deficiente boolean, colab_data_nascimento date,
  colab_email text, colab_chave_pix text, codigo_banco text, agencia text,
  agencia_dv text, conta text, conta_dv text, tipo_conta text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    COALESCE(c.colab_matricula, '')::TEXT,
    COALESCE(c.colab_nome_completo, '')::TEXT,
    c.colab_cpf::TEXT,
    COALESCE(c.colab_nacionalidade, '')::TEXT,
    COALESCE(c.colab_pis, '')::TEXT,
    COALESCE(c.colab_rua, '')::TEXT,
    COALESCE(c.colab_numero_casa, 0)::INTEGER,
    COALESCE(c.colab_complemento_endereco, '')::TEXT,
    COALESCE(c.colab_bairro, '')::TEXT,
    COALESCE(c.colab_cidade, '')::TEXT,
    COALESCE(c.colab_cep, 0)::BIGINT,
    COALESCE(c.colab_telefone, 0)::BIGINT,
    COALESCE(c.colab_grau_instrucao, 0)::SMALLINT,
    COALESCE(c.colab_estado_civil, 0)::SMALLINT,
    COALESCE(c.colab_raca, 0)::SMALLINT,
    c.colab_deficiente,
    c.colab_data_nascimento,
    COALESCE(c.colab_email, '')::TEXT,
    COALESCE(c.colab_chave_pix, '')::TEXT,
    COALESCE(c.codigo_banco, '')::TEXT,
    COALESCE(c.agencia, '')::TEXT,
    COALESCE(c.agencia_dv, '')::TEXT,
    COALESCE(c.conta, '')::TEXT,
    COALESCE(c.conta_dv, '')::TEXT,
    COALESCE(c.tipo_conta, '')::TEXT
  FROM colaboradores c
  WHERE c.user_id = auth.uid();
END;
$$;

-- ---------------------------------------------------------------------------
-- Escrita: dados cadastrais. Espelha update_colaborador_data_full, sem o parâmetro,
-- com as mesmas validações.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_meu_colaborador(
  p_nome_completo text, p_cpf text, p_nacionalidade text, p_data_nascimento date,
  p_matricula text, p_pis text, p_rua text, p_numero_casa integer, p_complemento text,
  p_bairro text, p_cidade text, p_cep bigint, p_telefone bigint,
  p_grau_instrucao smallint, p_estado_civil smallint, p_raca smallint,
  p_deficiente boolean, p_email text, p_chave_pix text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cpf_clean text;
  v_nome text;
  v_id uuid := public.meu_colaborador_id();
BEGIN
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Sua conta não está vinculada a um cadastro de colaborador.'
      USING ERRCODE = 'P0001';
  END IF;

  v_nome := NULLIF(TRIM(p_nome_completo), '');
  IF v_nome IS NULL THEN
    RAISE EXCEPTION 'Nome completo é obrigatório.' USING ERRCODE = 'P0001';
  END IF;

  v_cpf_clean := LPAD(regexp_replace(COALESCE(p_cpf, ''), '\D', '', 'g'), 11, '0');
  IF length(v_cpf_clean) <> 11 OR v_cpf_clean = '00000000000' THEN
    RAISE EXCEPTION 'CPF inválido.' USING ERRCODE = 'P0001';
  END IF;

  IF p_data_nascimento IS NULL THEN
    RAISE EXCEPTION 'Data de nascimento é obrigatória.' USING ERRCODE = 'P0001';
  END IF;

  UPDATE colaboradores
  SET
    colab_nome_completo = v_nome,
    colab_cpf = v_cpf_clean,
    colab_nacionalidade = NULLIF(p_nacionalidade, ''),
    colab_data_nascimento = p_data_nascimento,
    colab_matricula = NULLIF(p_matricula, ''),
    colab_pis = NULLIF(p_pis, ''),
    colab_rua = NULLIF(p_rua, ''),
    colab_numero_casa = NULLIF(p_numero_casa, 0),
    colab_complemento_endereco = NULLIF(p_complemento, ''),
    colab_bairro = NULLIF(p_bairro, ''),
    colab_cidade = NULLIF(p_cidade, ''),
    colab_cep = NULLIF(p_cep, 0),
    colab_telefone = NULLIF(p_telefone, 0),
    colab_grau_instrucao = NULLIF(p_grau_instrucao, 0),
    colab_estado_civil = NULLIF(p_estado_civil, 0),
    colab_raca = NULLIF(p_raca, 0),
    colab_deficiente = p_deficiente,
    colab_email = NULLIF(p_email, ''),
    colab_chave_pix = NULLIF(p_chave_pix, ''),
    updated_at = NOW()
  WHERE id = v_id;

  RETURN FOUND;

EXCEPTION
  -- colab_email e colab_chave_pix ganharam índice único em 20260714163506. Sem isto,
  -- o colaborador que digitasse um e-mail já usado por outro veria o erro cru do
  -- Postgres, com nome de índice.
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Este e-mail ou chave PIX já está em uso por outro colaborador.'
      USING ERRCODE = 'P0001';
END;
$$;

-- ---------------------------------------------------------------------------
-- Escrita: dados bancários. Espelha update_colaborador_bank_data, sem o parâmetro.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_meus_dados_bancarios(
  p_codigo_banco text, p_agencia text, p_agencia_dv text,
  p_conta text, p_conta_dv text, p_tipo_conta text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_codigo_banco text := NULLIF(p_codigo_banco, '');
  v_agencia text := NULLIF(p_agencia, '');
  v_agencia_dv text := NULLIF(p_agencia_dv, '');
  v_conta text := NULLIF(p_conta, '');
  v_conta_dv text := NULLIF(p_conta_dv, '');
  v_tipo_conta text := NULLIF(p_tipo_conta, '');
  v_id uuid := public.meu_colaborador_id();
BEGIN
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Sua conta não está vinculada a um cadastro de colaborador.'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_tipo_conta IS NOT NULL AND v_tipo_conta NOT IN ('corrente','poupanca') THEN
    RAISE EXCEPTION 'Tipo de conta inválido. Use "corrente" ou "poupanca".' USING ERRCODE = 'P0001';
  END IF;

  IF v_codigo_banco IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.bancos WHERE codigo_compe = v_codigo_banco
  ) THEN
    RAISE EXCEPTION 'Banco selecionado não existe.' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.colaboradores
     SET codigo_banco = v_codigo_banco,
         agencia = v_agencia,
         agencia_dv = v_agencia_dv,
         conta = v_conta,
         conta_dv = v_conta_dv,
         tipo_conta = v_tipo_conta,
         updated_at = NOW()
   WHERE id = v_id;

  RETURN FOUND;
END;
$$;

-- ---------------------------------------------------------------------------
-- Os GRANTs. Estas nascem fechadas: nada de PUBLIC.
--
-- É o oposto das RPCs antigas, que têm GRANT EXECUTE ... TO PUBLIC — a fragilidade 1
-- do laudo, e a razão de a anon key dar acesso à base inteira. Uma função sem sessão
-- do Auth não tem o que fazer aqui: auth.uid() seria NULL e ela não resolveria ninguém.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.meu_colaborador_id()        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_meu_colaborador()       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_meu_colaborador(
  text, text, text, date, text, text, text, integer, text, text, text, bigint, bigint,
  smallint, smallint, smallint, boolean, text, text)      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_meus_dados_bancarios(
  text, text, text, text, text, text)                     FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.meu_colaborador_id()     TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_meu_colaborador()    TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_meu_colaborador(
  text, text, text, date, text, text, text, integer, text, text, text, bigint, bigint,
  smallint, smallint, smallint, boolean, text, text)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_meus_dados_bancarios(
  text, text, text, text, text, text)                     TO authenticated;
