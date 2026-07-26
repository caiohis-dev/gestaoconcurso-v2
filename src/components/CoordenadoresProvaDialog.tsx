import { useState } from "react";
import { useCoordenadoresProva } from "@/hooks/useCoordenadoresProva";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, UserPlus, Trash2, Shield, Mail, Key } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface CoordenadoresProvaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provaId: string;
  provaEdital: string;
  provaUnidadeId?: string; // Filter colaboradores by this unit if provided
}

export function CoordenadoresProvaDialog({
  open,
  onOpenChange,
  provaId,
  provaEdital,
  provaUnidadeId,
}: CoordenadoresProvaDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const {
    coordenadores,
    colaboradoresDisponiveis,
    isLoading,
    delete: deleteCoordenador,
    isDeleting,
  } = useCoordenadoresProva(provaId, provaUnidadeId);

  const [selectedColaborador, setSelectedColaborador] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [coordenadorToDelete, setCoordenadorToDelete] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedColabData = colaboradoresDisponiveis.find(
    (c) => c.id === selectedColaborador
  );

  const handleSelectColaborador = (colaboradorProvaId: string) => {
    setSelectedColaborador(colaboradorProvaId);
    const colab = colaboradoresDisponiveis.find((c) => c.id === colaboradorProvaId);
    if (colab?.colaboradores?.colab_email) {
      setEmail(colab.colaboradores.colab_email);
    } else {
      setEmail("");
    }
    setPassword("");
  };

  const generatePassword = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    let result = "";
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setPassword(result);
  };

  const handleSubmit = async () => {
    if (!selectedColaborador || !email || !password) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha todos os campos para continuar.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Check if the email is already used by an admin user
      const { data: profileByEmail } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", email.toLowerCase().trim())
        .single();

      if (profileByEmail) {
        // Via `has_role` (RPC), não por SELECT em `user_roles`: até 2026-07-26 isto era
        // `.eq("role", "admin")`, e o e-mail de um SUPERADMIN passava reto pela barreira
        // — ele não tem linha `admin` na tabela. A hierarquia (superadmin ⇒ admin) vive
        // dentro do `has_role` desde a migration 20260725195530.
        const { data: ehAdmin } = await supabase.rpc("has_role", {
          _user_id: profileByEmail.id,
          _role: "admin",
        });

        if (ehAdmin) {
          toast({
            title: "Email já cadastrado como Administrador",
            description: "Este email já pertence a um Administrador do sistema e não pode ser utilizado para criar acesso de Coordenador.",
            variant: "destructive",
          });
          setIsSubmitting(false);
          return;
        }
      }

      // Call edge function to create coordinator (keeps admin session intact)
      const { data, error } = await supabase.functions.invoke("create-coordenador", {
        body: {
          email,
          password,
          fullName: selectedColabData?.colaboradores?.colab_nome_completo || "",
          colaboradorProvaId: selectedColaborador,
          provaId,
          colaboradorId: selectedColabData?.colaboradores?.id,
        },
      });

      // Handle edge function errors
      if (error) {
        // Try to parse error message from FunctionsHttpError
        let errorMessage = "Erro ao criar coordenador";
        try {
          // The error might contain a context with the response body
          const errorContext = error as { context?: { body?: string } };
          if (errorContext.context?.body) {
            const parsed = JSON.parse(errorContext.context.body);
            errorMessage = parsed.error || errorMessage;
          } else if (error.message) {
            errorMessage = error.message;
          }
        } catch {
          errorMessage = error.message || errorMessage;
        }
        toast({
          title: "Erro ao criar acesso",
          description: errorMessage,
          variant: "destructive",
        });
        setIsSubmitting(false);
        return;
      }

      // Check for error in response data
      if (data?.error) {
        toast({
          title: "Erro ao criar acesso",
          description: data.error,
          variant: "destructive",
        });
        setIsSubmitting(false);
        return;
      }

      // Invalidate queries to refresh the list
      queryClient.invalidateQueries({ queryKey: ["coordenadores-prova", provaId] });
      queryClient.invalidateQueries({ queryKey: ["colaboradores-elegiveis-coordenacao", provaId] });

      toast({
        title: "Coordenador cadastrado",
        description: `Acesso criado com sucesso. Envie as credenciais para o coordenador: Email: ${email} | Senha: ${password}`,
      });

      // Reset form
      setSelectedColaborador("");
      setEmail("");
      setPassword("");
    } catch (error: unknown) {
      console.error("Error creating coordenador:", error);
      const errorMessage = error instanceof Error ? error.message : "Não foi possível criar o acesso do coordenador.";
      toast({
        title: "Erro ao criar acesso",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
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

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Colaborador (Coordenador Geral ou Auxiliar)</Label>
                  <Select
                    value={selectedColaborador}
                    onValueChange={handleSelectColaborador}
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
                        <SelectItem key={c.id} value={c.id}>
                          {c.colaboradores?.colab_nome_completo} ({c.funcoes_colaboradores?.cargo_nome})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Email de Acesso
                  </Label>
                  <Input
                    type="email"
                    placeholder="email@exemplo.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={!selectedColaborador}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Key className="h-4 w-4" />
                    Senha
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      placeholder="Senha de acesso"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={!selectedColaborador}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={generatePassword}
                      disabled={!selectedColaborador}
                    >
                      Gerar
                    </Button>
                  </div>
                </div>

                <div className="flex items-end">
                  <Button
                    onClick={handleSubmit}
                    disabled={!selectedColaborador || !email || !password || isSubmitting}
                    className="w-full gap-2"
                  >
                    {isSubmitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <UserPlus className="h-4 w-4" />
                    )}
                    Conceder Acesso
                  </Button>
                </div>
              </div>

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
