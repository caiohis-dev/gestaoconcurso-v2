-- Conceder acesso de coordenador em UMA transação, com o `user_id` DERIVADO do cadastro.
--
-- O QUE ISTO SUBSTITUI
-- A Edge Function `create-coordenador`, removida no mesmo passe. Ela recebia e-mail e
-- SENHA digitados pelo admin e **criava uma conta no Auth** (`admin.createUser` com
-- `email_confirm: true`), devolvendo a senha num toast para o admin repassar. Era o
-- fluxo da era pré-v2, quando colaborador não era usuário do sistema. Hoje a conta tem
-- caminho próprio — invite por `_shared/enviar-link-acesso.ts`, e o trigger
-- `handle_new_user` vincula `colaboradores.user_id` casando por `colab_email`.
--
-- Três defeitos morrem com ela, e vale registrar porque a FORMA deles se repete:
--   1. Criava a conta ANTES de gravar `colab_email`, então `handle_new_user` não casava
--      nada: `colaboradores.user_id` ficava NULL e o papel `colaborador` não era
--      concedido — coordenador que não é colaborador. Pior, sem conserto no app:
--      reivindicar pelo CPF dispara `generateLink('invite')` num e-mail que já tem
--      conta, o invite falha e a EF responde sucesso assim mesmo.
--   2. No rollback chamava `deleteUser` **inclusive quando reaproveitara uma conta
--      existente** (a variável `isExistingUser` era atribuída e nunca lida) — com
--      `profiles`/`user_roles` em CASCADE, apagava conta e papéis de gente real.
--   3. `listUsers()` sem paginação (50/página): passando de 50 contas, deixaria de achar
--      a conta existente e cairia no ramo de criar.
--
-- POR QUE RPC
-- A concessão são dois escritos — `user_roles` e `coordenadores_prova`. "Vários passos
-- sem transação" é um dos dois padrões de defeito que mais se repetiram neste repo, e a
-- revogação já virou RPC por isso mesmo (`revogar_coordenador`, 20260726160000). Esta é
-- a simétrica que faltava.
--
-- AUTORIZAÇÃO
-- `has_role(auth.uid(), 'admin')` — a mesma exigência da policy de INSERT de
-- `coordenadores_prova` que ela contorna por ser SECURITY DEFINER, nem mais nem menos.
-- E é `has_role`, nunca SELECT literal em `user_roles`: a hierarquia superadmin ⇒ admin
-- mora dentro da função, e ignorá-la já bloqueou o superadmin três vezes aqui — uma
-- delas nesta mesma concessão (403 na `create-coordenador`, corrigido em 2026-07-26).

CREATE OR REPLACE FUNCTION public.conceder_coordenador(p_colaborador_prova_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Os MESMOS dois ids de `src/hooks/useCoordenadoresProva.tsx` (FUNCOES_COORDENACAO).
  -- ⚠️ Acoplamento por UUID literal, frágil por construção e já documentado em
  -- `my_rules/estrutura/modulos/aplicacao-provas/alocacao-e-funcoes.md`: se essas linhas
  -- de `funcoes_colaboradores` forem recriadas, ganham id novo e a elegibilidade quebra
  -- em silêncio. A bateria afirma que os dois ids existem, para a quebra dar sinal.
  c_funcoes_coordenacao uuid[] := ARRAY[
    '11a310e5-0fce-46f2-8ad7-769a5e5d7f89'::uuid,  -- Coordenador Geral
    '8d36ef0f-becb-45f3-837b-04eea15489fb'::uuid   -- Auxiliar de Coordenação
  ];
  v_prova_id   uuid;
  v_funcao_id  uuid;
  v_colab_id   uuid;
  v_user_id    uuid;
  v_email      text;
  v_nome       text;
  v_id         uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas administradores podem conceder acesso de coordenador'
      USING ERRCODE = '42501';
  END IF;

  -- Tudo é DERIVADO da alocação. O cliente manda um id e nada mais — em especial, não
  -- manda o `user_id`, que era justamente o campo livre que deixava a conta do acesso
  -- divergir da conta do cadastro.
  SELECT pu.prova_id, ap.funcao_id, c.id, c.user_id, c.colab_email, c.colab_nome_completo
    INTO v_prova_id, v_funcao_id, v_colab_id, v_user_id, v_email, v_nome
    FROM public.colaboradores_prova ap
    JOIN public.prova_unidades pu ON pu.id = ap.prova_unidade_id
    JOIN public.colaboradores  c  ON c.id  = ap.colaborador_id
   WHERE ap.id = p_colaborador_prova_id;

  IF v_prova_id IS NULL THEN
    RAISE EXCEPTION 'Alocação não encontrada. Recarregue a tela e tente de novo.'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_funcao_id IS NULL OR NOT (v_funcao_id = ANY (c_funcoes_coordenacao)) THEN
    RAISE EXCEPTION '% não está alocado com função de coordenação nesta prova. Altere a função da alocação antes de conceder o acesso.', v_nome
      USING ERRCODE = 'P0001';
  END IF;

  -- As duas recusas que substituem a criação de conta pelo diálogo. Elas NOMEIAM o que
  -- fazer porque chegam à tela: mensagem de banco que não instrui já foi dívida duas
  -- vezes neste repo.
  IF v_user_id IS NULL THEN
    IF v_email IS NULL OR btrim(v_email) = '' THEN
      RAISE EXCEPTION '% ainda não tem acesso ao sistema, e o cadastro dele não tem e-mail. Cadastre o e-mail dele primeiro; depois ele entra em /auth por "Estou sem minha senha".', v_nome
        USING ERRCODE = 'P0001';
    END IF;
    RAISE EXCEPTION '% ainda não tem acesso ao sistema. Peça que ele entre em /auth e use "Estou sem minha senha" (%); assim que ele definir a senha, o acesso de coordenador pode ser concedido.', v_nome, v_email
      USING ERRCODE = 'P0001';
  END IF;

  -- Barreira preservada da UI: o e-mail de um admin não podia virar acesso de
  -- coordenador. Ela vivia num SELECT do `CoordenadoresProvaDialog` e passa a viver
  -- aqui, onde não se contorna pelo PostgREST.
  IF public.has_role(v_user_id, 'admin') THEN
    RAISE EXCEPTION '% é Administrador do sistema e não pode receber acesso de Coordenador.', v_nome
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.coordenadores_prova
     WHERE user_id = v_user_id AND prova_id = v_prova_id
  ) THEN
    RAISE EXCEPTION '% já possui acesso de coordenador nesta prova.', v_nome
      USING ERRCODE = 'P0001';
  END IF;

  -- Ordem: o papel antes do acesso. Dentro da transação tanto faz, mas deixa a intenção
  -- explícita — quem controla acesso é `coordenadores_prova`, e `is_coordenador_prova`
  -- nunca olha `user_roles`.
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, 'coordenador'::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.coordenadores_prova (colaborador_prova_id, user_id, prova_id, created_by)
  VALUES (p_colaborador_prova_id, v_user_id, v_prova_id, auth.uid())
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Função nova nasce com EXECUTE para PUBLIC (e `anon` é membro de PUBLIC): o padrão
-- firmado pela 20260908231620 é revogar de PUBLIC — revogar de `anon` não faria nada — e
-- devolver a quem precisa.
REVOKE ALL ON FUNCTION public.conceder_coordenador(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.conceder_coordenador(uuid) TO authenticated, service_role;


-- ---------------------------------------------------------------------------------
-- A invariante no banco: a conta do ACESSO é a conta do CADASTRO
-- ---------------------------------------------------------------------------------
-- A RPC acima é o caminho certo, mas regra que só existe no caminho certo não é regra —
-- a policy de INSERT de `coordenadores_prova` é `has_role(admin)`, então um admin ainda
-- alcança a tabela direto pelo PostgREST com o par (user_id, colaborador_prova_id) que
-- quiser. É assim que se produz o coordenador cuja conta não é a do próprio cadastro.
--
-- 🔴 POR QUE A CHECAGEM DO user_id É CONDICIONAL — medido em 2026-09-12, e é o que
-- impede esta migration de quebrar todo `db reset`:
-- o dump (`seed.local.sql`) NÃO traz `colaboradores.user_id` — a coluna nem aparece na
-- lista do INSERT. Quem preenche os 12 vínculos é o backfill do `seed.pos.sql`, que roda
-- **depois** do dump. No instante em que o dump insere as 10 linhas de
-- `coordenadores_prova`, portanto, `colaboradores.user_id` ainda é NULL para todas —
-- e uma checagem incondicional derrubaria a carga inteira, aqui e no bootstrap de
-- produção, que lê o mesmo arquivo.
--
-- Então: sem vínculo no cadastro, não há com o que comparar e a linha passa (a RPC é
-- quem exige o vínculo). COM vínculo, as duas contas têm de ser a mesma — que é o caso
-- perigoso de verdade, o único que produz duas identidades para a mesma pessoa.
--
-- `prova_id`, esse, é conferido SEMPRE: não depende de seed nenhum. Medido antes de
-- apertar: as 10 linhas existentes são coerentes nos dois critérios, então não há
-- saneamento a fazer — e saneamento, se houvesse, moraria no dump, nunca aqui.

CREATE OR REPLACE FUNCTION public.check_coordenador_prova_coerente()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prova_id uuid;
  v_user_id  uuid;
  v_nome     text;
BEGIN
  SELECT pu.prova_id, c.user_id, c.colab_nome_completo
    INTO v_prova_id, v_user_id, v_nome
    FROM public.colaboradores_prova ap
    JOIN public.prova_unidades pu ON pu.id = ap.prova_unidade_id
    JOIN public.colaboradores  c  ON c.id  = ap.colaborador_id
   WHERE ap.id = NEW.colaborador_prova_id;

  IF NEW.prova_id IS DISTINCT FROM v_prova_id THEN
    RAISE EXCEPTION 'Acesso de coordenador incoerente: a alocação de % pertence a outra prova.', COALESCE(v_nome, 'colaborador')
      USING ERRCODE = 'P0001';
  END IF;

  IF v_user_id IS NOT NULL AND NEW.user_id IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'Acesso de coordenador incoerente: a conta informada não é a conta de %. O acesso tem de usar a conta do próprio cadastro.', COALESCE(v_nome, 'colaborador')
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_coordenador_prova_coerente_trigger ON public.coordenadores_prova;
CREATE TRIGGER check_coordenador_prova_coerente_trigger
  BEFORE INSERT OR UPDATE ON public.coordenadores_prova
  FOR EACH ROW EXECUTE FUNCTION public.check_coordenador_prova_coerente();
