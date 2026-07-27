-- Módulo CANDIDATOS — os inscritos de um edital.
-- Doc do módulo: my_rules/estrutura/modulos/candidatos/00-modulo.md
--
-- Regra que governa a tabela: candidato NÃO se cadastra à mão, sempre chega por
-- IMPORTAÇÃO de planilha (decisão do usuário, 2026-07-27). Isso muda o desenho em dois
-- pontos concretos:
--
--   1. A tabela precisa de uma CHAVE NATURAL, para que reimportar o mesmo arquivo
--      atualize em vez de duplicar. Sem ela, "sempre importado" viraria "duplica a cada
--      importação". É o índice único mais abaixo, e o app faz UPSERT sobre ele.
--   2. As constraints foram MEDIDAS contra o arquivo real antes de existir (regra 5 de
--      my_rules/estrutura/transversais/invariantes.md), com os números anotados em cada
--      uma. Constraint que rejeita dado real não protege nada: ela só quebra a carga.
--
-- Arquivo medido: 7.416 linhas, concurso 002-2026-SMA.

CREATE TABLE public.candidatos (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- O edital é o CONCURSO ao qual a pessoa se inscreveu. RESTRICT, nunca CASCADE: um
  -- edital com inscritos não some levando a lista junto (ver invariantes.md).
  edital_id              uuid NOT NULL REFERENCES public.editais(id) ON DELETE RESTRICT,

  -- Pedido explícito do usuário: string de 8. É string, e não número, porque número de
  -- inscrição admite zero à esquerda — guardar como integer perderia o zero e mudaria a
  -- inscrição da pessoa. O arquivo medido usa 6 dígitos; os 8 dão folga.
  n_inscricao            varchar(8) NOT NULL,

  -- O cargo/vaga a que a pessoa concorre (coluna "NOME" repetida no fim da planilha:
  -- 'DOCENTE II', 'DOCENTE I - HISTÓRIA', ...). Faz parte da chave natural — ver abaixo.
  cargo                  text,

  -- ⚠️ COLUNA TÉCNICA, não é dado: existe só para a chave natural poder ser um índice
  -- sobre COLUNAS, e não sobre expressão. O motivo é do PostgREST: o upsert dele
  -- (`?on_conflict=a,b,c`) só sabe nomear colunas — um índice funcional como o
  -- `editais_nome_key` seria invisível para ele, e a reimportação duplicaria tudo em vez
  -- de atualizar. Sendo GENERATED, o banco a mantém sozinho: não há como o app esquecer
  -- de atualizá-la ao editar o cargo, que é o defeito clássico de coluna desnormalizada.
  cargo_chave            text GENERATED ALWAYS AS (lower(btrim(coalesce(cargo, '')))) STORED,

  nome                   text NOT NULL,

  -- ── Identificação ────────────────────────────────────────────────────────────────
  -- NULLABLE de propósito. 2 das 7.416 linhas trazem CPF impossível de salvar (' 8631309761'
  -- com 10 dígitos e '1O778817709' com a letra O no lugar do zero). Como a IDENTIDADE do
  -- candidato é o n_inscricao — e não o CPF, como é no colaborador —, perder o inscrito da
  -- lista seria pior do que guardá-lo sem CPF. O importador grava NULL e ACUSA no relatório.
  cpf                    text,
  identidade_numero      text,
  identidade_orgao       text,
  identidade_uf          varchar(2),
  identidade_emissao     date,

  -- ── Contato ──────────────────────────────────────────────────────────────────────
  -- Mesmo tratamento do CPF: 27 linhas trazem e-mail impossível ('andi.gmail',
  -- 'marcia2manoel@ gmail.com', dois endereços no mesmo campo). NULL + aviso, não descarte.
  email                  text,
  -- TEXT, não integer: a origem traz '(24) 9982-20527'. `colaboradores` guarda telefone
  -- como integer e por isso perde máscara e zero à esquerda — erro que não se repete aqui.
  telefone               text,
  celular                text,

  -- ── Endereço ─────────────────────────────────────────────────────────────────────
  logradouro             text,
  -- TEXT: 'SN', '118 FUNDOS' e afins existem. Número de casa não é número.
  numero                 text,
  complemento            text,
  bairro                 text,
  cidade                 text,
  uf                     varchar(2),
  -- TEXT pelo mesmo motivo do n_inscricao: CEP tem zero à esquerda.
  cep                    text,

  -- ── Demais campos da inscrição ───────────────────────────────────────────────────
  -- Sem NOT NULL nem range: 15 linhas trazem ano impossível (1193, 1780, 2975). É o dado
  -- da origem; um CHECK aqui rejeitaria a carga e a data errada é da inscrição, não nossa.
  data_nascimento        date,
  -- Hora de nascimento é critério legal de desempate em concurso, por isso é guardada.
  hora_nascimento        time,
  -- '0'/'1' na origem, sem dicionário conhecido. Guardado cru de propósito: inventar
  -- 'M'/'F' aqui seria afirmar um significado que ninguém confirmou.
  sexo                   text,
  raca                   smallint,
  portador_deficiencia   boolean NOT NULL DEFAULT false,
  confirmado             boolean NOT NULL DEFAULT false,
  -- Identificador do concurso no sistema de origem ('242'). Guardado só como rastro da
  -- procedência do dado; quem manda aqui é o edital_id.
  concurso_id_origem     text,

  created_at             timestamptz DEFAULT now(),
  updated_at             timestamptz DEFAULT now(),
  created_by             uuid REFERENCES auth.users(id)
);

-- ── A chave natural ──────────────────────────────────────────────────────────────────
-- MEDIDO, e é o achado que decidiu o desenho: no arquivo real, 382 números de inscrição
-- aparecem MAIS DE UMA VEZ (778 linhas). Não é sujeira — é a mesma pessoa concorrendo a
-- mais de um cargo com a mesma inscrição:
--
--     213946 | CASSIA ANDREA ... | DOCENTE II
--     213946 | CASSIA ANDREA ... | DOCENTE I - LÍNGUA INGLESA
--     213946 | CASSIA ANDREA ... | DOCENTE I - HISTÓRIA
--
-- Por isso a unicidade é (edital, inscrição, CARGO), e não (edital, inscrição): medido,
-- o trio é único nas 7.416 linhas, enquanto o par rejeitaria 396 inscritos legítimos.
-- É sobre este índice que o importador faz UPSERT — reimportar o arquivo corrigido
-- atualiza os mesmos candidatos em vez de duplicá-los.
--
-- A normalização (`lower(btrim(coalesce(...)))`) segue o padrão de editais_nome_key e
-- colab_email — sem ela, 'DOCENTE II' e 'docente ii ' conviveriam —, mas mora na coluna
-- gerada `cargo_chave` em vez de no índice. O `coalesce` também resolve o cargo NULL, que
-- num índice comum não colidiria com nada (no Postgres, NULLs são distintos entre si).
CREATE UNIQUE INDEX candidatos_inscricao_cargo_key
  ON public.candidatos (edital_id, n_inscricao, cargo_chave);

-- Listagem e busca são sempre dentro de um edital.
CREATE INDEX idx_candidatos_edital_nome ON public.candidatos (edital_id, nome);
CREATE INDEX idx_candidatos_cpf ON public.candidatos (cpf) WHERE cpf IS NOT NULL;

-- ── CHECKs ───────────────────────────────────────────────────────────────────────────
-- Só o que o dado real satisfaz. Cada um foi contado contra as 7.416 linhas antes de
-- entrar; os que reprovariam linha legítima (faixa de data de nascimento, lista de UFs,
-- dicionário de sexo) foram deixados de fora de propósito — ver comentários acima.
ALTER TABLE public.candidatos
  ADD CONSTRAINT chk_candidato_n_inscricao_preenchido CHECK (btrim(n_inscricao) <> ''),
  ADD CONSTRAINT chk_candidato_nome_preenchido        CHECK (btrim(nome) <> ''),
  -- 11 dígitos ou NULL. Quem não couber entra sem CPF e sai no relatório.
  ADD CONSTRAINT chk_candidato_cpf_formato            CHECK (cpf IS NULL OR cpf ~ '^[0-9]{11}$'),
  ADD CONSTRAINT chk_candidato_cep_formato            CHECK (cep IS NULL OR cep ~ '^[0-9]{8}$'),
  -- Formato mínimo, deliberadamente frouxo: barra 'andi.gmail' sem tentar validar domínio.
  ADD CONSTRAINT chk_candidato_email_formato          CHECK (email IS NULL OR email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  -- Mesmos códigos de RACA_MAP (src/lib/constants.ts). O arquivo medido só usa o 2.
  ADD CONSTRAINT chk_candidato_raca_valida            CHECK (raca IS NULL OR raca IN (1, 2, 4, 6, 8, 9));

-- ── RLS ──────────────────────────────────────────────────────────────────────────────
-- A tabela herda os GRANTs do ALTER DEFAULT PRIVILEGES (migration 20260712010000), que só
-- permitem o PostgREST CHEGAR a avaliar a RLS. Quem barra é a política.
ALTER TABLE public.candidatos ENABLE ROW LEVEL SECURITY;

-- ⚠️ A LEITURA é fechada em admin, e isto é escolha, não descuido. `editais` usa
-- `USING (true)` porque nome de edital não é dado de ninguém; aqui cada linha é CPF,
-- e-mail, endereço e telefone de um cidadão. A auditoria de 2026-07-26 fechou quatro
-- tabelas operacionais que estavam em `USING (true)` justamente por isso — esta nasce
-- fechada em vez de repetir o caminho. O coordenador não tem uso para a lista de
-- inscritos: ele opera colaboradores, não candidatos.
--
-- `has_role(..., 'admin')` já cobre o superadmin: a hierarquia mora dentro da função
-- (migration 20260725195530). Nunca trocar por SELECT literal em user_roles — é a falha
-- que já bloqueou o superadmin três vezes neste repo.
CREATE POLICY "Admins can view candidatos"
  ON public.candidatos FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert candidatos"
  ON public.candidatos FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update candidatos"
  ON public.candidatos FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete candidatos"
  ON public.candidatos FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_candidatos_updated_at
  BEFORE UPDATE ON public.candidatos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── Contagem por edital ──────────────────────────────────────────────────────────────
-- A tela lista os editais com "N inscritos" em cada card. Sem isto, seriam N requisições
-- de count (uma por edital) ou — pior — baixar as linhas para contar no cliente.
--
-- ⚠️ SECURITY INVOKER (o padrão, e aqui é decisão): a função roda com os direitos de quem
-- chama, então a RLS de `candidatos` continua valendo dentro dela. Marcá-la SECURITY
-- DEFINER "para funcionar" abriria a contagem para qualquer autenticado — é exatamente a
-- forma da falha que este repo já teve nas Edge Functions (ver invariantes.md).
CREATE OR REPLACE FUNCTION public.contar_candidatos_por_edital()
RETURNS TABLE (edital_id uuid, total bigint)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT c.edital_id, count(*) AS total
  FROM public.candidatos c
  GROUP BY c.edital_id;
$$;
