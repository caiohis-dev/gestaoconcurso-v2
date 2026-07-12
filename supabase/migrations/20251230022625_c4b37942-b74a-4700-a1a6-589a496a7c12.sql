-- Drop the existing function first
DROP FUNCTION IF EXISTS public.get_colaborador_full_data(uuid);

-- Recreate the function with email and chave_pix fields
CREATE OR REPLACE FUNCTION public.get_colaborador_full_data(p_colaborador_id uuid)
 RETURNS TABLE(id uuid, colab_matricula text, colab_nome_completo text, colab_cpf text, colab_nacionalidade text, colab_pis text, colab_rua text, colab_numero_casa integer, colab_complemento_endereco text, colab_bairro text, colab_cidade text, colab_cep bigint, colab_telefone bigint, colab_grau_instrucao smallint, colab_estado_civil smallint, colab_raca smallint, colab_deficiente boolean, colab_data_nascimento date, colab_email text, colab_chave_pix text)
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
    COALESCE(c.colab_chave_pix, '')::TEXT
  FROM colaboradores c
  WHERE c.id = p_colaborador_id;
END;
$function$;

-- Create a new overload of update_colaborador_data that includes email and chave_pix
CREATE OR REPLACE FUNCTION public.update_colaborador_data(p_colaborador_id uuid, p_matricula text, p_pis text, p_rua text, p_numero_casa integer, p_complemento text, p_bairro text, p_cidade text, p_cep bigint, p_telefone bigint, p_grau_instrucao smallint, p_estado_civil smallint, p_raca smallint, p_deficiente boolean, p_email text, p_chave_pix text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE colaboradores
  SET 
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