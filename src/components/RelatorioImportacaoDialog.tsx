import { useState, useEffect } from "react";
import { buscarRelatorioCompleto, useRelatorioImportacao } from "@/hooks/useCandidatos";
import { deRelatorioPersistido } from "@/lib/candidatos-import";
import { useLogoBase64 } from "@/lib/pdf-timbre";
import {
  exportarRelatorioPDF,
  exportarRelatorioXLS,
} from "@/lib/relatorio-importacao-export";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Loader2,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Info,
  FileSpreadsheet,
  FileDown,
  AlertCircle,
} from "lucide-react";

const POR_PAGINA = 50;

/**
 * A cor da situação — vermelho para o que NÃO entrou, neutro para o que entrou.
 *
 * 🔴 "Não importada (inscrição não paga)" é NEUTRA de propósito, apesar de a linha ter
 * ficado de fora. Inscrição não paga não é defeito a corrigir — é o filtro fazendo o que
 * foi mandado. Pintá-la de vermelho mandaria a pessoa caçar erro em linhas legítimas, que
 * é exatamente o que a separação entre "Sem pagamento" e "Não importados" existe para
 * evitar (ver o card do passo 5 do assistente).
 */
function varianteDaSituacao(situacao: string): "destructive" | "secondary" | "outline" {
  if (situacao === "Não importada") return "destructive";
  if (situacao === "Importada com ressalva") return "outline";
  return "secondary";
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editalId: string | null;
  editalNome: string;
  /** Quantos inscritos o edital tem hoje — distingue "nunca importou" de "importou limpo". */
  totalDoEdital: number;
}

/**
 * O relatório PERSISTIDO da última importação de um edital, em leitura.
 *
 * ⚠️ **Não é o mesmo relatório que o assistente exporta.** Aquele (XLS/PDF) vive na
 * memória da sessão de importação e some ao fechar a aba; este é o que ficou no banco
 * (`candidatos_relatorio_importacao`). O conteúdo é o mesmo, mas **a Associação de Cargos
 * não é persistida** — ela só existe no export, e por isso não aparece aqui.
 */
export function RelatorioImportacaoDialog({
  open,
  onOpenChange,
  editalId,
  editalNome,
  totalDoEdital,
}: Props) {
  const [pagina, setPagina] = useState(0);
  const [exportando, setExportando] = useState<"xls" | "pdf" | null>(null);
  const [erroExportacao, setErroExportacao] = useState<string | null>(null);
  const logoBase64 = useLogoBase64();

  // Trocar de edital com o diálogo montado deixaria a paginação apontando para uma página
  // que o novo relatório pode não ter — e a tela viria vazia como se não houvesse nada.
  useEffect(() => setPagina(0), [editalId]);

  const { linhas, total, isLoading } = useRelatorioImportacao({
    editalId: open ? editalId : null,
    pagina,
    porPagina: POR_PAGINA,
  });

  const ultimaPagina = Math.max(0, Math.ceil(total / POR_PAGINA) - 1);

  /** Nome-base do arquivo. O assistente usa o nome da planilha; aqui só existe o edital. */
  const nomeBase = (editalNome || "relatorio").replace(/[\\/:*?"<>|]/g, "-");

  /**
   * 🔴 Exporta o relatório INTEIRO, não a página que está na tela.
   *
   * `linhas` traz 50 registros — é a fatia da paginação. Exportar a partir dela entregaria
   * um arquivo truncado com cara de completo, que é o formato de erro que este repo mais
   * teme. Por isso busca tudo de novo, em laço, antes de montar o documento.
   */
  const exportar = async (formato: "xls" | "pdf") => {
    if (!editalId) return;
    setExportando(formato);
    setErroExportacao(null);
    try {
      const problemas = deRelatorioPersistido(await buscarRelatorioCompleto(editalId));

      // ⚠️ `deParaCargos` NÃO vai: o de-para não é persistido, então a exportação feita
      // daqui sai sem a aba/bloco "Associação de Cargos". Passar `[]` acrescentaria uma
      // aba vazia ao XLS, o que é pior que não ter — parece que o de-para se perdeu.
      if (formato === "xls") {
        exportarRelatorioXLS({ problemas, nomeBase });
      } else {
        exportarRelatorioPDF({ problemas, logoBase64, nomeEdital: editalNome, nomeBase });
      }
    } catch (e) {
      console.error(e);
      // Sem a ressalva de "os inscritos estão salvos" que o assistente faz: aqui nada foi
      // gravado, então falhar o export não põe dado nenhum em risco.
      setErroExportacao(
        e instanceof Error
          ? `Não foi possível gerar o arquivo: ${e.message}`
          : "Não foi possível gerar o arquivo.",
      );
    } finally {
      setExportando(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Relatório da última importação</DialogTitle>
          <DialogDescription>
            {editalNome} — o que ficou de fora ou entrou com ressalva na última vez que a lista
            deste edital foi importada.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          // ⚠️ Carregando NÃO é "nenhum problema": mostrar a mensagem de sucesso enquanto a
          // consulta está no ar diria que a importação foi limpa quando ainda não se sabe.
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : total === 0 ? (
          <SemRelatorio totalDoEdital={totalDoEdital} />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">
                {total} ocorrência(s) registrada(s)
              </span>
              {/* Os mesmos dois formatos do assistente, e pela mesma razão: a planilha é
                  para trabalhar no Excel, o PDF é para anexar a processo e imprimir. */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  disabled={exportando !== null}
                  onClick={() => exportar("xls")}
                >
                  {exportando === "xls" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="h-4 w-4" />
                  )}
                  Baixar Planilha (XLS)
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  disabled={exportando !== null}
                  onClick={() => exportar("pdf")}
                >
                  {exportando === "pdf" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileDown className="h-4 w-4" />
                  )}
                  Baixar Documento (PDF)
                </Button>
              </div>
            </div>

            {/* ⚠️ Erro de export é VISÍVEL, nunca só no console: foi um `catch` mudo aqui
                que fez o assistente parecer travado ao falhar a geração do PDF. */}
            {erroExportacao && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{erroExportacao}</AlertDescription>
              </Alert>
            )}

            <p className="text-xs text-muted-foreground">
              A <strong>Associação de Cargos</strong> não aparece nestes arquivos — ela não é
              guardada no banco, só sai no relatório baixado durante a importação.
            </p>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">Nº de Inscrição</TableHead>
                  <TableHead className="w-56">Situação</TableHead>
                  <TableHead className="w-40">Campo</TableHead>
                  <TableHead>Detalhe</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">{l.n_inscricao}</TableCell>
                    <TableCell>
                      <Badge variant={varianteDaSituacao(l.situacao)}>{l.situacao}</Badge>
                    </TableCell>
                    <TableCell>{l.campo}</TableCell>
                    <TableCell className="text-muted-foreground">{l.detalhe}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {ultimaPagina > 0 && (
              <div className="flex items-center justify-between pt-2">
                <span className="text-sm text-muted-foreground">
                  Página {pagina + 1} de {ultimaPagina + 1}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    disabled={pagina === 0}
                    onClick={() => setPagina((p) => Math.max(0, p - 1))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    disabled={pagina >= ultimaPagina}
                    onClick={() => setPagina((p) => Math.min(ultimaPagina, p + 1))}
                  >
                    Próxima
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * O vazio, que são DOIS estados diferentes e não podem dar a mesma mensagem.
 *
 * 🔴 A tabela guarda só PROBLEMAS. Uma importação impecável grava zero linhas — e um
 * edital que nunca foi importado também tem zero linhas. Ler só a tabela não distingue os
 * dois; quem distingue é a contagem de inscritos do edital.
 *
 * ⚠️ Editais importados ANTES de 02/08/2026 (quando o relatório passou a ser gravado)
 * caem no ramo "não registrou problemas" sem que isso seja verdade. **Decisão do usuário
 * em 02/08: não tratar esse caso** — a v2 sobe com a tabela já existindo, então ele só
 * existe nas bases de desenvolvimento e some na primeira reimportação.
 */
function SemRelatorio({ totalDoEdital }: { totalDoEdital: number }) {
  if (totalDoEdital === 0) {
    return (
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Este edital ainda não tem inscritos importados, então não há relatório para mostrar.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert>
      <CheckCircle2 className="h-4 w-4" />
      <AlertDescription>
        A última importação deste edital não registrou nenhum problema — todas as linhas da
        planilha entraram sem ressalva.
      </AlertDescription>
    </Alert>
  );
}
