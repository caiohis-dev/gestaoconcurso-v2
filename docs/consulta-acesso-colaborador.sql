-- =============================================================================
-- CONSULTA DE DIAGNÓSTICO: "essa pessoa recebeu o link? ela acessou?"
-- =============================================================================
-- SOMENTE LEITURA. Nenhum INSERT/UPDATE/DELETE, nenhuma transação a desfazer.
-- Feita para ser colada no SQL Editor do dashboard do Supabase de PRODUÇÃO.
-- Não requer `supabase link` — o repo continua deslinkado (CLAUDE.md §6).
--
-- POR QUE ELA EXISTE
-- A coluna `colaboradores.colab_ultimo_acesso`, que a tela `/colaboradores` mostra
-- como "Último Acesso", NÃO TEM ESCRITOR desde 2026-07-15 (os dois que existiam
-- foram dropados em `20260715125720_drop_rpcs_colaborador_antigas.sql`). Ela está
-- congelada: quem entrou depois dessa data aparece como "Nunca acessou", e quem
-- usava o portal antigo aparece com uma data de junho/julho de 2026.
-- **A tela não é evidência de nada.** A evidência mora em `auth.users`.
-- Ver `my_rules/analises/analise-ultimo-acesso-e-convite.md`.
--
-- COMO LER OS CARIMBOS — medido contra o GoTrue local em 2026-09-20, não deduzido:
--
--   generateLink('invite')  → cria a conta; carimba `invited_at` E
--                             `confirmation_sent_at`; confirmado/login ficam nulos
--   clique no link `invite` → **LIMPA `confirmation_sent_at`** e carimba
--                             `email_confirmed_at` + `last_sign_in_at` (3 ms de
--                             diferença entre os dois) e abre sessão
--   generateLink('recovery')→ carimba `recovery_sent_at`
--   clique no `recovery`    → avança `last_sign_in_at`; `recovery_sent_at` NÃO é
--                             limpo — ele só diz quando o último foi enviado
--
-- 🔴 As duas consequências que mudam a leitura:
--   1. `colaboradores.user_id` preenchido NÃO significa que a pessoa acessou. O
--      `generateLink` cria a conta na hora do envio, e é o nascimento da conta que
--      dispara o trigger do vínculo. `user_id` prova que o CONVITE FOI GERADO.
--   2. `last_sign_in_at` preenchido não significa "entrou com a própria senha": o
--      próprio clique no link abre sessão. Para separar "só abriu o link" de "usa o
--      sistema", compare `last_sign_in_at` com `email_confirmed_at`.
--
-- 🔵 O CORTE DE 1 SEGUNDO NÃO É CHUTE — é o que o dado mostrou. Medida a diferença
--    entre os dois carimbos nas 47 contas de colaborador que já entraram (local,
--    cópia de prod de 16/09), a distribuição é BIMODAL e sem zona cinzenta:
--       7 contas entre 4 e 13 MILISSEGUNDOS  → o clique, e nada mais
--       nada entre 13 ms e 24,8 s
--      40 contas de 24,8 s a vários dias     → voltaram e entraram de verdade
--    Um corte de "2 minutos" classificaria como "só clicou" 12 pessoas que haviam
--    criado a senha e logado em seguida — o caminho normal, que leva ~1 a 2 min.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- BLOCO 1 — UMA PESSOA (o caso que motivou a consulta)
-- Troque o valor abaixo pelo CPF (só dígitos) ou pelo e-mail. Aceita os dois.
-- -----------------------------------------------------------------------------
WITH alvo AS (SELECT 'COLE-AQUI-O-CPF-OU-O-EMAIL'::text AS busca)
SELECT
  c.colab_nome_completo,
  c.colab_cpf,
  c.colab_email,
  (c.user_id IS NOT NULL)                    AS cadastro_vinculado,
  u.invited_at,
  u.confirmation_sent_at,                    -- preenchido = convite AINDA NÃO ABERTO
  u.recovery_sent_at,
  u.email_confirmed_at,                      -- preenchido = o link FOI aberto
  u.last_sign_in_at,
  c.colab_ultimo_acesso,
  CASE WHEN c.colab_ultimo_acesso IS NULL
       THEN 'Nunca acessou' ELSE to_char(c.colab_ultimo_acesso, 'DD/MM/YYYY') END
                                             AS o_que_a_tela_mostra,
  CASE
    WHEN u.id IS NULL
      THEN '1. SEM CONTA NO AUTH — o convite não chegou a ser gerado'
    WHEN u.email_confirmed_at IS NULL AND u.confirmation_sent_at IS NOT NULL
      THEN '2. CONVITE PENDENTE — foi enviado e NUNCA foi aberto'
    WHEN u.email_confirmed_at IS NULL
      THEN '3. conta sem convite pendente e sem confirmação — caso raro, investigar'
    WHEN u.last_sign_in_at - u.email_confirmed_at < interval '1 second'
      THEN '4. SÓ ABRIU O LINK — nunca entrou com a própria senha'
    ELSE '5. ACESSA O SISTEMA — a tela está mentindo'
  END                                        AS leitura
FROM alvo a
JOIN public.colaboradores c
  ON lower(trim(c.colab_email)) = lower(trim(a.busca))
  OR c.colab_cpf = regexp_replace(a.busca, '\D', '', 'g')
LEFT JOIN auth.users u ON u.id = c.user_id;


-- -----------------------------------------------------------------------------
-- BLOCO 2 — A COORTE INTEIRA DO AUTOSSERVIÇO DE E-MAIL
-- Todo mundo que informou o próprio e-mail em /auth ou /cadastro-publico (a porta
-- aberta em 19/09, a mesma que dispara o aviso aos admins). Responde "essa porta
-- está funcionando?" em vez de "essa pessoa acessou?".
-- -----------------------------------------------------------------------------
SELECT
  l.criado_em,
  l.colab_nome,
  l.email_informado,
  l.origem,
  (l.aviso_admins_em IS NOT NULL)            AS aviso_saiu,
  (c.user_id IS NOT NULL)                    AS convite_gerado,
  (u.confirmation_sent_at IS NOT NULL)       AS convite_pendente,
  (u.email_confirmed_at IS NOT NULL)         AS abriu_o_link,
  u.last_sign_in_at
FROM public.log_email_autoinformado l
LEFT JOIN public.colaboradores c ON c.id = l.colaborador_id
LEFT JOIN auth.users u           ON u.id = c.user_id
ORDER BY l.criado_em DESC;

-- Resumo da mesma coorte, em uma linha.
SELECT
  count(*)                                                        AS informaram_o_email,
  count(*) FILTER (WHERE c.user_id IS NULL)                       AS sem_conta_convite_nao_saiu,
  count(*) FILTER (WHERE u.confirmation_sent_at IS NOT NULL)      AS convite_pendente_nunca_aberto,
  count(*) FILTER (WHERE u.email_confirmed_at IS NOT NULL)        AS abriram_o_link,
  count(*) FILTER (WHERE u.last_sign_in_at - u.email_confirmed_at >= interval '1 second')
                                                                  AS voltaram_e_entraram
FROM public.log_email_autoinformado l
LEFT JOIN public.colaboradores c ON c.id = l.colaborador_id
LEFT JOIN auth.users u           ON u.id = c.user_id;


-- -----------------------------------------------------------------------------
-- BLOCO 3 — O TAMANHO DO DEFEITO EM PRODUÇÃO
-- Quantas pessoas a tela descreve errado. No banco local (cópia de prod de 16/09)
-- dava: 47 entraram de verdade, 33 delas exibidas como "Nunca acessou", e as
-- outras 14 exibindo uma data de junho/julho.
-- ⚠️ CONTROLE POSITIVO: `entraram_de_verdade` tem de ser > 0. Se vier zero, a
-- consulta está errada — não é o banco que está vazio, você mesmo já entrou.
-- -----------------------------------------------------------------------------
SELECT
  count(*)                                                                      AS colaboradores_vinculados,
  count(*) FILTER (WHERE u.last_sign_in_at IS NOT NULL)                         AS entraram_de_verdade,
  count(*) FILTER (WHERE u.last_sign_in_at IS NOT NULL
                     AND c.colab_ultimo_acesso IS NULL)                         AS mas_a_tela_diz_nunca_acessou,
  count(*) FILTER (WHERE u.last_sign_in_at IS NOT NULL
                     AND c.colab_ultimo_acesso IS NOT NULL
                     AND c.colab_ultimo_acesso < u.last_sign_in_at)             AS tela_mostra_data_congelada,
  count(*) FILTER (WHERE u.last_sign_in_at IS NULL)                             AS convite_gerado_sem_acesso,
  max(c.colab_ultimo_acesso)                                                    AS ultimo_carimbo_da_coluna_morta,
  max(u.last_sign_in_at)                                                        AS ultimo_login_de_verdade
FROM public.colaboradores c
JOIN auth.users u ON u.id = c.user_id;


-- -----------------------------------------------------------------------------
-- BLOCO 4 — OPCIONAL: o log de auditoria do GoTrue
-- É a fonte mais precisa ("quantas vezes essa conta logou, e quando"), mas a
-- retenção não foi conferida em produção. Rode a primeira consulta: se vier
-- vazia ou só com dias recentes, ignore o bloco — não é evidência de ausência.
-- -----------------------------------------------------------------------------
SELECT count(*) AS linhas, min(created_at)::date AS mais_antiga, max(created_at)::date AS mais_recente
FROM auth.audit_log_entries;

SELECT a.created_at, a.payload->>'action' AS acao, a.payload->>'actor_username' AS conta
FROM auth.audit_log_entries a
WHERE a.payload->>'actor_username' = 'COLE-AQUI-O-EMAIL'
ORDER BY a.created_at DESC
LIMIT 50;


-- -----------------------------------------------------------------------------
-- BLOCO 5 — QUEM FICOU NO MEIO DO CAMINHO
-- Abriu o link e nunca mais entrou. É a lista de quem vale a coordenação procurar.
--
-- ⚠️ O sinal é CIRCUNSTANCIAL, e o limite tem de ser dito: `updated_at` avança a
--    cada alteração da linha, não só ao definir a senha. Ele separa "mexeu em algo
--    depois do clique" de "não mexeu" — na prática, quem chegou a criar a senha e
--    não voltou, de quem abandonou antes disso. Não é prova, é triagem.
--
-- 🔴 `encrypted_password` NÃO serve para isso, e é a armadilha óbvia: o GoTrue
--    sempre grava um hash, inclusive para o convidado que nunca definiu senha.
--    Medido no local: ZERO contas com senha vazia nos dois grupos. Quem auditar por
--    essa coluna conclui que todo mundo tem senha — e não aprende nada.
-- -----------------------------------------------------------------------------
SELECT
  c.colab_nome_completo,
  c.colab_email,
  c.colab_telefone,
  u.email_confirmed_at                                  AS abriu_o_link_em,
  u.updated_at,
  CASE WHEN u.updated_at > u.email_confirmed_at + interval '1 second'
       THEN 'provavelmente criou a senha e não voltou a entrar'
       ELSE 'abandonou antes de criar a senha' END       AS onde_parou
FROM public.colaboradores c
JOIN auth.users u ON u.id = c.user_id
WHERE u.email_confirmed_at IS NOT NULL
  AND u.last_sign_in_at IS NOT NULL
  AND u.last_sign_in_at - u.email_confirmed_at < interval '1 second'
ORDER BY u.email_confirmed_at DESC;


-- =============================================================================
-- BLOCO 6 — A TRILHA DE ENVIO (migration 20260921005259) — FONTE DIRETA
-- =============================================================================
-- Tudo acima INFERE "o e-mail saiu?" dos carimbos do GoTrue — que existem por sorte,
-- não por desenho nosso, e só respondem para quem JÁ tem conta no Auth. A partir de
-- 2026-09-20, `log_envio_link_acesso` responde DIRETO, para toda tentativa de envio
-- (sucesso ou falha), disparada por qualquer uma das 5 portas.
--
-- ⚠️ SÓ VALE DAQUI PARA FRENTE. Não houve backfill (mesma decisão do carimbo de
-- último acesso) — envios de antes de 20/09 não aparecem aqui.

\echo ''
\echo '--- 6.1 Por pessoa: todo envio já tentado para este e-mail ---'
WITH alvo AS (SELECT 'COLE-AQUI-O-EMAIL'::text AS busca)
SELECT l.criado_em, l.origem, l.tipo_usado, l.sucesso, l.motivo_falha
FROM alvo a
JOIN public.log_envio_link_acesso l ON lower(trim(l.email)) = lower(trim(a.busca))
ORDER BY l.criado_em DESC;

\echo ''
\echo '--- 6.2 Falhas de envio, as mais recentes — hoje só existiam em console.error ---'
SELECT criado_em, origem, email, tipo_usado, motivo_falha
FROM public.log_envio_link_acesso
WHERE sucesso = false
ORDER BY criado_em DESC
LIMIT 50;

\echo ''
\echo '--- 6.3 Volume por porta e por resultado, desde que a trilha existe ---'
SELECT origem,
       count(*) FILTER (WHERE sucesso)       AS sucesso,
       count(*) FILTER (WHERE NOT sucesso)   AS falha
FROM public.log_envio_link_acesso
GROUP BY origem
ORDER BY origem;
