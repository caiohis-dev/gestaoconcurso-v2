-- As 7 funções "básicas do sistema" (cargo_editavel = false).
--
-- Por que isto é migration e não seed: estes registros são **dado de referência** do qual
-- o código depende, não dado de exemplo. src/hooks/useCoordenadoresProva.tsx hardcoda dois
-- destes UUIDs (Coordenador Geral e Auxiliar de Coordenação) para decidir quem é elegível a
-- acesso de coordenador. Seeds só rodam em `supabase db reset` (local); `supabase db push`
-- aplica apenas migrations. Enquanto estas linhas viviam só no seed.sql, um banco de
-- produção novo nasceria sem elas — e a lista de elegíveis a coordenador ficaria
-- permanentemente vazia, sem erro visível em lugar nenhum.
--
-- Origem do problema: os registros foram criados à mão no banco remoto via dashboard do
-- Lovable e nunca capturados em migration. A migration 20260112122955 assume que já existem
-- (só faz UPDATE ... WHERE id IN (...), que num banco vazio é um no-op silencioso).
--
-- Os UUIDs e os CBOs abaixo são os mesmos de produção — não gere novos, ou o hardcode do
-- frontend deixa de bater. O trigger check_system_funcao_changes (BEFORE UPDATE OR DELETE)
-- não bloqueia INSERT, então inserir já com cargo_editavel = false é seguro.

INSERT INTO public.funcoes_colaboradores (id, cargo_nome, cargo_descricao, cargo_editavel, cargo_cbo) VALUES
  ('11a310e5-0fce-46f2-8ad7-769a5e5d7f89', 'Coordenador Geral',        '', false, '4242-05'),
  ('8d36ef0f-becb-45f3-837b-04eea15489fb', 'Auxiliar de Coordenação',  '', false, '4242-05'),
  ('339457f6-06fd-4883-83ce-becc5fa9ac2c', 'Coordenador de Pagamento', '', false, '4242-05'),
  ('80f6df87-83c7-4449-9a0c-48bcdfe14734', 'Enfermeiro',               '', false, '2235-05'),
  ('36212734-6b7e-4213-8226-aa11f2732acd', 'Equipe de Apoio',          '', false, '5143-20'),
  ('d62fe957-3868-4d8d-bd61-848a09396088', 'Fiscal',                   '', false, '3513-15'),
  ('ea6f6432-dfac-43f8-8190-75eced805882', 'Motorista',                '', false, '7823-10')
ON CONFLICT (id) DO NOTHING;
