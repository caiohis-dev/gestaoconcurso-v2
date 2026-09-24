import { useMemo, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  Info,
  Link2,
  Loader2,
  ShieldCheck,
  Upload,
} from "lucide-react";
import type { PagamentoPix } from "@/lib/financeiro-cnab240-tipos";
import {
  COLUNAS_SISTEMA,
  contarLinhasDados,
  converterPlanilhaParaPagamentoPix,
  lerCabecalho,
  lerPrimeiraLinhaDados,
  sugerirMapeamento,
} from "@/lib/financeiro-planilha-pagamentos";
import type { DefColunaSistema, IdColunaSistema, MapeamentoColunas } from "@/lib/financeiro-planilha-pagamentos";
import { lerPlanilha } from "@/lib/financeiro-ler-planilha";
import type { Matriz } from "@/lib/financeiro-ler-planilha";
import { baixarXls } from "@/lib/financeiro-exportar-planilha";
import { agruparPagamentosPorUnidade, gerarLotePix } from "@/lib/financeiro-cnab240-gerador";
import type { GrupoUnidade } from "@/lib/financeiro-cnab240-gerador";
import { detectarChaveCpfDivergente } from "@/lib/financeiro-divergencia-pix";
import type { DivergenciaChaveCpf } from "@/lib/financeiro-divergencia-pix";

/**
 * Módulo Financeiro — geração de remessas de pagamento (CNAB 240 / PIX).
 *
 * Fase 3 do roadmap (my_rules/analises/roadmap-modulo-financeiro.yaml): UI real, reescrita nos
 * padrões do repositório (Tailwind/shadcn), sobre a lógica pura já portada e testada em
 * `src/lib/financeiro-*.ts` (Fase 2). Fluxo espelhado da origem (`gera_cnab_pix/src/App.tsx`):
 * envio → correspondência de colunas → validação/geração, um único fluxo linear (sem abas
 * "Geração"/"Histórico" da origem — eram placeholders vazios, e D3 manteve o módulo stateless).
 *
 * 🔴 Não lê nem escreve dado nenhum do resto do sistema: `edital`/`siglaUnidade` vêm da PLANILHA
 * de pagamento, sem vínculo com as tabelas `editais`/`unidades_prova`.
 */

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const ROTULO_TIPO_CHAVE: Record<string, string> = {
  "01": "Telefone",
  "02": "E-mail",
  "03": "CPF",
  "04": "Aleatória",
};
const rotuloTipoChave = (codigo: string): string => ROTULO_TIPO_CHAVE[codigo] ?? codigo ?? "—";

// 11 dígitos -> 000.000.000-00 (mantém original se não tiver 11 dígitos)
const formatarCpf = (digitos: string): string =>
  digitos.length === 11 ? digitos.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : digitos;

// yyyy-mm-dd (input date) -> DDMMAAAA (formato CNAB)
const toDDMMAAAA = (isoDate: string): string => {
  const [ano, mes, dia] = isoDate.split("-");
  if (!ano || !mes || !dia) return "";
  return `${dia}${mes}${ano}`;
};

// Carimbo de data/hora do momento do download, no formato _dd_mm_yyyy__hh_mm_ss.
const carimboDataHora = (d = new Date()): string => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `_${p(d.getDate())}_${p(d.getMonth() + 1)}_${d.getFullYear()}__${p(d.getHours())}_${p(d.getMinutes())}_${p(d.getSeconds())}`;
};

const hojeISO = (): string => {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
};

type Etapa = "upload" | "mapeamento" | "validacao";

const PASSOS: { numero: number; etapa: Etapa; titulo: string; icone: typeof Upload }[] = [
  { numero: 1, etapa: "upload", titulo: "Envio", icone: Upload },
  { numero: 2, etapa: "mapeamento", titulo: "Correspondência", icone: Link2 },
  { numero: 3, etapa: "validacao", titulo: "Validação", icone: ShieldCheck },
];

export default function Financeiro() {
  const { loading: authLoading } = useAuth();

  const [etapa, setEtapa] = useState<Etapa>("upload");
  const [matriz, setMatriz] = useState<Matriz | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dataPagamento, setDataPagamento] = useState<string>(hojeISO());
  const [erroLeitura, setErroLeitura] = useState<string | null>(null);
  const [cabecalho, setCabecalho] = useState<string[]>([]);
  const [primeiraLinha, setPrimeiraLinha] = useState<string[]>([]);
  const [mapeamento, setMapeamento] = useState<MapeamentoColunas | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const passoAtual = PASSOS.find((p) => p.etapa === etapa)?.numero ?? 1;

  // Parsing/validação derivada — só roda com um mapeamento confirmado
  const resultado = useMemo((): {
    pagamentos: PagamentoPix[];
    totalLinhas: number;
    erro: string | null;
  } => {
    if (!matriz || !mapeamento) return { pagamentos: [], totalLinhas: 0, erro: null };
    try {
      const pagamentos = converterPlanilhaParaPagamentoPix(matriz, toDDMMAAAA(dataPagamento), mapeamento);
      return { pagamentos, totalLinhas: contarLinhasDados(matriz), erro: null };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao processar a planilha.";
      return { pagamentos: [], totalLinhas: contarLinhasDados(matriz), erro: msg };
    }
  }, [matriz, dataPagamento, mapeamento]);

  const { pagamentos, totalLinhas, erro } = resultado;
  const podeGerar = pagamentos.length > 0 && !erro;

  // Um arquivo CNAB por unidade. Deriva os grupos (com nomes de arquivo únicos)
  // sem gerar o conteúdo — as linhas são montadas ao clicar no botão da unidade.
  const grupos = useMemo(() => (podeGerar ? agruparPagamentosPorUnidade(pagamentos) : []), [pagamentos, podeGerar]);

  // Aviso de conferência: chaves tipo CPF cujos dígitos divergem do CPF do
  // favorecido (titularidade) — causa comum de recusa do banco.
  const divergenciasChaveCpf = useMemo(
    () => (podeGerar ? detectarChaveCpfDivergente(pagamentos) : []),
    [pagamentos, podeGerar],
  );

  const pendentes = COLUNAS_SISTEMA.filter((c) => c.obrigatoria && (!mapeamento || mapeamento[c.id] === -1));
  const podeValidar = mapeamento !== null && pendentes.length === 0;

  const carregarArquivo = async (file: File | undefined | null) => {
    if (!file) return;
    setErroLeitura(null);
    try {
      const dados = await lerPlanilha(file);
      const cab = lerCabecalho(dados);
      setFileName(file.name);
      setMatriz(dados);
      setCabecalho(cab);
      setPrimeiraLinha(lerPrimeiraLinhaDados(dados));
      setMapeamento(sugerirMapeamento(cab));
      setEtapa("mapeamento");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Não foi possível ler a planilha.";
      setErroLeitura(msg);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const limpar = () => {
    setEtapa("upload");
    setMatriz(null);
    setFileName(null);
    setErroLeitura(null);
    setCabecalho([]);
    setPrimeiraLinha([]);
    setMapeamento(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const alterarColuna = (id: IdColunaSistema, idx: number) => setMapeamento((m) => (m ? { ...m, [id]: idx } : m));

  // Baixa os dois arquivos da unidade: a remessa .REM e a planilha .xls de
  // conferência. Ambos compartilham o mesmo nome-base (com o mesmo carimbo de
  // data/hora), de modo que o par fique evidente na pasta de downloads.
  const baixarGrupo = (grupo: GrupoUnidade) => {
    const base = grupo.nomeArquivo.replace(/\.REM$/i, "") + carimboDataHora();

    const linhas = gerarLotePix(grupo.pagamentos);
    const conteudo = linhas.join("\r\n") + "\r\n";
    const blob = new Blob([conteudo], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${base}.REM`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    exportarXlsUnidade(grupo, base);
  };

  const exportarXlsUnidade = (grupo: GrupoUnidade, base: string) => {
    const cabecalhoXls = ["Nome", "Cargo", "Tipo de chave", "Chave PIX", "Valor"];
    const linhas = grupo.pagamentos.map((p) => [
      p.nomeFornecedor,
      p.funcao,
      rotuloTipoChave(p.tipoChavePix),
      p.chavePix,
      Number.isFinite(p.valorPagamento) ? p.valorPagamento : 0,
    ]);
    baixarXls([cabecalhoXls, ...linhas], `${base}.xls`, "Recebedores");
  };

  const exportar = () => {
    if (pagamentos.length === 0) return;
    const cabecalhoXls = ["#", "Nome", "CPF", "Edital", "Unidade", "Valor", "Tipo de chave", "Chave PIX", "Tipo inferido"];
    const linhas = pagamentos.map((p, i) => [
      i + 1,
      p.nomeFornecedor,
      formatarCpf(p.cpfFornecedor),
      p.edital,
      p.siglaUnidade,
      Number.isFinite(p.valorPagamento) ? p.valorPagamento : 0,
      rotuloTipoChave(p.tipoChavePix),
      p.chavePix,
      p.chaveInferida ? "Sim" : "Não",
    ]);
    baixarXls([cabecalhoXls, ...linhas], `recebedores_${toDDMMAAAA(dataPagamento) || "conferencia"}.xls`, "Recebedores");
  };

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Financeiro</h1>
          <p className="text-muted-foreground">Geração de remessas de pagamento (CNAB 240 / PIX).</p>
        </div>

        <Stepper passoAtual={passoAtual} />

        {etapa === "upload" && (
          <EnvioEtapa
            dataPagamento={dataPagamento}
            onMudarData={setDataPagamento}
            erroLeitura={erroLeitura}
            inputRef={inputRef}
            onCarregarArquivo={carregarArquivo}
          />
        )}

        {etapa === "mapeamento" && mapeamento && (
          <MapeamentoEtapa
            fileName={fileName}
            cabecalho={cabecalho}
            primeiraLinha={primeiraLinha}
            mapeamento={mapeamento}
            pendentes={pendentes}
            podeValidar={podeValidar}
            onChange={alterarColuna}
            onValidar={() => setEtapa("validacao")}
            onVoltar={limpar}
          />
        )}

        {etapa === "validacao" && (
          <ValidacaoEtapa
            fileName={fileName}
            erro={erro}
            pagamentos={pagamentos}
            totalLinhas={totalLinhas}
            grupos={grupos}
            divergenciasChaveCpf={divergenciasChaveCpf}
            onExportar={exportar}
            onGerarGrupo={baixarGrupo}
            onVoltarMapeamento={() => setEtapa("mapeamento")}
            onTrocarArquivo={limpar}
          />
        )}
      </div>
    </Layout>
  );
}

/* ------------------------------------------------------------------ *
 * Stepper — indicador visual das 3 etapas (padrão de CadastroLote.tsx)
 * ------------------------------------------------------------------ */
function Stepper({ passoAtual }: { passoAtual: number }) {
  return (
    <div className="flex items-center justify-center" aria-label="Etapas">
      {PASSOS.map((passo, index) => (
        <div key={passo.numero} className="flex items-center">
          <div
            className={`flex flex-col items-center ${passoAtual >= passo.numero ? "text-primary" : "text-muted-foreground"}`}
          >
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-full border-2 transition-colors ${
                passoAtual > passo.numero
                  ? "border-primary bg-primary text-primary-foreground"
                  : passoAtual === passo.numero
                    ? "border-primary bg-primary/10"
                    : "border-muted"
              }`}
            >
              {passoAtual > passo.numero ? <CheckCircle2 className="h-6 w-6" /> : <passo.icone className="h-5 w-5" />}
            </div>
            <span className="mt-2 text-xs font-medium">{passo.titulo}</span>
          </div>
          {index < PASSOS.length - 1 && (
            <div className={`mx-2 h-0.5 w-16 transition-colors ${passoAtual > passo.numero ? "bg-primary" : "bg-muted"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Etapa 1 — envio (data de pagamento + upload)
 * ------------------------------------------------------------------ */
function EnvioEtapa(props: {
  dataPagamento: string;
  onMudarData: (v: string) => void;
  erroLeitura: string | null;
  inputRef: React.RefObject<HTMLInputElement>;
  onCarregarArquivo: (file: File | undefined | null) => void;
}) {
  const { dataPagamento, onMudarData, erroLeitura, inputRef, onCarregarArquivo } = props;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Arquivo de recebedores</CardTitle>
        <CardDescription>
          Envie a planilha .xls ou .xlsx. Na próxima etapa você confirma a correspondência das colunas antes da
          validação.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="data-pagamento">Data de pagamento</Label>
          <Input
            id="data-pagamento"
            type="date"
            className="max-w-xs"
            value={dataPagamento}
            onChange={(e) => onMudarData(e.target.value)}
          />
        </div>

        <Input
          ref={inputRef}
          type="file"
          accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          id="financeiro-upload"
          onChange={(e) => onCarregarArquivo(e.target.files?.[0])}
        />
        <div className="rounded-lg border-2 border-dashed p-8 text-center">
          <label htmlFor="financeiro-upload" className="cursor-pointer">
            <Upload className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            <span className="block text-lg font-medium">Clique para selecionar a planilha</span>
          </label>
          <p className="mt-2 text-sm text-muted-foreground">Formatos aceitos: .xls, .xlsx</p>
        </div>

        {erroLeitura && (
          <div
            className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-red-700 dark:text-red-400"
            role="alert"
          >
            <Info className="mt-0.5 h-5 w-5 flex-shrink-0" />
            <p>{erroLeitura}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ *
 * Etapa 2 — correspondência de colunas
 * ------------------------------------------------------------------ */
function MapeamentoEtapa(props: {
  fileName: string | null;
  cabecalho: string[];
  primeiraLinha: string[];
  mapeamento: MapeamentoColunas;
  pendentes: DefColunaSistema[];
  podeValidar: boolean;
  onChange: (id: IdColunaSistema, idx: number) => void;
  onValidar: () => void;
  onVoltar: () => void;
}) {
  const { fileName, cabecalho, primeiraLinha, mapeamento, pendentes, podeValidar } = props;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Correspondência de colunas</CardTitle>
        <CardDescription>
          Aponte qual coluna de <strong>{fileName}</strong> corresponde a cada campo do sistema. A validação começa
          após a confirmação.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="max-h-[500px] overflow-auto rounded-md border">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <TableHead>Coluna do sistema</TableHead>
                <TableHead>Coluna da planilha</TableHead>
                <TableHead>Prévia</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {COLUNAS_SISTEMA.map((col) => {
                const idx = mapeamento[col.id];
                const previa = idx >= 0 ? primeiraLinha[idx] : "";
                return (
                  <TableRow key={col.id}>
                    <TableCell>
                      <Label htmlFor={`coluna-${col.id}`}>
                        {col.label}
                        {col.obrigatoria && <span className="ml-1 text-xs font-normal text-primary">obrigatória</span>}
                        {col.sujeitoInferencia && (
                          <span className="ml-1 text-xs font-normal text-muted-foreground">Sujeito a inferência</span>
                        )}
                      </Label>
                    </TableCell>
                    <TableCell>
                      <Select value={String(idx)} onValueChange={(v) => props.onChange(col.id, Number(v))}>
                        <SelectTrigger id={`coluna-${col.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="-1">{col.obrigatoria ? "— selecione —" : "(não existe na planilha)"}</SelectItem>
                          {cabecalho.map((nome, i) => (
                            <SelectItem key={i} value={String(i)}>
                              {nome || `Coluna ${i + 1}`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-muted-foreground" title={previa}>
                      {previa || "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {pendentes.length > 0 && (
          <div
            className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 p-4 text-amber-700 dark:text-amber-400"
            role="alert"
          >
            <Info className="mt-0.5 h-5 w-5 flex-shrink-0" />
            <p>Faltam mapear: {pendentes.map((c) => c.label).join(", ")}.</p>
          </div>
        )}

        <div className="flex gap-4">
          <Button variant="outline" onClick={props.onVoltar}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Trocar arquivo
          </Button>
          <Button onClick={props.onValidar} disabled={!podeValidar} className="flex-1">
            <ShieldCheck className="mr-2 h-4 w-4" />
            Validar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ *
 * Etapa 3 — validação e geração por unidade
 * ------------------------------------------------------------------ */
function ValidacaoEtapa(props: {
  fileName: string | null;
  erro: string | null;
  pagamentos: PagamentoPix[];
  totalLinhas: number;
  grupos: GrupoUnidade[];
  divergenciasChaveCpf: DivergenciaChaveCpf[];
  onExportar: () => void;
  onGerarGrupo: (grupo: GrupoUnidade) => void;
  onVoltarMapeamento: () => void;
  onTrocarArquivo: () => void;
}) {
  const { fileName, erro, pagamentos, totalLinhas, grupos, divergenciasChaveCpf } = props;
  const ignoradas = Math.max(0, totalLinhas - pagamentos.length);
  const valorTotal = pagamentos.reduce((soma, p) => soma + (Number.isFinite(p.valorPagamento) ? p.valorPagamento : 0), 0);
  const inferidas = pagamentos.reduce((n, p) => (p.chaveInferida ? n + 1 : n), 0);
  const ambiguas = pagamentos.reduce((n, p) => (p.chaveAmbigua ? n + 1 : n), 0);
  // Conversor garante edital único quando não há erro; basta ler do primeiro registro.
  const editalUnico = pagamentos[0]?.edital ?? "";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Resumo da validação</CardTitle>
        <CardDescription>Conferência de {fileName}.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!erro && pagamentos.length > 0 && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Edital</span>
            <Badge variant="secondary">{editalUnico}</Badge>
          </div>
        )}

        {erro ? (
          <div
            className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-red-700 dark:text-red-400"
            role="alert"
          >
            <Info className="mt-0.5 h-5 w-5 flex-shrink-0" />
            <p>{erro}</p>
          </div>
        ) : (
          <ResumoValidacao
            validos={pagamentos.length}
            ignoradas={ignoradas}
            valorTotal={valorTotal}
            arquivos={grupos.length}
          />
        )}

        {!erro && pagamentos.length > 0 && (
          <TabelaPagamentos pagamentos={pagamentos} inferidas={inferidas} ambiguas={ambiguas} onExportar={props.onExportar} />
        )}

        {!erro && divergenciasChaveCpf.length > 0 && <AvisoDivergencia divergencias={divergenciasChaveCpf} />}

        {!erro && grupos.length > 0 && <GeracaoPorUnidade grupos={grupos} onGerarGrupo={props.onGerarGrupo} />}

        <div className="flex gap-4">
          <Button variant="outline" onClick={props.onVoltarMapeamento}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar ao mapeamento
          </Button>
          <Button variant="ghost" onClick={props.onTrocarArquivo}>
            Trocar arquivo
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ResumoValidacao(props: { validos: number; ignoradas: number; valorTotal: number; arquivos: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">Recebedores válidos</p>
          <p className="text-2xl font-bold">{props.validos}</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">Linhas ignoradas</p>
          <p className="text-2xl font-bold">{props.ignoradas}</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">Valor total do lote</p>
          <p className="text-2xl font-bold">{brl.format(props.valorTotal)}</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">Arquivos (unidades)</p>
          <p className="text-2xl font-bold">{props.arquivos}</p>
        </CardContent>
      </Card>
    </div>
  );
}

function TabelaPagamentos(props: {
  pagamentos: PagamentoPix[];
  inferidas: number;
  ambiguas: number;
  onExportar: () => void;
}) {
  const { pagamentos, inferidas, ambiguas } = props;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">Dados lidos ({pagamentos.length})</h3>
        <div className="flex flex-wrap items-center gap-2">
          {inferidas > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Badge variant="outline">tipo inferido</Badge>
              {inferidas} tipo(s) de chave inferido(s) automaticamente
            </span>
          )}
          {ambiguas > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-400">
                ambígua
              </Badge>
              {ambiguas} chave(s) que podem ser CPF ou telefone — confira antes de gerar
            </span>
          )}
          <Button variant="outline" size="sm" onClick={props.onExportar}>
            <Download className="mr-2 h-4 w-4" />
            Exportar XLS
          </Button>
        </div>
      </div>
      <div className="max-h-[500px] overflow-auto rounded-md border">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>CPF</TableHead>
              <TableHead>Edital</TableHead>
              <TableHead>Unidade</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Tipo de chave</TableHead>
              <TableHead>Chave PIX</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagamentos.map((p, i) => (
              <TableRow key={`${p.cpfFornecedor}-${i}`}>
                <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                <TableCell>{p.nomeFornecedor}</TableCell>
                <TableCell className="font-mono">{formatarCpf(p.cpfFornecedor)}</TableCell>
                <TableCell>{p.edital || "—"}</TableCell>
                <TableCell>{p.siglaUnidade || "—"}</TableCell>
                <TableCell className="text-right">{brl.format(Number.isFinite(p.valorPagamento) ? p.valorPagamento : 0)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    {rotuloTipoChave(p.tipoChavePix)}
                    {p.chaveInferida && <Badge variant="outline">inferido</Badge>}
                    {p.chaveAmbigua && (
                      <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-400">
                        ambígua
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="font-mono">{p.chavePix || "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function AvisoDivergencia({ divergencias }: { divergencias: DivergenciaChaveCpf[] }) {
  return (
    <div
      className="space-y-3 rounded-lg border border-amber-500/20 bg-amber-500/10 p-4 text-amber-700 dark:text-amber-400"
      role="alert"
    >
      <div className="flex items-start gap-2">
        <Info className="mt-0.5 h-5 w-5 flex-shrink-0" />
        <div>
          <p className="font-medium">{divergencias.length} chave(s) PIX do tipo CPF divergem do CPF do favorecido</p>
          <p className="text-sm">
            A chave informada é um CPF diferente do CPF do recebedor. O banco valida a titularidade da chave e
            costuma recusar esses pagamentos. Confira antes de gerar o arquivo.
          </p>
        </div>
      </div>
      <div className="overflow-auto rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>CPF do favorecido</TableHead>
              <TableHead>Chave (CPF) informada</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {divergencias.map((d, i) => (
              <TableRow key={`${d.cpf}-${i}`}>
                <TableCell>{d.nome}</TableCell>
                <TableCell className="font-mono">{formatarCpf(d.cpf)}</TableCell>
                <TableCell className="font-mono">{formatarCpf(d.chaveCpf)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function GeracaoPorUnidade({ grupos, onGerarGrupo }: { grupos: GrupoUnidade[]; onGerarGrupo: (grupo: GrupoUnidade) => void }) {
  return (
    <div className="space-y-3">
      <h3 className="font-medium">Gerar arquivo por unidade ({grupos.length})</h3>
      <p className="text-sm text-muted-foreground">
        Cada unidade gera dois arquivos: a remessa CNAB 240 (.REM) e a planilha de conferência (.xls) com nome, cargo,
        tipo de chave, chave e valor. Baixe cada unidade separadamente.
      </p>
      <div className="flex flex-wrap gap-2">
        {grupos.map((g) => (
          <Button key={g.nomeArquivo} onClick={() => onGerarGrupo(g)}>
            <Download className="mr-2 h-4 w-4" />
            {g.unidade} · {g.quantidade} · {brl.format(g.valorTotal)}
          </Button>
        ))}
      </div>
    </div>
  );
}
