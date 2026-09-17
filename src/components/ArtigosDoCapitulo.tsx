/**
 * A lista de ARTIGOS de um capítulo — um input por artigo.
 *
 * 🔴 **O número à esquerda é calculado e não se edita.** É o invariante central do
 * módulo em escala de artigo: inserir, apagar ou mover um renumera todos abaixo e
 * atualiza toda referência que aponte para eles. O Edital 002 publicado carrega o
 * resíduo de numerar à mão — a linha solta "10. e seus subitens" dentro do capítulo 7.
 *
 * ⚠️ **Por que botões e não arrastar.** Mudar de NÍVEL por arrasto é a parte difícil, e
 * a memória deste repo registra 4 armadilhas silenciosas no @dnd-kit 6.3.1. Quatro
 * botões com `aria-label` resolvem o mesmo e funcionam pelo teclado.
 *
 * ⚠️ **Este arquivo mora fora de `EditalStudio.tsx` de propósito:** a página já passou de
 * 400 linhas e foi onde a complexidade do lint subiu quatro vezes nesta v3.
 */
import { useState } from "react";
import {
  numerarItens,
  QUADRO_FONTES,
  type ItemBruto,
  type QuadroFonte,
} from "@/lib/edital-itens";
import { segmentarNegrito } from "@/lib/edital-texto";
import type { ArtigoEditado } from "@/hooks/useEditalItens";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowDown,
  ArrowUp,
  ClipboardPaste,
  Indent,
  Outdent,
  Plus,
  Table2,
  Trash2,
} from "lucide-react";

/** Rascunho local: sem ele, cada tecla dispararia uma gravação. */
export type Rascunhos = Record<string, { texto: string; ancora: string }>;

/** O que o artigo mostra à esquerda: `7.1`, `a)` ou nada. */
function Marcador({ numero, nivel }: { numero: string; nivel: number }) {
  if (!numero) return <span className="w-14 shrink-0" />;
  return (
    <span className="w-14 shrink-0 pt-2 text-right text-sm font-medium tabular-nums text-foreground">
      {nivel === 2 ? `${numero})` : `${numero}.`}
    </span>
  );
}

/** O texto como sairá no documento — só `**negrito**`, nada além. */
export function TextoFormatado({ texto }: { texto: string }) {
  return (
    <>
      {segmentarNegrito(texto).map((s, i) =>
        s.negrito ? <strong key={i}>{s.texto}</strong> : <span key={i}>{s.texto}</span>,
      )}
    </>
  );
}

/** O conteúdo editável: legenda + fonte no quadro, texto corrido no resto. */
function CorpoDoArtigo({
  item,
  texto,
  numero,
  onMudar,
}: {
  item: ItemBruto;
  texto: string;
  numero: string;
  onMudar: (campo: "texto" | "ancora", valor: string) => void;
}) {
  if (item.tipo === "quadro") {
    const fonte = QUADRO_FONTES.find((f) => f.fonte === item.quadro_fonte);
    return (
      <>
        <Input
          value={texto}
          onChange={(e) => onMudar("texto", e.target.value)}
          placeholder="Legenda do quadro (ex.: QUADRO I: DOS CARGOS…)"
          aria-label="Legenda do quadro"
        />
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Table2 className="h-3.5 w-3.5" />
          Tabela gerada de: <strong>{fonte?.rotulo ?? item.quadro_fonte}</strong>
        </p>
      </>
    );
  }

  return (
    <Textarea
      value={texto}
      onChange={(e) => onMudar("texto", e.target.value)}
      rows={2}
      className="min-h-[2.5rem] resize-y"
      placeholder={item.tipo === "prosa" ? "Parágrafo sem número" : "Texto do artigo"}
      aria-label={numero ? `Texto do item ${numero}` : "Texto do parágrafo"}
    />
  );
}

/** Mover, aninhar e remover. Tudo com `aria-label`: é o teclado que substitui o arrasto. */
function BotoesDoArtigo({
  nivel,
  primeiro,
  ultimo,
  travado,
  onMover,
  onNivel,
  onRemover,
}: {
  nivel: number;
  primeiro: boolean;
  ultimo: boolean;
  travado: boolean;
  onMover: (delta: -1 | 1) => void;
  onNivel: (delta: -1 | 1) => void;
  onRemover: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-0.5 pt-1">
      <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Subir artigo"
              disabled={primeiro || travado} onClick={() => onMover(-1)}>
        <ArrowUp className="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Descer artigo"
              disabled={ultimo || travado} onClick={() => onMover(1)}>
        <ArrowDown className="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Avançar um nível"
              disabled={nivel >= 2 || travado} onClick={() => onNivel(1)}>
        <Indent className="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Recuar um nível"
              disabled={nivel <= 0 || travado} onClick={() => onNivel(-1)}>
        <Outdent className="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"
              aria-label="Remover artigo" disabled={travado} onClick={onRemover}>
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function LinhaDeArtigo({
  item,
  numero,
  primeiro,
  ultimo,
  rascunho,
  onMudar,
  onMover,
  onNivel,
  onRemover,
  travado,
}: {
  item: ItemBruto;
  numero: string;
  primeiro: boolean;
  ultimo: boolean;
  rascunho: { texto: string; ancora: string } | undefined;
  onMudar: (campo: "texto" | "ancora", valor: string) => void;
  onMover: (delta: -1 | 1) => void;
  onNivel: (delta: -1 | 1) => void;
  onRemover: () => void;
  travado: boolean;
}) {
  const ancora = rascunho?.ancora ?? item.ancora ?? "";

  return (
    <li
      className="flex items-start gap-2 rounded-md border border-transparent px-1 py-1 hover:border-border"
      style={{ marginLeft: `${item.nivel * 1.5}rem` }}
    >
      <Marcador numero={numero} nivel={item.nivel} />

      <div className="min-w-0 flex-1 space-y-1">
        <CorpoDoArtigo
          item={item}
          numero={numero}
          texto={rascunho?.texto ?? item.texto ?? ""}
          onMudar={onMudar}
        />

        <div className="flex items-center gap-2">
          <Input
            value={ancora}
            onChange={(e) => onMudar("ancora", e.target.value)}
            placeholder="âncora (opcional)"
            aria-label="Âncora para referência cruzada"
            className="h-7 w-48 text-xs"
          />
          {ancora && (
            <span className="text-xs text-muted-foreground">
              referencie com <code>{`{{item:${ancora}}}`}</code>
            </span>
          )}
          {rascunho !== undefined && <span className="text-xs text-muted-foreground">não salvo</span>}
        </div>
      </div>

      <BotoesDoArtigo
        nivel={item.nivel}
        primeiro={primeiro}
        ultimo={ultimo}
        travado={travado}
        onMover={onMover}
        onNivel={onNivel}
        onRemover={onRemover}
      />
    </li>
  );
}

/** O diálogo de colagem — sem ele, montar um edital real é clicar 300 vezes. */
function BotaoDeColagem({ onImportar }: { onImportar: (texto: string) => void }) {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState("");

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <ClipboardPaste className="mr-1.5 h-4 w-4" />
          Colar vários
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Colar vários artigos</DialogTitle>
          <DialogDescription>
            Um artigo por linha, começando com <code>-</code>. Dois espaços de recuo criam
            um subitem, quatro criam uma alínea. <strong>Não digite os números</strong> — o
            sistema os calcula.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={12}
          className="font-mono text-xs"
          aria-label="Artigos a colar"
          placeholder={"- Primeiro artigo.\n- Segundo artigo.\n  - Subitem do segundo.\n    - alínea\n- {#laudo} Artigo com âncora."}
        />
        <DialogFooter>
          <Button
            disabled={texto.trim() === ""}
            onClick={() => {
              onImportar(texto);
              setTexto("");
              setAberto(false);
            }}
          >
            Importar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** O select de fonte do quadro — o domínio fechado, espelhando a CHECK do banco. */
function BotaoDeQuadro({ onAdicionar }: { onAdicionar: (f: QuadroFonte) => void }) {
  const [fonte, setFonte] = useState<string>("");
  return (
    <div className="flex items-center gap-1">
      <Select value={fonte} onValueChange={setFonte}>
        <SelectTrigger className="h-9 w-64" aria-label="Fonte do quadro">
          <SelectValue placeholder="+ Quadro (escolha a fonte)" />
        </SelectTrigger>
        <SelectContent>
          {QUADRO_FONTES.map((f) => (
            <SelectItem key={f.fonte} value={f.fonte}>
              {f.rotulo}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        size="sm"
        disabled={!fonte}
        onClick={() => {
          onAdicionar(fonte as QuadroFonte);
          setFonte("");
        }}
      >
        <Table2 className="mr-1.5 h-4 w-4" />
        Inserir
      </Button>
    </div>
  );
}

export interface ArtigosDoCapituloProps {
  itens: readonly ItemBruto[];
  numeroCapitulo: number | null;
  capituloChave: string;
  rascunhos: Rascunhos;
  setRascunhos: (r: Rascunhos) => void;
  onAdicionar: (tipo: "item" | "prosa" | "quadro", fonte?: QuadroFonte) => void;
  onRemover: (id: string) => void;
  onMover: (id: string, delta: -1 | 1) => void;
  onNivel: (id: string, delta: -1 | 1) => void;
  onImportar: (texto: string) => void;
  travado: boolean;
}

export function ArtigosDoCapitulo({
  itens,
  numeroCapitulo,
  rascunhos,
  setRascunhos,
  onAdicionar,
  onRemover,
  onMover,
  onNivel,
  onImportar,
  travado,
}: ArtigosDoCapituloProps) {
  const numerados = numerarItens(itens, numeroCapitulo);

  const mudar = (item: ItemBruto, campo: "texto" | "ancora", valor: string) => {
    const atual = rascunhos[item.id] ?? { texto: item.texto ?? "", ancora: item.ancora ?? "" };
    setRascunhos({ ...rascunhos, [item.id]: { ...atual, [campo]: valor } });
  };

  return (
    <div className="space-y-3">
      {numerados.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          Este capítulo ainda não tem nenhum artigo.
        </p>
      ) : (
        <ul className="space-y-1">
          {numerados.map((item, i) => (
            <LinhaDeArtigo
              key={item.id}
              item={item}
              numero={item.numero}
              primeiro={i === 0}
              ultimo={i === numerados.length - 1}
              rascunho={rascunhos[item.id]}
              onMudar={(campo, valor) => mudar(item, campo, valor)}
              onMover={(delta) => onMover(item.id, delta)}
              onNivel={(delta) => onNivel(item.id, delta)}
              onRemover={() => onRemover(item.id)}
              travado={travado}
            />
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        <Button variant="outline" size="sm" disabled={travado} onClick={() => onAdicionar("item")}>
          <Plus className="mr-1.5 h-4 w-4" />
          Artigo
        </Button>
        <Button variant="outline" size="sm" disabled={travado} onClick={() => onAdicionar("prosa")}>
          <Plus className="mr-1.5 h-4 w-4" />
          Parágrafo sem número
        </Button>
        <BotaoDeQuadro onAdicionar={(f) => onAdicionar("quadro", f)} />
        <BotaoDeColagem onImportar={onImportar} />
      </div>
    </div>
  );
}
