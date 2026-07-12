-- Corrigir search_path na função generate_codigo_acesso
CREATE OR REPLACE FUNCTION public.generate_codigo_acesso()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.colab_codigo_acesso IS NULL THEN
    NEW.colab_codigo_acesso := LPAD(FLOOR(RANDOM() * 10000)::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;