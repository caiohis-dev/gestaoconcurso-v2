-- CARGOS — o cargo do candidato deixa de ser texto sujo e vira entidade.
-- Roadmap: my_rules/analises/roadmap-cargos.yaml (etapa 1, janela A)
-- Doc da feature: my_rules/estrutura/modulos/candidatos/cargos.md
--
-- O PROBLEMA QUE ISTO COMEÇA A RESOLVER
-- O cargo chega da origem com o texto quebrado — 7 dos 9 cargos do arquivo real trazem
-- '¿', um travessão (em dash) escrito em cp1252 e lido como latin-1:
--
--     3.756  DOCENTE II
--       730  DOCENTE I ¿ EDUCAÇÃO FÍSICA
--       481  DOCENTE I ¿ HISTÓRIA          ... e mais quatro
--       195  ARTE                          ← foge do padrão dos outros sete
--
-- Como o cargo compõe a IDENTIDADE do candidato (índice candidatos_cpf_cargo_inscricao_key),
-- corrigir esse texto e reimportar CRIA UM SEGUNDO REGISTRO em vez de atualizar o antigo.
-- Com o texto dentro da identidade, a promessa "corrija a planilha e reimporte" nunca vai
-- valer. A saída é a identidade referenciar um CARGO CADASTRADO, e o texto virar atributo.
--
-- MEDIDO ANTES (regra 5 de estrutura/transversais/invariantes.md): normalizar os 9 cargos
-- por caixa e espaço deixa 9 distintos — NÃO COLAPSA NENHUM. Não existe limpeza automática
-- que resolva, e é por isso que a sanitização é um passo MANUAL do assistente (etapa 4),
-- não um algoritmo. Adivinhar aqui erraria em silêncio, que é o defeito que este módulo
-- já evitou uma vez (ver o 'TIPOPROVA' em cargos.md).
--
-- ESTA MIGRATION NÃO MUDA COMPORTAMENTO NENHUM. Cria o schema e para. A importação segue
-- gravando `candidatos.cargo` como texto e a chave natural segue sendo a mesma. A troca da
-- chave é a etapa 5 do roadmap, e só pode vir DEPOIS de o fluxo gravar cargo_id de verdade.

-- ═══════════════════════════════════════════════════════════════════════════════════
-- O catálogo canônico
-- ═══════════════════════════════════════════════════════════════════════════════════

CREATE TABLE public.cargos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- O nome LIMPO, digitado pelo usuário no passo 3 do assistente. É ele que aparece nas
  -- telas; o texto sujo da origem fica em `candidatos.cargo` e em `cargo_apelidos`.
  nome        text NOT NULL,

  -- ⚠️ COLUNA TÉCNICA, não é dado — mesmo padrão (e mesmo motivo) de
  -- `candidatos.cargo_chave`: a unicidade precisa ser sobre COLUNAS, e não sobre
  -- expressão, porque o upsert do PostgREST (`?on_conflict=a,b`) só sabe nomear colunas.
  -- Um índice funcional como o `editais_nome_key` seria invisível para ele.
  -- Sendo GENERATED, o banco a mantém sozinho: não há como o app esquecer de atualizá-la
  -- ao renomear o cargo, que é o defeito clássico de coluna desnormalizada.
  nome_chave  text GENERATED ALWAYS AS (lower(btrim(nome))) STORED,

  -- Para aposentar um cargo sem excluí-lo (excluir é bloqueado quando há candidatos).
  -- Nasce aqui, sem consumidor ainda: quem vier a precisar de "desativar" na etapa 7 do
  -- roadmap não vai precisar de migration nova.
  ativo       boolean NOT NULL DEFAULT true,

  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  created_by  uuid REFERENCES auth.users(id),

  CONSTRAINT chk_cargo_nome_preenchido CHECK (btrim(nome) <> '')
);

-- A identidade do cargo. Normaliza caixa e espaço, como `editais_nome_key` e `colab_email`:
-- sem isto, 'DOCENTE II' e ' docente ii ' conviveriam no catálogo e o usuário escolheria
-- entre dois itens idênticos na tela.
CREATE UNIQUE INDEX cargos_nome_chave_key ON public.cargos (nome_chave);

COMMENT ON TABLE public.cargos IS
  'Catálogo dos cargos a que os CANDIDATOS concorrem (quem FAZ a prova). '
  '⚠️ NÃO confundir com funcoes_colaboradores, que é o que o COLABORADOR faz ao APLICAR a '
  'prova (fiscal, coordenador) e que tem valor de pagamento, meta por unidade e alocação — '
  'nada disso existe aqui. Os vocabulários colidem (aquela tabela tem uma coluna chamada '
  'cargo_editavel); as entidades são opostas e nunca devem ser unificadas. '
  'Catálogo GLOBAL, sem edital_id: DOCENTE II é o mesmo cargo em qualquer concurso.';

COMMENT ON COLUMN public.cargos.nome_chave IS
  'Coluna técnica gerada: lower(btrim(nome)). Existe para a unicidade ser sobre colunas, '
  'que é o que o upsert do PostgREST sabe nomear. Não escrever pelo app.';

-- ═══════════════════════════════════════════════════════════════════════════════════
-- A memória: "este texto sujo significa aquele cargo"
-- ═══════════════════════════════════════════════════════════════════════════════════
--
-- Sem esta tabela o usuário refaria os 9 mapeamentos A CADA importação — e reimportar é o
-- FLUXO NORMAL deste módulo, não a exceção (a planilha é corrigida e mandada de novo).
-- Com ela, a segunda importação chega toda pré-preenchida e o passo vira conferência.

CREATE TABLE public.cargo_apelidos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- O texto CRU, exatamente como veio da planilha, com o '¿' e tudo.
  texto_origem  text NOT NULL,
  texto_chave   text GENERATED ALWAYS AS (lower(btrim(texto_origem))) STORED,

  -- CASCADE de propósito, e é o oposto do RESTRICT de candidatos.cargo_id logo abaixo:
  -- apelido não é histórico, é atalho de digitação. Apagar o cargo deve levar os apelidos
  -- dele junto — deixá-los apontando para nada não serviria a ninguém.
  cargo_id      uuid NOT NULL REFERENCES public.cargos(id) ON DELETE CASCADE,

  created_at    timestamptz DEFAULT now(),
  created_by    uuid REFERENCES auth.users(id),

  CONSTRAINT chk_cargo_apelido_texto_preenchido CHECK (btrim(texto_origem) <> '')
);

-- Um texto de origem aponta para UM cargo. É sobre este índice que o app faz upsert ao
-- confirmar o passo: reassociar uma grafia a outro cargo ATUALIZA o apelido (decisão nova
-- vence a antiga) em vez de criar uma segunda linha ambígua.
CREATE UNIQUE INDEX cargo_apelidos_texto_chave_key ON public.cargo_apelidos (texto_chave);

-- Índice de apoio à FK. Sem ele, cada DELETE em `cargos` faz seq scan aqui para resolver
-- o CASCADE. Postgres NÃO cria índice no lado que referencia — só no referenciado.
CREATE INDEX idx_cargo_apelidos_cargo ON public.cargo_apelidos (cargo_id);

COMMENT ON TABLE public.cargo_apelidos IS
  'Memória de "este texto de planilha significa aquele cargo", para a importação seguinte '
  'chegar pré-preenchida. GLOBAL, sem edital_id: o aprendizado atravessa concursos. '
  'Casa por texto_chave = lower(btrim(texto_origem)); grafia nova não casa e volta a exigir '
  'decisão do usuário, que é o comportamento certo.';

-- ═══════════════════════════════════════════════════════════════════════════════════
-- O lado do candidato
-- ═══════════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.candidatos
  -- RESTRICT, nunca CASCADE: apagar um cargo não pode sumir com inscrito. É o oposto do
  -- CASCADE dos apelidos, e a diferença é o que cada lado significa — apelido é atalho,
  -- inscrito é gente.
  ADD COLUMN cargo_id uuid REFERENCES public.cargos(id) ON DELETE RESTRICT;

-- ⚠️ Fica NULLABLE, e continua nullable mesmo depois da etapa 5 — o MESMO desenho de
-- `provas.edital_id`. A ordem `migrations → dado` impede um NOT NULL honesto (a coluna
-- nasce vazia e é a UI que a preenche), e a obrigatoriedade real é imposta em dois outros
-- lugares: o passo 3 do assistente não deixa importar com cargo sem associar, e o índice
-- único da etapa 5 colide se sobrar NULL.

-- Índice de apoio ao RESTRICT e ao join da listagem.
-- ⚠️ O índice único da chave natural NÃO serve para isto: ele começa por `edital_id`, e a
-- pergunta aqui é "quem usa ESTE cargo?", sem edital. Sem este índice, todo DELETE em
-- `cargos` varreria a tabela de candidatos inteira.
-- Parcial (mesmo padrão de `idx_candidatos_cpf`): a checagem de FK nunca procura NULL.
CREATE INDEX idx_candidatos_cargo ON public.candidatos (cargo_id) WHERE cargo_id IS NOT NULL;

COMMENT ON COLUMN public.candidatos.cargo_id IS
  'O cargo canônico, escolhido pelo usuário no passo Cargos da importação. A coluna `cargo` '
  'ao lado guarda o texto CRU da planilha, como procedência — as duas coexistem de propósito.';

-- ═══════════════════════════════════════════════════════════════════════════════════
-- GRANTS — o que estas duas tabelas NÃO herdam
-- ═══════════════════════════════════════════════════════════════════════════════════
--
-- ⚠️ A migration 20260712010000 deixou um `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES
-- TO anon, authenticated, service_role`. Isso significa que TODA TABELA NOVA de `public`
-- nasce com o pacote completo para `anon` — inclusive TRUNCATE.
--
-- E TRUNCATE **NÃO PASSA POR RLS**. Foi exatamente assim que `candidatos` nasceu com `anon`
-- podendo esvaziá-la (verificado: funciona no banco local); o que segura hoje é o PostgREST
-- não expor TRUNCATE, ou seja, um detalhe de implementação de terceiro. O enxugamento
-- sistêmico de todas as tabelas é item próprio do backlog — estas duas simplesmente não
-- nascem repetindo o erro.
--
-- Isto CONVERSA com a 20260712010000 em vez de brigar: aquela registrou o estado herdado,
-- esta revoga pontualmente no que é novo. Quando o item sistêmico rodar, encontra estas
-- duas já enxutas.

-- `anon` fica sem nada: nenhum fluxo público lê cargo. Os fluxos públicos que existem
-- passam por Edge Function com service_role, nunca pela anon key direta.
REVOKE ALL ON public.cargos         FROM anon;
REVOKE ALL ON public.cargo_apelidos FROM anon;

-- `authenticated` mantém só o DML — o mínimo para o PostgREST CHEGAR a avaliar a RLS, que
-- é quem barra de verdade. TRUNCATE, REFERENCES e TRIGGER não têm uso pelo app.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.cargos         FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.cargo_apelidos FROM authenticated;

-- `service_role` permanece intacto: é o papel das Edge Functions e do bootstrap.

-- ═══════════════════════════════════════════════════════════════════════════════════
-- RLS — leitura para autenticado, escrita só admin
-- ═══════════════════════════════════════════════════════════════════════════════════
--
-- Nome de cargo NÃO é dado de ninguém: é como `editais`, não como `candidatos` (que é
-- fechada em admin nas 4 operações porque cada linha ali é CPF, endereço e telefone de um
-- cidadão). Fechar a leitura aqui custaria uma policy a mais sem proteger nada — e o join
-- da listagem de candidatos roda com o papel de quem já pode ler candidatos, então não há
-- vazamento por transitividade.
--
-- ⚠️ `has_role(auth.uid(), 'admin')` já cobre o superadmin: a hierarquia mora DENTRO da
-- função (migration 20260725195530). NUNCA trocar por SELECT literal em `user_roles` — é a
-- falha que já bloqueou o superadmin três vezes neste repo.
--
-- `TO authenticated` explícito nas oito policies: sem papel alvo, a policy também seria
-- avaliada para `anon`. Hoje é inócuo (sem GRANT, `anon` não chega lá), mas ser exato custa
-- nada e não depende de o GRANT continuar como está.

ALTER TABLE public.cargos         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cargo_apelidos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view cargos"
  ON public.cargos FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert cargos"
  ON public.cargos FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update cargos"
  ON public.cargos FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete cargos"
  ON public.cargos FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated can view cargo_apelidos"
  ON public.cargo_apelidos FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert cargo_apelidos"
  ON public.cargo_apelidos FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update cargo_apelidos"
  ON public.cargo_apelidos FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete cargo_apelidos"
  ON public.cargo_apelidos FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- ═══════════════════════════════════════════════════════════════════════════════════
-- Trigger
-- ═══════════════════════════════════════════════════════════════════════════════════
-- Só em `cargos`: `cargo_apelidos` não tem updated_at — um apelido é reescrito por upsert,
-- não editado campo a campo, e a data que interessa dele é a de criação.

CREATE TRIGGER update_cargos_updated_at
  BEFORE UPDATE ON public.cargos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
