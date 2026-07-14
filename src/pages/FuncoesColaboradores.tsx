import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import Layout from "@/components/Layout";
import { useFuncoesColaboradores, FuncaoColaborador } from "@/hooks/useFuncoesColaboradores";
import { useFuncoesAssociadas } from "@/hooks/useFuncoesAssociadas";
import FuncaoColaboradorDialog from "@/components/FuncaoColaboradorDialog";
import { Button } from "@/components/ui/button";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Loader2, Plus, Pencil, Trash2 } from "lucide-react";

export default function FuncoesColaboradores() {
  const { user, loading: authLoading, isAdmin } = useAuth();
  const navigate = useNavigate();
  const { funcoes, isLoading, create, update, delete: deleteFuncao, isCreating, isUpdating, isDeleting } = useFuncoesColaboradores();
  const { isFuncaoAssociada, isLoading: isLoadingAssociacoes } = useFuncoesAssociadas();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingFuncao, setEditingFuncao] = useState<FuncaoColaborador | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [funcaoToDelete, setFuncaoToDelete] = useState<FuncaoColaborador | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  if (authLoading || isLoading || isLoadingAssociacoes) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const handleCreate = () => {
    setEditingFuncao(null);
    setDialogOpen(true);
  };

  const handleEdit = (funcao: FuncaoColaborador) => {
    setEditingFuncao(funcao);
    setDialogOpen(true);
  };

  const handleDelete = (funcao: FuncaoColaborador) => {
    setFuncaoToDelete(funcao);
    setDeleteDialogOpen(true);
  };

  const handleSubmit = (data: { cargo_nome: string; cargo_cbo?: string; cargo_descricao?: string }) => {
    if (editingFuncao) {
      update(
        { id: editingFuncao.id, ...data },
        { onSuccess: () => setDialogOpen(false) }
      );
    } else {
      create(data, { onSuccess: () => setDialogOpen(false) });
    }
  };

  const confirmDelete = () => {
    if (funcaoToDelete) {
      deleteFuncao(funcaoToDelete.id, {
        onSuccess: () => {
          setDeleteDialogOpen(false);
          setFuncaoToDelete(null);
        },
      });
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Funções de Colaboradores</h1>
            <p className="text-muted-foreground">Gerencie as funções disponíveis para os colaboradores</p>
          </div>
          {isAdmin && (
            <Button onClick={handleCreate} className="gap-2">
              <Plus className="h-4 w-4" />
              Nova Função
            </Button>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Lista de Funções</CardTitle>
          </CardHeader>
          <CardContent>
            {funcoes.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Nenhuma função cadastrada
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>CBO</TableHead>
                    <TableHead>Descrição</TableHead>
                    {isAdmin && <TableHead className="w-[100px]">Ações</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                {funcoes.map((funcao) => {
                    const isAssociada = isFuncaoAssociada(funcao.id);
                    const isSistema = funcao.cargo_editavel === false;
                    const cannotDelete = isAssociada || isSistema;
                    
                    const getDeleteTooltip = () => {
                      if (isSistema) return "Função básica do sistema - não pode ser excluída";
                      if (isAssociada) return "Função associada a prova(s) - exclusão bloqueada";
                      return "";
                    };
                    
                    return (
                      <TableRow key={funcao.id}>
                        <TableCell className="font-medium">
                          {funcao.cargo_nome}
                          {isSistema && (
                            <span className="ml-2 text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                              Sistema
                            </span>
                          )}
                        </TableCell>
                        <TableCell>{funcao.cargo_cbo || "-"}</TableCell>
                        <TableCell className="max-w-md truncate">
                          {funcao.cargo_descricao || "-"}
                        </TableCell>
                        {isAdmin && (
                          <TableCell>
                            <div className="flex gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleEdit(funcao)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => handleDelete(funcao)}
                                        disabled={cannotDelete}
                                        className={cannotDelete ? "opacity-50 cursor-not-allowed" : ""}
                                      >
                                        <Trash2 className={`h-4 w-4 ${cannotDelete ? "" : "text-destructive"}`} />
                                      </Button>
                                    </span>
                                  </TooltipTrigger>
                                  {cannotDelete && (
                                    <TooltipContent>
                                      <p>{getDeleteTooltip()}</p>
                                    </TooltipContent>
                                  )}
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <FuncaoColaboradorDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        funcao={editingFuncao}
        onSubmit={handleSubmit}
        isLoading={isCreating || isUpdating}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a função "{funcaoToDelete?.cargo_nome}"?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={isDeleting}>
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
