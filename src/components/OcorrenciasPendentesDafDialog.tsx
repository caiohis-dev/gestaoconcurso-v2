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

/**
 * O impedimento da Exportação DAF: há unidade da prova com o registro de ocorrências
 * ainda aberto. Lista QUAIS, e oferece o caminho — a tela de ocorrências, onde cada
 * unidade se encerra (`OcorrenciasProva`, "Encerrar Registro").
 */
export function OcorrenciasPendentesDafDialog({
  unidades,
  onOpenChange,
  onIrParaOcorrencias,
}: {
  /** Rótulos das unidades pendentes; vazio = fechado. */
  unidades: string[];
  onOpenChange: (aberto: boolean) => void;
  onIrParaOcorrencias: () => void;
}) {
  const uma = unidades.length === 1;
  return (
    <AlertDialog open={unidades.length > 0} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Não é possível exportar o DAF ainda</AlertDialogTitle>
          <AlertDialogDescription>
            {uma
              ? "Esta unidade ainda não encerrou o registro de ocorrências."
              : `Estas ${unidades.length} unidades ainda não encerraram o registro de ocorrências.`}{" "}
            O arquivo de pagamento só sai depois que todas as unidades da prova encerrarem,
            porque uma ocorrência (como falta) ainda pode tirar alguém do pagamento.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="max-h-48 overflow-auto rounded-md border divide-y text-sm">
          {unidades.map((u, i) => (
            <li key={`${u}-${i}`} className="px-3 py-1.5">
              {u}
            </li>
          ))}
        </ul>
        <AlertDialogFooter>
          <AlertDialogCancel>Fechar</AlertDialogCancel>
          <AlertDialogAction onClick={onIrParaOcorrencias}>Ir para Ocorrências</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
