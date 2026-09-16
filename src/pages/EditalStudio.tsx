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
import { useEditalItens } from "@/hooks/useEditalItens";
import { useLinhasPorFonte } from "@/hooks/useQuadrosDoEdital";
import { analisarEdital, resumoDoLinter, type Achado } from "@/lib/edital-linter";
import { resolverReferencias, type CapituloResolvido } from "@/lib/edital-numeracao";
import {
  ancorasDoDocumento,
  mapaDeAncoras,
  numerarItens,
  resolverReferenciasDeItem,
  type ItemBruto,
  type QuadroFonte,
} from "@/lib/edital-itens";
import {
  ArtigosDoCapitulo,
  TextoFormatado,
  type Rascunhos,
} from "@/components/ArtigosDoCapitulo";
import { QuadroDoArtigo } from "@/components/QuadroDoArtigo";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, Loader2, AlertTriangle, CircleAlert, CheckCircle2, Eye } from "lucide-react";
import { QuadroDeCargos } from "@/components/QuadroDeCargos";
import { CronogramaEtapas } from "@/components/CronogramaEtapas";
import { AcoesAfirmativas } from "@/components/AcoesAfirmativas";
import { MatrizDaProva } from "@/components/MatrizDaProva";

/** Os artigos de um capítulo, já ordenados. */
type PorCapitulo = ReadonlyMap<string, ItemBruto[]>;

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
/**
 * O corpo do capítulo na PRÉVIA, montado dos registros de `edital_itens`.
 *
 * 🔴 É aqui que a numeração de artigo aparece — nunca no que a pessoa digita. Foi
 * medido: nos três editais reais as 95 referências cruzadas apontam TODAS para item, e
 * nenhuma para capítulo. Ver `src/lib/edital-itens.ts`.
 */
function CorpoDoCapitulo({
  capitulo,
  itens,
  documento,
  ancoras,
  editalId,
}: {
  capitulo: CapituloResolvido;
  itens: readonly ItemBruto[];
  documento: CapituloResolvido[];
  ancoras: Map<string, string>;
  editalId: string | undefined;
}) {
  const numerados = numerarItens(itens, capitulo.numero);
  if (numerados.length === 0) return <p className="text-sm text-muted-foreground">—</p>;

  // As duas resoluções de referência, em ordem: capítulo e depois item.
  const resolver = (t: string) => resolverReferenciasDeItem(resolverReferencias(t, documento), ancoras);

  return (
    <div className="space-y-1 text-sm text-muted-foreground">
      {numerados.map((l) => (
        <div key={l.id} style={{ paddingLeft: `${l.nivel * 1.25}rem` }}>
          <p className="whitespace-pre-wrap">
            {l.numero && (
              <span className="font-medium text-foreground">
                {l.nivel === 2 ? `${l.numero}) ` : `${l.numero}. `}
              </span>
            )}
            <TextoFormatado texto={resolver(l.texto ?? "")} />
          </p>
          {l.tipo === "quadro" && editalId && (
            <div className="my-2 overflow-x-auto rounded-md border">
              <QuadroDoArtigo fonte={l.quadro_fonte as QuadroFonte} editalId={editalId} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Escolhe o editor estruturado do capítulo, pela CHAVE — nunca por número nem posição,
 * que mudam conforme os condicionais entram e saem.
 *
 * ⚠️ Esta função é o ponto de crescimento do módulo: cada fatia acrescenta UMA linha
 * aqui e um componente próprio. Se ela começar a acumular lógica em vez de despacho, é
 * sinal de que a decisão está no lugar errado.
 */
function EditorDoCapitulo({ chave, editalId }: { chave: string; editalId: string | undefined }) {
  if (!editalId) return null;
  if (chave === "quadro_de_cargos") return <QuadroDeCargos editalId={editalId} />;
  if (chave === "prova_objetiva") return <MatrizDaProva editalId={editalId} />;
  // O cronograma sai como elemento pós-textual, junto dos anexos.
  if (chave === "anexos") return <CronogramaEtapas editalId={editalId} />;
  if (["vagas_pcd", "vagas_cotas_raciais", "condicoes_especiais_prova"].includes(chave)) {
    return <AcoesAfirmativas editalId={editalId} capitulo={chave} />;
  }
  return null;
}

/** O painel central: o capítulo selecionado, com o editor que ele pedir. */
/** O painel central: o capítulo selecionado e os artigos dele. */
function PainelDoCapitulo({
  capitulo,
  editalId,
  itens,
  rascunhos,
  setRascunhos,
  gravarCapitulo,
  artigos,
}: {
  capitulo: CapituloResolvido | undefined;
  editalId: string | undefined;
  itens: readonly ItemBruto[];
  rascunhos: Rascunhos;
  setRascunhos: (r: Rascunhos) => void;
  gravarCapitulo: (c: CapituloResolvido) => void;
  artigos: ReturnType<typeof useEditalItens>;
}) {
  if (!capitulo) return null;
  const selecionado = capitulo;
  const sujos = itens.filter((i) => rascunhos[i.id] !== undefined);

  const salvar = () => {
    artigos.gravar(
      sujos.map((i) => ({
        id: i.id,
        texto: rascunhos[i.id].texto,
        ancora: rascunhos[i.id].ancora,
      })),
    );
    setRascunhos({});
  };

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-4">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-lg font-semibold">
          {selecionado.numero !== null && `${selecionado.numero}. `}
          {selecionado.titulo}
        </h2>
        {/* 🔴 Salvar fica junto do "Incluir", no alto, a pedido do usuário em 16/09: são
            as duas ações do capítulo, e no rodapé o botão saía do campo de visão em
            capítulo longo — justamente quando há mais o que salvar. Com o artigo virando
            registro, ele passou a gravar TODOS os artigos alterados de uma vez; salvar
            no `blur` seria mais natural com 300 artigos, mas desfaria essa escolha. */}
        <div className="flex shrink-0 items-center gap-3">
          {sujos.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {sujos.length} artigo(s) não salvo(s)
            </span>
          )}
          <Button size="sm" onClick={salvar} disabled={artigos.isGravando || sujos.length === 0}>
            {artigos.isGravando ? "Salvando…" : "Salvar capítulo"}
          </Button>
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={selecionado.incluido}
              onCheckedChange={(incluido) => gravarCapitulo({ ...selecionado, incluido })}
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

      {/*
        🔵 Os capítulos com PARÂMETRO ESTRUTURADO (fatias 2 a 5). O capítulo deixa de ser
        texto livre e vira formulário, e a tabela do edital passa a ser gerada do dado —
        o artigo só a REFERENCIA, com `tipo = 'quadro'`.
        ⚠️ A escolha é pela CHAVE do capítulo, no catálogo — não por número nem por
        posição, que mudam conforme os condicionais entram e saem.
      */}
      <EditorDoCapitulo chave={selecionado.chave} editalId={editalId} />

      <ArtigosDoCapitulo
        itens={itens}
        numeroCapitulo={selecionado.numero}
        capituloChave={selecionado.chave}
        rascunhos={rascunhos}
        setRascunhos={setRascunhos}
        travado={artigos.isMexendo}
        onAdicionar={(tipo, fonte) =>
          artigos.adicionar({ capituloChave: selecionado.chave, tipo, quadroFonte: fonte })
        }
        onRemover={(id) => artigos.remover(id)}
        onMover={(id, delta) => artigos.mover({ id, delta })}
        onNivel={(id, delta) => artigos.mudarNivel({ id, delta })}
        onImportar={(texto) =>
          artigos.importarColagem({ capituloChave: selecionado.chave, texto })
        }
      />
    </div>
  );
}

/**
 * O resumo das pendências, como BOTÃO. Clicar abre a lista, e cada item leva ao capítulo.
 *
 * 🔵 Até 2026-09-16 isto era um painel fixo na terceira coluna. Virou botão a pedido do
 * usuário: o painel ocupava um terço da tela o tempo todo para mostrar, na maior parte
 * das vezes, "nenhuma pendência".
 *
 * ⚠️ O que NÃO pode mudar com isso: a contagem continua VISÍVEL sem clique. Esconder o
 * número atrás de um botão mudo faria a pendência desaparecer da vista — que é o oposto
 * do que este módulo existe para fazer.
 */
function BotaoDePendencias({
  achados,
  onIrPara,
}: {
  achados: Achado[];
  onIrPara: (chave: string) => void;
}) {
  const resumo = resumoDoLinter(achados);
  const limpo = resumo.erros === 0 && resumo.avisos === 0;

  if (limpo) {
    return (
      <span className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-1.5 text-sm text-green-800">
        <CheckCircle2 className="h-4 w-4" />
        Nenhuma pendência
      </span>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="gap-2">
          {resumo.erros > 0 && <Badge variant="destructive">{resumo.erros} erro(s)</Badge>}
          {resumo.avisos > 0 && (
            <Badge variant="outline" className="gap-1">
              <AlertTriangle className="h-3 w-3" />
              {resumo.avisos} aviso(s)
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[28rem] p-0">
        <ScrollArea className="max-h-[60vh]">
          <ul className="divide-y">
            {achados.map((a, i) => (
              <li key={`${a.regra}-${a.capitulo}-${i}`}>
                <button
                  type="button"
                  disabled={!a.capitulo}
                  onClick={() => a.capitulo && onIrPara(a.capitulo)}
                  className={`w-full px-3 py-2 text-left text-xs hover:bg-muted disabled:cursor-default ${
                    a.severidade === "erro" ? "text-destructive" : "text-amber-700"
                  }`}
                >
                  {a.mensagem}
                </button>
              </li>
            ))}
          </ul>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

/** A prévia do documento montado, numa gaveta lateral. */
function BotaoDePrevia({
  documento,
  porCapitulo,
  editalId,
}: {
  documento: CapituloResolvido[];
  porCapitulo: PorCapitulo;
  editalId: string | undefined;
}) {
  const ancoras = mapaDeAncoras(
    ancorasDoDocumento(
      documento.map((c) => ({
        chave: c.chave,
        numero: c.numero,
        incluido: c.incluido,
        itens: porCapitulo.get(c.chave) ?? [],
      })),
    ),
  );
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Eye className="h-4 w-4" />
          Ver prévia
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full p-0 sm:max-w-2xl">
        <SheetHeader className="border-b p-4">
          <SheetTitle>Prévia do edital</SheetTitle>
          {/* ⚠️ A descrição não é enfeite: `dialogos-acessibilidade.test.ts` exige uma em
              todo diálogo, e foi ela que pegou a ausência aqui. Leitor de tela anuncia o
              título e depois isto. */}
          <SheetDescription>
            O documento montado, com a numeração de capítulos e itens já resolvida. Só os
            capítulos incluídos aparecem.
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="h-[calc(100vh-5rem)]">
          <div className="space-y-4 p-4">
            {documento
              .filter((c) => c.incluido)
              .map((cap) => (
                <section key={cap.chave} className="space-y-1">
                  <h3 className="text-sm font-semibold uppercase">
                    {cap.numero !== null && `${cap.numero}. `}
                    {cap.titulo}
                  </h3>
                  <CorpoDoCapitulo
                    capitulo={cap}
                    itens={porCapitulo.get(cap.chave) ?? []}
                    documento={documento}
                    ancoras={ancoras}
                    editalId={editalId}
                  />
                </section>
              ))}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

export default function EditalStudio() {
  const { editalId } = useParams<{ editalId: string }>();
  const { edital, documento, isLoading, gravarCapitulo } = useEdital(editalId);
  const artigos = useEditalItens(editalId);
  const linhasPorFonte = useLinhasPorFonte(editalId);

  const [chaveSelecionada, setChaveSelecionada] = useState<string | null>(null);
  // Rascunho local por artigo: sem ele, cada tecla dispararia uma gravação.
  const [rascunhos, setRascunhos] = useState<Rascunhos>({});

  const achados = useMemo(
    () => analisarEdital({ documento, itens: artigos.itens, linhasPorFonte }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [documento, artigos.itens, JSON.stringify(linhasPorFonte)],
  );
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

  if (isLoading || artigos.isLoading) {
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
    // ⚠️ Descarta os rascunhos ao trocar de capítulo, como já fazia com o texto único.
    // Guardá-los entre capítulos daria a impressão de trabalho salvo que não está.
    setRascunhos({});
  };

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-4">
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
          {/*
            🔵 DUAS COLUNAS desde 2026-09-16, a pedido do usuário. O preview e o painel de
            pendências eram a terceira coluna, fixa — ocupavam um terço da tela o tempo
            todo para mostrar, na maior parte das vezes, "nenhuma pendência".

            ⚠️ O que NÃO mudou: a CONTAGEM de pendências continua visível sem clique, e o
            ícone de erro segue aparecendo na trilha, capítulo a capítulo. Esconder o
            número atrás de um botão mudo tiraria a pendência da vista, que é o oposto do
            que este módulo faz.
          */}
          <div className="ml-auto flex items-center gap-2">
            <BotaoDePendencias achados={achados} onIrPara={selecionar} />
            <BotaoDePrevia
              documento={documento}
              porCapitulo={artigos.porCapitulo}
              editalId={editalId}
            />
          </div>
        </div>

        <ResizablePanelGroup direction="horizontal" className="min-h-[70vh] rounded-lg border">
          {/* ── Esquerda: a trilha. É a MESMA lista da prévia. ────────────────── */}
          <ResizablePanel defaultSize={30} minSize={18}>
            <Trilha
              documento={documento}
              selecionada={selecionado?.chave}
              achadosPorCapitulo={achadosPorCapitulo}
              onSelecionar={selecionar}
            />
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* ── Direita: o capítulo selecionado ───────────────────────────────── */}
          <ResizablePanel defaultSize={70} minSize={40}>
            <PainelDoCapitulo
              capitulo={selecionado}
              editalId={editalId}
              itens={artigos.porCapitulo.get(selecionado?.chave ?? "") ?? []}
              rascunhos={rascunhos}
              setRascunhos={setRascunhos}
              gravarCapitulo={gravarCapitulo}
              artigos={artigos}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </Layout>
  );
}
