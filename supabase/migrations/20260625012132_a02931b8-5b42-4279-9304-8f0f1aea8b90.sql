
CREATE OR REPLACE FUNCTION public.update_colaborador_data_full(
  p_colaborador_id uuid,
  p_nome_completo text,
  p_cpf text,
  p_nacionalidade text,
  p_data_nascimento date,
  p_matricula text,
  p_pis text,
  p_rua text,
  p_numero_casa integer,
  p_complemento text,
  p_bairro text,
  p_cidade text,
  p_cep bigint,
  p_telefone bigint,
  p_grau_instrucao smallint,
  p_estado_civil smallint,
  p_raca smallint,
  p_deficiente boolean,
  p_email text,
  p_chave_pix text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cpf_clean text;
  v_nome text;
BEGIN
  -- NOT NULL validations
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
  WHERE id = p_colaborador_id;

  RETURN FOUND;
END;
$function$;
