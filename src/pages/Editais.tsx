import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useEditais, Edital, EditalInsert, EditalUpdate } from "@/hooks/useEditais";
import { EditalDialog } from "@/components/EditalDialog";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PasswordConfirmDialog } from "@/components/PasswordConfirmDialog";
import { Plus, Loader2, FileText, Pencil, Trash2, Users } from "lucide-react";

export default function Editais() {
  const { user, loading: authLoading, isAdmin } = useAuth();
  const {
    editais,
    isLoading,
    create,
    update,
    delete: deleteEdital,
    isCreating,
    isUpdating,
    isDeleting,
  } = useEditais();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editalEmEdicao, setEditalEmEdicao] = useState<Edital | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editalToDelete, setEditalToDelete] = useState<Edital | null>(null);

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const handleCreate = () => {
    setEditalEmEdicao(null);
    setDialogOpen(true);
  };

  const handleEdit = (edital: Edital) => {
    setEditalEmEdicao(edital);
    setDialogOpen(true);
  };

  const handleDelete = (edital: Edital) => {
    setEditalToDelete(edital);
    setDeleteDialogOpen(true);
  };

  const handleSubmit = (data: EditalInsert | EditalUpdate) => {
    if (editalEmEdicao) {
      update({ id: editalEmEdicao.id, data });
    } else {
      create(data as EditalInsert);
    }
    setDialogOpen(false);
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Editais</h1>
            <p className="text-muted-foreground">
              Cadastre os editais; cada prova é criada sob um deles.
            </p>
          </div>
          <Button onClick={handleCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            Novo Edital
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : editais.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold text-foreground">Nenhum edital cadastrado</h3>
            <p className="text-muted-foreground mt-1">
              Clique em "Novo Edital" para cadastrar o primeiro.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {editais.map((edital) => (
              <Card key={edital.id} className="flex flex-col">
                <CardHeader>
                  <CardTitle className="text-lg">{edital.nome}</CardTitle>
                </CardHeader>
                <CardContent className="mt-auto space-y-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Users className="h-4 w-4" />
                    {edital.n_candidatos != null
                      ? `${edital.n_candidatos} candidatos`
                      : "Nº de candidatos não informado"}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="gap-2" onClick={() => handleEdit(edital)}>
                      <Pencil className="h-4 w-4" />
                      Editar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-2 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(edital)}
                    >
                      <Trash2 className="h-4 w-4" />
                      Excluir
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <EditalDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        edital={editalEmEdicao}
        onSubmit={handleSubmit}
        isLoading={isCreating || isUpdating}
      />

      <PasswordConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open);
          if (!open) setEditalToDelete(null);
        }}
        title="Excluir edital"
        description={`Tem certeza que deseja excluir o edital "${editalToDelete?.nome ?? ""}"? Provas vinculadas impedem a exclusão.`}
        confirmText={isDeleting ? "Excluindo..." : "Excluir"}
        confirmVariant="destructive"
        onConfirm={async () => {
          if (editalToDelete) {
            deleteEdital(editalToDelete.id);
            setEditalToDelete(null);
          }
        }}
      />
    </Layout>
  );
}
