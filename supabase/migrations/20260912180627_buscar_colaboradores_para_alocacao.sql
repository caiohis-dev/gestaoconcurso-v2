-- Busca de colaborador para ALOCAR, com o cruzamento feito no banco.
--
-- ⚠️ O timestamp do nome é UTC: isto foi escrito em 2026-09-12, à tarde (horário local).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- POR QUE EXISTE
-- ─────────────────────────────────────────────────────────────────────────────
-- Dois pickers faziam a MESMA coisa, e os dois sem teto:
--
--   · `GerenciarColaboradoresProva` (via `useColaboradores({fetchAll:true})`) baixava
--     TODOS os colaboradores e cruzava, no cliente, com TODAS as alocações da prova
--     (`useColaboradoresProva.colaboradoresAlocadosQuery`, 3 requisições) só para montar
--     um `<Select>` e marcar quem já está alocado noutra unidade.
--   · `OcorrenciasProva.openSubstituto` repetia o par, com outro nome.
--
-- 🔴 O PostgREST corta a resposta em `max_rows` (1000, `config.toml:22`) **sem erro
--    nenhum**. MEDIDO em 2026-09-12, banco local: 771 colaboradores (77% do teto) e 531
--    alocações na maior prova (53%). Os sintomas são diferentes e ambos silenciosos:
--      · no picker, um colaborador some da lista e ninguém consegue alocá-lo;
--      · no cruzamento, quem já está em OUTRA unidade aparece como DISPONÍVEL, e a tela
--        deixa tentar a alocação.
--
-- ⚠️ Esse segundo caso é MENOS grave do que parece, e a primeira versão deste comentário
--    errou nisso: o trigger `check_colaborador_prova_unique` JÁ recusa, no banco, alocar
--    alguém que esteja em outra unidade da mesma prova ("Este colaborador já está alocado
--    em outra unidade desta prova."). A regra tem dente. O prejuízo do truncamento aqui é
--    **degradação de UX** — o aviso preventivo some e a pessoa descobre no erro —, não
--    perda de dado nem furo de regra. O erro veio de ler o NOME do trigger na listagem
--    sem abrir o corpo, que é exatamente o que o CLAUDE.md §8 manda não fazer.
--
-- A saída é a mesma de `totais_da_prova` (10/09) e `funcoes_em_uso` (11/09): perguntar ao
-- banco em vez de baixar tudo e calcular no cliente. Com `LIMIT`, a consulta fica **imune
-- ao teto por construção** — que é o único jeito de fechar o risco, porque nenhum
-- conserto no cliente alcança um corte que acontece antes da resposta chegar.
--
-- Ganho colateral que vale nomear: o picker parava de trazer `colab_cpf`,
-- `colab_telefone` e `colab_chave_pix` de 771 pessoas para desenhar uma lista de nomes.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- SEGURANÇA
-- ─────────────────────────────────────────────────────────────────────────────
-- `SECURITY INVOKER` (o padrão), como a `funcoes_em_uso`. A RLS das duas tabelas continua
-- valendo e o resultado é exatamente o que o chamador já podia ler pelo caminho cru:
--   · `colaboradores` — admin/coordenador veem tudo, os demais só a própria linha;
--   · `colaboradores_prova` — `admin OR is_coordenador_prova(prova_id)`, então o
--     coordenador DA PROVA enxerga as alocações dela, que é de onde sai o aviso
--     "já está em <sigla>". Fosse DEFINER, um coordenador de outra prova passaria a ver
--     alocação que hoje não vê.

CREATE OR REPLACE FUNCTION public.buscar_colaboradores_para_alocacao(
  p_prova_id                 uuid,
  p_termo                    text DEFAULT '',
  p_excluir_prova_unidade_id uuid DEFAULT NULL,
  p_limite                   int  DEFAULT 50
)
RETURNS TABLE (
  id                       uuid,
  colab_nome_completo      text,
  colab_cpf                text,
  alocado_prova_unidade_id uuid,
  alocado_unid_sigla       text
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH termo AS (
    SELECT
      btrim(coalesce(p_termo, '')) AS cru,
      -- A MESMA normalização do lado do dado: `colab_nome_busca` é `translate(lower(…))`.
      -- ⚠️ O cliente tem de mandar o termo por `removerAcentos` (src/lib/texto.ts). Os
      -- dois lados ou nenhum — mexer num só faz a busca parar de achar, sem erro.
      translate(lower(btrim(coalesce(p_termo, ''))),
                'áàâãäåéèêëíìîïóòôõöúùûüçñýÿ',
                'aaaaaaeeeeiiiiooooouuuucnyy') AS sem_acento
  ),
  -- As alocações desta prova, uma linha por colaborador. O `DISTINCT ON` é cinto de
  -- segurança barato: o trigger `check_colaborador_prova_unique` já impede a mesma pessoa
  -- em duas unidades da mesma prova, mas se aquela barreira cair (ou for contornada por
  -- carga direta), o picker mostra uma linha em vez de duplicar a pessoa na lista.
  alocados AS (
    SELECT DISTINCT ON (ap.colaborador_id)
           ap.colaborador_id,
           ap.prova_unidade_id,
           up.unid_sigla
      FROM public.colaboradores_prova ap
      JOIN public.prova_unidades pu ON pu.id = ap.prova_unidade_id
      JOIN public.unidades_prova  up ON up.id = pu.unidade_id
     WHERE pu.prova_id = p_prova_id
     ORDER BY ap.colaborador_id, ap.prova_unidade_id
  )
  SELECT c.id,
         c.colab_nome_completo,
         c.colab_cpf,
         a.prova_unidade_id,
         a.unid_sigla
    FROM public.colaboradores c
    LEFT JOIN alocados a ON a.colaborador_id = c.id
   CROSS JOIN termo t
   WHERE (
           t.cru = ''
           OR public.colab_nome_busca(c) LIKE '%' || t.sem_acento || '%'
           OR c.colab_matricula ILIKE '%' || t.cru || '%'
           OR c.colab_cpf       ILIKE '%' || t.cru || '%'
         )
     -- Quem já está na unidade ATUAL não é opção: sai da lista inteiramente. Quem está em
     -- outra unidade FICA, porque a tela o mostra desabilitado com a sigla — esconder
     -- seria pior, o usuário procuraria o nome e não saberia por que sumiu.
     AND (p_excluir_prova_unidade_id IS NULL
          OR a.prova_unidade_id IS DISTINCT FROM p_excluir_prova_unidade_id)
   -- ⚠️ `id` como desempate. Medido em 2026-09-12 contra o dump: hoje NÃO há
   -- `colab_nome_completo` repetido — mas nada impede (não existe unique nessa coluna), e
   -- sem ordem única duas linhas de mesmo nome trocariam de lugar entre uma consulta e
   -- outra. É o mesmo desempate que `useBuscarColaboradores` já usa, pelo mesmo motivo.
   ORDER BY c.colab_nome_completo, c.id
   LIMIT greatest(coalesce(p_limite, 50), 1);
$$;

COMMENT ON FUNCTION public.buscar_colaboradores_para_alocacao(uuid, text, uuid, int) IS
  'Busca colaboradores para alocar numa prova, ja dizendo quem esta alocado em qual '
  'unidade DELA (alocado_prova_unidade_id + alocado_unid_sigla). Substitui o par '
  '"baixa todos + cruza no cliente" dos pickers de /gerenciar-colaboradores-prova e '
  '/ocorrencias-prova, que batia no teto max_rows=1000 em silencio. p_termo vazio devolve '
  'as primeiras p_limite por nome. p_excluir_prova_unidade_id tira da lista quem ja esta '
  'naquela unidade. SECURITY INVOKER: a RLS das duas tabelas continua valendo.';

-- Função nova nasce com EXECUTE para PUBLIC (e `anon` e membro de PUBLIC). O padrão desde
-- a 20260908231620 é revogar de PUBLIC — revogar de `anon` nao faria nada — e devolver a
-- quem precisa. 🔴 `service_role` nao e opcional: sem ele toda leitura pela chave de
-- servico morre com `42501 permission denied for function`, e a mensagem nao diz o que
-- faltou.
REVOKE ALL ON FUNCTION public.buscar_colaboradores_para_alocacao(uuid, text, uuid, int)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.buscar_colaboradores_para_alocacao(uuid, text, uuid, int)
  TO authenticated, service_role;
