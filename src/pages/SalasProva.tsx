import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useSalasProva, SalaProva, SalaProvaCreateMultiple } from "@/hooks/useSalasProva";
import { CreateSalaData, EditSalaData } from "@/components/SalaProvaDialog";
import { useUnidadesProva } from "@/hooks/useUnidadesProva";
import Layout from "@/components/Layout";
import { SalaProvaDialog } from "@/components/SalaProvaDialog";
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
import { Loader2, Plus, Pencil, Trash2, DoorOpen, ArrowLeft } from "lucide-react";

export default function SalasProva() {
  const { unidadeId } = useParams<{ unidadeId: string }>();
  // Quem autoriza esta rota é o `RequireAcesso papeis={["admin"]}` do `App.tsx` — a página
  // não guarda a si mesma. Só o estado de carregamento interessa aqui.
  const { loading: authLoading } = useAuth();
  const { unidades, isLoading: isLoadingUnidades } = useUnidadesProva();
  const {
    salas,
    isLoading,
    createMultiple,
    update,
    delete: deleteSala,
    isCreating,
    isUpdating,
    isDeleting,
  } = useSalasProva(unidadeId ?? "");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSala, setEditingSala] = useState<SalaProva | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [salaToDelete, setSalaToDelete] = useState<SalaProva | null>(null);

  const unidade = unidades.find((u) => u.id === unidadeId);

  // ⚠️ `isLoadingUnidades` entra na espera porque a unidade decide o que a página é: sem
  // ele, o cabeçalho renderiza sem nome e o "não encontrada" abaixo dispararia durante a
  // carga, mandando embora quem só chegou antes da resposta.
  if (authLoading || isLoading || isLoadingUnidades) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  // Carregado e não achou: id inválido na URL ou unidade excluída. Antes disto a tela
  // ficava em "Carregando..." para sempre, com a tabela vazia.
  if (!unidade) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <DoorOpen className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">Unidade não encontrada</h3>
          <p className="text-muted-foreground mb-4">
            Ela pode ter sido excluída, ou o endereço está errado.
          </p>
          <Button asChild variant="outline">
            <Link to="/unidades-prova">Voltar para Unidades de Prova</Link>
          </Button>
        </div>
      </Layout>
    );
  }

  const handleCreate = () => {
    setEditingSala(null);
    setDialogOpen(true);
  };

  const handleEdit = (sala: SalaProva) => {
    setEditingSala(sala);
    setDialogOpen(true);
  };

  const handleDelete = (sala: SalaProva) => {
    setSalaToDelete(sala);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (salaToDelete) {
      deleteSala(salaToDelete.id);
      setDeleteDialogOpen(false);
      setSalaToDelete(null);
    }
  };

  const handleSubmit = (data: CreateSalaData | EditSalaData) => {
    if (editingSala) {
      const editData = data as EditSalaData;
      update(
        { 
          id: editingSala.id, 
          data: {
            sala_numero: editData.sala_numero,
            sala_descricao: editData.sala_descricao,
            sala_capacidade: editData.sala_capacidade,
            // `null` (campo apagado) precisa viajar; `undefined` sumiria do JSON.
            sala_andar: editData.sala_andar,
          }
        },
        { onSuccess: () => setDialogOpen(false) }
      );
    } else {
      const createData = data as CreateSalaData;
      createMultiple(
        {
          sala_fk_unidade: unidadeId!,
          quantidade: createData.quantidade,
          sala_capacidade: createData.sala_capacidade,
          andar_de: createData.andar_de,
          andar_ate: createData.andar_ate,
        },
        { onSuccess: () => setDialogOpen(false) }
      );
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Button variant="ghost" size="sm" asChild>
                <Link to="/unidades-prova">
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Voltar
                </Link>
              </Button>
            </div>
            <h1 className="text-2xl font-bold text-foreground">
              Salas de Prova - {unidade.unid_nome}
            </h1>
            <p className="text-muted-foreground">
              Gerencie as salas da unidade {unidade.unid_sigla.trim()}
            </p>
          </div>
          <Button onClick={handleCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            Nova Sala
          </Button>
        </div>

        {salas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <DoorOpen className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">Nenhuma sala cadastrada</h3>
            <p className="text-muted-foreground mb-4">
              Clique no botão acima para adicionar a primeira sala.
            </p>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-center">Andar</TableHead>
                  <TableHead className="text-center">Capacidade</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {salas.map((sala) => (
                  <TableRow key={sala.id}>
                    <TableCell className="font-medium">{sala.sala_numero}</TableCell>
                    <TableCell>{sala.sala_descricao ?? "-"}</TableCell>
                    <TableCell className="text-center">{sala.sala_andar ?? "-"}</TableCell>
                    <TableCell className="text-center">{sala.sala_capacidade}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(sala)}
                          disabled={isUpdating || isDeleting}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(sala)}
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

      <SalaProvaDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        sala={editingSala}
        onSubmit={handleSubmit}
        isLoading={isCreating || isUpdating}
        numerosExistentes={salas.map((s) => s.sala_numero)}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a sala "{salaToDelete?.sala_numero}"?
              Esta ação não pode ser desfeita.
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
