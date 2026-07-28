-- Módulo CANDIDATOS — reapontar para outro cargo uma linha JÁ IMPORTADA é recusado.
-- Etapa 5b do roadmap em my_rules/analises/roadmap-cargos.yaml (decisão D11, confirmada
-- pelo usuário em 2026-07-28).
--
-- ⚠️ Esta migration só faz sentido DEPOIS de 20260728100000, e não antes. Antes daquela,
-- `cargo_id` não está na chave natural e reapontar ATUALIZA a linha no lugar — a guarda
-- não teria o que guardar, e guarda que não pode disparar é armadilha, não segurança.
--
-- ── A ETAPA 5 INVERTEU QUAL ERRO É FATAL ─────────────────────────────────────────────
--
--                                        | antes (chave = texto) | agora (chave = cargo_id)
--   origem muda a grafia do cargo        | DUPLICAVA             | re-resolve → UPDATE ✔
--   usuário reaponta um texto p/ outro   | cargo_id fora da      | DUPLICA e deixa as
--   cargo                                | chave → UPDATE ✔      | linhas antigas ÓRFÃS
--
-- O caso concreto, e ele não é hipotético — é o que a medição do roadmap antecipou:
-- "ARTE" (195 inscritos) é associado ao cargo A na primeira importação. Depois de ver os
-- dados, o usuário conclui que ARTE é o cargo B e troca a associação no passo Cargos. O
-- upsert passa a gravar a chave (edital, cpf, B, inscrição), que não casa com nada →
-- INSERT de 195 linhas novas, e as 195 antigas com A FICAM LÁ. 390 linhas, metade órfã, e
-- nada acusa. Mudar de ideia sobre "ARTE" é o comportamento ESPERADO do passo, não o
-- desviante: só o usuário sabe se ARTE é `DOCENTE I — ARTE`, e ele só sabe depois de ver.
--
-- ── ⚠️ POR QUE A GUARDA NÃO É EM `cargo_apelidos` ────────────────────────────────────
-- Aquele seria o alvo intuitivo e é o ERRADO, por três razões verificadas no código:
--   1. O apelido NÃO é o caminho do dado, é a memória de PRÉ-PREENCHIMENTO. Quem decide o
--      cargo_id do lote é `aplicarResolucoes(candidatos, resolucoes)`, e `resolucoes` é
--      estado da UI. Bloquear a tabela não impediria a gravação errada.
--   2. `salvarApelidos` manda os ~9 pares num upsert ÚNICO e atômico. Barrar UM par
--      derrubaria os NOVE, perdendo atalhos sem relação com o problema.
--   3. O chamador ENGOLE o erro de propósito (`.catch(() => undefined)`), porque apelido é
--      conveniência e a importação é o objetivo. A guarda falharia em SILÊNCIO.
-- A guarda tem de ficar onde o dano acontece: em `candidatos`.
--
-- ── ⚠️ POR QUE A CONDIÇÃO É ESTREITA ─────────────────────────────────────────────────
-- "Mesma inscrição, cargo_id diferente" SOZINHO bloquearia o caso legítimo mais comum do
-- arquivo real: 382 pessoas concorrem a mais de um cargo COM A MESMA INSCRIÇÃO (é por
-- isso que o cargo está na chave). Só com o TEXTO do cargo IGUAL dá para afirmar "esta é
-- a mesma linha da planilha, apontada para outro cargo" — reapontamento, e não segundo
-- cargo. O CONTROLE POSITIVO 1 da bateria é o que prova essa estreiteza.
--
-- O que fica de fora, e é irredutível: se a origem mudar a GRAFIA e o usuário
-- reclassificar no mesmo gesto, o texto difere e o trigger não vê. O arquivo NÃO TEM
-- identificador por cargo (a única coluna única por linha é um contador), então banco
-- nenhum distingue "reclassificaram esta pessoa" de "esta pessoa tem um segundo cargo".
-- Quem pega esse resíduo é a reconciliação, ainda não implementada.
--
-- ── O que isto NÃO bloqueia, de propósito ────────────────────────────────────────────
--   - Renomear `cargos.nome`: pós-etapa 5 é cosmético e é o GANHO CENTRAL do tema.
--     Congelá-lo proibiria justamente a operação que a etapa 5 tornou segura.
--   - Criar cargo novo: é INSERT em `cargos`, sempre livre.
--   - Apagar cargo em uso: já recusado pelo ON DELETE RESTRICT desde 20260727210000.
--   - Reimportar a mesma linha com o mesmo cargo: é o caminho feliz, vira UPDATE.

-- SECURITY INVOKER (e não DEFINER, ao contrário de `impedir_remover_valor_com_meta`):
-- aqui não há risco de RLS porosa. Só admin consegue INSERT em `candidatos` (a RLS fecha
-- as 4 operações em admin), e admin enxerga TODA a tabela — a consulta do trigger não tem
-- como ver menos do que existe. DEFINER seria superfície de escalonamento sem ganho.
CREATE OR REPLACE FUNCTION public.candidatos_recusa_reapontar_cargo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cargo_anterior text;
  v_texto_origem   text;
BEGIN
  -- ⚠️ `IS NOT DISTINCT FROM` no CPF, e não `=`: 2 linhas do arquivo real trazem CPF
  -- impossível e são gravadas com NULL. Com `=`, essas linhas escapariam da guarda —
  -- é o mesmo motivo do NULLS NOT DISTINCT no índice.
  --
  -- A normalização do texto é calculada INLINE em vez de ler uma coluna gerada: a
  -- `cargo_chave` foi dropada por D3 na migration anterior, e ressuscitá-la só para isto
  -- reintroduziria a coluna terminada em `_chave` sem chave nenhuma apontando para ela.
  -- Custo zero: a busca é seletiva pelo prefixo (edital_id, cpf) do índice único, e a
  -- distribuição medida é no máximo 4 cargos por inscrição.
  SELECT coalesce(cg.nome, '(sem cargo associado)'), c.cargo
    INTO v_cargo_anterior, v_texto_origem
    FROM candidatos c
    LEFT JOIN cargos cg ON cg.id = c.cargo_id
   WHERE c.edital_id = NEW.edital_id
     AND c.cpf IS NOT DISTINCT FROM NEW.cpf
     AND c.n_inscricao = NEW.n_inscricao
     AND lower(btrim(coalesce(c.cargo, ''))) = lower(btrim(coalesce(NEW.cargo, '')))
     AND c.cargo_id IS DISTINCT FROM NEW.cargo_id
   LIMIT 1;

  IF FOUND THEN
    -- Barrar sem orientar só troca um problema por outro (lição da etapa 4): a mensagem
    -- nomeia o texto, o cargo de destino atual e a saída.
    RAISE EXCEPTION
      'O cargo "%" já foi importado neste edital associado a "%". Mudar a associação criaria inscritos duplicados e deixaria os antigos órfãos.',
      v_texto_origem, v_cargo_anterior
      USING ERRCODE = 'RC001',
            HINT = 'Para trocar o cargo destes inscritos é preciso migrar os registros existentes, o que ainda não tem tela. Volte a associação para o cargo anterior, ou apague os inscritos deste edital antes de reimportar.';
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.candidatos_recusa_reapontar_cargo() IS
  'Etapa 5b / D11 do roadmap-cargos.yaml. Depois que a chave natural passou a usar '
  'cargo_id, reapontar um texto de cargo já importado para OUTRO cargo deixa de atualizar '
  'a linha e passa a inserir uma nova, deixando as antigas órfãs em silêncio. A condição é '
  'estreita de propósito (exige o TEXTO do cargo igual) para não bloquear as 382 pessoas '
  'que concorrem a mais de um cargo com a mesma inscrição.';

-- BEFORE INSERT, e não UPDATE: no upsert, a linha que CASA a chave vira UPDATE e é o
-- caminho correto (mesma pessoa, mesmo cargo, dados atualizados). O dano mora no INSERT
-- que não casou justamente porque o cargo_id mudou.
DROP TRIGGER IF EXISTS check_candidato_nao_reaponta_cargo ON public.candidatos;
CREATE TRIGGER check_candidato_nao_reaponta_cargo
  BEFORE INSERT ON public.candidatos
  FOR EACH ROW EXECUTE FUNCTION public.candidatos_recusa_reapontar_cargo();
