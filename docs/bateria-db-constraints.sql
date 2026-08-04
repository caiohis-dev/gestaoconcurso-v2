-- ============================================================================
-- Bateria de bypass — CHECK constraints (etapa 3 do roadmap-db-constraints)
-- ============================================================================
--
-- O QUE ISTO PROVA
-- Que as regras que só existiam no Zod agora barram TAMBÉM quem fala direto com o
-- banco, sem passar pelo frontend. Cada caso tenta gravar um valor que a UI recusa;
-- o esperado é o banco recusar com SQLSTATE 23514 (check_violation).
--
-- COMO RODAR (banco LOCAL — nunca contra produção)
--   sg docker -c "docker exec -i supabase_db_<ref> psql -U postgres -d postgres" \
--     < docs/bateria-db-constraints.sql
--
-- Ou, com o CLI:
--   psql "$(npx supabase status -o json | jq -r .DB_URL)" -f docs/bateria-db-constraints.sql
--
-- É SEGURO: tudo roda dentro de uma transação que termina em ROLLBACK. Nenhuma linha
-- é alterada de verdade. Pode rodar quantas vezes quiser.
--
-- POR QUE NÃO É TESTE DO VITEST
-- A suíte de testes roda contra um MOCK do Supabase, sem Postgres — um teste lá
-- afirmaria o mock, não o banco. Constraint só se testa contra o banco de verdade.
-- Ver my_rules/estrutura/transversais/testes.md.
--
-- MÉTODO: os casos usam UPDATE em linhas existentes, não INSERT. É de propósito —
-- INSERT exigiria satisfazer NOT NULL e FKs de tabelas inteiras, e o ruído
-- esconderia o que se quer medir. A CHECK vale igual para INSERT e UPDATE.
-- Se a tabela estiver vazia (clone sem o dump), o caso é reportado como SKIP em vez
-- de passar em falso.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE _casos (
  ordem       serial,
  constraint_ text,
  descricao   text,
  tabela      text,
  comando     text,
  -- Predicado opcional para escolher a linha-cobaia. Existe porque nem toda linha
  -- serve: em `funcoes_colaboradores`, o trigger `prevent_system_funcao_changes`
  -- barra a renomeação das 7 funções de sistema ANTES de o CHECK ser avaliado, e o
  -- caso morreria por um motivo que não é o que ele quer provar.
  filtro      text DEFAULT 'true'
) ON COMMIT DROP;

INSERT INTO _casos (constraint_, descricao, tabela, comando) VALUES
  ('chk_unid_nome_preenchido',
   'nome de unidade com só espaços',
   'unidades_prova',
   'UPDATE unidades_prova SET unid_nome = ''   '' WHERE id = (SELECT id FROM unidades_prova LIMIT 1)'),

  ('chk_unid_sigla_preenchida',
   'sigla de unidade vazia (CHAR(10) preenche com espaço — só trim revela)',
   'unidades_prova',
   'UPDATE unidades_prova SET unid_sigla = '''' WHERE id = (SELECT id FROM unidades_prova LIMIT 1)'),

  -- ⚠️ **DOIS CASOS REMOVIDOS EM 2026-08-03**, com a coluna: 'unidade com 0 andares' e
  -- 'unidade com andares negativos (o caso que motivou o tema)', ambos de
  -- `chk_unid_andares_min`. `unidades_prova.unid_andares` foi dropada (migration
  -- 20260804001559) porque o número virava teto para criar salas em `/salas-prova`, e o
  -- teto era o defeito. Os casos não falhariam: **quebrariam a bateria inteira**, com
  -- erro de coluna inexistente. Bateria é ferramenta que se executa.

  ('chk_sala_capacidade_positiva',
   'sala com capacidade 0',
   'sala_prova',
   'UPDATE sala_prova SET sala_capacidade = 0 WHERE id = (SELECT id FROM sala_prova LIMIT 1)'),

  -- 🔴 **A bateria pegou uma SOBREPOSIÇÃO em 2026-08-03, e o caso teve de ser afinado.**
  -- Com `SET sala_numero = -1` sozinho, quem barrava passou a ser
  -- `chk_sala_numero_casa_com_andar` (de 03/08), não a constraint que este caso quer
  -- provar: nenhuma linha do banco tem `sala_andar` nulo, e −1 não casa com andar × 100 +
  -- sequência. A linha continuava recusada — mas por outra regra, e a bateria acusou
  -- FALHOU justamente por comparar QUAL constraint disparou. Zerar o andar no mesmo
  -- UPDATE isola o caso: com `sala_andar IS NULL` a CHECK nova se cala (por desenho) e
  -- sobra a de sinal.
  --
  -- ⚠️ A lição vale além daqui: **CHECK nova pode ofuscar CHECK antiga**, e sem uma
  -- bateria que afirme o NOME de quem barrou isso passa despercebido — o dia em que a
  -- regra nova for afrouxada, a antiga volta a ser a única, e ninguém saberá desde quando.
  ('chk_sala_numero_positivo',
   'sala com número negativo (andar nulo, para isolar da CHECK de coerência)',
   'sala_prova',
   'UPDATE sala_prova SET sala_numero = -1, sala_andar = NULL WHERE id = (SELECT id FROM sala_prova LIMIT 1)'),

  ('chk_sala_numero_casa_com_andar',
   'sala com número negativo E andar informado — quem barra é a coerência (03/08)',
   'sala_prova',
   'UPDATE sala_prova SET sala_numero = -1 WHERE id = (SELECT id FROM sala_prova WHERE sala_andar IS NOT NULL LIMIT 1)'),

  ('chk_sala_andar_min',
   'sala no andar 0 (opcional, mas quando informado é 1+)',
   'sala_prova',
   'UPDATE sala_prova SET sala_andar = 0 WHERE id = (SELECT id FROM sala_prova LIMIT 1)'),

  ('chk_prova_edital_preenchido',
   'prova com edital denormalizado em branco',
   'provas',
   'UPDATE provas SET prova_edital = ''  '' WHERE id = (SELECT id FROM provas LIMIT 1)'),

  ('chk_prova_n_candidatos_positivo',
   'prova com 0 candidatos',
   'provas',
   'UPDATE provas SET prova_n_candidatos = 0 WHERE id = (SELECT id FROM provas LIMIT 1)'),

  ('chk_prova_horario_ordem',
   'prova que termina ANTES de começar',
   'provas',
   'UPDATE provas SET prova_hora_inicio = ''14:00'', prova_hora_final = ''09:00'' WHERE id = (SELECT id FROM provas LIMIT 1)'),

  ('chk_prova_horario_ordem',
   'prova que termina no mesmo instante em que começa',
   'provas',
   'UPDATE provas SET prova_hora_inicio = ''09:00'', prova_hora_final = ''09:00'' WHERE id = (SELECT id FROM provas LIMIT 1)'),

  ('chk_edital_nome_preenchido',
   'edital sem nome',
   'editais',
   'UPDATE editais SET nome = '' '' WHERE id = (SELECT id FROM editais LIMIT 1)'),

  ('chk_edital_n_candidatos_positivo',
   'edital com candidatos negativos',
   'editais',
   'UPDATE editais SET n_candidatos = -10 WHERE id = (SELECT id FROM editais LIMIT 1)'),

  ('chk_colab_nome_preenchido',
   'colaborador sem nome',
   'colaboradores',
   'UPDATE colaboradores SET colab_nome_completo = '' '' WHERE id = (SELECT id FROM colaboradores LIMIT 1)'),

  ('chk_colab_cpf_numerico',
   'CPF com letras — o achado central: .length(11) do Zod aceitava isto',
   'colaboradores',
   'UPDATE colaboradores SET colab_cpf = ''abcdefghijk'' WHERE id = (SELECT id FROM colaboradores LIMIT 1)'),

  ('chk_colab_cpf_numerico',
   'CPF com pontuação (11 caracteres, mas não 11 dígitos)',
   'colaboradores',
   'UPDATE colaboradores SET colab_cpf = ''123.456.789'' WHERE id = (SELECT id FROM colaboradores LIMIT 1)'),

  ('chk_colab_telefone_positivo',
   'telefone negativo',
   'colaboradores',
   'UPDATE colaboradores SET colab_telefone = -1 WHERE id = (SELECT id FROM colaboradores LIMIT 1)'),

  ('chk_colab_numero_casa_nao_negativo',
   'número de casa negativo',
   'colaboradores',
   'UPDATE colaboradores SET colab_numero_casa = -3 WHERE id = (SELECT id FROM colaboradores LIMIT 1)'),

  ('chk_colab_email_formato',
   'e-mail sem @',
   'colaboradores',
   'UPDATE colaboradores SET colab_email = ''reaportalvr.com'' WHERE id = (SELECT id FROM colaboradores LIMIT 1)'),

  ('chk_colab_email_formato',
   'e-mail com domínio sem ponto',
   'colaboradores',
   'UPDATE colaboradores SET colab_email = ''fulano@gmailcom'' WHERE id = (SELECT id FROM colaboradores LIMIT 1)'),

  ('chk_colab_email_formato',
   'e-mail com espaço nas pontas (o caso das 22 linhas saneadas)',
   'colaboradores',
   'UPDATE colaboradores SET colab_email = '' fulano@gmail.com '' WHERE id = (SELECT id FROM colaboradores LIMIT 1)');

-- Caso com `filtro` próprio (ver o comentário da coluna).
INSERT INTO _casos (constraint_, descricao, tabela, comando, filtro) VALUES
  ('chk_cargo_nome_preenchido',
   'função de colaborador sem nome (numa função EDITÁVEL — as de sistema têm trigger antes)',
   'funcoes_colaboradores',
   'UPDATE funcoes_colaboradores SET cargo_nome = ''   '' WHERE id = (SELECT id FROM funcoes_colaboradores WHERE cargo_editavel IS DISTINCT FROM false LIMIT 1)',
   'cargo_editavel IS DISTINCT FROM false');

-- ── Execução ────────────────────────────────────────────────────────────────
DO $bateria$
DECLARE
  c            record;
  passou       int := 0;
  falhou       int := 0;
  pulou        int := 0;
  tem_linha    boolean;
  erro_estado  text;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== Bateria de bypass — CHECK constraints ===';
  RAISE NOTICE 'Esperado em cada caso: SQLSTATE 23514 (check_violation)';
  RAISE NOTICE '';

  FOR c IN SELECT * FROM _casos ORDER BY ordem LOOP
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I WHERE %s)', c.tabela, c.filtro) INTO tem_linha;

    IF NOT tem_linha THEN
      pulou := pulou + 1;
      RAISE NOTICE 'SKIP    %  — % (sem linha-cobaia em %)', c.constraint_, c.descricao, c.tabela;
      CONTINUE;
    END IF;

    BEGIN
      EXECUTE c.comando;
      -- Chegou aqui: o banco ACEITOU o valor inválido.
      falhou := falhou + 1;
      RAISE NOTICE 'FALHOU  %  — % (o banco ACEITOU)', c.constraint_, c.descricao;
    EXCEPTION
      WHEN check_violation THEN
        GET STACKED DIAGNOSTICS erro_estado = CONSTRAINT_NAME;
        IF erro_estado IS DISTINCT FROM c.constraint_ THEN
          -- Barrou, mas por outra constraint: o caso não prova o que dizia provar.
          falhou := falhou + 1;
          RAISE NOTICE 'FALHOU  %  — % (barrou por "%", não pela esperada)',
                       c.constraint_, c.descricao, erro_estado;
        ELSE
          passou := passou + 1;
          RAISE NOTICE 'ok      %  — %', c.constraint_, c.descricao;
        END IF;
      WHEN OTHERS THEN
        -- Barrou, mas não por CHECK: trigger, NOT NULL, FK... O caso não prova o que
        -- se propôs a provar. Reportar em vez de derrubar a bateria inteira — foi o
        -- que aconteceu na primeira execução, com o trigger das funções de sistema.
        falhou := falhou + 1;
        RAISE NOTICE 'FALHOU  %  — % (erro % em vez de check_violation: %)',
                     c.constraint_, c.descricao, SQLSTATE, SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE '';
  RAISE NOTICE '--- Resultado: % ok, % falhou, % pulado (de % casos) ---',
               passou, falhou, pulou, passou + falhou + pulou;

  IF falhou > 0 THEN
    RAISE EXCEPTION 'BATERIA REPROVADA: % caso(s) não foram barrados como esperado.', falhou;
  END IF;
  RAISE NOTICE 'BATERIA APROVADA.';
  RAISE NOTICE '';
END
$bateria$;

-- Nada aqui deve persistir.
ROLLBACK;

-- ============================================================================
-- Conferência do caminho HTTP (feita à mão em 2026-07-25 — registro do resultado)
-- ============================================================================
--
-- O SQL acima prova que o BANCO barra. Falta saber o que o usuário veria se
-- tropeçasse: erro tratável (4xx) ou explosão (5xx)? Conferido com PATCH direto no
-- PostgREST, fora do frontend:
--
--   curl -X PATCH "http://127.0.0.1:54321/rest/v1/unidades_prova?id=eq.<uuid>" \
--     -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
--     -H "Content-Type: application/json" -d '{"unid_andares": -5}'
--
-- Resultado: **HTTP 400** com corpo JSON `{"code":"23514", "message":"new row for
-- relation \"unidades_prova\" violates check constraint \"chk_unid_andares_min\""}`.
--
-- ⚠️ **Este registro é de 25/07 e a coluna não existe mais desde 03/08** — repetir o
-- comando hoje dá 400 por outro motivo (coluna inexistente, PGRST204). O que ele
-- continua provando, e por isso fica: violação de CHECK chega ao cliente como **4xx
-- nomeando a constraint**, não como 5xx. Para reproduzir, troque por um CHECK vivo
-- (`{"unid_nome": "   "}` → chk_unid_nome_preenchido).
-- Idem para `colab_cpf = 'abcdefghijk'` → 400 / 23514 / chk_colab_cpf_numerico.
-- Nenhuma linha foi alterada nos dois casos. É o comportamento desejado: erro de
-- cliente, nomeando a constraint — dá para o frontend traduzir em mensagem amigável,
-- como já se faz com a unicidade de nome de edital.
--
-- ⚠️ OBSERVAÇÃO DE SEGURANÇA, registrada porque não é óbvia: o campo `details` da
-- resposta do PostgREST vem com a LINHA INTEIRA que falhou ("Failing row contains
-- (...)") — no caso de `colaboradores`, isso inclui CPF, PIS, endereço, telefone e
-- dados bancários. Hoje isso NÃO é vazamento novo, porque quem consegue disparar um
-- UPDATE nessa tabela (admin/coordenador, pela RLS) já enxerga as mesmas linhas no
-- SELECT. Mas a contenção depende de as policies de UPDATE e de SELECT continuarem
-- alinhadas: se algum dia alguém puder escrever numa linha que não pode ler, uma
-- violação de constraint proposital vira um leitor. Considere isto ao mexer nas
-- policies de `colaboradores`.
