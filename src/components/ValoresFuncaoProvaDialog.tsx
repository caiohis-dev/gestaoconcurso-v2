import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { useValoresFuncaoProva } from "@/hooks/useValoresFuncaoProva";
import { useFuncoesColaboradores } from "@/hooks/useFuncoesColaboradores";
import { Loader2, Plus, Trash2, Save } from "lucide-react";
import { toast } from "sonner";

interface ValoresFuncaoProvaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provaId: string;
  provaEdital: string;
}

export function ValoresFuncaoProvaDialog({
  open,
  onOpenChange,
  provaId,
  provaEdital,
}: ValoresFuncaoProvaDialogProps) {
  const { valoresFuncao, isLoading, upsertValor, deleteValor, isUpdating } =
    useValoresFuncaoProva(provaId);
  const { funcoes, isLoading: isLoadingFuncoes } = useFuncoesColaboradores();

  const [selectedFuncao, setSelectedFuncao] = useState("");
  const [novoValor, setNovoValor] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValor, setEditingValor] = useState("");
  const [valorParaExcluir, setValorParaExcluir] = useState<string | null>(null);

  const funcoesDisponiveis = funcoes.filter(
    (f) => !valoresFuncao.some((v) => v.funcao_id === f.id)
  );

  /**
   * O `min="0"` do input só vale para a validação NATIVA do navegador, que exige submit
   * de <form> — e aqui não há form: o clique chama esta função direto. Até 2026-07-26 um
   * `-150` digitado entrava na base de pagamento. O banco passou a recusar (constraint
   * `chk_valor_pagamento_nao_negativo`); isto barra antes, com mensagem legível.
   *
   * RECUSA em vez de saturar: transformar -150 em 150 é adivinhar a intenção, e em 0
   * seria pior ainda, porque 0 é valor VÁLIDO (função não remunerada).
   */
  const valorInvalido = (texto: string): string | null => {
    const n = parseFloat(texto);
    if (!Number.isFinite(n)) return "Informe um valor numérico.";
    if (n < 0) return "O valor de pagamento não pode ser negativo.";
    return null;
  };

  const handleAdd = () => {
    if (selectedFuncao && novoValor) {
      const problema = valorInvalido(novoValor);
      if (problema) {
        toast.error(problema);
        return;
      }
      upsertValor({
        funcaoId: selectedFuncao,
        valorPagamento: parseFloat(novoValor),
      });
      setSelectedFuncao("");
      setNovoValor("");
    }
  };

  const handleStartEdit = (id: string, valor: number) => {
    setEditingId(id);
    setEditingValor(valor.toString());
  };

  const handleSaveEdit = (funcaoId: string) => {
    if (editingValor) {
      const problema = valorInvalido(editingValor);
      if (problema) {
        toast.error(problema);
        return;
      }
      upsertValor({
        funcaoId,
        valorPagamento: parseFloat(editingValor),
      });
      setEditingId(null);
      setEditingValor("");
    }
  };

  const confirmarExclusao = () => {
    if (valorParaExcluir) {
      deleteValor(valorParaExcluir);
      setValorParaExcluir(null);
    }
  };

  const nomeDoValorParaExcluir = valoresFuncao.find((v) => v.id === valorParaExcluir)
    ?.funcoes_colaboradores?.cargo_nome;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Cadastrar Funções dos Colaboradores - {provaEdital.trim()}</DialogTitle>
          <DialogDescription>
            Defina o valor pago por função nesta prova. O valor é congelado no momento da
            alocação: alterá-lo aqui não muda o que já foi alocado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2">
            <Select
              value={selectedFuncao}
              onValueChange={setSelectedFuncao}
              disabled={isLoadingFuncoes || funcoesDisponiveis.length === 0}
            >
              <SelectTrigger className="flex-1">
                <SelectValue
                  placeholder={
                    funcoesDisponiveis.length === 0
                      ? "Todas as funções já têm valor definido"
                      : "Selecione uma função"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {funcoesDisponiveis.map((funcao) => (
                  <SelectItem key={funcao.id} value={funcao.id}>
                    {funcao.cargo_nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              step="0.01"
              min="0"
              placeholder="Valor R$"
              value={novoValor}
              onChange={(e) => setNovoValor(e.target.value)}
              className="w-32"
            />
            <Button
              onClick={handleAdd}
              disabled={!selectedFuncao || !novoValor || isUpdating}
            >
              {isUpdating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
            </Button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : valoresFuncao.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum valor definido para esta prova.
            </div>
          ) : (
            <div className="rounded-md border max-h-[400px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Função</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="w-[100px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {valoresFuncao.map((valor) => (
                    <TableRow key={valor.id}>
                      <TableCell className="font-medium">
                        {valor.funcoes_colaboradores?.cargo_nome || "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {editingId === valor.id ? (
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={editingValor}
                            onChange={(e) => setEditingValor(e.target.value)}
                            className="w-32 ml-auto"
                          />
                        ) : (
                          <span
                            className="cursor-pointer hover:text-primary"
                            onClick={() =>
                              handleStartEdit(valor.id, valor.valor_pagamento)
                            }
                          >
                            {formatCurrency(valor.valor_pagamento)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {editingId === valor.id ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleSaveEdit(valor.funcao_id)}
                              disabled={isUpdating}
                            >
                              {isUpdating ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Save className="h-4 w-4 text-primary" />
                              )}
                            </Button>
                          ) : null}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setValorParaExcluir(valor.id)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </DialogContent>

      {/* Até 2026-07-26 a lixeira apagava direto, num clique. É dado da base de
          pagamento; confirmar é o mínimo. Fica em AlertDialog simples, e não no
          PasswordConfirmDialog: o valor é CONGELADO na alocação, então apagar não altera
          pagamento já feito — pedir senha aqui seria atrito desproporcional. */}
      <AlertDialog
        open={valorParaExcluir !== null}
        onOpenChange={(aberto) => !aberto && setValorParaExcluir(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover valor da função</AlertDialogTitle>
            <AlertDialogDescription>
              {nomeDoValorParaExcluir
                ? `O valor de "${nomeDoValorParaExcluir}" será removido desta prova. `
                : "O valor será removido desta prova. "}
              A alocação já feita não muda, porque o valor é congelado no momento da
              alocação. Mas a função deixa de aceitar meta de colaboradores.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmarExclusao}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
