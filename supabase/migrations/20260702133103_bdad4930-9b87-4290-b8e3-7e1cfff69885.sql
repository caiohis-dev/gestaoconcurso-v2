
DROP FUNCTION IF EXISTS public.get_colaborador_full_data(uuid);

CREATE OR REPLACE FUNCTION public.get_colaborador_full_data(p_colaborador_id uuid)
 RETURNS TABLE(
   id uuid,
   colab_matricula text,
   colab_nome_completo text,
   colab_cpf text,
   colab_nacionalidade text,
   colab_pis text,
   colab_rua text,
   colab_numero_casa integer,
   colab_complemento_endereco text,
   colab_bairro text,
   colab_cidade text,
   colab_cep bigint,
   colab_telefone bigint,
   colab_grau_instrucao smallint,
   colab_estado_civil smallint,
   colab_raca smallint,
   colab_deficiente boolean,
   colab_data_nascimento date,
   colab_email text,
   colab_chave_pix text,
   codigo_banco text,
   agencia text,
   agencia_dv text,
   conta text,
   conta_dv text,
   tipo_conta text
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  WHERE c.id = p_colaborador_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_colaborador_bank_data(
  p_colaborador_id uuid,
  p_codigo_banco text,
  p_agencia text,
  p_agencia_dv text,
  p_conta text,
  p_conta_dv text,
  p_tipo_conta text
)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_codigo_banco text := NULLIF(p_codigo_banco, '');
  v_agencia text := NULLIF(p_agencia, '');
  v_agencia_dv text := NULLIF(p_agencia_dv, '');
  v_conta text := NULLIF(p_conta, '');
  v_conta_dv text := NULLIF(p_conta_dv, '');
  v_tipo_conta text := NULLIF(p_tipo_conta, '');
BEGIN
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
   WHERE id = p_colaborador_id;

  RETURN FOUND;
END;
$function$;
