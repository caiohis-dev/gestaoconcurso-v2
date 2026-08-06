-- ═════════════════════════════════════════════════════════════════════════════════════
-- O nº de inscrição passa a caber 12 caracteres
--
-- Decisão do usuário em 2026-08-06: `n_inscricao` deve caber **até 12**. É CAPACIDADE,
-- não formato exato — número de 1 a 4 dígitos continua válido, e o arquivo real de hoje
-- (7.416 linhas, de '1' a '7416') segue importando sem uma linha nova acusada.
--
-- Desenho em my_rules/analises/roadmap-n-inscricao-12-caracteres.yaml.
--
-- ── Por que `text` + CHECK NOMEADA, e não `varchar(12)` ──────────────────────────────
--
-- `varchar(n)` recusa com `value too long for type character varying(12)`: mensagem SEM
-- nome, que só se traduz casando texto — com o número dentro da string. Isso já apodreceu
-- aqui: a tradução de `mensagemErroImportacao` casava `value too long` e dizia "aceita
-- até 8 caracteres", número que teria de ser caçado à mão a cada mudança de tipo.
--
-- Uma CHECK NOMEADA é traduzível pelo NOME, que é a convenção deste módulo (o ramo do
-- índice único casa `candidatos_edital_inscricao_key`, não o texto do erro). Um nome não
-- muda sozinho quando o limite muda.
--
-- ── Por que a CHECK cuida SÓ DO TETO ─────────────────────────────────────────────────
--
-- O piso (branco) continua sendo trabalho da `chk_candidato_n_inscricao_preenchido`, que
-- já existe. Escrever aqui `char_length(btrim(...)) BETWEEN 1 AND 12` faria esta CHECK
-- barrar TAMBÉM o branco, e a cobertura da antiga viraria fantasma: a linha seguiria
-- recusada, mas pela regra errada, e um dia alguém removeria a antiga sem perceber que
-- deixou de haver quem barrasse o branco por si.
--
-- É o caso de 03/08 com `sala_numero = -1`, registrado no §8 do CLAUDE.md. Cada CHECK com
-- um trabalho só — e a bateria afirma o NOME de quem barrou, não só que houve recusa.
--
-- ── Por que NÃO há regra de "só dígitos" ─────────────────────────────────────────────
--
-- Porque o pedido é de capacidade, e porque foi medido o custo: 47 literais NÃO-numéricos
-- de `n_inscricao` vivem hoje nas baterias SQL de `docs/` ('N001', 'A001', 'S002'…) — 22
-- em bateria-troca-total-candidatos.sql, 11 em bateria-cargos.sql, 7 em
-- bateria-chave-natural-candidatos.sql, 4 em bateria-alocacao-candidatos.sql e 3 em
-- bateria-relatorio-importacao.sql. Uma CHECK de dígitos quebraria as cinco, e NADA as
-- executa automaticamente (npm test mocka o Supabase; docs:conferir não lê bateria).
--
-- Consequência aceita, e é ela que um auditor vai estranhar: `n_inscricao` continua
-- aceitando 'N001'. Se "só dígitos" for desejado um dia, é tema próprio — com os 47 no
-- mesmo passe.
--
-- ── A medição (regra 5 de invariantes.md: medir antes de apertar) ────────────────────
--
--   SELECT max(char_length(n_inscricao)), count(*) FROM public.candidatos;
--
-- Banco local, 2026-08-06: `candidatos` está com **0 linhas**, e o dump de produção traz
-- **0** candidatos — logo não há saneamento a fazer, nem aqui nem no bootstrap da base
-- nova. A medição que importa é a do ARQUIVO real: comprimentos de 1 a 4 caracteres
-- (9 · 90 · 900 · 6.417), máximo 4. Nenhuma linha chega perto do teto.
--
-- Alargar varchar(8) → text não reescreve a tabela (os tipos são binariamente coercíveis),
-- mas ainda toma ACCESS EXCLUSIVE. Irrelevante com 0 linhas; não com 7.231.
-- ═════════════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.candidatos
  ALTER COLUMN n_inscricao TYPE text;

ALTER TABLE public.candidatos
  ADD CONSTRAINT chk_candidato_n_inscricao_tamanho
  CHECK (char_length(n_inscricao) <= 12);

COMMENT ON COLUMN public.candidatos.n_inscricao IS
  'Nº de inscrição do candidato — metade da chave natural (edital_id, n_inscricao). '
  'TEXT com teto de 12 caracteres (chk_candidato_n_inscricao_tamanho, 2026-08-06). '
  'É texto e não número porque nº de inscrição admite ZERO À ESQUERDA: guardar como '
  'integer perderia o zero e mudaria a inscrição da pessoa. '
  'O teto é CAPACIDADE, não formato: valor mais curto é válido, e NÃO há regra de "só '
  'dígitos" — a coluna aceita 000123 e N001. O porquê está na migration '
  '20260806162539.';
