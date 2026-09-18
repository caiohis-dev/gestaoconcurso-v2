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
import { useParams, Link, useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import { useEdital } from "@/hooks/useEdital";
import { useEditalItens } from "@/hooks/useEditalItens";
import { useLinhasPorFonte } from "@/hooks/useQuadrosDoEdital";
import { useCamposDoEdital } from "@/hooks/useCamposDoEdital";
import { useAvisarAoSair } from "@/hooks/useAvisarAoSair";
import { analisarEdital, resumoDoLinter, type Achado } from "@/lib/edital-linter";
import { resolverReferencias, type CapituloResolvido } from "@/lib/edital-numeracao";
import { resolverCampos } from "@/lib/edital-campos";
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
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, Loader2, AlertTriangle, CircleAlert, CheckCircle2, Eye } from "lucide-react";
import { QuadroDeCargos } from "@/components/QuadroDeCargos";
import { CronogramaEtapas } from "@/components/CronogramaEtapas";
import { AcoesAfirmativas } from "@/components/AcoesAfirmativas";
import { MatrizDaProva } from "@/components/MatrizDaProva";
import { QuadroDeTitulos } from "@/components/QuadroDeTitulos";
import { TerritorialidadeELotacao } from "@/components/TerritorialidadeELotacao";
import { ChecklistDeInvestidura } from "@/components/ChecklistDeInvestidura";
import { InscricaoTaxasEIsencao } from "@/components/InscricaoTaxasEIsencao";
import { ConteudoProgramatico } from "@/components/ConteudoProgramatico";
import { CriteriosDeDesempate } from "@/components/CriteriosDeDesempate";
import { DadosDoEdital } from "@/components/DadosDoEdital";

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
  valores,
  editalId,
}: {
  capitulo: CapituloResolvido;
  itens: readonly ItemBruto[];
  documento: CapituloResolvido[];
  ancoras: Map<string, string>;
  valores: ReadonlyMap<string, string> | undefined;
  editalId: string | undefined;
}) {
  const numerados = numerarItens(itens, capitulo.numero);
  if (numerados.length === 0) return <p className="text-sm text-muted-foreground">—</p>;

  // As TRÊS resoluções, em ordem: capítulo, item e por último o valor.
  //
  // ⚠️ A ordem não é arbitrária. `{{campo:}}` vem por último porque o VALOR é a única das
  // três coisas que vem de dado digitado por alguém — um valor que contivesse `{{` viraria
  // referência se fosse resolvido antes. Resolvendo-o no fim, não há esse caminho.
  const resolver = (t: string) =>
    resolverCampos(
      resolverReferenciasDeItem(resolverReferencias(t, documento), ancoras),
      valores ?? new Map(),
    );

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
  if (chave === "preambulo") return <DadosDoEdital editalId={editalId} />;
  if (chave === "quadro_de_cargos") return <QuadroDeCargos editalId={editalId} />;
  if (chave === "prova_objetiva") return <MatrizDaProva editalId={editalId} />;
  if (chave === "prova_de_titulos") return <QuadroDeTitulos editalId={editalId} />;
  if (chave === "distribuicao_geografica") return <TerritorialidadeELotacao editalId={editalId} />;
  if (chave === "investidura_e_posse") return <ChecklistDeInvestidura editalId={editalId} />;
  if (chave === "desempate_e_resultado") return <CriteriosDeDesempate editalId={editalId} />;
  if (["inscricao_e_pagamento", "isencao_taxa"].includes(chave)) {
    return <InscricaoTaxasEIsencao editalId={editalId} />;
  }
  // Os pós-textuais: o cronograma e o anexo de conteúdo programático saem juntos, que é
  // como os três editais os publicam — depois do corpo, sem número de capítulo.
  if (chave === "anexos") {
    return (
      <div className="space-y-4">
        <CronogramaEtapas editalId={editalId} />
        <ConteudoProgramatico editalId={editalId} />
      </div>
    );
  }
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
  quantidadeSuja,
  onSalvar,
}: {
  capitulo: CapituloResolvido | undefined;
  editalId: string | undefined;
  itens: readonly ItemBruto[];
  rascunhos: Rascunhos;
  setRascunhos: (r: Rascunhos) => void;
  gravarCapitulo: (c: CapituloResolvido) => void;
  artigos: ReturnType<typeof useEditalItens>;
  quantidadeSuja: number;
  /**
   * ⚠️ Vem de fora, e isso é o ponto: o botão e o diálogo de troca de capítulo chamam a
   * MESMA função. Duas implementações de "gravar os rascunhos" divergiriam no dia em que
   * uma fosse corrigida — o mesmo motivo que fez `parsearCapitulo` parar de numerar.
   */
  onSalvar: () => void;
}) {
  if (!capitulo) return null;
  const selecionado = capitulo;

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
            no `blur` seria mais natural com 300 artigos, mas desfaria essa escolha.

            🔵 **E ele NÃO é mais a única defesa contra a perda (2026-09-18).** Trocar de
            capítulo com rascunho sujo descartava o texto em silêncio — o contador abaixo
            avisava, e nada impedia. Hoje a troca pergunta. O botão continua sendo o único
            caminho do texto do artigo até o banco: os painéis estruturados gravam no
            `blur`, os artigos não. */}
        <div className="flex shrink-0 items-center gap-3">
          {quantidadeSuja > 0 && (
            <span className="text-xs text-muted-foreground">
              {quantidadeSuja} artigo(s) não salvo(s)
            </span>
          )}
          <Button size="sm" onClick={onSalvar} disabled={artigos.isGravando || quantidadeSuja === 0}>
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
  // Sem prop drilling: é o mesmo cache do React Query que o painel do capítulo já usa.
  const { valores } = useCamposDoEdital(editalId);
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
                    valores={valores}
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

/**
 * Os rascunhos dos artigos do capítulo aberto, e a guarda contra perdê-los.
 *
 * 🔴 **Por que é um hook e não código solto no componente.** Com estas branches dentro,
 * `EditalStudio` passou de 15 de complexidade no lint (baseline 111). Extrair é a saída
 * deste repo — elevar o baseline não é. `edital-linter.ts` já fez a mesma coisa duas vezes.
 *
 * 🔴 **`salvar` tem UMA implementação, com DOIS chamadores:** o botão "Salvar capítulo" e o
 * diálogo de troca. Duas cópias divergiriam no dia em que uma fosse corrigida.
 */
/**
 * Para onde se quer ir enquanto há rascunho sujo. `sair` é deixar a tela inteira.
 *
 * ⚠️ Um destino TIPADO, não uma string de chave com um valor especial. A versão com
 * sentinela (`"__sair__"`) colidiria com chave de capítulo no dia em que o catálogo
 * ganhasse uma parecida, e o compilador não diria nada.
 */
type DestinoPendente = { tipo: "capitulo"; chave: string } | { tipo: "sair" };

function useRascunhosDoCapitulo(
  artigos: ReturnType<typeof useEditalItens>,
  documento: readonly CapituloResolvido[],
  chaveAberta: string | undefined,
  aoTrocar: (chave: string) => void,
  aoSair: () => void,
) {
  // Rascunho local por artigo: sem ele, cada tecla dispararia uma gravação.
  const [rascunhos, setRascunhos] = useState<Rascunhos>({});
  const [pendente, setPendente] = useState<DestinoPendente | null>(null);

  const itensAbertos = artigos.porCapitulo.get(chaveAberta ?? "") ?? [];
  const sujos = itensAbertos.filter((i) => rascunhos[i.id] !== undefined);

  // 🔴 A TERCEIRA saída: fechar a aba ou recarregar. Ela não passa pelo React em momento
  // nenhum — só o navegador pode interromper, e só por `beforeunload`. Passa BOOLEANO, não a
  // contagem: com a contagem, cada tecla digitada num artigo novo re-registraria o listener.
  useAvisarAoSair(sujos.length > 0);

  const salvar = () => {
    if (sujos.length > 0) {
      artigos.gravar(
        sujos.map((i) => ({
          id: i.id,
          texto: rascunhos[i.id].texto,
          ancora: rascunhos[i.id].ancora,
        })),
      );
    }
    setRascunhos({});
  };

  /**
   * 🔴 SAIR do capítulo com rascunho sujo PERGUNTA, não descarta.
   *
   * ⚠️ Até 2026-09-18 a troca de capítulo fazia `setRascunhos({})` direto, com o comentário
   * *"guardá-los entre capítulos daria a impressão de trabalho salvo que não está"* — o
   * raciocínio estava certo e a conclusão, errada: quem digitava num artigo, clicava noutro
   * capítulo na trilha e voltava, **perdia o texto sem aviso nenhum**. Perda silenciosa é o
   * formato de defeito que este repo mais teme, e o contador "N não salvo(s)" anunciava o
   * estado, nunca a consequência.
   *
   * A alternativa de gravar no `blur` do artigo foi preterida: desfaria a escolha de 16/09
   * (um só save por capítulo, pensado para 300 artigos) e tiraria o "descartar sem salvar".
   *
   * 🔴 **São TRÊS as saídas do capítulo, e as três passam por aqui** — foi por isso que a
   * primeira versão desta guarda não bastou: ela cobria as duas primeiras, e a terceira
   * perdia o texto do mesmo jeito.
   *
   * | saída | por onde |
   * |---|---|
   * | outro capítulo | a trilha da esquerda |
   * | outro capítulo | o "ir para" do painel de pendências |
   * | a tela inteira | o "Voltar para Editais" do cabeçalho |
   * | a aba inteira | fechar ou recarregar — por `useAvisarAoSair`, ver acima |
   *
   * ⚠️ As três primeiras são navegação do app e ganham diálogo próprio, que **nomeia** o que
   * está em risco. A quarta só pode ser interrompida pelo navegador, com texto que ele
   * escolhe e não se customiza desde ~2017.
   */
  const pedir = (destino: DestinoPendente) => {
    if (destino.tipo === "capitulo" && destino.chave === chaveAberta) return false;
    if (sujos.length > 0) {
      setPendente(destino);
      return true;
    }
    if (destino.tipo === "sair") aoSair();
    else aoTrocar(destino.chave);
    return false;
  };

  const resolver = (acao: "salvar" | "descartar") => {
    if (acao === "salvar") salvar();
    else setRascunhos({});
    if (pendente?.tipo === "sair") aoSair();
    else if (pendente) aoTrocar(pendente.chave);
    setPendente(null);
  };

  // Nomeia o destino numa frase que serve aos dois casos: "ir para a lista de editais" e
  // "ir para o capítulo «Da Prova Objetiva»".
  const rotuloDoDestino =
    pendente?.tipo === "sair"
      ? "a lista de editais"
      : `o capítulo \u201C${documento.find((c) => c.chave === pendente?.chave)?.titulo ?? "escolhido"}\u201D`;

  return {
    rascunhos,
    setRascunhos,
    quantidadeSuja: sujos.length,
    salvar,
    /** Devolve `true` quando ABRIU o diálogo — quem chama usa isso para barrar a navegação. */
    pedirTroca: (chave: string) => pedir({ tipo: "capitulo", chave }),
    pedirSaida: () => pedir({ tipo: "sair" }),
    pendente,
    fecharTroca: () => setPendente(null),
    resolverTroca: resolver,
    rotuloDoDestino,
  };
}

export default function EditalStudio() {
  const { editalId } = useParams<{ editalId: string }>();
  const navegar = useNavigate();
  const { edital, documento, isLoading, gravarCapitulo } = useEdital(editalId);
  const artigos = useEditalItens(editalId);
  const linhasPorFonte = useLinhasPorFonte(editalId);
  // ⚠️ `valores` é `undefined` enquanto carrega, e é assim que tem de chegar ao linter: a
  // regra `campo-sem-valor` não roda sem o mapa, então o painel não pisca dezenas de erros
  // no primeiro frame. Ver o cabeçalho de `useCamposDoEdital`.
  const { valores: valoresDeCampo } = useCamposDoEdital(editalId);

  const [chaveSelecionada, setChaveSelecionada] = useState<string | null>(null);

  const achados = useMemo(
    () => analisarEdital({ documento, itens: artigos.itens, linhasPorFonte, valoresDeCampo }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [documento, artigos.itens, JSON.stringify(linhasPorFonte), valoresDeCampo],
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
  const draft = useRascunhosDoCapitulo(artigos, documento, selecionado?.chave, setChaveSelecionada, () =>
    navegar("/editais"),
  );

  if (isLoading || artigos.isLoading) {
    return (
      <Layout>
        <div className="flex h-[60vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-4">
          {/*
            ⚠️ Continua sendo um `Link` de verdade — não virou `<button>`. Assim o
            botão do meio, o "abrir em nova aba" e o foco de teclado seguem funcionando; a
            guarda só intercepta o clique comum, e apenas quando há rascunho sujo.
          */}
          <Button variant="ghost" size="icon" asChild>
            <Link
              to="/editais"
              aria-label="Voltar para Editais"
              onClick={(e) => {
                if (draft.pedirSaida()) e.preventDefault();
              }}
            >
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
            <BotaoDePendencias achados={achados} onIrPara={draft.pedirTroca} />
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
              onSelecionar={draft.pedirTroca}
            />
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* ── Direita: o capítulo selecionado ───────────────────────────────── */}
          <ResizablePanel defaultSize={70} minSize={40}>
            <PainelDoCapitulo
              capitulo={selecionado}
              editalId={editalId}
              itens={artigos.porCapitulo.get(selecionado?.chave ?? "") ?? []}
              rascunhos={draft.rascunhos}
              setRascunhos={draft.setRascunhos}
              gravarCapitulo={gravarCapitulo}
              artigos={artigos}
              quantidadeSuja={draft.quantidadeSuja}
              onSalvar={draft.salvar}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      {/*
        ⚠️ TRÊS saídas, e nenhuma delas é a destrutiva por omissão. "Cancelar" fecha e não
        troca de capítulo, então quem clicou por engano na trilha não perde nada nem precisa
        decidir. Descartar é a única que perde texto, e está nomeada.
      */}
      <AlertDialog open={!!draft.pendente} onOpenChange={(aberto) => !aberto && draft.fecharTroca()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Há artigo não salvo</AlertDialogTitle>
            <AlertDialogDescription>
              {draft.quantidadeSuja} artigo(s) de &ldquo;{selecionado?.titulo}&rdquo; foram alterados e
              ainda não estão no banco. Salvar antes de ir para {draft.rotuloDoDestino}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button variant="outline" onClick={() => draft.resolverTroca("descartar")}>
              Descartar e continuar
            </Button>
            <AlertDialogAction onClick={() => draft.resolverTroca("salvar")}>
              Salvar e continuar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
