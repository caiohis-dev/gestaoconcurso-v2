/**
 * O botão "Exportar" do Studio — o arquivo `.md` do edital, atrás do PORTÃO.
 *
 * 🔵 Fatia 12, etapa 4 (2026-11-16). O portão é `avaliarExportacao`
 * (`src/lib/edital-exportacao.ts`); aqui só se desenha o estado que ele devolve e se
 * guarda QUAIS pendências a pessoa confirmou.
 *
 * 🔴 **Não existe "marcar todas".** A decisão D-P1 é liberar com uma confirmação que nomeie
 * CADA pendência. Uma caixa por pendência, com o texto dela ao lado, é isso; um botão que
 * marcasse todas seria a confirmação em bloco que a decisão recusou.
 *
 * ⚠️ As confirmações valem enquanto o diálogo está aberto: fechar zera. Uma confirmação
 * guardada de ontem cobriria uma pendência que hoje pode significar outra coisa.
 */
import { useState } from "react";
import { useDocumentoDoEdital } from "@/hooks/useDocumentoDoEdital";
import { useConsultasComErro } from "@/hooks/useConsultasComErro";
import { documentoEmMarkdown } from "@/lib/edital-markdown";
import { avaliarExportacao, nomeDoArquivo, type EstadoDaExportacao } from "@/lib/edital-exportacao";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CheckCircle2, CircleAlert, Download, Loader2 } from "lucide-react";

function baixarTexto(nome: string, conteudo: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: "text/markdown;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function Recusa({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div role="alert" className="space-y-1 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
      <p className="flex items-center gap-2 font-medium text-destructive">
        <CircleAlert className="h-4 w-4" />
        {titulo}
      </p>
      <div className="text-muted-foreground">{children}</div>
    </div>
  );
}

/**
 * O corpo do diálogo, só apresentação — recebe o estado do portão pronto. Separado para
 * ser testável sem montar as dez consultas do documento.
 */
export function PainelDaExportacao({
  estado,
  confirmadas,
  alternar,
  aoBaixar,
}: {
  estado: EstadoDaExportacao;
  confirmadas: ReadonlySet<string>;
  alternar: (id: string) => void;
  aoBaixar: () => void;
}) {
  if (estado.tipo === "carregando") {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="Montando o documento" />
      </div>
    );
  }

  if (estado.tipo === "falha") {
    return (
      <Recusa titulo="Não foi possível ler todos os dados do edital.">
        <p>
          Falhou a leitura de: <span className="font-mono">{estado.consultas.join(", ")}</span>. Exportar agora
          produziria um arquivo com dado faltando, e a falha apareceria como “sem linha”. Recarregue a página e tente
          de novo.
        </p>
      </Recusa>
    );
  }

  if (estado.tipo === "rascunho") {
    return (
      <Recusa titulo={`Há ${estado.quantidade} artigo(s) não salvo(s) no capítulo aberto.`}>
        <p>
          A exportação lê o que está salvo, não o que está na tela — o arquivo sairia diferente do texto que você vê.
          Salve o capítulo (ou descarte as alterações) e exporte de novo.
        </p>
      </Recusa>
    );
  }

  const pendencias = estado.pendencias;
  const livre = estado.tipo === "livre";

  return (
    <div className="space-y-3">
      {pendencias.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-green-800">
          <CheckCircle2 className="h-4 w-4" />
          Nenhuma pendência. O arquivo sai com a numeração do documento montado.
        </p>
      ) : (
        <>
          <p className="text-sm">
            {pendencias.length} pendência(s) aberta(s). Elas saem <strong>visíveis</strong> no arquivo. Para exportar
            mesmo assim, confirme cada uma:
          </p>
          <ScrollArea className="max-h-[50vh] rounded-md border">
            <ul className="divide-y">
              {pendencias.map((p) => (
                <li key={p.id} className="flex items-start gap-2 px-3 py-2">
                  <Checkbox
                    id={`confirma-${p.id}`}
                    checked={confirmadas.has(p.id)}
                    onCheckedChange={() => alternar(p.id)}
                    className="mt-0.5"
                  />
                  <label
                    htmlFor={`confirma-${p.id}`}
                    className={`text-xs ${p.severidade === "erro" ? "text-destructive" : "text-amber-700"}`}
                  >
                    {p.texto}
                  </label>
                </li>
              ))}
            </ul>
          </ScrollArea>
          {!livre && (
            <p className="text-xs text-muted-foreground">Falta(m) confirmar {estado.faltam.length}.</p>
          )}
        </>
      )}
      <DialogFooter>
        <Button onClick={aoBaixar} disabled={!livre} className="gap-2">
          <Download className="h-4 w-4" />
          {pendencias.length === 0 ? "Baixar Markdown" : "Baixar com as pendências confirmadas"}
        </Button>
      </DialogFooter>
    </div>
  );
}

export function ExportarEdital({
  editalId,
  edital,
  rascunhosSujos,
}: {
  editalId: string | undefined;
  edital: { nome?: string | null; numero_edital?: string | null } | null | undefined;
  rascunhosSujos: number;
}) {
  const { documento, pendencias } = useDocumentoDoEdital(editalId);
  const consultasComErro = useConsultasComErro();
  const [aberto, setAberto] = useState(false);
  const [confirmadas, setConfirmadas] = useState<ReadonlySet<string>>(new Set());

  const estado = avaliarExportacao({ consultasComErro, pendencias, rascunhosSujos, confirmadas });

  const alternar = (id: string) =>
    setConfirmadas((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });

  const aoBaixar = () => {
    // Reavalia na hora do clique: o botão só habilita em "livre", mas a decisão final não
    // pode depender de um render que já passou.
    if (estado.tipo !== "livre" || !documento) return;
    baixarTexto(nomeDoArquivo(edital), documentoEmMarkdown(documento, { titulo: edital?.nome ?? undefined }));
    setAberto(false);
  };

  return (
    <Dialog
      open={aberto}
      onOpenChange={(v) => {
        setAberto(v);
        setConfirmadas(new Set());
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Download className="h-4 w-4" />
          Exportar
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Exportar o edital</DialogTitle>
          <DialogDescription>
            Gera o arquivo Markdown do documento montado — o mesmo da prévia —, com a numeração escrita como texto para
            o Word não renumerar.
          </DialogDescription>
        </DialogHeader>
        <PainelDaExportacao estado={estado} confirmadas={confirmadas} alternar={alternar} aoBaixar={aoBaixar} />
      </DialogContent>
    </Dialog>
  );
}
