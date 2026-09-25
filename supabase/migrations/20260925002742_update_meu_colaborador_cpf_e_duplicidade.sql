-- update_meu_colaborador: o CPF deixa de ser completado com zeros antes da conferência de
-- tamanho, ganha dígito verificador quando MUDA, e a duplicidade passa a nomear o campo.
--
-- Medido em 2026-09-24, chamando a RPC como colaborador no banco local:
--
-- 1. `LPAD(…, 11, '0')` rodava ANTES do `length <> 11` — o mesmo defeito corrigido em 3 Edge
--    Functions em 2026-09-20 (`_shared/cpf.ts`). E o LPAD também TRUNCA: '123' virava
--    '00000000123' e 12 dígitos viravam os 11 primeiros, e os dois passavam. A tela exige 11
--    dígitos, mas a barreira é a RPC, não a tela.
--
-- 2. `EXCEPTION WHEN unique_violation` respondia SEMPRE "Este e-mail ou chave PIX já está em
--    uso" — os índices únicos são quatro (CPF, PIS, e-mail, PIX), e o colaborador edita o CPF
--    nesta tela. Agora o nome do índice violado escolhe a frase.
--
-- 🔵 O dígito verificador (módulo 11, a mesma regra de `src/lib/cpf.ts`) só é exigido quando
-- o CPF MUDA. Medido no mesmo dia: 15 dos 821 cadastros têm DV inválido, e NENHUM deles tem
-- conta — então nenhum chega a esta RPC hoje. Exigir sempre barraria, no futuro, quem só
-- quer corrigir o endereço por causa de um CPF legado que não é trabalho dele (decisão de
-- 2026-07-26: CPF inválido é trabalho do coordenador). Exigir na mudança impede o CPF
-- inválido NOVO sem prender ninguém.
--
-- Assinatura, SECURITY DEFINER, search_path e permissões ficam idênticos (os GRANT/REVOKE
-- abaixo só reafirmam o que a 20260714193057 já deixou).

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
  v_cpf_atual text;
  v_nome text;
  v_id uuid := public.meu_colaborador_id();
  v_soma int;
  v_dv int;
  v_indice text;
BEGIN
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Sua conta não está vinculada a um cadastro de colaborador.'
      USING ERRCODE = 'P0001';
  END IF;

  v_nome := NULLIF(TRIM(p_nome_completo), '');
  IF v_nome IS NULL THEN
    RAISE EXCEPTION 'Nome completo é obrigatório.' USING ERRCODE = 'P0001';
  END IF;

  -- Tamanho ANTES de qualquer preenchimento: sem LPAD, que completava o curto e truncava o
  -- longo. A máscara (pontos, traço) sai; o que sobra tem de ser exatamente 11 dígitos.
  v_cpf_clean := regexp_replace(COALESCE(p_cpf, ''), '\D', '', 'g');
  IF v_cpf_clean !~ '^[0-9]{11}$' OR v_cpf_clean ~ '^(\d)\1{10}$' THEN
    RAISE EXCEPTION 'CPF inválido: informe os 11 dígitos.' USING ERRCODE = 'P0001';
  END IF;

  SELECT colab_cpf INTO v_cpf_atual FROM colaboradores WHERE id = v_id;

  IF v_cpf_clean IS DISTINCT FROM v_cpf_atual THEN
    -- 1º dígito: pesos 10..2 sobre os 9 primeiros.
    v_soma := 0;
    FOR i IN 1..9 LOOP
      v_soma := v_soma + substr(v_cpf_clean, i, 1)::int * (11 - i);
    END LOOP;
    v_dv := (v_soma * 10) % 11;
    IF v_dv = 10 THEN v_dv := 0; END IF;
    IF v_dv <> substr(v_cpf_clean, 10, 1)::int THEN
      RAISE EXCEPTION 'CPF inválido: os dígitos verificadores não conferem.' USING ERRCODE = 'P0001';
    END IF;

    -- 2º dígito: pesos 11..2 sobre os 10 primeiros.
    v_soma := 0;
    FOR i IN 1..10 LOOP
      v_soma := v_soma + substr(v_cpf_clean, i, 1)::int * (12 - i);
    END LOOP;
    v_dv := (v_soma * 10) % 11;
    IF v_dv = 10 THEN v_dv := 0; END IF;
    IF v_dv <> substr(v_cpf_clean, 11, 1)::int THEN
      RAISE EXCEPTION 'CPF inválido: os dígitos verificadores não conferem.' USING ERRCODE = 'P0001';
    END IF;
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
  -- O nome do índice escolhe a frase. Para o e-mail e o PIX o índice é funcional
  -- (lower(trim(...))), e CONSTRAINT_NAME traz o nome do índice do mesmo jeito.
  -- ⚠️ Os P0001 lançados acima NÃO caem aqui: o handler só pega unique_violation.
  WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_indice = CONSTRAINT_NAME;
    RAISE EXCEPTION '%', CASE v_indice
      WHEN 'colaboradores_colab_cpf_key'       THEN 'Este CPF já está cadastrado para outro colaborador.'
      WHEN 'colaboradores_colab_pis_key'       THEN 'Este PIS já está cadastrado para outro colaborador.'
      WHEN 'colaboradores_colab_email_key'     THEN 'Este e-mail já está em uso por outro colaborador.'
      WHEN 'colaboradores_colab_chave_pix_key' THEN 'Esta chave PIX já está em uso por outro colaborador.'
      ELSE 'Um dos dados informados já está cadastrado para outro colaborador.'
    END USING ERRCODE = 'P0001';
END;
$$;

REVOKE ALL ON FUNCTION public.update_meu_colaborador(
  text, text, text, date, text, text, text, integer, text, text, text, bigint, bigint,
  smallint, smallint, smallint, boolean, text, text)      FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_meu_colaborador(
  text, text, text, date, text, text, text, integer, text, text, text, bigint, bigint,
  smallint, smallint, smallint, boolean, text, text)      TO authenticated;
