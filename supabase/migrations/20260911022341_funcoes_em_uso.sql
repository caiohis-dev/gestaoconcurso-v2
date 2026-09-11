-- Quais funções de colaborador estão EM USO — agregado no banco.
--
-- ⚠️ O timestamp deste arquivo é UTC: foi criado em 2026-09-10, à noite (horário local).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- POR QUE EXISTE
-- ─────────────────────────────────────────────────────────────────────────────
-- `/funcoes-colaboradores` precisa saber, por função, se ela já é usada em alguma prova —
-- só para desabilitar o botão de excluir e escrever o tooltip. Para isso, o hook
-- `useFuncoesAssociadas` baixava as TRÊS tabelas inteiras e montava um `Set` no cliente.
--
-- MEDIDO em 2026-09-10, no banco local (cópia de produção):
--     valores_funcao_prova ........  1.342 bytes (24 linhas)
--     colaboradores_prova ......... 31.022 bytes (554 linhas)
--     meta_colaboradores_unidade .. 10.414 bytes (186 linhas)
--     TOTAL ...................... 42.778 bytes, em 3 requisições
--
-- 42,8 kB para produzir um punhado de booleanos. Esta função devolve só os ids.
--
-- 🔴 E FECHA UM RISCO QUE NENHUM CONSERTO NO CLIENTE ALCANÇA: o PostgREST trunca a
--    resposta em `max_rows` (1000 por padrão) **em silêncio**. Com as três consultas
--    cruas, passar de 1000 linhas em qualquer uma faria o `Set` nascer incompleto — e o
--    sintoma seria o botão de excluir **não** desabilitar. Agregando no banco, o teto
--    deixa de importar: o retorno tem no máximo uma linha por função (18 hoje).
--
-- ⚠️ O QUE ESTE ITEM **NÃO** É, e a primeira versão dele afirmava que era: não é risco de
--    perda de dado. As três FKs para `funcoes_colaboradores` são **RESTRICT** (medido), e
--    o banco recusa a exclusão de função em uso nomeando
--    `colaboradores_prova_funcao_id_fkey`; a UI já traduz esse `23503`
--    (`useFuncoesColaboradores.tsx`). O pior caso é um botão que devia estar desabilitado
--    e não está — o usuário clica e recebe a recusa. Degradação de UX, não perda.
--
-- ⚠️ E a primeira tentativa de provar a recusa provou a REGRA ERRADA: apagar "Coordenador
--    Geral" é barrado por `prevent_system_funcao_changes()`, não pela FK. Só com uma
--    função `cargo_editavel = true` **e** em uso a FK aparece. Ao provar uma recusa, leia
--    o NOME de quem barrou.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- SEGURANÇA
-- ─────────────────────────────────────────────────────────────────────────────
-- `SECURITY INVOKER` (o padrão), então a RLS das três tabelas continua valendo e o
-- resultado é exatamente o que o chamador já podia ler. 🔵 Na prática isso não muda nada
-- hoje: `/funcoes-colaboradores` é guardada por `["admin"]` (App.tsx), e as três policies
-- liberam tudo para admin. Vale como garantia se a tela um dia abrir para coordenador —
-- aí ele veria "em uso" só o que alcança, que é o mesmo que vê hoje pelo caminho cru.

CREATE OR REPLACE FUNCTION public.funcoes_em_uso()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
AS $$
  -- UNION (não UNION ALL) de propósito: o que interessa é o conjunto, e a função é
  -- chamada para responder "esta está em uso?" — repetir id seria só tráfego.
  SELECT v.funcao_id FROM public.valores_funcao_prova v       WHERE v.funcao_id IS NOT NULL
  UNION
  SELECT c.funcao_id FROM public.colaboradores_prova c        WHERE c.funcao_id IS NOT NULL
  UNION
  SELECT m.funcao_id FROM public.meta_colaboradores_unidade m WHERE m.funcao_id IS NOT NULL
$$;

COMMENT ON FUNCTION public.funcoes_em_uso() IS
  'Ids das funcoes_colaboradores que aparecem em valores_funcao_prova, '
  'colaboradores_prova ou meta_colaboradores_unidade. Usada por /funcoes-colaboradores '
  'para desabilitar o botao de excluir. Substitui tres selects crus que somavam 42,8 kB '
  'e ficavam sujeitos ao truncamento silencioso em max_rows. SECURITY INVOKER: a RLS das '
  'tres tabelas continua valendo. A barreira real da exclusao sao as FKs RESTRICT.';

-- 🔴 `service_role` não é opcional: sem ele, toda leitura pela chave de serviço morre com
-- `42501 permission denied for function`, e a mensagem não diz o que faltou. Já custou
-- tempo duas vezes hoje (`colab_nome_busca` e `totais_da_prova`).
REVOKE ALL ON FUNCTION public.funcoes_em_uso() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.funcoes_em_uso() TO authenticated, service_role;
