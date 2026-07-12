import { useState, useMemo } from "react";
import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useProvas, Prova, ProvaInsert, ProvaUpdate } from "@/hooks/useProvas";
import { ProvaDialog } from "@/components/ProvaDialog";
import { ProvaCard } from "@/components/ProvaCard";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Plus, Loader2, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PasswordConfirmDialog } from "@/components/PasswordConfirmDialog";
import { useCoordenadorUnidades } from "@/hooks/useCoordenadorUnidades";



export default function Provas() {
  const { user, loading: authLoading, isAdmin, isSuperAdmin, isCoordenador } = useAuth();
  const {
    provas,
    isLoading,
    create,
    update,
    delete: deleteProva,
    isCreating,
    isUpdating,
    isDeleting,
  } = useProvas();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [provaToDelete, setProvaToDelete] = useState<Prova | null>(null);

  // For coordenadores, fetch their prova IDs
  const { data: coordenadorProvaIds = [] } = useQuery({
    queryKey: ["coordenador-prova-ids", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from("coordenadores_prova")
        .select("prova_id")
        .eq("user_id", user.id);
      if (error) throw error;
      return data.map((cp) => cp.prova_id);
    },
    enabled: isCoordenador && !!user?.id,
  });

  const { provaUnidadeIds: coordenadorProvaUnidadeIds } = useCoordenadorUnidades();

  // Filter provas for coordenadores
  const filteredProvas = useMemo(() => {
    if (isAdmin) return provas;
    if (isCoordenador) {
      return provas.filter((p) => coordenadorProvaIds.includes(p.id));
    }
    return [];
  }, [provas, isAdmin, isCoordenador, coordenadorProvaIds]);

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth-admin" replace />;
  }

  if (!isAdmin && !isCoordenador) {
    return <Navigate to="/" replace />;
  }

  const handleCreate = () => {
    setDialogOpen(true);
  };

  const handleDelete = (prova: Prova) => {
    setProvaToDelete(prova);
    setDeleteDialogOpen(true);
  };




  const handleSubmit = (data: ProvaInsert) => {
    create(data);
    setDialogOpen(false);
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Provas</h1>
            <p className="text-muted-foreground">
              {isCoordenador ? "Provas que você coordena" : "Gerencie as provas do sistema"}
            </p>
          </div>
          {isAdmin && (
            <Button onClick={handleCreate} className="gap-2">
              <Plus className="h-4 w-4" />
              Nova Prova
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filteredProvas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold text-foreground">
              {isCoordenador ? "Nenhuma prova atribuída" : "Nenhuma prova cadastrada"}
            </h3>
            <p className="text-muted-foreground mt-1">
              {isCoordenador 
                ? "Você ainda não possui provas atribuídas como coordenador." 
                : "Clique em \"Nova Prova\" para adicionar a primeira prova."}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {filteredProvas.map((prova) => (
              <ProvaCard
                key={prova.id}
                prova={prova}
                onDelete={isSuperAdmin ? handleDelete : undefined}
                allowedProvaUnidadeIds={isCoordenador ? coordenadorProvaUnidadeIds : null}
              />
            ))}
          </div>
        )}
      </div>

      {isAdmin && (
        <ProvaDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          prova={null}
          onSubmit={handleSubmit}
          isLoading={isCreating}
        />
      )}

      <PasswordConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open);
          if (!open) setProvaToDelete(null);
        }}
        title="Excluir prova"
        description={`Tem certeza que deseja excluir a prova "${provaToDelete?.prova_edital?.trim() ?? ""}"? Esta ação não pode ser desfeita.`}
        confirmText={isDeleting ? "Excluindo..." : "Excluir"}
        confirmVariant="destructive"
        onConfirm={async () => {
          if (provaToDelete) {
            deleteProva(provaToDelete.id);
            setProvaToDelete(null);
          }
        }}
      />

    </Layout>
  );
}
