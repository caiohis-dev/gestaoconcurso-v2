-- Marcar todas as funções existentes como funções básicas do sistema
-- cargo_editavel = false significa que o nome não pode ser editado e a função não pode ser excluída
UPDATE funcoes_colaboradores
SET cargo_editavel = false
WHERE id IN (
  '8d36ef0f-becb-45f3-837b-04eea15489fb',  -- Auxiliar de Coordenação
  '339457f6-06fd-4883-83ce-becc5fa9ac2c',  -- Coordenador de Pagamento
  '11a310e5-0fce-46f2-8ad7-769a5e5d7f89',  -- Coordenador Geral
  '80f6df87-83c7-4449-9a0c-48bcdfe14734',  -- Enfermeiro
  '36212734-6b7e-4213-8226-aa11f2732acd',  -- Equipe de Apoio
  'd62fe957-3868-4d8d-bd61-848a09396088',  -- Fiscal
  'ea6f6432-dfac-43f8-8190-75eced805882'   -- Motorista
);

-- Criar trigger para impedir alteração do nome e exclusão de funções do sistema
CREATE OR REPLACE FUNCTION prevent_system_funcao_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Para DELETE: impedir exclusão de funções do sistema
  IF TG_OP = 'DELETE' THEN
    IF OLD.cargo_editavel = false THEN
      RAISE EXCEPTION 'Não é permitido excluir funções básicas do sistema.';
    END IF;
    RETURN OLD;
  END IF;
  
  -- Para UPDATE: impedir alteração do nome de funções do sistema
  IF TG_OP = 'UPDATE' THEN
    IF OLD.cargo_editavel = false AND OLD.cargo_nome != NEW.cargo_nome THEN
      RAISE EXCEPTION 'Não é permitido alterar o nome de funções básicas do sistema.';
    END IF;
    -- Impedir que funções do sistema sejam transformadas em editáveis
    IF OLD.cargo_editavel = false AND NEW.cargo_editavel = true THEN
      RAISE EXCEPTION 'Não é permitido tornar funções do sistema editáveis.';
    END IF;
    RETURN NEW;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Remover trigger existente se houver
DROP TRIGGER IF EXISTS check_system_funcao_changes ON funcoes_colaboradores;

-- Criar trigger
CREATE TRIGGER check_system_funcao_changes
BEFORE UPDATE OR DELETE ON funcoes_colaboradores
FOR EACH ROW
EXECUTE FUNCTION prevent_system_funcao_changes();