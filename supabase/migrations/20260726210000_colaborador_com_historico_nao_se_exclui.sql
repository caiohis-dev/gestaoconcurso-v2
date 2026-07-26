-- Excluir um colaborador apagava o histórico dele em cascata.
--
-- As FKs que apontam para `colaboradores` nasceram CASCADE (default do dashboard do
-- Lovable, onde o schema foi feito):
--
--   colaboradores_prova.colaborador_id      CASCADE   -> alocações somem
--   ocorrencias_colaborador.colaborador_id  CASCADE   -> OCORRÊNCIAS somem
--   ocorrencias_colaborador.substituto_id   SET NULL  -> a substituição some da ocorrência
--   email_atualizacao_log.colaborador_id    CASCADE   -> log de envio some
--
-- O cliente (`useColaboradores.deleteMutation`) recusava se houvesse vínculo em
-- `colaboradores_prova`. Duas falhas nisso:
--
--   1. Era só cliente. Um DELETE direto pelo PostgREST passava reto.
--   2. **A regra do cliente protegia menos do que aparentava**: ele checava alocação e
--      NÃO checava ocorrência. Um colaborador com histórico de ocorrência mas sem
--      alocação era excluível PELA PRÓPRIA TELA, levando o histórico junto. Medido em
--      2026-07-26: 18 das 19 ocorrências do banco pertenciam a colaboradores nessa
--      situação exata.
--
-- DECISÃO DO USUÁRIO (2026-07-26): "excluir colaborador com histórico deve ser
-- impossível". As três FKs de participação viram RESTRICT.
--
-- `substituto_id` TAMBÉM vira RESTRICT, e isso é deliberado: ser citado como substituto
-- numa ocorrência É histórico. Deixá-lo em SET NULL reproduziria em miniatura o defeito
-- que esta migration fecha — a exclusão passaria, apagando em silêncio quem substituiu
-- quem. Custo real hoje: zero, os 14 substitutos já estão cobertos pelas outras regras.
--
-- ⚠️ EXCEÇÃO CONSCIENTE: `email_atualizacao_log` CONTINUA CASCADE.
-- Não é histórico de participação — é log operacional de entrega de mensagem. Bloquear
-- por causa dele criaria um beco sem saída: a pessoa não tem, em tela nenhuma, como
-- limpar esse log. E `colaborador_id` é NOT NULL, então SET NULL (que preservaria a
-- linha desgarrada) não é possível sem alterar a coluna. Custo da exceção, medido: 4
-- colaboradores têm log sem ter alocação nem ocorrência.
--
-- MEDIDO ANTES (banco local, cópia de produção, 2026-07-26):
--   771 colaboradores; 535 com alocação; 19 com ocorrência; 14 citados como substituto
--   => 553 passam a ser inexcluíveis, 218 seguem excluíveis.
-- Nenhuma linha órfã: a troca não invalida nada existente.

ALTER TABLE public.colaboradores_prova
  DROP CONSTRAINT IF EXISTS colaboradores_prova_colaborador_id_fkey;
ALTER TABLE public.colaboradores_prova
  ADD CONSTRAINT colaboradores_prova_colaborador_id_fkey
  FOREIGN KEY (colaborador_id) REFERENCES public.colaboradores(id)
  ON DELETE RESTRICT;

ALTER TABLE public.ocorrencias_colaborador
  DROP CONSTRAINT IF EXISTS ocorrencias_colaborador_colaborador_id_fkey;
ALTER TABLE public.ocorrencias_colaborador
  ADD CONSTRAINT ocorrencias_colaborador_colaborador_id_fkey
  FOREIGN KEY (colaborador_id) REFERENCES public.colaboradores(id)
  ON DELETE RESTRICT;

ALTER TABLE public.ocorrencias_colaborador
  DROP CONSTRAINT IF EXISTS ocorrencias_colaborador_substituto_id_fkey;
ALTER TABLE public.ocorrencias_colaborador
  ADD CONSTRAINT ocorrencias_colaborador_substituto_id_fkey
  FOREIGN KEY (substituto_id) REFERENCES public.colaboradores(id)
  ON DELETE RESTRICT;
