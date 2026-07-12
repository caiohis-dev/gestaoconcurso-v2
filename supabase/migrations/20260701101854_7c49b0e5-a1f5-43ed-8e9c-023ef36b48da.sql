CREATE OR REPLACE FUNCTION public.uppercase_colab_nome_completo()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.colab_nome_completo IS NOT NULL THEN
    NEW.colab_nome_completo = UPPER(NEW.colab_nome_completo);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_uppercase_colab_nome_completo ON public.colaboradores;

CREATE TRIGGER tr_uppercase_colab_nome_completo
BEFORE INSERT OR UPDATE ON public.colaboradores
FOR EACH ROW
EXECUTE FUNCTION public.uppercase_colab_nome_completo();