-- ─────────────────────────────────────────────────────────────────────────────────────
-- O bloqueio de cargo passa a olhar SÓ candidatos: apelido deixa de trancar
-- ─────────────────────────────────────────────────────────────────────────────────────
--
-- DECISÃO DO USUÁRIO, 2026-08-01: "A regra de bloqueio deve corresponder somente a
-- condições de haver candidatos associados a esse cargo em algum edital."
--
-- Estreita a `CG001` da migration `20260731100000`, que valeu por UM dia. Lá, QUALQUER
-- menção trancava; aqui, só inscrito. A regra continua morando no BANCO — a tela apenas
-- ANTECIPA o que a barreira faz.
--
-- ── ⭐ O QUE ISSO DESTRAVA — o defeito é de MOMENTO, e é reproduzível ───────────────
--
-- A regra larga fechava a janela de limpeza NO MOMENTO ERRADO, e isso se lê no código do
-- assistente: `salvarApelidos` grava a memória no FIM DO PASSO 3
-- (`CandidatosImportar.tsx`), e só o passo 4 escreve os inscritos. Sob a `CG001` larga, o
-- apelido recém-gravado JÁ tornava o cargo imutável — antes de existir um único inscrito.
--
-- Ou seja: a doc prometia "a janela para corrigir um nome vai até o passo 3", e a janela
-- fechava DENTRO do passo 3, pela mão do próprio assistente. Como 7 dos 9 cargos do
-- arquivo real trazem `¿` (medido nas 7.416 linhas), os 7 nomes sujos ficavam permanentes
-- sem que ninguém tivesse importado nada.
--
-- ⚠️ OBSERVADO no banco local em 2026-08-01, no estado deixado por uma execução do passo
-- 3: 9 cargos, 9 apelidos, ZERO candidatos — e os 9 imutáveis, trancados só pelo apelido.
-- Esse estado NÃO sobrevive a um `db reset`: o dump não traz cargo, apelido nem candidato,
-- e as três tabelas voltam vazias. Quem quiser reproduzir tem de rodar o passo 3.
--
-- Com o bloqueio olhando só inscritos, a janela volta a ser a prometida: vai até a
-- primeira importação que USE o cargo.
-- ─────────────────────────────────────────────────────────────────────────────────────

-- ── 1. Excluir: os apelidos voltam a ser levados junto ──────────────────────────────
--
-- 🔴 CASCADE AQUI É ESCOLHA, NÃO OMISSÃO — e o aviso existe porque a regra da casa é
-- "FK RESTRICT, nunca CASCADE por omissão". Uma auditoria que leia só a palavra vai
-- querer "consertar" isto. Não conserte: `cargo_apelidos.cargo_id` é NOT NULL, então
-- permitir o DELETE de cargo só-com-apelido OBRIGA os apelidos a irem junto. Não há
-- terceira opção — SET NULL é impossível, e apagar em duas chamadas do cliente deixaria
-- estado pela metade.
--
-- É também o desenho original (até 30/07), e a assimetria deliberada volta a valer:
-- **apelido é atalho de digitação, candidato é gente.** Apagar o cargo deve levar o
-- apelido, porque apelido apontando para nada não serve a ninguém.
--
-- ⚠️ O CUSTO É PERDA SILENCIOSA, o formato de erro que este repo mais teme: some a
-- memória de "texto sujo → cargo" que pré-preenche as próximas importações, sem erro
-- nenhum. Quem paga a conta é a UI — `Cargos.tsx` AVISA antes, com a contagem, e há
-- teste guardando o aviso. Se o aviso sair, este CASCADE vira perda muda.
ALTER TABLE public.cargo_apelidos
  DROP CONSTRAINT IF EXISTS cargo_apelidos_cargo_id_fkey;

ALTER TABLE public.cargo_apelidos
  ADD CONSTRAINT cargo_apelidos_cargo_id_fkey
  FOREIGN KEY (cargo_id) REFERENCES public.cargos(id) ON DELETE CASCADE;

COMMENT ON CONSTRAINT cargo_apelidos_cargo_id_fkey ON public.cargo_apelidos IS
  'CASCADE de propósito (voltou em 2026-08-01; foi RESTRICT por um dia, entre 31/07 e '
  '01/08): o bloqueio de cargo olha só candidatos, e cargo_id é NOT NULL, então o DELETE '
  'obriga o apelido a ir junto. A perda da memória de pré-preenchimento é avisada na UI.';

-- ── 2. Alterar: o trigger passa a contar SÓ inscritos ───────────────────────────────
--
-- O par trigger+função é RENOMEADO, e não só substituído: `..._em_uso` descrevia a regra
-- larga, e neste repo o NOME mente antes do código. Um trigger chamado "em_uso" que
-- ignora apelidos é a próxima leitura errada.
--
-- ⚠️ Ordem obrigatória: o trigger some primeiro, senão o DROP da função é recusado.
DROP TRIGGER IF EXISTS check_cargo_nao_alteravel_em_uso ON public.cargos;
DROP FUNCTION IF EXISTS public.cargos_recusa_alterar_em_uso();

CREATE OR REPLACE FUNCTION public.cargos_recusa_alterar_com_inscritos()
RETURNS trigger
LANGUAGE plpgsql
-- SECURITY INVOKER (o padrão): a função não precisa de privilégio nenhum além do de quem
-- já está alterando a linha. DEFINER aqui seria poder desnecessário.
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_candidatos integer;
BEGIN
  -- Usa `idx_candidatos_cargo` (etapa 1 do tema Cargos). Sem ele isto seria seq scan em
  -- `candidatos` — milhares de linhas — a cada UPDATE.
  --
  -- ⚠️ `cargo_apelidos` NÃO é mais contado, e é o ponto inteiro desta migration.
  SELECT count(*) INTO v_candidatos FROM candidatos WHERE cargo_id = OLD.id;

  IF v_candidatos > 0 THEN
    -- Barrar sem orientar só troca um problema por outro (lição da etapa 4 do roadmap de
    -- cargos): a mensagem diz O QUE prende, QUANTO, e qual é a única saída.
    RAISE EXCEPTION
      'O cargo "%" tem % inscrito(s) em algum edital e não pode ser alterado. Só cargo sem nenhum inscrito é editável.',
      OLD.nome, v_candidatos
      USING ERRCODE = 'CG001';
  END IF;

  RETURN NEW;
END;
$$;

-- ⚠️ Continua BEFORE UPDATE olhando OLD.id: o que importa é o que já aponta para esta
-- linha. E continua sem coluna isenta — a regra é sobre a LINHA, então trocar `ativo` de
-- cargo COM INSCRITO também é recusado. Se um dia alguém quiser isentar uma coluna, o
-- lugar é aqui, explicitamente.
CREATE TRIGGER check_cargo_nao_alteravel_com_inscritos
  BEFORE UPDATE ON public.cargos
  FOR EACH ROW EXECUTE FUNCTION public.cargos_recusa_alterar_com_inscritos();

COMMENT ON FUNCTION public.cargos_recusa_alterar_com_inscritos() IS
  'Recusa UPDATE em cargo que tenha inscrito em algum edital (SQLSTATE CG001). Decisão do '
  'usuário em 2026-08-01, estreitando a regra de 31/07, que trancava por QUALQUER menção '
  'e travava o cargo já no passo 3 do assistente — ver a migration 20260801103940.';

-- ── 3. O que NÃO é afetado ──────────────────────────────────────────────────────────
--
-- `useCriarCargo` faz `INSERT ... ON CONFLICT DO NOTHING`, e um BEFORE UPDATE não dispara
-- nisso: o passo 3 do assistente continua criando cargo normalmente. Os caminhos de
-- escrita em `cargos` seguem sendo três — o INSERT do criarCargo, o UPDATE do renomear e
-- o DELETE da página de gestão.
--
-- `candidatos_cargo_id_fkey` fica RESTRICT: inscrito continua barrando a exclusão, e é a
-- única barreira que sobra. `candidatos_importacao` guarda o cargo dentro de um `jsonb`
-- sem FK — nunca foi menção e não passa a ser (conferido em 01/08).
