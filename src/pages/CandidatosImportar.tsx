import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import {
  useLogoBase64,
  criarDocumentoPaisagem,
  desenharTimbre,
  numerarPaginas,
  MARGEM_LATERAL,
  ESTILOS_TABELA,
  ESTILOS_CABECALHO,
  TIMBRE_LINHA1_PADRAO,
  TIMBRE_LINHA2_PADRAO,
} from "@/lib/pdf-timbre";
import { useEditais } from "@/hooks/useEditais";
import {
  useImportarCandidatos,
  useContagemCandidatosPorEdital,
  ResultadoImportacao,
} from "@/hooks/useCandidatos";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  CAMPOS_CANDIDATO,
  ColunaPlanilha,
  LinhaConvertida,
  LinhaPlanilha,
  Mapeamento,
  ResolucaoCargos,
  agruparProblemasPorCampo,
  autoMapear,
  cargosDaPlanilha,
  converterLinha,
  deduplicar,
  mapeamentoCompleto,
  montarProblemasDoRelatorio,
  pareceSujo,
  resolverLinhas,
  rotulosDeColunas,
  separarPorPagamento,
  subtituloDoCampo,
} from "@/lib/candidatos-import";
import { useCargos, useCargoApelidos, useCriarCargo, useSalvarApelidos } from "@/hooks/useCargos";
import { Input } from "@/components/ui/input";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  ArrowLeft,
  ArrowRight,
  Upload,
  FileSpreadsheet,
  FileText,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Square,
} from "lucide-react";

/** Valor sentinela do Select: o Radix não aceita `value=""` num SelectItem. */
const NAO_MAPEADO = "__NAO_MAPEADO__";
/** O mesmo motivo, na tabela de cargos: "ainda não escolhi" precisa de um valor. */
const CARGO_NAO_RESOLVIDO = "__CARGO_NAO_RESOLVIDO__";
/** Abre o campo de digitar um nome novo, em vez de escolher do catálogo. */
const CARGO_CRIAR_NOVO = "__CARGO_CRIAR_NOVO__";

/**
 * Os cinco passos do assistente. O passo 3 (Cargos) entrou em 2026-07-27 — ver
 * `my_rules/estrutura/modulos/candidatos/cargos.md`.
 *
 * ⚠️ Importação e Relatório eram 3 e 4; hoje são 4 e 5. Quem for mexer na numeração
 * precisa tocar TRÊS lugares: a trilha, os blocos `{passo === n}` e as transições. Errar
 * um deixa um passo inalcançável, sem erro nenhum na tela.
 */
type Passo = 1 | 2 | 3 | 4 | 5;

/**
 * Mostra o texto do cargo com o caractere quebrado DESTACADO.
 *
 * O `¿` some no meio de uma frase em caixa alta — e é justamente ele que o usuário precisa
 * ver para entender por que está sendo perguntado. Destacar é o oposto de corrigir: a
 * limpeza automática foi medida e descartada (ver `cargos.md`), então a tela aponta e a
 * decisão continua sendo de quem sabe.
 */
function TextoDoCargo({ texto }: { texto: string }) {
  if (!pareceSujo(texto)) return <>{texto}</>;
  // `split` com grupo de captura mantém os separadores no array, então os pedaços e os
  // caracteres sujos saem intercalados na ordem original.
  const pedacos = texto.split(/([¿�])/);
  return (
    <>
      {pedacos.map((p, i) =>
        /[¿�]/.test(p) ? (
          <mark key={i} className="rounded bg-destructive/20 px-0.5 text-destructive">
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

export default function CandidatosImportar() {
  const navigate = useNavigate();
  const { editais, isLoading: carregandoEditais } = useEditais();
  const { importar, isImportando } = useImportarCandidatos();
  const { cargos, isLoading: carregandoCargos } = useCargos();
  const { apelidos, isLoading: carregandoApelidos } = useCargoApelidos();
  const { criarCargo, isCriando } = useCriarCargo();
  const { salvarApelidos } = useSalvarApelidos();

  const [passo, setPasso] = useState<Passo>(1);
  const [editalId, setEditalId] = useState<string>("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erroLeitura, setErroLeitura] = useState<string | null>(null);
  const [colunas, setColunas] = useState<ColunaPlanilha[]>([]);
  const [linhas, setLinhas] = useState<LinhaPlanilha[]>([]);
  const [mapeamento, setMapeamento] = useState<Mapeamento>({});
  /**
   * `textoChave` do cargo → `id` do cargo escolhido.
   *
   * Fica na página, e não dentro do passo 3, porque voltar ao pareamento e avançar de novo
   * PRECISA preservar o que já foi resolvido — refazer nove associações por ter conferido
   * uma coluna seria punir o usuário por checar o trabalho dele.
   *
   * Chave sobrevivente de um pareamento anterior é inofensiva: nenhum grupo casa com ela,
   * então ela não conta como resolvida nem aparece na tela.
   */
  const [resolucoes, setResolucoes] = useState<ResolucaoCargos>(new Map());
  /**
   * Quais resoluções vieram de um apelido guardado numa importação anterior.
   *
   * Serve só ao selo "lembrado" — o usuário precisa saber que aquilo é uma decisão PASSADA
   * dele, e não um palpite do sistema. Sem essa distinção, discordar da associação exige
   * confiar que ela veio de algum lugar sensato.
   */
  const [lembrados, setLembrados] = useState<Set<string>>(new Set());
  /** `textoChave` → nome sendo digitado no campo de criar. `undefined` = campo fechado. */
  const [nomesNovos, setNomesNovos] = useState<Map<string, string>>(new Map());
  const [erroAoCriar, setErroAoCriar] = useState<string | null>(null);

  const [progresso, setProgresso] = useState({ enviados: 0, total: 0 });
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null);
  const [confirmacaoAberta, setConfirmacaoAberta] = useState(false);
  const pararRef = useRef(false);

  const logoBase64 = useLogoBase64();
  const [exportandoPDF, setExportandoPDF] = useState(false);
  /**
   * 🔴 O erro da exportação PRECISA chegar à tela. A primeira versão engolia a exceção
   * num `console.error` e devolvia o botão ao normal: a pessoa clicava, nada baixava, e
   * nada dizia por quê — perda silenciosa, o formato de erro que este repo mais teme.
   * A página não usa toast; o idioma dela é state + <Alert>, como `erroLeitura`.
   */
  const [erroExportacao, setErroExportacao] = useState<string | null>(null);

  const editalSelecionado = editais.find((e) => e.id === editalId) ?? null;

  /**
   * Quantos inscritos o edital tem HOJE — o número que a importação vai APAGAR.
   *
   * É metade do contraste que protege contra arquivo truncado (a outra metade é
   * `candidatos.length`). Vem da mesma RPC que alimenta os cards da listagem, então não
   * custa consulta nova.
   */
  const { contagem } = useContagemCandidatosPorEdital();
  const inscritosHoje = editalId ? (contagem[editalId] ?? 0) : 0;


  // ── Leitura do arquivo ──────────────────────────────────────────────────────────
  const handleArquivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErroLeitura(null);

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer);
      const sheet = wb.Sheets[wb.SheetNames[0]];

      // `header: 1` (linhas como ARRAY) e `raw: false` (células como texto formatado).
      // As duas escolhas são obrigatórias, não estilo:
      //   - array, porque o arquivo tem duas colunas chamadas NOME e o modo objeto faria
      //     a segunda sobrescrever a primeira (ver rotulosDeColunas);
      //   - texto, porque em modo cru o CPF '05176390760' viraria o número 5176390760 e
      //     perderia o zero à esquerda — o CPF de outra pessoa.
      const matriz = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        raw: false,
        defval: null,
      });

      if (matriz.length < 2) {
        setErroLeitura("A planilha precisa ter uma linha de cabeçalho e ao menos uma linha de dados.");
        return;
      }

      const cols = rotulosDeColunas(matriz[0] as unknown[]);
      setArquivo(file);
      setColunas(cols);
      setLinhas(matriz.slice(1));
      setMapeamento(autoMapear(cols));
      // Arquivo novo zera as associações: os cargos podem ser outros, e aproveitar decisão
      // tomada sobre a planilha anterior seria decidir por quem não olhou esta. Trocar o
      // PAREAMENTO não zera — ali os textos costumam ser os mesmos.
      setResolucoes(new Map());
      setLembrados(new Set());
      setNomesNovos(new Map());
      setErroAoCriar(null);
    } catch (err) {
      setErroLeitura(
        `Não foi possível ler a planilha: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  // ── Conversão (recalculada quando o pareamento muda) ────────────────────────────
  const convertidas: LinhaConvertida[] = useMemo(() => {
    if (!editalId || linhas.length === 0 || !mapeamentoCompleto(mapeamento)) return [];
    // +2: a planilha é 1-based e a primeira linha é o cabeçalho. O número que aparece no
    // relatório é o mesmo que a pessoa vê ao abrir o arquivo no Excel para corrigir.
    return linhas.map((linha, i) => converterLinha(linha, mapeamento, editalId, i + 2));
  }, [linhas, mapeamento, editalId]);

  /**
   * As linhas que têm o que identificar o inscrito. É ESTE o número do passo 2.
   *
   * ⚠️ Não usar `candidatos.length` aqui: aquele lote já passou pela deduplicação, que
   * desde a etapa 5 depende do `cargo_id`. No passo 2 nenhum cargo foi resolvido ainda,
   * então todos os `cargo_id` são null e as inscrições da MESMA pessoa em cargos
   * diferentes colapsariam numa só — o passo 2 anunciaria menos do que vai importar.
   *
   * ⚠️ Este comentário citava "396 inscritos a menos". No arquivo de referência o número é
   * ZERO, porque `N_INSCRICAO` é única por linha (correção de 2026-07-28). A precaução
   * continua valendo: ela não depende de QUANTOS colapsam, e sim de o contador do passo 2
   * não poder ser calculado antes da resolução.
   */
  const linhasValidas = useMemo(() => convertidas.filter((l) => l.candidato !== null), [convertidas]);

  /**
   * 🔴 O FILTRO DE PAGAMENTO: só quem pagou a inscrição é importado.
   *
   * Roda ANTES do dedup de propósito — ver `separarPorPagamento`, que explica por que a
   * ordem inversa perderia um pagante que tivesse duplicata.
   */
  const { pagantes, naoPagantes } = useMemo(
    () => separarPorPagamento(convertidas),
    [convertidas],
  );

  /**
   * Estágios 2 a 4 do pipeline, juntos e reativos às resoluções do passo Cargos:
   *
   *     converterLinha → separarPorPagamento → resolverLinhas → deduplicar → blocos de 500
   *
   * ⚠️ Em 2026-08-01 a chave natural encolheu para `(edital_id, n_inscricao)`, e com isso
   * o dedup deixou de depender do cargo: rodá-lo antes ou depois de `resolverLinhas` dá o
   * MESMO resultado. A ordem fica porque o que sai daqui é o que vai ser gravado, e a
   * gravação precisa do `cargo_id` — quem impede a inversão é o tipo, `deduplicar` só
   * aceita o que saiu de `resolverLinhas`.
   *
   * 🔴 Já o filtro de pagamento, que entrou na frente de tudo na mesma data, NÃO tem tipo
   * guardando a ordem — passar `convertidas` no lugar de `pagantes` compila e roda, e o
   * único sintoma seria não-pagantes na lista importada.
   */
  const { candidatos, repetidas } = useMemo(
    () => deduplicar(resolverLinhas(pagantes, resolucoes)),
    [pagantes, resolucoes],
  );
  const comErro = convertidas.filter((l) => l.erro !== null);
  // ⚠️ Sobre os PAGANTES, não sobre `convertidas`: um aviso de dado a conferir numa linha
  // que nem vai ser importada é ruído — manda a pessoa corrigir na origem algo que não
  // entrou. O motivo de a linha ficar de fora já é dito, com nome, na seção Pagamento.
  const comAviso = pagantes.filter((l) => l.avisos.length > 0);

  /**
   * ⚠️ O sinal de arquivo truncado: a planilha traz menos da METADE do que já existe.
   *
   * Não bloqueia — pode ser legítimo (edital que teve indeferimentos em massa). Mas muda
   * o tom da confirmação de "confirme" para "confira antes". O limiar é arbitrário de
   * propósito: qualquer número aqui é palpite, e o valor está em separar o caso comum do
   * caso que merece um segundo olhar, não em acertar a fronteira.
   *
   * Mora AQUI, e não junto de `inscritosHoje`, porque depende de `candidatos` — que só
   * existe depois do dedup.
   */
  const quedaSuspeita = inscritosHoje > 0 && candidatos.length < inscritosHoje / 2;

  const trocarMapeamento = (campoKey: string, valor: string) => {
    setMapeamento((prev) => ({
      ...prev,
      [campoKey]: valor === NAO_MAPEADO ? null : Number(valor),
    }));
  };

  // Uma coluna da planilha alimentando dois campos quase sempre é engano de pareamento —
  // e é fácil de cometer com dois cabeçalhos `NOME`. Avisa sem bloquear: pode ser
  // intencional (o mesmo campo servindo de e-mail e de chave, por exemplo).
  const colunasRepetidasNoMapa = useMemo(() => {
    const usos = new Map<number, string[]>();
    for (const campo of CAMPOS_CANDIDATO) {
      const idx = mapeamento[campo.key];
      if (idx === null || idx === undefined) continue;
      usos.set(idx, [...(usos.get(idx) ?? []), campo.label]);
    }
    return [...usos.entries()].filter(([, campos]) => campos.length > 1);
  }, [mapeamento]);

  // ── Cargos (passo 3) ────────────────────────────────────────────────────────────
  // ⚠️ Sobre os PAGANTES, não sobre `convertidas`. Um cargo que só aparece em linhas de
  // não-pagante não vai ser importado por ninguém: pedir para pareá-lo é trabalho inútil,
  // e "Criar novo…" ali sujaria o catálogo global com um cargo sem nenhum inscrito.
  const cargosLidos = useMemo(() => cargosDaPlanilha(pagantes), [pagantes]);

  const cargosPendentes = useMemo(
    () => cargosLidos.filter((c) => !resolucoes.has(c.textoChave)),
    [cargosLidos, resolucoes],
  );

  /**
   * Pré-preenche o que já dá para decidir sozinho, em duas fontes e nesta ordem:
   *
   *   1. apelido guardado numa importação anterior  → marcado como "lembrado";
   *   2. casamento EXATO por nome contra o catálogo → sem selo.
   *
   * Não havendo nenhum dos dois, fica VAZIO. **Nunca um palpite** — é a mesma regra que
   * mantém `TIPOPROVA` fora dos sinônimos do pareamento: sugerir errado é pior que não
   * sugerir, porque o usuário confere o que parece decidido com menos atenção.
   *
   * ⚠️ Só roda com as DUAS queries carregadas. Rodar antes trataria "ainda não sei os
   * cargos" como "não há cargos" e não pré-preencheria nada — o defeito que faria o
   * usuário criar duplicata do que já existe.
   *
   * Escolha do usuário nunca é sobrescrita: o `if` de baixo só preenche o que está vazio.
   */
  useEffect(() => {
    if (carregandoCargos || carregandoApelidos || cargosLidos.length === 0) return;

    setResolucoes((prev) => {
      const proximo = new Map(prev);
      const novosLembrados = new Set<string>();
      let mudou = false;

      for (const c of cargosLidos) {
        if (proximo.has(c.textoChave)) continue;

        const doApelido = apelidos.get(c.textoChave);
        if (doApelido) {
          proximo.set(c.textoChave, doApelido);
          novosLembrados.add(c.textoChave);
          mudou = true;
          continue;
        }
        const doCatalogo = cargos.find((cargo) => cargo.nome_chave === c.textoChave);
        if (doCatalogo) {
          proximo.set(c.textoChave, doCatalogo.id);
          mudou = true;
        }
      }

      if (novosLembrados.size > 0) {
        setLembrados((antes) => new Set([...antes, ...novosLembrados]));
      }
      // Devolver `prev` quando nada mudou evita um render a mais a cada mudança de query.
      return mudou ? proximo : prev;
    });
  }, [cargosLidos, apelidos, cargos, carregandoCargos, carregandoApelidos]);

  /**
   * Grafias diferentes que o usuário apontou para o MESMO cargo.
   *
   * Não é erro — é o efeito pretendido de sanitizar. Mas precisa ficar visível ANTES de
   * importar, porque a partir da etapa 5 do roadmap essas inscrições passam a compartilhar
   * a chave natural: a mesma pessoa nas duas grafias vira UMA linha. Descobrir isso pelo
   * total no fim seria descobrir tarde.
   */
  const cargosUnificados = useMemo(() => {
    const porCargo = new Map<string, string[]>();
    for (const c of cargosLidos) {
      const id = resolucoes.get(c.textoChave);
      if (!id) continue;
      porCargo.set(id, [...(porCargo.get(id) ?? []), c.textoOrigem]);
    }
    return [...porCargo.entries()]
      .filter(([, textos]) => textos.length > 1)
      .map(([id, textos]) => ({
        nome: cargos.find((x) => x.id === id)?.nome ?? "—",
        textos,
      }));
  }, [cargosLidos, resolucoes, cargos]);

  const esquecerSelo = (textoChave: string) =>
    setLembrados((prev) => {
      if (!prev.has(textoChave)) return prev;
      const proximo = new Set(prev);
      proximo.delete(textoChave);
      return proximo;
    });

  const resolverCargo = (textoChave: string, valor: string, textoOrigem: string) => {
    setErroAoCriar(null);

    if (valor === CARGO_CRIAR_NOVO) {
      // Abre o campo JÁ PREENCHIDO com o texto da planilha, para o usuário EDITAR. Campo
      // em branco obrigaria a redigitar o nome inteiro; partir do texto sujo transforma a
      // tarefa em "conserte o que está errado", que é o que ela de fato é.
      setNomesNovos((prev) => new Map(prev).set(textoChave, textoOrigem));
      return;
    }

    setNomesNovos((prev) => {
      if (!prev.has(textoChave)) return prev;
      const proximo = new Map(prev);
      proximo.delete(textoChave);
      return proximo;
    });
    esquecerSelo(textoChave);

    setResolucoes((prev) => {
      const proximo = new Map(prev);
      if (valor === CARGO_NAO_RESOLVIDO) proximo.delete(textoChave);
      else proximo.set(textoChave, valor);
      return proximo;
    });
  };

  const cancelarCriacao = (textoChave: string) => {
    setErroAoCriar(null);
    setNomesNovos((prev) => {
      const proximo = new Map(prev);
      proximo.delete(textoChave);
      return proximo;
    });
  };

  /**
   * Cria o cargo com o nome que o usuário digitou e o associa ao texto da planilha.
   *
   * Nome que já existe NÃO é erro: `criarCargo` devolve o cargo existente (ver o hook, que
   * usa `ignoreDuplicates` justamente para não renomear o que já está lá). Os dois caminhos
   * terminam iguais aqui — o usuário queria ESTE cargo.
   *
   * Falha de verdade NÃO avança e mostra a mensagem do banco junto do campo: seguir com o
   * cargo por resolver produziria um lote com `cargo_id` nulo, que é o que D4 impede.
   */
  const confirmarCriacao = async (textoChave: string) => {
    const nome = (nomesNovos.get(textoChave) ?? "").trim();
    if (nome === "") return;

    try {
      const cargo = await criarCargo(nome);
      setResolucoes((prev) => new Map(prev).set(textoChave, cargo.id));
      esquecerSelo(textoChave);
      cancelarCriacao(textoChave);
    } catch (e) {
      setErroAoCriar(e instanceof Error ? e.message : String(e));
    }
  };

  // ── Importação ──────────────────────────────────────────────────────────────────
  const executarImportacao = async () => {
    // Guarda a memória para a PRÓXIMA importação. Vem antes do envio porque é rápido e
    // porque, se o usuário parar a importação no meio, o trabalho de associar já está
    // salvo — parar não pode custar a decisão que ele acabou de tomar.
    //
    // ⚠️ Falhar aqui NÃO barra a importação, e a assimetria é deliberada: o apelido é
    // atalho para a próxima vez, enquanto a importação é o objetivo. `useSalvarApelidos`
    // já avisa por toast. Criar cargo, ao contrário, barra — lá o que está em jogo é o
    // `cargo_id` das linhas, não uma conveniência.
    const pares = cargosLidos
      .filter((c) => resolucoes.has(c.textoChave))
      .map((c) => ({ texto_origem: c.textoOrigem, cargo_id: resolucoes.get(c.textoChave) as string }));
    await salvarApelidos(pares).catch(() => undefined);

    pararRef.current = false;
    setResultado(null);
    setProgresso({ enviados: 0, total: candidatos.length });
    setPasso(4);

    // `candidatos` JÁ vem resolvido e deduplicado na ordem certa (ver o useMemo lá em
    // cima). A resolução deixou de acontecer aqui na etapa 5: fazê-la depois do dedup
    // deixaria duas grafias do mesmo cargo passarem como distintas, e o Postgres recusaria
    // o bloco inteiro com "cannot affect row a second time".
    //
    // ⚠️ `editalId` vai EXPLÍCITO: é o edital cuja lista será apagada, e uma operação
    // destrutiva não deve deduzir seu alvo de `candidatos[0]`.
    const res = await importar({
      editalId,
      candidatos,
      onProgresso: setProgresso,
      deveParar: () => pararRef.current,
    });

    setResultado(res);
    setPasso(5);
  };

  const blocos = resultado?.blocos ?? [];
  const blocosComErro = blocos.filter((r) => r.erro !== null);

  /** De-para daquela importação: texto da planilha → cargo final, com a contagem. */
  const deParaCargos = useMemo(
    () =>
      cargosLidos.map((c) => ({
        "Texto na planilha": c.textoOrigem,
        "Cargo do sistema": cargos.find((x) => x.id === resolucoes.get(c.textoChave))?.nome ?? "—",
        Linhas: c.linhas,
        Origem: lembrados.has(c.textoChave) ? "Lembrado de importação anterior" : "Definido agora",
      })),
    [cargosLidos, cargos, resolucoes, lembrados],
  );

  const baixarRelatorio = () => {
    const abaProblemas = montarProblemasDoRelatorio(comErro, comAviso, repetidas, naoPagantes);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        abaProblemas.length > 0
          ? abaProblemas
          : [{ "Nº de Inscrição": "", Situação: "Nenhum problema", Campo: "", Detalhe: "" }],
      ),
      "Problemas",
    );
    // Aba própria para o de-para dos cargos: é o registro auditável de que texto virou que
    // cargo naquela importação. Sem ela, a decisão de sanitização só existe dentro do banco.
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(deParaCargos), "Cargos");
    const base = arquivo?.name?.replace(/\.(xlsx|xls|csv)$/i, "") || "importacao_candidatos";
    XLSX.writeFile(wb, `${base}_relatorio.xlsx`);
  };

  /** Respiro entre o título do timbre e a primeira coisa que o corpo escreve. */
  const RESPIRO_APOS_TITULO = 7;
  /** Espaço entre o fim de uma tabela e o subtítulo da próxima. */
  const ENTRE_BLOCOS = 15;
  /** Abaixo disto não cabe subtítulo + cabeçalho de tabela: melhor virar a página. */
  const ALTURA_MINIMA_DE_BLOCO = 40;

  /**
   * O mesmo relatório do XLS, em documento timbrado — para anexar a processo e imprimir.
   *
   * A diferença de fundo entre os dois não é o formato: a planilha entrega uma lista
   * plana para o Excel filtrar, e o PDF AGRUPA POR CAMPO, porque quem lê o PDF vai
   * corrigir a planilha, e corrigir é trabalho por coluna. Ver
   * `agruparProblemasPorCampo`.
   */
  const baixarRelatorioPDF = () => {
    setExportandoPDF(true);
    setErroExportacao(null);
    try {
      const problemasPorCampo = agruparProblemasPorCampo(
        montarProblemasDoRelatorio(comErro, comAviso, repetidas, naoPagantes),
      );

      const doc = criarDocumentoPaisagem();
      const alturaDaPagina = doc.internal.pageSize.getHeight();
      const linhasDoTimbre = [
        TIMBRE_LINHA1_PADRAO,
        TIMBRE_LINHA2_PADRAO,
        editalSelecionado?.nome || "EDITAL",
      ];

      const paginasTimbradas = new Set<number>();
      let topoDoCorpo = 0;

      /**
       * Timbra a página atual UMA VEZ. O Set é o que impede o timbre duplicado: a página
       * é timbrada tanto por quem a cria de propósito quanto pelo `didDrawPage` do
       * autoTable, que dispara para toda página que a tabela ocupar — inclusive as que
       * ela mesma criou ao transbordar.
       */
      const timbrar = () => {
        const pagina = doc.getCurrentPageInfo().pageNumber;
        if (paginasTimbradas.has(pagina)) return;
        paginasTimbradas.add(pagina);
        // Aqui o timbre tem altura FIXA (sempre 3 linhas + título), então o Y devolvido é
        // o mesmo em toda página — guardá-lo é o que mantém `startY` e `margin.top` de
        // acordo. Se um dia as linhas variarem por página, isto deixa de valer.
        topoDoCorpo = desenharTimbre(doc, {
          logoBase64,
          linhas: linhasDoTimbre,
          titulo: "RELATÓRIO DE IMPORTAÇÃO DE CANDIDATOS",
        }) + RESPIRO_APOS_TITULO;
      };

      // Timbra a página 1 antes de qualquer tabela: é esta chamada que define
      // `topoDoCorpo`, e o `margin.top` das tabelas depende dele já estar valendo.
      timbrar();

      const margensDaTabela = {
        top: topoDoCorpo,
        left: MARGEM_LATERAL,
        right: MARGEM_LATERAL,
        bottom: 15,
      };

      let y = topoDoCorpo;

      const escreverSubtitulo = (texto: string) => {
        doc.setFont("times", "bold");
        doc.setFontSize(11);
        doc.text(texto, MARGEM_LATERAL, y);
        y += 5;
      };

      if (deParaCargos.length > 0) {
        // O de-para vem primeiro por ser o registro auditável da importação: que texto
        // sujo virou que cargo. É a mesma razão da aba "Cargos" no XLS.
        escreverSubtitulo("Associação de Cargos");
        autoTable(doc, {
          startY: y,
          head: [["Texto na Planilha", "Cargo do Sistema", "Linhas", "Origem"]],
          body: deParaCargos.map((c) => [
            c["Texto na planilha"],
            c["Cargo do sistema"],
            c.Linhas.toString(),
            c.Origem,
          ]),
          theme: "grid",
          margin: margensDaTabela,
          styles: ESTILOS_TABELA,
          headStyles: { ...ESTILOS_CABECALHO, minCellHeight: 8 },
          didDrawPage: timbrar,
        });
        y = (doc.lastAutoTable?.finalY ?? y) + ENTRE_BLOCOS;
      }

      for (const { campo, queixas } of problemasPorCampo) {
        if (y > alturaDaPagina - ALTURA_MINIMA_DE_BLOCO) {
          doc.addPage();
          timbrar();
          y = topoDoCorpo;
        }

        // ⚠️ O título NÃO é montado aqui: `subtituloDoCampo` é quem sabe que "Pagamento"
        // não é problema e merece texto próprio. Ver o porquê lá.
        escreverSubtitulo(subtituloDoCampo(campo));
        autoTable(doc, {
          startY: y,
          head: [["Nº de Inscrição", "Situação", "Detalhe"]],
          body: queixas.map((p) => [p["Nº de Inscrição"], p.Situação, p.Detalhe]),
          theme: "grid",
          margin: margensDaTabela,
          // ⚠️ `linebreak`, NÃO `hidden`. Com `hidden` a coluna Detalhe era CORTADA na
          // largura da célula, sem reticências e sem aviso — e o detalhe é a única coisa
          // que este relatório existe para entregar ("CPF tem 10 dígitos"). Um relatório
          // de erros que corta a mensagem do erro em silêncio é perda silenciosa.
          styles: { ...ESTILOS_TABELA, overflow: "linebreak" },
          headStyles: { ...ESTILOS_CABECALHO, minCellHeight: 8 },
          columnStyles: {
            // 30mm, e não os 20 de quando a coluna se chamava "Linha": o cabeçalho
            // "Nº de Inscrição" tem 15 caracteres e em 20mm quebraria em duas linhas.
            0: { cellWidth: 30, halign: "center" },
            1: { cellWidth: 60 },
            2: { cellWidth: "auto" },
          },
          didDrawPage: timbrar,
        });
        y = (doc.lastAutoTable?.finalY ?? y) + ENTRE_BLOCOS;
      }

      // Depois de tudo, porque só agora se sabe o total.
      numerarPaginas(doc);

      const carimbo = format(new Date(), "dd-MM-yyyy HH-mm-ss");
      const base = arquivo?.name?.replace(/\.(xlsx|xls|csv)$/i, "") || "importacao";
      doc.save(`${base}_relatorio_${carimbo}.pdf`);
    } catch (e) {
      console.error(e);
      setErroExportacao(
        e instanceof Error
          ? `Não foi possível gerar o PDF: ${e.message}`
          : "Não foi possível gerar o PDF.",
      );
    } finally {
      setExportandoPDF(false);
    }
  };

  if (carregandoEditais) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="gap-2" onClick={() => navigate("/candidatos")}>
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Importar Candidatos</h1>
            <p className="text-muted-foreground">
              Planilha de inscritos → lista de candidatos do edital.
            </p>
          </div>
        </div>

        {/* Trilha dos passos */}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {[
            [1, "Arquivo"],
            [2, "Pareamento"],
            [3, "Cargos"],
            [4, "Importação"],
            [5, "Relatório"],
          ].map(([n, rotulo]) => (
            <div
              key={n as number}
              className={`rounded-full px-3 py-1 ${
                passo === n
                  ? "bg-primary text-primary-foreground"
                  : passo > (n as number)
                    ? "bg-muted text-foreground"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {n as number}. {rotulo as string}
            </div>
          ))}
        </div>

        {/* ── PASSO 1 — edital + arquivo ───────────────────────────────────────── */}
        {passo === 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Edital e planilha</CardTitle>
              <CardDescription>
                Todo candidato pertence a um edital. Reimportar a mesma planilha depois de
                corrigi-la <strong>atualiza</strong> os inscritos em vez de duplicá-los — a chave é o
                nº de inscrição junto com o cargo.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {editais.length === 0 ? (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Nenhum edital cadastrado</AlertTitle>
                  <AlertDescription>
                    Cadastre o edital do concurso antes de importar os inscritos.{" "}
                    <Button variant="link" className="h-auto p-0" onClick={() => navigate("/editais")}>
                      Cadastrar Edital
                    </Button>
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="max-w-md space-y-2">
                  <label htmlFor="edital-destino" className="text-sm font-medium">
                    Edital de destino
                  </label>
                  <Select value={editalId} onValueChange={setEditalId}>
                    <SelectTrigger id="edital-destino">
                      <SelectValue placeholder="Selecione o edital" />
                    </SelectTrigger>
                    <SelectContent>
                      {editais.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="rounded-lg border-2 border-dashed p-8 text-center">
                <FileSpreadsheet className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
                <input
                  id="arquivo-candidatos"
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={handleArquivo}
                />
                <Button asChild variant="outline" className="gap-2">
                  <label htmlFor="arquivo-candidatos" className="cursor-pointer">
                    <Upload className="h-4 w-4" />
                    Escolher planilha
                  </label>
                </Button>
                <p className="mt-2 text-sm text-muted-foreground">Formatos aceitos: .xlsx, .xls, .csv</p>
                {arquivo && (
                  <p className="mt-3 text-sm font-medium text-foreground">
                    {arquivo.name} — {linhas.length} linha(s) de dados, {colunas.length} coluna(s)
                  </p>
                )}
              </div>

              {erroLeitura && (
                <Alert variant="destructive">
                  <XCircle className="h-4 w-4" />
                  <AlertTitle>Não foi possível ler o arquivo</AlertTitle>
                  <AlertDescription>{erroLeitura}</AlertDescription>
                </Alert>
              )}

              <div className="flex justify-end">
                <Button
                  className="gap-2"
                  disabled={!editalId || linhas.length === 0}
                  onClick={() => setPasso(2)}
                >
                  Parear colunas
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── PASSO 2 — pareamento ─────────────────────────────────────────────── */}
        {passo === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>Pareamento de colunas</CardTitle>
              <CardDescription>
                Diga qual coluna da planilha alimenta cada campo. O palpite abaixo veio dos
                cabeçalhos — confira, principalmente onde há cabeçalhos repetidos (a letra da
                coluna aparece ao lado para diferenciá-los). <strong>Nº de Inscrição</strong>,{" "}
                <strong>Nome</strong> e <strong>Cargo</strong> são obrigatórios.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {CAMPOS_CANDIDATO.map((campo) => {
                  const valor = mapeamento[campo.key];
                  const faltando = campo.obrigatorio && (valor === null || valor === undefined);
                  return (
                    <div key={campo.key} className="space-y-1.5">
                      {/* O `htmlFor`/`id` não é detalhe: são 25 comboboxes iguais nesta
                          tela, e sem a associação o leitor de tela anuncia todos como
                          "combobox", sem dizer de qual campo. `<button>` é elemento
                          rotulável, então o `<label>` nomeia o gatilho do Select. */}
                      <label htmlFor={`campo-${campo.key}`} className="text-sm font-medium">
                        {campo.label}
                        {/* O asterisco é decoração visual: a obrigatoriedade já viaja no
                            `aria-required` do gatilho, e sem isto o leitor lê o nome do
                            campo com um "asterisco" pendurado no fim. */}
                        {campo.obrigatorio && (
                          <span aria-hidden="true" className="ml-1 text-destructive">
                            *
                          </span>
                        )}
                      </label>
                      <Select
                        value={valor === null || valor === undefined ? NAO_MAPEADO : String(valor)}
                        onValueChange={(v) => trocarMapeamento(campo.key, v)}
                        required={campo.obrigatorio}
                      >
                        <SelectTrigger
                          id={`campo-${campo.key}`}
                          className={faltando ? "border-destructive" : undefined}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NAO_MAPEADO}>— não importar —</SelectItem>
                          {colunas.map((col) => (
                            <SelectItem key={col.indice} value={String(col.indice)}>
                              {col.rotulo}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              </div>

              {/* ⚠️ O AVISO MAIS IMPORTANTE DESTA TELA, e ele vive AQUI FORA da prévia de
                  propósito: desde que o Cargo virou obrigatório (D4), a prévia só aparece
                  DEPOIS de ele estar pareado — um aviso lá dentro seria código morto.

                  ⚠️ HISTÓRICO DESTE TEXTO, e ele tem uma volta. Até 28/07 o aviso prometia
                  que sem o cargo "396 inscritos somem". Em 28/07 isso foi declarado falso
                  ("medido com a coluna certa: perda ZERO") e o texto passou a falar só da
                  organização da lista.

                  🔴 EM 31/07 a medição de 28/07 caiu: ela usou a coluna 0 (`N_INSCRICAO`),
                  que é o CONTADOR DE LINHA do export (`1..7416`, sem gap) e por isso nunca
                  colide. Lida do `ID` — que é de onde a inscrição deve vir —, ela REPETE em
                  382 casos, e sem o cargo as 396 inscrições excedentes colidiriam mesmo.

                  O TEXTO ATUAL SEGUE CERTO, e é por isso que não muda aqui: ele não cita
                  número nenhum, e o motivo que dá (sem cargo a lista não responde "quantos
                  inscritos por cargo") vale sob qualquer mapeamento. Voltar a prometer "396
                  somem" seria trocar um número falso por outro condicional — a perda só
                  ocorre se o usuário mapear a inscrição para o `ID`, que é escolha dele no
                  passo 2. Ver `my_rules/estrutura/modulos/candidatos/00-modulo.md`. */}
              {mapeamento.cargo === null && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>O campo Cargo precisa ser pareado</AlertTitle>
                  <AlertDescription>
                    O cargo é a vaga a que o inscrito concorre, e é o que organiza a lista: sem
                    ele, ninguém sabe quantos inscritos há em cada cargo nem como distribuí-los.
                    Não dá para seguir sem escolher a coluna — no arquivo de referência o cargo
                    está na <strong>segunda coluna chamada NOME</strong>, e não em{" "}
                    <code>TIPOPROVA</code>, que existe e está vazia.
                  </AlertDescription>
                </Alert>
              )}

              {colunasRepetidasNoMapa.length > 0 && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Uma mesma coluna alimenta mais de um campo</AlertTitle>
                  <AlertDescription>
                    {colunasRepetidasNoMapa.map(([indice, campos]) => (
                      <div key={indice}>
                        <strong>{colunas[indice]?.rotulo}</strong> → {campos.join(", ")}
                      </div>
                    ))}
                  </AlertDescription>
                </Alert>
              )}

              {/* Prévia: o pareamento errado só aparece quando se vê o VALOR que vai entrar. */}
              {mapeamentoCompleto(mapeamento) && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Prévia das 5 primeiras linhas</h3>
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Linha</TableHead>
                          <TableHead>Inscrição</TableHead>
                          <TableHead>Nome</TableHead>
                          <TableHead>Cargo</TableHead>
                          <TableHead>CPF</TableHead>
                          <TableHead>Nascimento</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {convertidas.slice(0, 5).map((l) => (
                          <TableRow key={l.linhaPlanilha}>
                            <TableCell>{l.linhaPlanilha}</TableCell>
                            <TableCell className="font-mono">
                              {l.candidato?.n_inscricao ?? "—"}
                            </TableCell>
                            <TableCell>{l.candidato?.nome ?? <em>{l.erro}</em>}</TableCell>
                            <TableCell>{l.candidato?.cargo ?? "—"}</TableCell>
                            <TableCell className="font-mono">{l.candidato?.cpf ?? "—"}</TableCell>
                            <TableCell>{l.candidato?.data_nascimento ?? "—"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* ⚠️ O contador de repetidas NÃO aparece aqui. Ele depende do cargo já
                      resolvido (ver `repetidas` no useMemo lá em cima), e no passo 2 isso
                      ainda não aconteceu — o número seria inventado. Ele vive no passo 3. */}
                  <div className="flex flex-wrap gap-2 pt-2">
                    <Badge variant="secondary">{linhasValidas.length} linha(s) lida(s)</Badge>
                    {comAviso.length > 0 && (
                      <Badge variant="outline">{comAviso.length} com dado a conferir</Badge>
                    )}
                    {comErro.length > 0 && (
                      <Badge variant="destructive">{comErro.length} sem inscrição/nome/cargo</Badge>
                    )}
                  </div>

                  {/* 🔴 O AVISO DO FILTRO DE PAGAMENTO, e ele fica AQUI de propósito: este
                      é o ponto em que a pessoa acabou de dizer qual coluna responde
                      "pagou?", e é onde a consequência dessa escolha tem de aparecer.

                      Aparece SEMPRE que há pagante, inclusive quando ninguém fica de fora
                      — "0 ficam de fora" é informação, e some-lo faria o aviso surgir só
                      às vezes, do jeito que ninguém aprende que a regra existe.

                      ⚠️ Os números saem de `pagantes`/`naoPagantes`, que são pré-dedup.
                      É o mesmo motivo de `linhasValidas` não usar `candidatos.length`: no
                      passo 2 nenhum cargo foi resolvido, e o total final só se conhece
                      depois do passo 3. */}
                  {linhasValidas.length > 0 && (
                    <Alert>
                      <CheckCircle2 className="h-4 w-4" />
                      <AlertTitle>
                        Só inscrições pagas serão importadas — {pagantes.length} de{" "}
                        {linhasValidas.length}
                      </AlertTitle>
                      <AlertDescription>
                        {naoPagantes.length === 0 ? (
                          <>
                            Todas as linhas lidas constam como pagas na coluna{" "}
                            <strong>Inscrição Confirmada</strong>, então ninguém fica de fora.
                          </>
                        ) : (
                          <>
                            <strong>{naoPagantes.length} linha(s)</strong> não constam como
                            pagas na coluna <strong>Inscrição Confirmada</strong> e{" "}
                            <strong>não serão importadas</strong>. Elas saem nomeadas no
                            relatório final, na seção <strong>Pagamento</strong>. Se o número
                            surpreender, confira se a coluna pareada é a certa antes de
                            continuar.
                          </>
                        )}
                      </AlertDescription>
                    </Alert>
                  )}

                  {comErro.length > 0 && (
                    <Alert variant="destructive">
                      <XCircle className="h-4 w-4" />
                      <AlertTitle>{comErro.length} linha(s) não serão importadas</AlertTitle>
                      <AlertDescription>
                        Faltou o que identifica o inscrito. Primeiras:{" "}
                        {comErro
                          .slice(0, 3)
                          .map((l) => `linha ${l.linhaPlanilha} (${l.erro})`)
                          .join("; ")}
                        {comErro.length > 3 && ` … e mais ${comErro.length - 3}`}. O relatório final
                        traz a lista completa.
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )}

              <div className="flex justify-between">
                <Button variant="outline" className="gap-2" onClick={() => setPasso(1)}>
                  <ArrowLeft className="h-4 w-4" />
                  Voltar
                </Button>
                {/* Não importa mais nada: quem importa é o passo 3, depois dos cargos. O
                    contador some junto — o número final só se conhece depois de resolver
                    os cargos, e prometer aqui um total que muda lá seria pior que não
                    prometer nada. */}
                <Button
                  className="gap-2"
                  disabled={!mapeamentoCompleto(mapeamento) || linhasValidas.length === 0}
                  onClick={() => setPasso(3)}
                >
                  Continuar
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── PASSO 3 — cargos ─────────────────────────────────────────────────── */}
        {passo === 3 && (
          <Card>
            <CardHeader>
              <CardTitle>Cargos</CardTitle>
              <CardDescription>
                O cargo vem escrito como está na planilha, e a origem costuma quebrar o texto.
                Associe cada um ao cargo do sistema: o texto da planilha continua guardado, e o
                nome que você escolher aqui é o que aparece nas telas.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* INVARIANTE que dispensa um ramo de "nenhum cargo lido" aqui: desde D9,
                  candidato sem cargo não existe (a linha é descartada na conversão), logo
                  `cargosLidos` só é vazio quando `candidatos` também é — e o passo 2 já
                  barra esse caso. Um alerta aqui seria código morto disfarçado de guarda.

                  ⚠️ Enquanto o catálogo carrega NÃO se mostra a tabela. Tratar "ainda não
                  sei" como "não há cargos" faria todo cargo aparecer sem associação e o
                  usuário criaria duplicata do que já existe — é o padrão de defeito mais
                  repetido deste repo. */}
              {carregandoCargos ? (
                <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando os cargos já cadastrados…
                </div>
              ) : (
                <>
                  {cargos.length === 0 && (
                    <Alert>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Nenhum cargo cadastrado ainda</AlertTitle>
                      <AlertDescription>
                        Este é o primeiro concurso a usar o cadastro de cargos.
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <caption className="sr-only">
                        Cargos encontrados na planilha e o cargo do sistema correspondente
                      </caption>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Texto na planilha</TableHead>
                          <TableHead className="w-24 text-right">Linhas</TableHead>
                          <TableHead>Exemplos</TableHead>
                          <TableHead className="w-72">Cargo do sistema</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {cargosLidos.map((c) => {
                          const escolhido = resolucoes.get(c.textoChave);
                          const criando = nomesNovos.get(c.textoChave);
                          return (
                            <TableRow key={c.textoChave}>
                              <TableCell className="font-medium">
                                <TextoDoCargo texto={c.textoOrigem} />
                                {!escolhido && criando === undefined && (
                                  // A cor não pode ser o único sinal: o texto abaixo é o
                                  // que o leitor de tela anuncia.
                                  <span className="ml-2 text-xs text-destructive">
                                    sem associação
                                  </span>
                                )}
                                {escolhido && lembrados.has(c.textoChave) && (
                                  // O selo diz que a decisão é DELE, de outra importação —
                                  // não um palpite do sistema. Discordar fica fácil.
                                  <Badge variant="secondary" className="ml-2 text-xs font-normal">
                                    lembrado
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {c.linhas.toLocaleString("pt-BR")}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {c.exemplos.join(", ")}
                              </TableCell>
                              <TableCell>
                                {criando !== undefined ? (
                                  <div className="space-y-2">
                                    <label
                                      htmlFor={`novo-cargo-${c.textoChave}`}
                                      className="text-xs font-medium"
                                    >
                                      Nome do cargo novo
                                    </label>
                                    <Input
                                      id={`novo-cargo-${c.textoChave}`}
                                      value={criando}
                                      autoFocus
                                      onChange={(e) =>
                                        setNomesNovos((prev) =>
                                          new Map(prev).set(c.textoChave, e.target.value),
                                        )
                                      }
                                      onKeyDown={(e) => {
                                        // Enter confirma e Esc cancela: quem está corrigindo
                                        // nove nomes seguidos não vai tirar a mão do teclado.
                                        if (e.key === "Enter") {
                                          e.preventDefault();
                                          void confirmarCriacao(c.textoChave);
                                        }
                                        if (e.key === "Escape") cancelarCriacao(c.textoChave);
                                      }}
                                    />
                                    <div className="flex gap-2">
                                      <Button
                                        size="sm"
                                        disabled={criando.trim() === "" || isCriando}
                                        onClick={() => void confirmarCriacao(c.textoChave)}
                                      >
                                        Criar e associar
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => cancelarCriacao(c.textoChave)}
                                      >
                                        Cancelar
                                      </Button>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    <label htmlFor={`cargo-${c.textoChave}`} className="sr-only">
                                      Cargo do sistema para “{c.textoOrigem}”
                                    </label>
                                    <Select
                                      value={escolhido ?? CARGO_NAO_RESOLVIDO}
                                      onValueChange={(v) =>
                                        resolverCargo(c.textoChave, v, c.textoOrigem)
                                      }
                                    >
                                      <SelectTrigger
                                        id={`cargo-${c.textoChave}`}
                                        className={!escolhido ? "border-destructive" : undefined}
                                      >
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value={CARGO_NAO_RESOLVIDO}>
                                          — selecione —
                                        </SelectItem>
                                        <SelectItem value={CARGO_CRIAR_NOVO}>
                                          + Criar novo…
                                        </SelectItem>
                                        {cargos.map((cargo) => (
                                          <SelectItem key={cargo.id} value={cargo.id}>
                                            {cargo.nome}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  {erroAoCriar && (
                    <Alert variant="destructive">
                      <XCircle className="h-4 w-4" />
                      <AlertTitle>Não foi possível criar o cargo</AlertTitle>
                      <AlertDescription>{erroAoCriar}</AlertDescription>
                    </Alert>
                  )}

                  {cargosUnificados.length > 0 && (
                    <Alert>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Grafias diferentes tratadas como o mesmo cargo</AlertTitle>
                      <AlertDescription>
                        {cargosUnificados.map((u) => (
                          <div key={u.nome}>
                            {u.textos.map((t) => `“${t}”`).join(" e ")} → <strong>{u.nome}</strong>
                          </div>
                        ))}
                        <p className="mt-2">
                          É o efeito esperado de padronizar. Quem estiver inscrito nas duas grafias
                          para o mesmo cargo passa a contar uma vez só.
                        </p>
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* ⚠️ Este aviso MUDOU DE SIGNIFICADO DUAS VEZES, e o texto precisa
                      acompanhar. Na etapa 5 passou a incluir duas GRAFIAS do mesmo cargo
                      unificadas pela associação. Em 2026-08-01 a chave encolheu para o nº de
                      inscrição, e agora "repetida" quer dizer só isso: mesmo número, ainda
                      que o CPF, o nome ou o cargo difiram. Sem explicar, a pessoa procura na
                      planilha uma repetição que não está escrita lá.

                      ⚠️ Ele já NÃO depende mais do cargo resolvido e poderia viver no passo
                      2. Fica aqui porque o passo 2 já carrega o aviso do filtro de pagamento,
                      e dois avisos de descarte no mesmo ponto competem em vez de informar. */}
                  {repetidas.length > 0 && (
                    <Alert>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>
                        {repetidas.length} linha(s) da planilha repetem um nº de inscrição
                      </AlertTitle>
                      <AlertDescription>
                        O nº de inscrição identifica o candidato, então duas linhas com o mesmo
                        número são a mesma inscrição — mesmo que o CPF, o nome ou o cargo estejam
                        diferentes. Só a última ocorrência de cada uma será importada; o relatório
                        final lista todas, com o número.
                      </AlertDescription>
                    </Alert>
                  )}
                </>
              )}

              <div className="flex items-center justify-between gap-4">
                {/* "Voltar ao pareamento", e não só "Voltar": o cabeçalho da página já tem
                    um botão Voltar, que sai da importação inteira. Dois botões com o mesmo
                    nome na mesma tela obrigam o leitor de tela a adivinhar qual é qual. */}
                <Button variant="outline" className="gap-2" onClick={() => setPasso(2)}>
                  <ArrowLeft className="h-4 w-4" />
                  Voltar ao pareamento
                </Button>
                <div className="flex items-center gap-3">
                  {/* O botão desabilitado DIZ por quê. Um botão cinza e mudo deixa o
                      usuário procurando o que fazer. */}
                  {cargosPendentes.length > 0 && (
                    <span className="text-sm text-destructive">
                      Resolva {cargosPendentes.length} cargo(s) para importar
                    </span>
                  )}
                  {/* ⚠️ NÃO chama a importação direto: ela SUBSTITUI a lista do edital.
                      A confirmação é obrigatória e mostra o contraste de números. */}
                  <Button
                    className="gap-2"
                    disabled={cargosPendentes.length > 0}
                    onClick={() => setConfirmacaoAberta(true)}
                  >
                    Importar {candidatos.length.toLocaleString("pt-BR")} candidato(s)
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── PASSO 4 — em andamento ───────────────────────────────────────────── */}
        {passo === 4 && (
          <Card>
            <CardHeader>
              <CardTitle>Importando…</CardTitle>
              <CardDescription>
                Enviando para <strong>{editalSelecionado?.nome}</strong> em blocos. Não feche a
                página; parar agora mantém o que já entrou.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Progress value={progresso.total ? (progresso.enviados / progresso.total) * 100 : 0} />
              <p className="text-sm text-muted-foreground">
                {progresso.enviados} de {progresso.total} enviados
              </p>
              <Button
                variant="outline"
                className="gap-2"
                disabled={!isImportando}
                onClick={() => {
                  pararRef.current = true;
                }}
              >
                <Square className="h-4 w-4" />
                Parar
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ── PASSO 5 — relatório ──────────────────────────────────────────────── */}
        {passo === 5 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {blocosComErro.length === 0 ? (
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                )}
                {resultado?.trocou ? "Lista do edital substituída" : "A lista NÃO foi alterada"}
              </CardTitle>
              <CardDescription>
                {resultado?.trocou ? (
                  <>
                    <strong>{editalSelecionado?.nome}</strong> agora tem{" "}
                    <strong>{resultado.inseridos}</strong> inscrito(s).{" "}
                    {resultado.removidos > 0
                      ? `Os ${resultado.removidos} da lista anterior foram removidos.`
                      : "A lista estava vazia antes desta importação."}
                  </>
                ) : (
                  <>
                    Nenhum inscrito de <strong>{editalSelecionado?.nome}</strong> foi removido ou
                    alterado.
                  </>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* ⭐ O AVISO MAIS IMPORTANTE DO FLUXO NOVO, e por isso vem antes dos números.
                  A troca total inverteu o significado de falha: antes, um bloco falho deixava
                  a importação pela metade e reimportar consertava. Agora ela deixa a lista
                  INTACTA. Sem dizer isso com todas as letras, o usuário assume o pior e pode
                  ir "consertar" à mão uma lista que não foi tocada. */}
              {resultado && !resultado.trocou && (
                <Alert variant="destructive">
                  <XCircle className="h-4 w-4" />
                  <AlertTitle>A troca não foi executada — ninguém foi removido</AlertTitle>
                  <AlertDescription>
                    <p>{resultado.motivoNaoTrocou}</p>
                    <p className="mt-2">
                      A lista do edital continua exatamente como estava. Importar de novo é
                      seguro.
                    </p>
                  </AlertDescription>
                </Alert>
              )}

              {/* ⚠️ "Sem pagamento" é card PRÓPRIO, e não se soma a "Não importados". As
                  duas contagens dizem que a linha ficou de fora, mas por motivos opostos:
                  a primeira é defeito de dado, que se corrige na planilha e se reimporta;
                  a segunda é o filtro funcionando. Somá-las mandaria a pessoa procurar
                  erro em 185 linhas que não têm nenhum. */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
                {[
                  ["Inseridos", resultado?.inseridos ?? 0, "text-foreground"],
                  ["Removidos", resultado?.removidos ?? 0, "text-foreground"],
                  ["Não importados", comErro.length, "text-destructive"],
                  ["Sem pagamento", naoPagantes.length, "text-muted-foreground"],
                  ["Com ressalva", comAviso.length, "text-foreground"],
                ].map(([rotulo, valor, cor]) => (
                  <div key={rotulo as string} className="rounded-lg border p-4">
                    <div className={`text-2xl font-bold ${cor as string}`}>{valor as number}</div>
                    <div className="text-sm text-muted-foreground">{rotulo as string}</div>
                  </div>
                ))}
              </div>

              {deParaCargos.length > 0 && (
                <div className="rounded-lg border p-4 text-sm">
                  <p className="font-medium">
                    {deParaCargos.length} cargo(s):{" "}
                    {deParaCargos.filter((c) => c.Origem.startsWith("Lembrado")).length} lembrado(s),{" "}
                    {deParaCargos.filter((c) => c.Origem === "Definido agora").length} definido(s)
                    agora
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    O de-para completo está na aba <strong>Cargos</strong> do relatório.
                  </p>
                </div>
              )}

              {blocosComErro.length > 0 && (
                <Alert variant="destructive">
                  <XCircle className="h-4 w-4" />
                  <AlertTitle>{blocosComErro.length} bloco(s) falharam no envio</AlertTitle>
                  <AlertDescription>
                    {blocosComErro.map((b) => (
                      <div key={b.bloco}>
                        Bloco {b.bloco}: {b.erro}
                      </div>
                    ))}
                    {/* ⚠️ O texto antigo dizia "o que já entrou será atualizado, não
                        duplicado" — verdade no upsert, MENTIRA na troca total: quando um
                        bloco falha, nada entra. O envio vai para uma área de preparo que é
                        descartada, e a lista do edital nem chega a ser tocada. */}
                    <p className="mt-2">
                      Nada foi gravado na lista do edital: o envio é preparado à parte e só
                      substitui a lista quando chega inteiro. Corrija a planilha e importe de
                      novo.
                    </p>
                  </AlertDescription>
                </Alert>
              )}

              {comAviso.length > 0 && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>{comAviso.length} inscrito(s) com algum dado a conferir na origem</AlertTitle>
                  <AlertDescription>
                    {/* ⚠️ Este texto dizia "entraram com algum campo em branco" e "não pôde ser
                        aproveitado" — verdade até 29/07, MENTIRA desde 30/07: o valor impossível
                        deixou de virar NULL e passa a ser gravado como veio. Anunciar perda que
                        não houve manda o usuário procurar um dado que está lá. */}
                    O inscrito está na lista e o dado foi <strong>gravado como veio da planilha</strong>
                    , mesmo sendo impossível (CPF fora do formato, e-mail inválido, data ou hora
                    irreconhecível, nome com caractere estranho). Nada foi perdido — baixe o
                    relatório para ver quais linhas corrigir na origem.
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" className="gap-2" onClick={baixarRelatorio}>
                  <FileSpreadsheet className="h-4 w-4" />
                  Baixar Planilha (XLS)
                </Button>
                <Button variant="outline" className="gap-2" onClick={baixarRelatorioPDF} disabled={exportandoPDF}>
                  {exportandoPDF ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                  Baixar Documento (PDF)
                </Button>
                <Button className="gap-2" onClick={() => navigate("/candidatos")}>
                  Ver candidatos
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>

              {/* 🔴 Sem isto, um PDF que falha é indistinguível de um clique que não
                  pegou: o botão volta ao normal e nada baixa. Os inscritos JÁ foram
                  importados neste ponto — o que falhou é só o documento —, então o
                  texto tem de dizer as duas coisas, senão a pessoa refaz a importação
                  inteira achando que perdeu tudo. */}
              {erroExportacao && (
                <Alert variant="destructive" className="mt-4">
                  <XCircle className="h-4 w-4" />
                  <AlertTitle>Não foi possível gerar o documento</AlertTitle>
                  <AlertDescription>
                    {erroExportacao} Os inscritos já foram importados e estão salvos — não
                    é preciso importar de novo. Tente baixar a planilha (XLS), que traz os
                    mesmos dados.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── A confirmação destrutiva ────────────────────────────────────────────
            Importar SUBSTITUI a lista inteira do edital. O usuário precisa ver isso
            antes, e o que protege não é o diálogo existir — ele aparece sempre, e
            diálogo que sempre aparece vira clique automático. O que protege é o
            CONTRASTE de números: quem esperava trocar 7.416 por 7.416 e lê "por 12"
            para na hora.

            ⚠️ DECISÃO REGISTRADA (2026-07-30): NÃO pede senha, ao contrário do
            "limpar edital". Lá a destruição é um clique só, partindo de uma listagem;
            aqui o usuário já atravessou três passos deliberados (arquivo, pareamento,
            cargos) e está olhando o que vai entrar. Uma senha no fim de um assistente
            de cinco passos vira memória muscular, e memória muscular não confere nada. */}
        <AlertDialog open={confirmacaoAberta} onOpenChange={setConfirmacaoAberta}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Substituir a lista de inscritos de {editalSelecionado?.nome}?
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3">
                  <div className="flex items-center gap-3 rounded-lg border p-3 text-center">
                    <div className="flex-1">
                      <div className="text-2xl font-bold">
                        {inscritosHoje.toLocaleString("pt-BR")}
                      </div>
                      <div className="text-xs text-muted-foreground">no edital hoje</div>
                    </div>
                    <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                    <div className="flex-1">
                      <div className="text-2xl font-bold">
                        {candidatos.length.toLocaleString("pt-BR")}
                      </div>
                      {/* 🔴 "vão entrar", NÃO "nesta planilha". O número é pós-filtro de
                          pagamento e pós-dedup, então ele NÃO é o tamanho da planilha —
                          e o rótulo antigo virou promessa falsa no instante em que o
                          filtro entrou (2026-08-01).

                          Rótulo que descreve a origem do número em vez do EFEITO dele é
                          exatamente o defeito do "limpar edital", que exibia a contagem
                          filtrada ao lado de um botão que apagava o edital inteiro — e
                          estava, como este, atrás da confirmação destrutiva. */}
                      <div className="text-xs text-muted-foreground">vão entrar</div>
                    </div>
                  </div>

                  <p>
                    Os <strong>{inscritosHoje.toLocaleString("pt-BR")}</strong> inscritos atuais
                    serão <strong>apagados</strong> e substituídos pelos{" "}
                    <strong>{candidatos.length.toLocaleString("pt-BR")}</strong> desta importação.
                    A operação é feita de uma vez só: ou a lista inteira é trocada, ou nada muda.
                  </p>

                  {/* O filtro é lembrado AQUI de novo, e não é redundância: entre o aviso
                      do passo 2 e este diálogo a pessoa atravessou o passo de cargos, que
                      é longo. Este é o último ponto em que dá para desistir, e a diferença
                      entre os dois números é a explicação de por que o total encolheu. */}
                  {naoPagantes.length > 0 && (
                    <p>
                      <strong>{naoPagantes.length.toLocaleString("pt-BR")}</strong> linha(s) da
                      planilha ficam de fora por não constarem como{" "}
                      <strong>inscrição paga</strong>. Elas saem nomeadas no relatório final.
                    </p>
                  )}

                  {quedaSuspeita && (
                    <p className="rounded-md border border-destructive p-3 font-medium text-destructive">
                      A planilha tem menos da metade dos inscritos que o edital tem hoje. Se o
                      arquivo não estiver completo, esta operação remove quem ficou de fora —
                      confira o arquivo antes de continuar.
                    </p>
                  )}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={executarImportacao}>
                Substituir os inscritos
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Layout>
  );
}
