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
import {
  buscarMetasQueImpedemRemocao,
  useValoresFuncaoProva,
  type MetaQueImpedeRemocao,
} from "@/hooks/useValoresFuncaoProva";
import { useFuncoesColaboradores } from "@/hooks/useFuncoesColaboradores";
import { Loader2, Plus, Trash2, Save } from "lucide-react";
import { toast } from "sonner";

/**
 * A exclusão de um valor passa por etapas. `verificando` existe para que o popup certo
 * abra de primeira: até 2026-11-27 a confirmação abria sempre, e só DEPOIS de "Remover"
 * um toast dizia que havia metas — a pessoa confirmava algo que nunca ia acontecer.
 */
type Exclusao =
  | { etapa: "verificando"; valorId: string }
  | { etapa: "confirmar"; valorId: string }
  | { etapa: "bloqueado"; valorId: string; metas: MetaQueImpedeRemocao[]; mensagem?: string };

type Bloqueio = Extract<Exclusao, { etapa: "bloqueado" }>;

/** O popup de "não é possível remover": nomeia a função e diz onde zerar as metas. */
function BloqueioRemocaoDialog({
  bloqueio,
  nomeDaFuncao,
  onOpenChange,
}: {
  bloqueio: Bloqueio | null;
  nomeDaFuncao: string | undefined;
  onOpenChange: (aberto: boolean) => void;
}) {
  const funcao = nomeDaFuncao ? `"${nomeDaFuncao}"` : "esta função";
  const metas = bloqueio?.metas ?? [];

  return (
    <AlertDialog open={bloqueio !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Não é possível remover o valor</AlertDialogTitle>
          <AlertDialogDescription>
            {bloqueio?.mensagem ??
              `Ainda há metas de colaboradores definidas para ${funcao} nesta prova. Zere as metas antes de remover o valor.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {metas.length > 0 && (
          <div className="space-y-2 text-sm">
            <ul className="max-h-48 overflow-auto rounded-md border divide-y">
              {metas.map((meta, i) => (
                <li key={`${meta.unidade}-${i}`} className="flex justify-between px-3 py-1.5">
                  <span>{meta.unidade}</span>
                  <span className="text-muted-foreground">
                    {meta.quantidade} {meta.quantidade === 1 ? "colaborador" : "colaboradores"}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground">
              Em cada unidade, use "Definir Número de Colaboradores" e zere a meta desta
              função.
            </p>
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogAction>Entendi</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

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
  const [exclusao, setExclusao] = useState<Exclusao | null>(null);

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

  const pedirExclusao = async (valorId: string, funcaoId: string) => {
    setExclusao({ etapa: "verificando", valorId });
    try {
      const metas = await buscarMetasQueImpedemRemocao(provaId, funcaoId);
      setExclusao(
        metas.length > 0
          ? { etapa: "bloqueado", valorId, metas }
          : { etapa: "confirmar", valorId },
      );
    } catch {
      // Não deu para conferir: segue para a confirmação. A barreira é o trigger
      // `check_valor_sem_meta`, e a recusa dele também cai no popup de bloqueio.
      setExclusao({ etapa: "confirmar", valorId });
    }
  };

  const confirmarExclusao = () => {
    if (exclusao?.etapa !== "confirmar") return;
    const { valorId } = exclusao;
    setExclusao(null);
    deleteValor(valorId, (mensagem) =>
      setExclusao({ etapa: "bloqueado", valorId, metas: [], mensagem }),
    );
  };

  /**
   * Fecha só se o popup que pediu o fechamento ainda for o da etapa atual. O
   * `onOpenChange(false)` da confirmação dispara DEPOIS do clique em "Remover" — se a
   * recusa do banco já tiver aberto o bloqueio, um `setExclusao(null)` incondicional o
   * fecharia na hora, e a recusa sumiria calada.
   */
  const fecharSeEtapa = (etapa: Exclusao["etapa"]) => (aberto: boolean) => {
    if (!aberto) setExclusao((atual) => (atual?.etapa === etapa ? null : atual));
  };

  const nomeDoValorParaExcluir = valoresFuncao.find((v) => v.id === exclusao?.valorId)
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
            Defina o valor pago por função nesta prova. Ele vale para todos os colaboradores
            da função, inclusive os já alocados, e é o que vai para a Exportação DAF e para os
            recibos. Depois que a prova é finalizada, só muda reabrindo a prova.
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
                            aria-label="Remover valor"
                            onClick={() => pedirExclusao(valor.id, valor.funcao_id)}
                            disabled={exclusao?.etapa === "verificando"}
                            className="text-destructive hover:text-destructive"
                          >
                            {exclusao?.etapa === "verificando" &&
                            exclusao.valorId === valor.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
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
          PasswordConfirmDialog: só se remove valor de prova ABERTA (a finalizada é
          recusada pelo banco, PF001), ou seja, antes da Exportação DAF que vira pagamento.
          ⚠️ Até 2026-11-27 este comentário dizia que o valor era "congelado na alocação" —
          nunca foi: `colaboradores_prova.valor_pagamento` nunca é preenchido, e o DAF e o
          recibo leem o valor AO VIVO. Por isso o texto abaixo diz o que acontece com quem
          já está alocado. */}
      <AlertDialog
        open={exclusao?.etapa === "confirmar"}
        onOpenChange={fecharSeEtapa("confirmar")}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover valor da função</AlertDialogTitle>
            <AlertDialogDescription>
              {nomeDoValorParaExcluir
                ? `O valor de "${nomeDoValorParaExcluir}" será removido desta prova. `
                : "O valor será removido desta prova. "}
              Quem já está alocado nesta função fica sem valor: sai em branco na Exportação
              DAF e como R$ 0,00 no recibo, até que um valor seja cadastrado de novo. A função
              também deixa de aceitar meta de colaboradores.
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

      {/* Bloqueio: vem ANTES da confirmação quando há meta > 0 (o caso normal), ou
          depois dela se o banco recusar por um caminho que a checagem não previu. Em
          popup, e não em toast: é um impedimento que pede ação, não um aviso que passa. */}
      <BloqueioRemocaoDialog
        bloqueio={exclusao?.etapa === "bloqueado" ? exclusao : null}
        nomeDaFuncao={nomeDoValorParaExcluir}
        onOpenChange={fecharSeEtapa("bloqueado")}
      />
    </Dialog>
  );
}
