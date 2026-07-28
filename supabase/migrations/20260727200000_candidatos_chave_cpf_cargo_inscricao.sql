-- Módulo CANDIDATOS — a chave natural passa a incluir o CPF.
-- Doc do módulo: my_rules/estrutura/modulos/candidatos/00-modulo.md
--
-- ANTES:  (edital_id, n_inscricao, cargo_chave)
-- DEPOIS: (edital_id, cpf, cargo_chave, n_inscricao)   ← decisão do usuário, 2026-07-27
--
-- É sobre este índice que o app faz UPSERT, então ele é o que decide se REIMPORTAR a
-- planilha corrigida atualiza os inscritos ou os duplica.
--
-- ── Por que a troca é segura (medido antes, regra 5 de invariantes.md) ────────────────
-- Medido contra o arquivo real (`todos inscritos concurso 002-2026-SMA`, 7.416 linhas de
-- dado), lendo a inscrição da coluna `ID`:
--
--     (n_inscricao, cargo)              → 7.416 grupos distintos   (chave antiga)
--     (cpf, cargo, n_inscricao)         → 7.416 grupos distintos   (chave nova)
--
-- Nenhum inscrito se perde. E não podia se perder: a chave nova CONTÉM a antiga, e
-- acrescentar coluna a uma chave única só é capaz de SEPARAR linhas, nunca de fundi-las.
-- É o oposto da proposta que foi medida e recusada em 27/07 — trocar `cargo_chave` POR
-- `cpf` (em vez de somar) colapsaria 396 inscritos em silêncio.
--
-- ⚠️ O QUE A TROCA CUSTA, e está aceito: o CPF entra na identidade, então corrigir um CPF
-- errado na planilha e reimportar cria um SEGUNDO registro e mantém o antigo, em vez de
-- atualizar. É o mesmo comportamento que o texto do cargo já tinha; agora vale para três
-- campos. A promessa "corrija a planilha e reimporte" continua não valendo para os campos
-- da própria chave — só o `deduplicar()` do app e a reconciliação resolveriam isso.
--
-- Efeito colateral de afrouxamento, também aceito: sair de (inscrição, cargo) para o
-- quarteto permite que duas linhas com a MESMA inscrição e o MESMO cargo coexistam se
-- tiverem CPF diferente. Não ocorre no arquivo medido (os dois contam 7.416), mas passa a
-- ser possível.

DROP INDEX IF EXISTS public.candidatos_inscricao_cargo_key;

-- ⚠️ `NULLS NOT DISTINCT` é a parte essencial, não um detalhe de estilo.
--
-- 2 das 7.416 linhas trazem CPF impossível de salvar (' 8631309761', com 10 dígitos, e
-- '1O778817709', com a letra O no lugar do zero); o importador grava NULL e acusa no
-- relatório, porque perder o inscrito da lista seria pior. No comportamento PADRÃO do
-- Postgres, dois NULLs são distintos entre si — ou seja, essas 2 linhas NÃO colidiriam
-- com elas mesmas e seriam INSERIDAS DE NOVO a cada reimportação, multiplicando em
-- silêncio. Com `NULLS NOT DISTINCT`, "sem CPF" é UM valor, e elas atualizam como as
-- outras. Verificado que o `ON CONFLICT` infere um índice assim (Postgres 17.6).
--
-- Note a assimetria com `cargo_chave`, que resolve o NULL por `coalesce` dentro da coluna
-- gerada: lá a coluna existe porque o cargo precisa de NORMALIZAÇÃO (lower/btrim) e o
-- upsert do PostgREST só sabe nomear colunas, não expressões. O CPF não precisa de
-- normalização nenhuma — `chk_candidato_cpf_formato` já o obriga a ser exatamente 11
-- dígitos —, então uma coluna gerada aqui seria só uma cópia da outra ocupando espaço.
-- O único problema a resolver era o NULL, e é exatamente isso que a cláusula resolve.
CREATE UNIQUE INDEX candidatos_cpf_cargo_inscricao_key
  ON public.candidatos (edital_id, cpf, cargo_chave, n_inscricao) NULLS NOT DISTINCT;

COMMENT ON INDEX public.candidatos_cpf_cargo_inscricao_key IS
  'Chave natural do candidato: edital + CPF + cargo + nº de inscrição. É sobre ela que a '
  'importação faz UPSERT — reimportar a planilha atualiza os inscritos em vez de duplicá-los. '
  'NULLS NOT DISTINCT para que os inscritos sem CPF (CPF impossível na origem) não se '
  'multipliquem a cada reimportação.';
