-- Desalocar um colaborador apagava o acesso de coordenador dele em silêncio.
--
-- `coordenadores_prova.colaborador_prova_id` apontava para `colaboradores_prova` com
-- ON DELETE CASCADE. A regra existia, mas só no cliente: `useColaboradoresProva` fazia
-- SELECT em `coordenadores_prova` e recusava com a mensagem "Este colaborador possui
-- acesso como Coordenador. Remova o acesso em 'Acesso dos Coordenadores' antes...".
--
-- Pela tela funcionava. Por qualquer outro caminho — PostgREST direto, Edge Function com
-- service_role, script — a alocação era apagada e o ACESSO SUMIA JUNTO, sem erro: a
-- pessoa perdia a coordenação da prova e nada registrava o porquê. São 10 vínculos.
--
-- Além disso, o pré-check era "leio e então decido": o acesso podia ser concedido entre
-- o SELECT e o DELETE.
--
-- DECISÃO DO USUÁRIO (2026-07-26): bloquear no banco também.
--
-- ⚠️ EFEITO COLATERAL DESEJADO, mas que precisa ser conhecido: `colaboradores_prova`
-- cascateia de `prova_unidades`. Com este RESTRICT, DESVINCULAR UMA UNIDADE que tenha um
-- coordenador alocado passa a FALHAR — a cascata esbarra aqui. É o comportamento certo
-- (desvincular não deve revogar coordenação em silêncio), mas muda o que a tela de
-- `/gerenciar-prova` faz: é preciso remover o acesso de coordenador antes. A RPC
-- `desvincular_unidade_da_prova` propaga o erro, e o cliente o traduz.
--
-- ⚠️ O QUE NÃO ENTRA NESTA MIGRATION: `salas_prova_distribuidas.sala_fiscal_1/2`
-- continua SET NULL — desalocar alguém o remove da sala em que era fiscal, em silêncio.
-- Hoje são ZERO linhas (nenhum fiscal foi atribuído a sala ainda), então é preventivo, e
-- bloquear ali criaria atrito no dia da prova, quando trocar fiscal de sala é rotina.
-- Decisão em aberto, registrada no backlog.

ALTER TABLE public.coordenadores_prova
  DROP CONSTRAINT IF EXISTS coordenadores_prova_colaborador_prova_id_fkey;
ALTER TABLE public.coordenadores_prova
  ADD CONSTRAINT coordenadores_prova_colaborador_prova_id_fkey
  FOREIGN KEY (colaborador_prova_id) REFERENCES public.colaboradores_prova(id)
  ON DELETE RESTRICT;
