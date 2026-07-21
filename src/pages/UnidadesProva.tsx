import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useUnidadesProva, UnidadeProva } from "@/hooks/useUnidadesProva";
import Layout from "@/components/Layout";
import { UnidadeProvaDialog } from "@/components/UnidadeProvaDialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
import { Loader2, Plus, Pencil, Trash2, Building2, DoorOpen } from "lucide-react";

export default function UnidadesProva() {
  const { user, loading: authLoading, isAdmin } = useAuth();
  const navigate = useNavigate();
  const {
    unidades,
    isLoading,
    create,
    update,
    delete: deleteUnidade,
    isCreating,
    isUpdating,
    isDeleting,
  } = useUnidadesProva();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUnidade, setEditingUnidade] = useState<UnidadeProva | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [unidadeToDelete, setUnidadeToDelete] = useState<UnidadeProva | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!authLoading && user && !isAdmin) {
      navigate("/");
    }
  }, [user, authLoading, isAdmin, navigate]);

  if (authLoading || isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!user || !isAdmin) {
    return null;
  }

  const handleCreate = () => {
    setEditingUnidade(null);
    setDialogOpen(true);
  };

  const handleEdit = (unidade: UnidadeProva) => {
    setEditingUnidade(unidade);
    setDialogOpen(true);
  };

  const handleDelete = (unidade: UnidadeProva) => {
    setUnidadeToDelete(unidade);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (unidadeToDelete) {
      deleteUnidade(unidadeToDelete.id);
      setDeleteDialogOpen(false);
      setUnidadeToDelete(null);
    }
  };

  const handleSubmit = (data: any) => {
    if (editingUnidade) {
      update({ id: editingUnidade.id, data }, { onSuccess: () => setDialogOpen(false) });
    } else {
      create(data, { onSuccess: () => setDialogOpen(false) });
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Locais de prova</h1>
            <p className="text-muted-foreground">Gerencie as unidades onde serão realizadas as provas</p>
          </div>
          <Button onClick={handleCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            Nova Unidade
          </Button>
        </div>

        {unidades.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">Nenhuma unidade cadastrada</h3>
            <p className="text-muted-foreground mb-4">Clique no botão acima para adicionar a primeira unidade.</p>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Sigla</TableHead>
                  <TableHead className="text-center">Andares</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unidades.map((unidade) => (
                  <TableRow key={unidade.id}>
                    <TableCell className="font-medium">{unidade.unid_nome}</TableCell>
                    <TableCell>{unidade.unid_sigla.trim()}</TableCell>
                    <TableCell className="text-center">{unidade.unid_andares}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" asChild title="Gerenciar salas">
                          <Link to={`/salas-prova/${unidade.id}`}>
                            <DoorOpen className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(unidade)}
                          disabled={isUpdating || isDeleting}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(unidade)}
                          disabled={isUpdating || isDeleting}
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

      <UnidadeProvaDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        unidade={editingUnidade}
        onSubmit={handleSubmit}
        isLoading={isCreating || isUpdating}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a unidade "{unidadeToDelete?.unid_nome}"? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
