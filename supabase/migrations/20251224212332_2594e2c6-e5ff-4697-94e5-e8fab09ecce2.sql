-- Fix type mismatch in get_colaborador_full_data function
CREATE OR REPLACE FUNCTION public.get_colaborador_full_data(p_colaborador_id uuid)
 RETURNS TABLE(id uuid, colab_matricula text, colab_nome_completo text, colab_cpf text, colab_nacionalidade text, colab_pis text, colab_rua text, colab_numero_casa integer, colab_complemento_endereco text, colab_bairro text, colab_cidade text, colab_cep bigint, colab_telefone bigint, colab_grau_instrucao smallint, colab_estado_civil smallint, colab_raca smallint, colab_deficiente boolean, colab_data_nascimento date)
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
    c.colab_data_nascimento
  FROM colaboradores c
  WHERE c.id = p_colaborador_id;
END;
$function$;