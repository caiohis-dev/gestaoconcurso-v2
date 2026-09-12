import { useState } from "react";
import { useCoordenadoresProva, type ImpedimentoCoordenador } from "@/hooks/useCoordenadoresProva";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, UserPlus, Trash2, Shield } from "lucide-react";

interface CoordenadoresProvaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provaId: string;
  provaEdital: string;
  provaUnidadeId?: string; // Filter colaboradores by this unit if provided
}

// Os dois impedimentos pedem providências diferentes, então a frase é diferente. Ela
// aparece no próprio item da lista — o impedido NÃO some do seletor, senão o admin
// procuraria o nome, não acharia e não teria como saber por quê.
const TEXTO_IMPEDIMENTO: Record<ImpedimentoCoordenador, string> = {
  "sem-conta": "ainda sem acesso ao sistema",
  "sem-email": "sem e-mail no cadastro",
};

const AJUDA_IMPEDIMENTO: Record<ImpedimentoCoordenador, string> = {
  "sem-conta":
    'Ele precisa entrar em /auth e usar "Estou sem minha senha" para criar o acesso. Assim que definir a senha, ele aparece aqui.',
  "sem-email":
    "O cadastro dele não tem e-mail, e é pelo e-mail que o acesso nasce. Cadastre o e-mail na ficha do colaborador primeiro.",
};

export function CoordenadoresProvaDialog({
  open,
  onOpenChange,
  provaId,
  provaEdital,
  provaUnidadeId,
}: CoordenadoresProvaDialogProps) {
  const {
    coordenadores,
    colaboradoresDisponiveis,
    isLoading,
    conceder,
    isConcedendo,
    delete: deleteCoordenador,
    isDeleting,
  } = useCoordenadoresProva(provaId, provaUnidadeId);

  const [selectedColaborador, setSelectedColaborador] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [coordenadorToDelete, setCoordenadorToDelete] = useState<string | null>(null);

  const selecionado = colaboradoresDisponiveis.find((c) => c.id === selectedColaborador);

  const handleSubmit = () => {
    if (!selectedColaborador) return;
    conceder(selectedColaborador);
    setSelectedColaborador("");
  };

  const handleDeleteClick = (id: string) => {
    setCoordenadorToDelete(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (coordenadorToDelete) {
      deleteCoordenador(coordenadorToDelete);
      setDeleteDialogOpen(false);
      setCoordenadorToDelete(null);
    }
  };

  const formatCPF = (cpf: string) => {
    const cleaned = cpf.replace(/\D/g, "").padStart(11, "0");
    return cleaned.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Acesso dos Coordenadores
            </DialogTitle>
            <DialogDescription>
              Prova: {provaEdital?.trim()}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Add coordenador form */}
            <div className="p-4 border rounded-lg bg-muted/50 space-y-4">
              <h3 className="font-semibold flex items-center gap-2">
                <UserPlus className="h-4 w-4" />
                Conceder Acesso a Coordenador
              </h3>

              <p className="text-sm text-muted-foreground">
                O acesso usa a conta que o colaborador já tem no sistema — nenhuma senha é
                criada aqui.
              </p>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Colaborador (Coordenador Geral ou Auxiliar)</Label>
                  <Select
                    value={selectedColaborador}
                    onValueChange={setSelectedColaborador}
                    disabled={colaboradoresDisponiveis.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          isLoading
                            ? "Carregando..."
                            : colaboradoresDisponiveis.length === 0
                            ? "Nenhum colaborador elegível"
                            : "Selecionar colaborador"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {colaboradoresDisponiveis.map((c) => (
                        <SelectItem
                          key={c.id}
                          value={c.id}
                          disabled={c.impedimento !== null}
                        >
                          {c.nome} ({c.funcao})
                          {c.impedimento && ` — ${TEXTO_IMPEDIMENTO[c.impedimento]}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-end">
                  <Button
                    onClick={handleSubmit}
                    disabled={
                      !selectedColaborador ||
                      selecionado?.impedimento !== null ||
                      isConcedendo
                    }
                    className="w-full gap-2"
                  >
                    {isConcedendo ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <UserPlus className="h-4 w-4" />
                    )}
                    Conceder Acesso
                  </Button>
                </div>
              </div>

              {colaboradoresDisponiveis.some((c) => c.impedimento === "sem-conta") && (
                <p className="text-sm text-muted-foreground">
                  {AJUDA_IMPEDIMENTO["sem-conta"]}
                </p>
              )}

              {colaboradoresDisponiveis.some((c) => c.impedimento === "sem-email") && (
                <p className="text-sm text-muted-foreground">
                  {AJUDA_IMPEDIMENTO["sem-email"]}
                </p>
              )}

              {colaboradoresDisponiveis.length === 0 && !isLoading && (
                <p className="text-sm text-muted-foreground">
                  Não há colaboradores com função de Coordenador Geral ou Auxiliar de Coordenação cadastrados para esta prova, ou todos já possuem acesso.
                </p>
              )}
            </div>

            {/* Coordenadores list */}
            <div className="space-y-4">
              <h3 className="font-semibold">Coordenadores com Acesso</h3>

              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : coordenadores.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhum coordenador com acesso para esta prova.
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>CPF</TableHead>
                        <TableHead>Função</TableHead>
                        <TableHead className="w-[100px]">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {coordenadores.map((coord) => (
                        <TableRow key={coord.id}>
                          <TableCell className="font-medium">
                            {coord.colaboradores_prova?.colaboradores?.colab_nome_completo}
                          </TableCell>
                          <TableCell>
                            {coord.colaboradores_prova?.colaboradores?.colab_cpf
                              ? formatCPF(coord.colaboradores_prova.colaboradores.colab_cpf)
                              : "-"}
                          </TableCell>
                          <TableCell>
                            {coord.colaboradores_prova?.funcoes_colaboradores?.cargo_nome || "-"}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteClick(coord.id)}
                              disabled={isDeleting}
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover acesso</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover o acesso deste coordenador? O colaborador não será excluído, apenas seu acesso ao sistema será revogado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Removendo..." : "Remover Acesso"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
