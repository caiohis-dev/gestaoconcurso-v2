import { useMemo, useRef, useState } from "react";
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
  autoMapear,
  converterLinha,
  deduplicar,
  mapeamentoCompleto,
  rotulosDeColunas,
} from "@/lib/candidatos-import";
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

type Passo = 1 | 2 | 3 | 4;

export default function CandidatosImportar() {
  const navigate = useNavigate();
  const { editais, isLoading: carregandoEditais } = useEditais();
  const { importar, isImportando } = useImportarCandidatos();

  const [passo, setPasso] = useState<Passo>(1);
  const [editalId, setEditalId] = useState<string>("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erroLeitura, setErroLeitura] = useState<string | null>(null);
  const [colunas, setColunas] = useState<ColunaPlanilha[]>([]);
  const [linhas, setLinhas] = useState<LinhaPlanilha[]>([]);
  const [mapeamento, setMapeamento] = useState<Mapeamento>({});

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

  const { candidatos, repetidas } = useMemo(() => deduplicar(convertidas), [convertidas]);
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

  // ── Importação ──────────────────────────────────────────────────────────────────
  const executarImportacao = async () => {
    pararRef.current = false;
    setResultados([]);
    setProgresso({ enviados: 0, total: candidatos.length });
    setPasso(3);

    const res = await importar({
      candidatos,
      onProgresso: setProgresso,
      deveParar: () => pararRef.current,
    });

    setResultados(res);
    setPasso(4);
  };

  const gravados = resultados.reduce((s, r) => s + r.gravados, 0);
  const blocosComErro = resultados.filter((r) => r.erro !== null);

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
            [3, "Importação"],
            [4, "Relatório"],
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
                coluna aparece ao lado para diferenciá-los). Só{" "}
                <strong>Nº de Inscrição</strong> e <strong>Nome</strong> são obrigatórios.
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

                  <div className="flex flex-wrap gap-2 pt-2">
                    <Badge variant="secondary">{candidatos.length} a importar</Badge>
                    {comAviso.length > 0 && (
                      <Badge variant="outline">{comAviso.length} com campo descartado</Badge>
                    )}
                    {comErro.length > 0 && (
                      <Badge variant="destructive">{comErro.length} sem inscrição/nome</Badge>
                    )}
                    {repetidas.length > 0 && (
                      <Badge variant="outline">{repetidas.length} repetida(s) na planilha</Badge>
                    )}
                  </div>

                  {/* ⚠️ O aviso mais importante desta tela. O cargo compõe a chave
                      natural, então deixá-lo sem parear FUNDE num só registro todas as
                      inscrições da mesma pessoa em cargos diferentes — 396 inscritos no
                      arquivo de referência. É perda silenciosa: a importação termina em
                      verde e a lista fica menor do que a planilha, sem nada acusar. */}
                  {repetidas.length > 0 && (
                    <Alert variant={mapeamento.cargo === null ? "destructive" : "default"}>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>
                        {repetidas.length} linha(s) têm o mesmo nº de inscrição e o mesmo cargo
                      </AlertTitle>
                      <AlertDescription>
                        {mapeamento.cargo === null ? (
                          <>
                            O campo <strong>Cargo</strong> não foi pareado. Se a planilha traz a
                            mesma pessoa concorrendo a mais de um cargo, sem o cargo essas
                            inscrições viram uma só e {repetidas.length} some(m) da lista. Confira
                            se alguma coluna da planilha tem o cargo — no arquivo de referência ele
                            está na <strong>segunda coluna chamada NOME</strong>.
                          </>
                        ) : (
                          <>
                            Só a última ocorrência de cada uma será importada. Isso é o esperado
                            quando a planilha tem linhas corrigidas mais abaixo; o relatório final
                            lista todas.
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
                <Button
                  className="gap-2"
                  disabled={!mapeamentoCompleto(mapeamento) || candidatos.length === 0}
                  onClick={executarImportacao}
                >
                  Importar {candidatos.length} candidato(s)
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── PASSO 3 — em andamento ───────────────────────────────────────────── */}
        {passo === 3 && (
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

        {/* ── PASSO 4 — relatório ──────────────────────────────────────────────── */}
        {passo === 4 && (
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
