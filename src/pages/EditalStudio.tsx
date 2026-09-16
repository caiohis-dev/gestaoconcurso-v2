/**
 * Edital Studio — a tela de autoria do edital.
 *
 * 🔴 **As três colunas são PROJEÇÕES DA MESMA LISTA de capítulos**, e isso não é estilo:
 * é o ponto central da fatia. `CandidatosImportar.tsx:83` avisa, sobre o stepper feito à
 * mão dele: "adicionar um passo precisa tocar TRÊS lugares: a trilha, os blocos
 * `{passo === n}` e as transições. Errar um deixa um passo inalcançável, sem erro nenhum
 * na tela." Com 19 elementos que entram e saem por parâmetro, repetir aquilo seria o
 * mesmo defeito multiplicado.
 *
 * Aqui, acrescentar capítulo é UMA entrada em `src/lib/edital-capitulos.ts`. A trilha, o
 * formulário e o preview acompanham sozinhos.
 *
 * 🔴 **A numeração exibida é sempre calculada.** Ver `src/lib/edital-numeracao.ts`.
 */
import { useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import Layout from "@/components/Layout";
import { useEdital } from "@/hooks/useEdital";
import { analisarEdital, resumoDoLinter, type Achado } from "@/lib/edital-linter";
import { resolverReferencias, type CapituloResolvido } from "@/lib/edital-numeracao";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, Loader2, AlertTriangle, CircleAlert, CheckCircle2 } from "lucide-react";

/** O número como sai no documento; capítulo sem número mostra um traço. */
function Numero({ capitulo }: { capitulo: CapituloResolvido }) {
  return (
    <span className="tabular-nums text-muted-foreground w-6 shrink-0 text-right">
      {capitulo.numero ?? "—"}
    </span>
  );
}

/**
 * A trilha da esquerda. É a MESMA lista do preview — só muda a projeção.
 * Capítulo desligado aparece esmaecido, não some: desligar é reversível e quem redige
 * precisa achá-lo para religar.
 */
function Trilha({
  documento,
  selecionada,
  achadosPorCapitulo,
  onSelecionar,
}: {
  documento: CapituloResolvido[];
  selecionada: string | undefined;
  achadosPorCapitulo: Map<string, Achado[]>;
  onSelecionar: (chave: string) => void;
}) {
  return (
    <ScrollArea className="h-full">
      <ul className="p-2">
        {documento.map((cap) => {
          const temErro = (achadosPorCapitulo.get(cap.chave) ?? []).some((p) => p.severidade === "erro");
          return (
            <li key={cap.chave}>
              <button
                type="button"
                onClick={() => onSelecionar(cap.chave)}
                aria-current={selecionada === cap.chave}
                className={`flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted ${
                  selecionada === cap.chave ? "bg-muted font-medium" : ""
                } ${cap.incluido ? "" : "opacity-50"}`}
              >
                <Numero capitulo={cap} />
                <span className="flex-1">{cap.titulo}</span>
                {temErro && <CircleAlert className="h-4 w-4 shrink-0 text-destructive" />}
              </button>
            </li>
          );
        })}
      </ul>
    </ScrollArea>
  );
}

/** Preview do documento e painel do linter — a terceira projeção da mesma lista. */
function PreviewELinter({
  documento,
  achados,
}: {
  documento: CapituloResolvido[];
  achados: Achado[];
}) {
  const resumo = resumoDoLinter(achados);
  const limpo = resumo.erros === 0 && resumo.avisos === 0;
  return (
    <div className="flex h-full flex-col">
      <div className="border-b p-3">
        <div className="flex items-center gap-2 text-sm">
          {limpo ? (
            <>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span>Nenhuma pendência</span>
            </>
          ) : (
            <>
              {resumo.erros > 0 && <Badge variant="destructive">{resumo.erros} erro(s)</Badge>}
              {resumo.avisos > 0 && (
                <Badge variant="outline" className="gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {resumo.avisos} aviso(s)
                </Badge>
              )}
            </>
          )}
        </div>
        {achados.length > 0 && (
          <ul className="mt-2 space-y-1 text-xs">
            {achados.map((a, i) => (
              <li
                key={`${a.regra}-${a.capitulo}-${i}`}
                className={a.severidade === "erro" ? "text-destructive" : "text-amber-700"}
              >
                {a.mensagem}
              </li>
            ))}
          </ul>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-4 p-4">
          {documento
            .filter((c) => c.incluido)
            .map((cap) => (
              <section key={cap.chave}>
                <h3 className="text-sm font-semibold uppercase">
                  {cap.numero !== null && `${cap.numero}. `}
                  {cap.titulo}
                </h3>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {/* A referência cruzada vira número AQUI, na renderização. */}
                  {resolverReferencias(cap.texto, documento) || "—"}
                </p>
              </section>
            ))}
        </div>
      </ScrollArea>
    </div>
  );
}

export default function EditalStudio() {
  const { editalId } = useParams<{ editalId: string }>();
  const { edital, documento, isLoading, gravarCapitulo, isGravando } = useEdital(editalId);

  const [chaveSelecionada, setChaveSelecionada] = useState<string | null>(null);
  // Rascunho local do texto: sem ele, cada tecla dispararia uma gravação.
  const [rascunho, setRascunho] = useState<string | null>(null);

  const achados = useMemo(() => analisarEdital({ documento }), [documento]);
  const achadosPorCapitulo = useMemo(() => {
    const m = new Map<string, Achado[]>();
    for (const a of achados) {
      if (!a.capitulo) continue;
      const lista = m.get(a.capitulo) ?? [];
      lista.push(a);
      m.set(a.capitulo, lista);
    }
    return m;
  }, [achados]);

  const selecionado = documento.find((c) => c.chave === chaveSelecionada) ?? documento[0];

  if (isLoading) {
    return (
      <Layout>
        <div className="flex h-[60vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  const selecionar = (chave: string) => {
    setChaveSelecionada(chave);
    setRascunho(null);
  };

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/editais" aria-label="Voltar para Editais">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{edital?.nome}</h1>
            <p className="text-muted-foreground">
              {edital?.numero_edital ? `Edital nº ${edital.numero_edital}` : "Número do edital não informado"}
            </p>
          </div>
        </div>

        <ResizablePanelGroup direction="horizontal" className="min-h-[70vh] rounded-lg border">
          {/* ── Esquerda: a trilha. É a MESMA lista do preview. ───────────────── */}
          <ResizablePanel defaultSize={26} minSize={18}>
            <Trilha
              documento={documento}
              selecionada={selecionado?.chave}
              achadosPorCapitulo={achadosPorCapitulo}
              onSelecionar={selecionar}
            />
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* ── Centro: o capítulo selecionado ────────────────────────────────── */}
          <ResizablePanel defaultSize={42} minSize={25}>
            {selecionado && (
              <div className="flex h-full flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-lg font-semibold">
                    {selecionado.numero !== null && `${selecionado.numero}. `}
                    {selecionado.titulo}
                  </h2>
                  {/* Salvar fica junto do "Incluir", no alto: são as duas ações do
                      capítulo, e no rodapé o botão saía do campo de visão em capítulo
                      longo — justamente quando há mais o que salvar. */}
                  <div className="flex shrink-0 items-center gap-3">
                    {rascunho !== null && (
                      <span className="text-xs text-muted-foreground">alterações não salvas</span>
                    )}
                    <Button
                      size="sm"
                      onClick={() => {
                        gravarCapitulo({ ...selecionado, texto: rascunho ?? selecionado.texto });
                        setRascunho(null);
                      }}
                      disabled={isGravando || rascunho === null}
                    >
                      {isGravando ? "Salvando…" : "Salvar capítulo"}
                    </Button>
                    <label className="flex items-center gap-2 text-sm">
                      <Switch
                        checked={selecionado.incluido}
                        onCheckedChange={(incluido) =>
                          gravarCapitulo({ ...selecionado, incluido, texto: rascunho ?? selecionado.texto })
                        }
                        aria-label={`Incluir "${selecionado.titulo}" no edital`}
                      />
                      Incluir
                    </label>
                  </div>
                </div>

                {!selecionado.numerado && (
                  <p className="text-xs text-muted-foreground">
                    Elemento {selecionado.chave === "preambulo" ? "pré-textual" : "pós-textual"}: entra no
                    documento e não recebe número.
                  </p>
                )}

                <Textarea
                  value={rascunho ?? selecionado.texto}
                  onChange={(e) => setRascunho(e.target.value)}
                  placeholder="Redação do capítulo. Para referenciar outro capítulo, escreva {{cap:chave}} — o número é resolvido sozinho."
                  className="min-h-[320px] flex-1 font-mono text-sm"
                />
              </div>
            )}
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* ── Direita: preview + linter ─────────────────────────────────────── */}
          <ResizablePanel defaultSize={32} minSize={20}>
            <PreviewELinter documento={documento} achados={achados} />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </Layout>
  );
}
