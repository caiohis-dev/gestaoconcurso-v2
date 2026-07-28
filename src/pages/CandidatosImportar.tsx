import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import { useEditais } from "@/hooks/useEditais";
import { useImportarCandidatos, ResultadoBloco } from "@/hooks/useCandidatos";
import {
  CAMPOS_CANDIDATO,
  ColunaPlanilha,
  LinhaConvertida,
  LinhaPlanilha,
  Mapeamento,
  ResolucaoCargos,
  autoMapear,
  cargosDaPlanilha,
  converterLinha,
  deduplicar,
  mapeamentoCompleto,
  pareceSujo,
  resolverLinhas,
  rotulosDeColunas,
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
  const [resultados, setResultados] = useState<ResultadoBloco[]>([]);
  const pararRef = useRef(false);

  const editalSelecionado = editais.find((e) => e.id === editalId) ?? null;

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
   * diferentes colapsariam numa só — o passo 2 anunciaria 396 inscritos a menos do que
   * vai importar. É a mesma perda dos 396 que D4 existe para impedir, aparecendo como
   * mentira no contador.
   */
  const linhasValidas = useMemo(() => convertidas.filter((l) => l.candidato !== null), [convertidas]);

  /**
   * Estágios 2 e 3 do pipeline, juntos e reativos às resoluções do passo Cargos:
   *
   *     converterLinha → resolverLinhas → deduplicar → blocos de 500
   *
   * ⚠️ A ORDEM É CONTRATO e mudou na etapa 5. Antes o dedup rodava sobre `convertidas`,
   * o que era CORRETO enquanto a chave natural do banco era o TEXTO do cargo. Com
   * `cargo_id` na chave, duas grafias sujas do mesmo cargo viraram a MESMA chave: um
   * dedup sobre o texto as deixaria passar como distintas e o Postgres recusaria o bloco
   * de 500 inteiro. Hoje quem impede a inversão é o tipo — `deduplicar` só aceita o que
   * saiu de `resolverLinhas`.
   */
  const { candidatos, repetidas } = useMemo(
    () => deduplicar(resolverLinhas(convertidas, resolucoes)),
    [convertidas, resolucoes],
  );
  const comErro = convertidas.filter((l) => l.erro !== null);
  const comAviso = convertidas.filter((l) => l.candidato !== null && l.avisos.length > 0);

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
  const cargosLidos = useMemo(() => cargosDaPlanilha(convertidas), [convertidas]);

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
    setResultados([]);
    setProgresso({ enviados: 0, total: candidatos.length });
    setPasso(4);

    // `candidatos` JÁ vem resolvido e deduplicado na ordem certa (ver o useMemo lá em
    // cima). A resolução deixou de acontecer aqui na etapa 5: fazê-la depois do dedup
    // deixaria duas grafias do mesmo cargo passarem como distintas, e o Postgres recusaria
    // o bloco de 500 inteiro com "cannot affect row a second time".
    const res = await importar({
      candidatos,
      onProgresso: setProgresso,
      deveParar: () => pararRef.current,
    });

    setResultados(res);
    setPasso(5);
  };

  const gravados = resultados.reduce((s, r) => s + r.gravados, 0);
  const blocosComErro = resultados.filter((r) => r.erro !== null);

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
    const abaProblemas = [
      ...comErro.map((l) => ({
        Linha: l.linhaPlanilha,
        Situação: "Não importada",
        Detalhe: l.erro ?? "",
      })),
      ...comAviso.map((l) => ({
        Linha: l.linhaPlanilha,
        Situação: "Importada com ressalva",
        Detalhe: l.avisos.join(" | "),
      })),
      ...repetidas.map((r) => ({
        Linha: r.linhaPlanilha,
        Situação: "Substituída por linha posterior",
        Detalhe: `Inscrição e cargo repetidos na planilha (${r.chave.replace("||", " / ")})`,
      })),
    ].sort((a, b) => a.Linha - b.Linha);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        abaProblemas.length > 0 ? abaProblemas : [{ Linha: "", Situação: "Nenhum problema", Detalhe: "" }],
      ),
      "Problemas",
    );
    // Aba própria para o de-para dos cargos: é o registro auditável de que texto virou que
    // cargo naquela importação. Sem ela, a decisão de sanitização só existe dentro do banco.
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(deParaCargos), "Cargos");
    const base = arquivo?.name?.replace(/\.(xlsx|xls|csv)$/i, "") || "importacao_candidatos";
    XLSX.writeFile(wb, `${base}_relatorio.xlsx`);
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

                  O que está em jogo: o cargo compõe a identidade do candidato. Sem ele, as
                  inscrições da mesma pessoa em cargos diferentes colidem e viram uma só —
                  396 inscritos somem no arquivo de referência. Era perda silenciosa (a
                  importação terminava em verde com a lista menor); hoje é impedimento. */}
              {mapeamento.cargo === null && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>O campo Cargo precisa ser pareado</AlertTitle>
                  <AlertDescription>
                    O cargo faz parte da identidade do inscrito: sem ele, quem concorre a mais de
                    um cargo com a mesma inscrição vira um registro só e desaparece da lista. Não
                    dá para seguir sem escolher a coluna — no arquivo de referência o cargo está na{" "}
                    <strong>segunda coluna chamada NOME</strong>, e não em <code>TIPOPROVA</code>,
                    que existe e está vazia.
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
                      <Badge variant="outline">{comAviso.length} com campo descartado</Badge>
                    )}
                    {comErro.length > 0 && (
                      <Badge variant="destructive">{comErro.length} sem inscrição/nome/cargo</Badge>
                    )}
                  </div>

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

                  {/* ⚠️ Este aviso MUDOU DE SIGNIFICADO na etapa 5, e o texto tem de dizer
                      isso. Antes "repetida" só podia ser repetição literal na planilha;
                      agora, com o cargo entrando por referência, duas GRAFIAS do mesmo
                      cargo também viram a mesma linha. Sem explicar, a pessoa vai procurar
                      na planilha uma repetição que não está escrita lá. Ele também só pode
                      viver aqui, e não no passo 2: depende do cargo já resolvido. */}
                  {repetidas.length > 0 && (
                    <Alert>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>
                        {repetidas.length} linha(s) da planilha viram a mesma inscrição
                      </AlertTitle>
                      <AlertDescription>
                        Mesmo CPF, mesmo nº de inscrição e o mesmo cargo <em>depois da associação</em>{" "}
                        — o que inclui grafias diferentes que você apontou para o mesmo cargo. Só a
                        última ocorrência de cada uma será importada; o relatório final lista todas.
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
                  <Button
                    className="gap-2"
                    disabled={cargosPendentes.length > 0}
                    onClick={executarImportacao}
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
                Importação concluída
              </CardTitle>
              <CardDescription>
                {gravados} candidato(s) gravados em <strong>{editalSelecionado?.nome}</strong>.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {[
                  ["Gravados", gravados, "text-foreground"],
                  ["Não importados", comErro.length, "text-destructive"],
                  ["Com ressalva", comAviso.length, "text-foreground"],
                  ["Repetidos no arquivo", repetidas.length, "text-foreground"],
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
                  <AlertTitle>{blocosComErro.length} bloco(s) falharam</AlertTitle>
                  <AlertDescription>
                    {blocosComErro.map((b) => (
                      <div key={b.bloco}>
                        Bloco {b.bloco}: {b.erro}
                      </div>
                    ))}
                    <p className="mt-2">
                      Corrija a planilha e importe de novo — o que já entrou será atualizado, não
                      duplicado.
                    </p>
                  </AlertDescription>
                </Alert>
              )}

              {comAviso.length > 0 && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>{comAviso.length} inscrito(s) entraram com algum campo em branco</AlertTitle>
                  <AlertDescription>
                    O inscrito está na lista, mas um campo secundário não pôde ser aproveitado (CPF
                    fora do formato, e-mail inválido, data irreconhecível). Baixe o relatório para
                    ver quais linhas corrigir na origem.
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" className="gap-2" onClick={baixarRelatorio}>
                  <FileSpreadsheet className="h-4 w-4" />
                  Baixar relatório
                </Button>
                <Button className="gap-2" onClick={() => navigate("/candidatos")}>
                  Ver candidatos
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
