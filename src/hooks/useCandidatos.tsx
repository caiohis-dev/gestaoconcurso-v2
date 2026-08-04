import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useToast } from "@/hooks/use-toast";
import {
  CandidatoResolvido,
  ProblemaDoRelatorio,
  mensagemErroImportacao,
  paraRelatorioPersistido,
} from "@/lib/candidatos-import";

/** O cargo canônico do catálogo, trazido pelo join da listagem. */
export interface CargoDoCandidato {
  id: string;
  nome: string;
}

export interface Candidato {
  id: string;
  edital_id: string;
  n_inscricao: string;
  /**
   * O texto do cargo **como veio na planilha** — procedência, não identidade (D2 do
   * roadmap de cargos). Costuma vir sujo (`DOCENTE I ¿ HISTÓRIA`, travessão em cp1252
   * lido como latin-1). ⚠️ **Não é isto que a tela deve exibir**: quem responde "qual é
   * o cargo" é `cargos.nome`, o nome canônico. Este campo existe para explicar ao
   * usuário por que ele viu o texto sujo antes, e para o mapeamento ser refazível.
   */
  cargo: string | null;
  cargo_id: string | null;
  /**
   * O cargo do catálogo, embutido pelo `select` da listagem.
   *
   * ⚠️ **É um join à esquerda, e tem de continuar sendo.** Trocar por `cargos!inner`
   * sumiria com todo inscrito de `cargo_id` nulo — e sumir da lista é o único erro grave
   * possível nesta tela.
   */
  cargos: CargoDoCandidato | null;
  nome: string;
  cpf: string | null;
  email: string | null;
  telefone: string | null;
  celular: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  identidade_numero: string | null;
  identidade_orgao: string | null;
  identidade_uf: string | null;
  identidade_emissao: string | null;
  data_nascimento: string | null;
  hora_nascimento: string | null;
  sexo: string | null;
  /** TEXT desde 30/07: o código impossível entra cru, então não presuma número. */
  raca: string | null;
  /**
   * O pedido de atendimento especial, em texto livre e sem teto (2026-08-04).
   *
   * ⚠️ Pode ser LONGO — é `text` no banco, de propósito. Ao exibi-lo, deixe quebrar; não
   * corte com `truncate` sem dar acesso ao texto inteiro em algum lugar, porque o que está
   * escrito aqui é o que alguém tem de providenciar.
   */
  sala_especial: string | null;
  portador_deficiencia: boolean;
  confirmado: boolean;
  concurso_id_origem: string | null;
  created_at: string | null;
  updated_at: string | null;
}

/**
 * Tamanho do bloco enviado por requisição, para a área de preparo.
 *
 * O arquivo real tem 7.416 linhas. Uma requisição por linha — que é como `CadastroLote`
 * importa colaboradores — daria 7.416 idas ao servidor e uns 20 minutos de espera.
 *
 * MEDIDO em 2026-07-30, para o shape do preparo:
 *
 *     bloco    payload    requisições p/ 7.416    folga em 5 MB
 *       500    0,44 MB                     15          4,56 MB
 *      1000    0,89 MB                      8          4,11 MB   ← aqui
 *      5000    4,44 MB                      2          0,56 MB
 *      7416    6,59 MB                      1          🔴 ESTOURA
 *
 * ⭐ O bloco NÃO cresce com o edital, só o número de requisições: 50.000 inscritos são
 * 50 requisições de 0,89 MB. É o que faz o fluxo escalar sem teto.
 *
 * ⚠️ Fatiar mais grosso reduz as CHANCES de um bloco falhar, mas NÃO elimina o risco de
 * preparo incompleto — quem elimina é a GUARDA 3 da RPC (`p_total_esperado`). São coisas
 * diferentes, e confundi-las levaria alguém a "resolver" o problema mexendo neste número.
 */
export const TAMANHO_BLOCO = 1000;

/**
 * Teto de segurança para `p_relatorio` em `trocar_candidatos_do_edital` — ele NÃO é
 * chunked como `candidatos` (ver o comentário do gate em `useImportarCandidatos`).
 *
 * MEDIDO contra o arquivo real (7.416 linhas): o relatório inteiro (238 linhas de
 * problema) pesa 37,8 KB — ~163 bytes/linha. 4 MB é 80% do limite de 5 MB do Kong já
 * medido para `candidatos` (a mesma margem, e não um número novo inventado), deixando
 * espaço para os outros parâmetros da RPC (irrelevantes em tamanho) e para o envelope
 * JSON-RPC do PostgREST.
 */
export const LIMITE_RELATORIO_BYTES = 4 * 1024 * 1024;

export interface FiltroCandidatos {
  editalId: string | null;
  busca?: string;
  /** Recorte por cargo do catálogo. `null` = todos. */
  cargoId?: string | null;
  pagina?: number;
  porPagina?: number;
}

/**
 * O `select` da listagem, com o cargo canônico embutido.
 *
 * O join evita o N+1 (uma consulta a `cargos` por linha exibida) e não custa paginação: o
 * PostgREST resolve a relação na mesma requisição, então o `count: "exact"` continua sendo
 * o do servidor. `cargos` tem RLS de SELECT para `authenticated`, e quem já lê `candidatos`
 * é admin — a relação não esbarra em policy.
 */
const SELECT_LISTAGEM = "*, cargos ( id, nome )";

/**
 * Listagem paginada dos inscritos de UM edital.
 *
 * ⚠️ A paginação não é enfeite: são milhares de linhas por edital, e o PostgREST corta a
 * resposta em 1.000 por padrão. Sem `range`, a tela mostraria 1.000 candidatos e o
 * usuário não teria como saber que os outros 6.416 existem — o pior tipo de erro, o que
 * parece ter funcionado. O total vem do `count: "exact"`, não do tamanho do array.
 */
export function useCandidatos({
  editalId,
  busca = "",
  cargoId = null,
  pagina = 0,
  porPagina = 50,
}: FiltroCandidatos) {
  const termo = busca.trim();

  const query = useQuery({
    queryKey: ["candidatos", editalId, termo, cargoId, pagina, porPagina],
    // Sem edital escolhido não há o que listar — e `enabled: false` evita a consulta
    // sem filtro, que traria inscrito de todos os editais misturado.
    enabled: !!editalId,
    queryFn: async () => {
      let q = supabase
        .from("candidatos")
        .select(SELECT_LISTAGEM, { count: "exact" })
        .eq("edital_id", editalId as string);

      // O recorte por cargo vai ao SERVIDOR, e é por isso que o contador continua
      // valendo: filtrar no cliente deixaria o `count` falando do conjunto inteiro
      // enquanto a tabela mostra um subconjunto — a tela mentiria sem quebrar nada.
      if (cargoId) q = q.eq("cargo_id", cargoId);

      if (termo) {
        // Busca por nome, inscrição ou CPF — os três jeitos de procurar alguém numa lista
        // de inscritos. `%` nas duas pontas porque o usuário costuma lembrar do sobrenome.
        //
        // ⚠️ O nome do CARGO está fora deste `or` de propósito. Filtrar por coluna de
        // tabela embutida tem sintaxe própria no PostgREST e não entra no mesmo `or`; e
        // quem quer "os inscritos de DOCENTE II" tem o filtro por cargo, que é exato.
        // Improvisar isso no cliente quebraria o `count` do servidor.
        const escapado = termo.replace(/[%,()]/g, " ");
        q = q.or(`nome.ilike.%${escapado}%,n_inscricao.ilike.%${escapado}%,cpf.ilike.%${escapado}%`);
      }

      const { data, error, count } = await q
        .order("nome", { ascending: true })
        .range(pagina * porPagina, pagina * porPagina + porPagina - 1);

      if (error) throw error;
      return { candidatos: (data ?? []) as Candidato[], total: count ?? 0 };
    },
  });

  return {
    candidatos: query.data?.candidatos ?? [],
    total: query.data?.total ?? 0,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
  };
}

/** Quantos inscritos cada edital tem — alimenta os cards da tela de Candidatos. */
export function useContagemCandidatosPorEdital() {
  const query = useQuery({
    queryKey: ["candidatos", "contagem-por-edital"],
    queryFn: async () => {
      // `head: true` + `count` traz só o número: contar 7 mil linhas não pode custar
      // baixar 7 mil linhas.
      const { data, error } = await supabase.rpc("contar_candidatos_por_edital");
      if (error) throw error;
      const porEdital: Record<string, number> = {};
      for (const linha of (data ?? []) as { edital_id: string; total: number }[]) {
        porEdital[linha.edital_id] = Number(linha.total);
      }
      return porEdital;
    },
  });

  return { contagem: query.data ?? {}, isLoading: query.isLoading };
}

/** Uma linha do relatório persistido — o shape da tabela, não o do export. */
export interface LinhaRelatorio {
  id: string;
  n_inscricao: string;
  situacao: string;
  campo: string;
  detalhe: string;
}

/**
 * O relatório PERSISTIDO da última importação de um edital.
 *
 * ⚠️ Não confundir com o relatório de EXPORT (XLS/PDF do assistente): aquele vive na
 * memória da sessão de importação e some ao fechar a aba. Este sobrevive, e é o único que
 * ainda existe depois. Ver `candidatos_relatorio_importacao` (migration 20260802145848).
 *
 * 🔴 **É PAGINADO, e não é zelo:** o PostgREST corta a resposta em `max_rows = 1000`
 * (config.toml). Um relatório maior que isso voltaria TRUNCADO sem erro nenhum — a
 * pessoa veria 1.000 problemas e concluiria que são todos. O gate de tamanho da
 * importação (`LIMITE_RELATORIO_BYTES`) permite ~32.000 linhas, então a faixa entre 1.000
 * e 32.000 é alcançável de verdade. O `count: "exact"` é do servidor, como na listagem.
 *
 * ⚠️ **A ORDEM DA PLANILHA NÃO É RECUPERÁVEL, e o `ORDER BY` daqui é uma escolha.** A
 * tabela não guarda `linhaPlanilha` nem um `ordem`, e `created_at` é o mesmo para todas
 * as linhas (é `now()` da transação, não por linha). Sem `ORDER BY` explícito o Postgres
 * não promete ordem alguma — a paginação passaria a repetir e pular linhas entre páginas.
 * Ordena-se por `campo` e depois `n_inscricao` porque é o agrupamento que o PDF já usa:
 * quem lê o relatório corrige a planilha, e corrigir é trabalho por coluna.
 */
export function useRelatorioImportacao({
  editalId,
  pagina = 0,
  porPagina = 50,
}: {
  editalId: string | null;
  pagina?: number;
  porPagina?: number;
}) {
  const query = useQuery({
    queryKey: ["relatorio-importacao", editalId, pagina, porPagina],
    enabled: !!editalId,
    queryFn: async () => {
      const { data, error, count } = await supabase
        .from("candidatos_relatorio_importacao")
        .select("id, n_inscricao, situacao, campo, detalhe", { count: "exact" })
        .eq("edital_id", editalId as string)
        .order("campo", { ascending: true })
        .order("n_inscricao", { ascending: true })
        .range(pagina * porPagina, pagina * porPagina + porPagina - 1);

      if (error) throw error;
      return { linhas: (data ?? []) as LinhaRelatorio[], total: count ?? 0 };
    },
  });

  return {
    linhas: query.data?.linhas ?? [],
    total: query.data?.total ?? 0,
    // ⚠️ `isLoading` é lido pela tela para NÃO mostrar "nenhum problema" enquanto carrega:
    // relatório vazio e relatório carregando são estados diferentes, e confundi-los é o
    // padrão de defeito mais repetido deste repo.
    isLoading: query.isLoading,
    error: query.error,
  };
}

/**
 * Baixa o relatório INTEIRO de um edital, para exportar — não a página que a tela mostra.
 *
 * 🔴 **Pagina em laço, e isso não é otimização prematura.** O PostgREST corta em
 * `max_rows = 1000` (config.toml), então um `select` único devolveria no máximo 1.000
 * linhas **sem erro nenhum** — o XLS sairia truncado e a pessoa não teria como saber. É a
 * mesma razão de a listagem de candidatos paginar; aqui o custo de errar é pior, porque o
 * arquivo exportado vira o documento que alguém anexa a processo.
 *
 * ⚠️ O `ORDER BY` tem de ser o MESMO da tela (`campo`, depois `n_inscricao`): sem ordem
 * estável o laço repetiria e pularia linhas entre as fatias. Ver `useRelatorioImportacao`.
 */
export async function buscarRelatorioCompleto(editalId: string): Promise<LinhaRelatorio[]> {
  const TAMANHO_FATIA = 1000;
  const todas: LinhaRelatorio[] = [];

  for (let inicio = 0; ; inicio += TAMANHO_FATIA) {
    const { data, error } = await supabase
      .from("candidatos_relatorio_importacao")
      .select("id, n_inscricao, situacao, campo, detalhe")
      .eq("edital_id", editalId)
      .order("campo", { ascending: true })
      .order("n_inscricao", { ascending: true })
      .range(inicio, inicio + TAMANHO_FATIA - 1);

    if (error) throw error;

    const fatia = (data ?? []) as LinhaRelatorio[];
    todas.push(...fatia);

    // Fatia menor que o pedido = acabou. Não dá para confiar num `count` obtido antes do
    // laço: entre uma fatia e outra o relatório pode ter sido reescrito por uma
    // reimportação concorrente, e o laço rodaria para sempre esperando um total que mudou.
    if (fatia.length < TAMANHO_FATIA) break;
  }

  return todas;
}

export interface ResultadoBloco {
  gravados: number;
  erro: string | null;
  /** 1-based, para a mensagem: "o 3º bloco falhou". */
  bloco: number;
}

/**
 * O resultado da importação inteira. Existe desde a troca total (2026-07-30) porque
 * "quantos blocos entraram" deixou de ser a resposta: o que interessa é se a LISTA foi
 * trocada, e por quanto.
 */
export interface ResultadoImportacao {
  blocos: ResultadoBloco[];
  /**
   * ⚠️ `false` significa que a lista do edital continua EXATAMENTE como estava — nada
   * foi apagado. É a informação mais importante do relatório quando algo falha, e o
   * oposto do que valia no fluxo antigo (onde falha parcial deixava a lista pela metade).
   */
  trocou: boolean;
  /** Quantos inscritos a troca REMOVEU. Vem do banco, não de contagem do cliente. */
  removidos: number;
  /** Quantos inscritos a troca INSERIU. Vem do banco. */
  inseridos: number;
  /** Preenchido quando `trocou` é false: por que a troca não aconteceu. */
  motivoNaoTrocou: string | null;
}

export interface ProgressoImportacao {
  enviados: number;
  total: number;
}

/**
 * Sobe o lote para a área de preparo, em blocos. Devolve `true` se o usuário interrompeu.
 *
 * Só ENVIA e RELATA — não decide nada. Quem decide se a troca acontece é o gate na
 * `mutationFn`, e manter as duas coisas separadas é o que impede um `return` daqui de
 * virar, sem querer, uma autorização para apagar a lista.
 */
async function subirPreparo({
  candidatos,
  editalId,
  importacaoId,
  createdBy,
  blocos,
  onProgresso,
  deveParar,
}: {
  candidatos: CandidatoResolvido[];
  editalId: string;
  importacaoId: string;
  createdBy: string | null;
  /** Preenchido AQUI, para o chamador ler o relatório mesmo quando interrompemos no meio. */
  blocos: ResultadoBloco[];
  onProgresso?: (p: ProgressoImportacao) => void;
  deveParar?: () => boolean;
}): Promise<boolean> {
  for (let i = 0; i < candidatos.length; i += TAMANHO_BLOCO) {
    if (deveParar?.()) return true;

    const bloco = candidatos.slice(i, i + TAMANHO_BLOCO);
    const { error } = await supabase.from("candidatos_importacao").insert(
      bloco.map((c) => ({
        importacao_id: importacaoId,
        edital_id: editalId,
        // O candidato inteiro vai como jsonb. A RPC reidrata com
        // `jsonb_populate_record`, então coluna nova viaja sem ninguém mexer aqui.
        linha: c as unknown as Json,
        created_by: createdBy,
      })),
    );

    blocos.push({
      bloco: Math.floor(i / TAMANHO_BLOCO) + 1,
      gravados: error ? 0 : bloco.length,
      erro: error ? mensagemErroImportacao(error.message) : null,
    });

    onProgresso?.({
      enviados: Math.min(i + TAMANHO_BLOCO, candidatos.length),
      total: candidatos.length,
    });
  }
  return false;
}

/**
 * Importa a planilha TROCANDO a lista de inscritos do edital.
 *
 * ⭐ O QUE ESTE HOOK FAZ, EM UMA FRASE: sobe a planilha para uma área de PREPARO, em
 * blocos, e então manda o banco apagar a lista atual do edital e reinserir o preparo —
 * tudo numa transação só. Decisão do usuário em 2026-07-30, roadmap
 * `my_rules/analises/roadmap-importacao-troca-total.yaml`.
 *
 * 🔵 Desde 2026-08-02 a MESMA chamada também troca o relatório da importação, persistido
 * em `candidatos_relatorio_importacao` — ver o parâmetro `relatorio` e a migration
 * `20260802145848`. ⚠️ Há DOIS "relatórios" que não devem se confundir: o EXPORT (XLS/PDF
 * que a pessoa baixa, vive só na memória da sessão) e o PERSISTIDO (esta tabela, sobrevive
 * ao fechar a aba). Este hook lê o primeiro para escrever o segundo.
 *
 * ⚠️ `relatorio` NÃO é chunked como `candidatos` — viaja inteiro em `p_relatorio`. Um
 * gate próprio (`LIMITE_RELATORIO_BYTES`) recusa a troca INTEIRA se ele passar de 4 MB,
 * porque o estouro aconteceria no proxy, antes do Postgres ver a requisição, e nenhum
 * SQLSTATE saberia traduzir isso. Ver o comentário do gate mais abaixo.
 *
 * ── POR QUE DEIXOU DE SER UPSERT ────────────────────────────────────────────────────
 *
 * O upsert casava a linha pela chave natural. Como CPF, cargo e inscrição compunham essa
 * chave (era assim até 2026-08-01, hoje é só edital + inscrição), corrigir qualquer um
 * deles na planilha e reimportar NÃO casava: entrava um registro novo e o antigo ficava
 * lá, órfão, sem ninguém ser avisado. A troca total mata a classe inteira, porque não
 * existe "casar linha" — a lista velha sai inteira.
 *
 * A premissa que autoriza isso, confirmada pelo usuário: a planilha é SEMPRE a lista
 * completa do edital, nunca um lote de adição.
 *
 * ── POR QUE O PREPARO EXISTE ────────────────────────────────────────────────────────
 *
 * MEDIDO: o lote inteiro em JSON dá 5,40 MB para 7.416 inscritos, contra o limite padrão
 * de 5 MB do Kong. Mandar tudo numa chamada não cabe hoje e piora com o edital. Por isso
 * os blocos continuam — só que o destino é `candidatos_importacao`, e a atomicidade
 * mudou de lugar: ela agora vive na RPC, no servidor, e não mais em "cada bloco é uma
 * transação sua".
 *
 * ── ⚠️ A INVERSÃO QUE PRECISA ESTAR CLARA PARA QUEM LÊ O RELATÓRIO ─────────────────
 *
 * Antes, um bloco falho deixava a importação PELA METADE e reimportar consertava.
 * Agora, um bloco falho deixa a lista INTACTA: o preparo é descartado e a troca não
 * acontece. É melhor, mas é diferente — e por isso `ResultadoImportacao.trocou` existe.
 *
 * ⚠️ `deduplicar()` e `chaveNatural()` continuam necessários: se a planilha trouxer duas
 * linhas com a mesma chave, o índice único recusa o INSERT — e agora o INSERT é a troca
 * INTEIRA, então uma duplicata no arquivo derruba tudo. O que a chave É mudou em
 * 2026-08-01 (passou a ser só `edital_id + n_inscricao`); a necessidade do dedup, não.
 */
export function useImportarCandidatos() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: async ({
      editalId,
      candidatos,
      relatorio,
      onProgresso,
      deveParar,
    }: {
      /**
       * ⚠️ Explícito, e não deduzido de `candidatos[0].edital_id`: é o edital cuja lista
       * será APAGADA. Um valor implícito numa operação destrutiva é o tipo de coisa que
       * ninguém confere. A GUARDA 2 da RPC recusa se o preparo não for todo dele.
       */
      editalId: string;
      // ⭐ `CandidatoResolvido`, e não `CandidatoImportado`: o tipo é o que impede um lote
      // SEM `cargo_id` de chegar aqui. Esse campo compõe a chave natural — mandar o lote
      // não-resolvido gravaria linhas com a identidade incompleta, e o TS recusa antes.
      candidatos: CandidatoResolvido[];
      // 🔴 Desde 2026-08-02: o relatório persiste JUNTO com a troca, na mesma transação
      // — ver `trocar_candidatos_do_edital`. Vai no formato de EXPORT
      // (`ProblemaDoRelatorio`, com as chaves acentuadas); é este hook que traduz para o
      // formato de persistência com `paraRelatorioPersistido` logo abaixo, para o
      // chamador não precisar saber que os dois formatos existem.
      relatorio: ProblemaDoRelatorio[];
      onProgresso?: (p: ProgressoImportacao) => void;
      deveParar?: () => boolean;
    }): Promise<ResultadoImportacao> => {
      const { data: userData } = await supabase.auth.getUser();
      const createdBy = userData.user?.id ?? null;
      const importacaoId = crypto.randomUUID();
      const blocos: ResultadoBloco[] = [];

      const semTroca = (motivo: string): ResultadoImportacao => ({
        blocos,
        trocou: false,
        removidos: 0,
        inseridos: 0,
        motivoNaoTrocou: motivo,
      });

      // Preparo abandonado de uma tentativa anterior faria a contagem passar do esperado
      // e a GUARDA 3 recusaria a troca. Como o `importacaoId` é novo a cada chamada, isto
      // é defesa contra um uuid repetido — improvável, mas barato de descartar.
      await supabase.from("candidatos_importacao").delete().eq("importacao_id", importacaoId);

      const interrompida = await subirPreparo({
        candidatos,
        editalId,
        importacaoId,
        createdBy,
        blocos,
        onProgresso,
        deveParar,
      });

      // ── 🔴 O GATE: só troca a lista se o preparo estiver COMPLETO ──────────────────
      // Chamar a RPC aqui com o preparo pela metade apagaria a lista inteira e reporia só
      // uma parte. A GUARDA 3 do banco recusaria (é ela a rede de segurança), mas mandar
      // um pedido que se SABE inválido é pedir para o banco decidir o que já está
      // decidido aqui — e o usuário receberia um erro de banco em vez de uma explicação.
      const limparPreparo = async () => {
        await supabase.from("candidatos_importacao").delete().eq("importacao_id", importacaoId);
      };

      if (interrompida) {
        await limparPreparo();
        return semTroca("A importação foi interrompida antes de terminar de enviar.");
      }

      const blocoComErro = blocos.find((b) => b.erro !== null);
      if (blocoComErro) {
        await limparPreparo();
        return semTroca(`O envio falhou no bloco ${blocoComErro.bloco}: ${blocoComErro.erro}`);
      }

      // ── 🔴 O GATE DO RELATÓRIO: ele NÃO é chunked, ao contrário de `candidatos` ────
      //
      // `candidatos` sobe em blocos de `TAMANHO_BLOCO` justamente porque um lote inteiro
      // não cabe no limite de 5 MB do Kong (medido: 5,40 MB para 7.416 linhas). O
      // relatório viaja INTEIRO numa chamada só, dentro de `p_relatorio` — decisão
      // tomada porque o volume real medido (238 linhas para as mesmas 7.416, 37,8 KB) é
      // três ordens de grandeza menor que o limite. Chunkar algo que nunca chega perto
      // do teto seria complexidade sem uso — mas "nunca chega perto" não é "não pode".
      //
      // Uma linha do relatório pesa ~163 bytes (medido); a ~32.000 linhas o payload
      // encosta nos 5 MB. Como `comAviso.flatMap` pode gerar VÁRIAS queixas por linha da
      // planilha, um arquivo patologicamente sujo — não necessariamente um edital
      // GRANDE — poderia chegar lá antes de qualquer guarda de `candidatos` disparar.
      //
      // Sem este gate, o estouro aconteceria no PROXY (Kong), antes do Postgres ver a
      // requisição — nenhum código SQLSTATE nem `mensagemErroImportacao` saberia traduzir
      // isso; o usuário veria uma falha de rede crua. Por isso a guarda é no CLIENTE, e
      // por isso ela recusa a TROCA INTEIRA (não só "não persiste o relatório"): deixar
      // candidatos entrar e o relatório ficar de fora quebraria a garantia que a
      // migration 20260802145848 existe para dar — os dois mudam juntos, ou nenhum muda.
      const relatorioPersistido = paraRelatorioPersistido(relatorio);
      const bytesDoRelatorio = new TextEncoder().encode(JSON.stringify(relatorioPersistido)).length;
      if (bytesDoRelatorio > LIMITE_RELATORIO_BYTES) {
        await limparPreparo();
        const mb = (bytesDoRelatorio / 1024 / 1024).toFixed(1);
        return semTroca(
          `O relatório desta importação (${mb} MB, ${relatorioPersistido.length} linha(s) de problema) ` +
            "é grande demais para ser salvo numa única operação. A lista atual do edital foi mantida — " +
            "nada foi alterado. Isto foge do uso normal do sistema; avise o time de desenvolvimento antes de tentar de novo.",
        );
      }

      // ── A troca ────────────────────────────────────────────────────────────────────
      // `p_total_esperado` é a conferência que o banco faz contra o preparo. Ela NÃO é
      // redundante com o gate acima: o gate garante que ESTE cliente enviou tudo; a
      // guarda garante que o que CHEGOU é tudo — bloco aceito mas não persistido, uuid
      // colidido ou escrita concorrente não passam por ela.
      const { data, error } = await supabase.rpc("trocar_candidatos_do_edital", {
        p_edital_id: editalId,
        p_importacao_id: importacaoId,
        p_total_esperado: candidatos.length,
        // O MESMO valor que passou pelo gate acima — nunca recalculado, para não haver
        // chance de o que foi medido divergir do que é enviado.
        p_relatorio: relatorioPersistido as unknown as Json,
        // ⚠️ O cast continua: `p_relatorio` é `Json` no tipo gerado, e
        // `LinhaRelatorioPersistida[]` não é atribuível a `Json` sem ele (interfaces não
        // têm index signature). É o mesmo caso do `linha:` do preparo, logo acima.
      });

      if (error) {
        await limparPreparo();
        return semTroca(mensagemErroImportacao(error.message));
      }

      // A RPC devolve UMA linha; o PostgREST entrega como array por ser RETURNS TABLE.
      const troca = (Array.isArray(data) ? data[0] : data) as
        | { removidos: number; inseridos: number }
        | undefined;

      return {
        blocos,
        trocou: true,
        removidos: Number(troca?.removidos ?? 0),
        inseridos: Number(troca?.inseridos ?? 0),
        motivoNaoTrocou: null,
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["candidatos"] });
    },
    onError: (error: { message: string }) => {
      toast({
        title: "Erro na importação",
        description: mensagemErroImportacao(error.message),
        variant: "destructive",
      });
    },
  });

  return { importar: mutation.mutateAsync, isImportando: mutation.isPending };
}

/** Exclusão de um inscrito e o "limpar o edital" que antecede uma reimportação do zero. */
export function useExcluirCandidatos() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const excluirUm = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("candidatos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["candidatos"] });
      toast({ title: "Candidato excluído", description: "O inscrito foi removido da lista." });
    },
    onError: (error: { message: string }) => {
      toast({
        title: "Erro ao excluir candidato",
        description: mensagemErroImportacao(error.message),
        variant: "destructive",
      });
    },
  });

  const excluirDoEdital = useMutation({
    mutationFn: async (editalId: string) => {
      const { error, count } = await supabase
        .from("candidatos")
        .delete({ count: "exact" })
        .eq("edital_id", editalId);
      if (error) throw error;
      return count ?? 0;
    },
    onSuccess: (quantidade) => {
      queryClient.invalidateQueries({ queryKey: ["candidatos"] });
      toast({
        title: "Inscritos removidos",
        description: `${quantidade} candidato(s) foram removidos deste edital.`,
      });
    },
    onError: (error: { message: string }) => {
      toast({
        title: "Erro ao remover inscritos",
        description: mensagemErroImportacao(error.message),
        variant: "destructive",
      });
    },
  });

  return {
    excluirUm: excluirUm.mutate,
    excluirDoEdital: excluirDoEdital.mutate,
    isExcluindo: excluirUm.isPending || excluirDoEdital.isPending,
  };
}
