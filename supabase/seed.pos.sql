-- seed.pos.sql — operações de DADOS que rodam DEPOIS da carga do dump.
--
-- Por que este arquivo existe: migration não alcança dado que entra pelo dump. O
-- `[db.seed]` roda depois das migrations no `db reset` e NÃO roda em `db push`, então
-- uma migration de dados rodaria contra tabela vazia (no-op) e nunca mais rodaria.
-- Schema vai em migration; dado vem para cá.
--
-- Diferente do seed.local.sql (o dump, com PII, não versionado), este arquivo É
-- VERSIONADO: contém só regras, nenhum dado pessoal — nenhum CPF, nome ou e-mail
-- aparece aqui. Ele é a metade da correção de dados que sobrevive a um dump novo.
--
-- Em produção o `db push` não executa seed nenhum: este arquivo é um passo MANUAL do
-- bootstrap, rodado depois de carregar o dump (ver my_rules/banco-producao.md).
--
-- Tudo aqui é idempotente e seguro contra base vazia: rodar duas vezes, ou antes de
-- existir dado, não faz efeito nem quebra.

-- ---------------------------------------------------------------------------
-- Backfill dos colaboradores que JÁ eram usuários do Auth antes da refatoração.
--
-- São a cúpula: 2 admins + 10 coordenadores, pessoas que são colaboradores e gestores
-- ao mesmo tempo. Elas não podem passar pelo fluxo de reivindicação, porque ele é um
-- cadastro e o Auth não emite um segundo usuário para um e-mail que já existe. Sem
-- este backfill elas ficariam com user_id NULL e perderiam o acesso aos próprios dados
-- de colaborador quando a porta velha fechar — silenciosamente.
--
-- O objetivo é deixá-las no mesmo estado em que a reivindicação deixa qualquer outro
-- colaborador: user_id preenchido + papel 'colaborador' em user_roles.
-- ---------------------------------------------------------------------------

WITH pares AS (
  -- Duas provas de que a conta e o cadastro são a mesma pessoa. O e-mail é a regra
  -- principal (normalizado como o Auth o trata, e como o índice único de colab_email
  -- o normaliza). O nome existe porque o e-mail sozinho perde quem se cadastrou no
  -- Auth com um endereço diferente do que consta no cadastro — hoje, um coordenador.
  SELECT c.id AS colab_id, u.id AS uid
  FROM colaboradores c
  CROSS JOIN auth.users u
  LEFT JOIN profiles p ON p.id = u.id
  WHERE c.user_id IS NULL
    AND (
         (c.colab_email IS NOT NULL AND lower(trim(c.colab_email)) = lower(trim(u.email)))
      OR (p.full_name  IS NOT NULL AND upper(trim(c.colab_nome_completo)) = upper(trim(p.full_name)))
    )
),
seguros AS (
  -- A trava. Vincular a pessoa errada é o pior erro possível nesta tabela (ela tem
  -- conta bancária), então só passa o casamento inequívoco: um colaborador para um
  -- usuário, nos dois sentidos. Homônimo, e-mail repetido ou um nome que case com
  -- duas contas não vinculam nada — ficam NULL e a pessoa reivindica pelo fluxo
  -- normal, que é o comportamento seguro.
  SELECT colab_id, uid FROM pares
  WHERE colab_id IN (SELECT colab_id FROM pares GROUP BY colab_id HAVING count(DISTINCT uid) = 1)
    AND uid      IN (SELECT uid      FROM pares GROUP BY uid      HAVING count(DISTINCT colab_id) = 1)
    -- e o usuário não pode já pertencer a outro colaborador (user_id é UNIQUE)
    AND NOT EXISTS (SELECT 1 FROM colaboradores c2 WHERE c2.user_id = pares.uid)
)
UPDATE colaboradores c
SET user_id = s.uid
FROM seguros s
WHERE c.id = s.colab_id;

-- O papel acompanha o elo: quem tem user_id é colaborador com conta, e mantém os
-- papéis de gestão que já tinha (user_roles é multi-papel — foi por isso que
-- 'colaborador' virou papel, e não uma coluna 'tipo', que rebaixaria os coordenadores).
INSERT INTO user_roles (user_id, role)
SELECT c.user_id, 'colaborador'::app_role
FROM colaboradores c
WHERE c.user_id IS NOT NULL
ON CONFLICT (user_id, role) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Backfill do tema "Editais como entidade" (roadmap-editais.yaml, etapa 1).
--
-- A migration criou a tabela `editais` e `provas.edital_id` (nullable). Aqui vem o
-- DADO: para cada prova_edital distinto, cria um edital (copiando os campos-modelo de
-- uma prova daquele edital) e liga as provas via edital_id.
--
-- Idempotente (ON CONFLICT no índice único de nome; o UPDATE só toca edital_id ainda
-- NULL) e seguro contra base vazia (sem provas, ambos são no-op). Em produção é passo
-- MANUAL do bootstrap; nos ambientes de hoje, o v2 nasce vazio e as provas já entram
-- com edital_id — este backfill serve o db reset local (cópia do v1) e é no-op no v2.
-- ---------------------------------------------------------------------------

INSERT INTO editais (nome, n_candidatos, cabecalho_linha1, cabecalho_linha2)
SELECT DISTINCT ON (lower(btrim(p.prova_edital)))
       btrim(p.prova_edital),
       p.prova_n_candidatos,
       p.prova_cabecalho_linha1,
       p.prova_cabecalho_linha2
FROM provas p
WHERE p.prova_edital IS NOT NULL AND btrim(p.prova_edital) <> ''
ORDER BY lower(btrim(p.prova_edital)), p.created_at NULLS LAST, p.id
ON CONFLICT (lower(btrim(nome))) DO NOTHING;

UPDATE provas p
SET edital_id = e.id
FROM editais e
WHERE p.edital_id IS NULL
  AND p.prova_edital IS NOT NULL
  AND lower(btrim(p.prova_edital)) = lower(btrim(e.nome));
