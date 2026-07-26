import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useUsers, AppRole } from "@/hooks/useUsers";
import { useProvas } from "@/hooks/useProvas";
import Layout from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { Loader2, Plus, Shield, User, Users, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { z } from "zod";
import { Alert, AlertDescription } from "@/components/ui/alert";

export const createUserSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "Senha deve ter no mínimo 6 caracteres"),
  fullName: z.string().min(2, "Nome deve ter no mínimo 2 caracteres"),
  role: z.enum(["admin", "user", "coordenador", "superadmin"]),
  provaId: z.string().optional(),
}).refine((data) => {
  if (data.role === "coordenador" && !data.provaId) {
    return false;
  }
  return true;
}, {
  message: "Selecione uma prova para o coordenador",
  path: ["provaId"],
});

const roleLabels: Record<AppRole, string> = {
  superadmin: "Super Admin",
  admin: "Administrador",
  coordenador: "Coordenador",
  user: "Usuário",
};

const roleBadgeVariants: Record<AppRole, "default" | "secondary" | "outline"> = {
  superadmin: "default",
  admin: "default",
  coordenador: "outline",
  user: "secondary",
};

export default function GerenciarUsuarios() {
  const { user, loading, isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  const { users, isLoading, updateRole, createUser, addCoordenadorAccess, userCoordenadorProvas } = useUsers();
  const { provas, isLoading: isLoadingProvas } = useProvas();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [coordenadorDialogOpen, setCoordenadorDialogOpen] = useState(false);
  const [selectedUserForCoordenador, setSelectedUserForCoordenador] = useState<{ id: string; email: string } | null>(null);
  const [selectedProvaId, setSelectedProvaId] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    fullName: "",
    role: "user" as AppRole,
    provaId: "",
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);


  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErrors({});

    try {
      createUserSchema.parse(formData);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors: Record<string, string> = {};
        error.errors.forEach((err) => {
          if (err.path[0]) {
            errors[err.path[0] as string] = err.message;
          }
        });
        setFormErrors(errors);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      await createUser.mutateAsync(formData);
      setDialogOpen(false);
      setFormData({ email: "", password: "", fullName: "", role: "user", provaId: "" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCoordenadorToggle = async (userId: string, email: string, currentlyHas: boolean) => {
    if (currentlyHas) {
      // Remover papel de coordenador
      await updateRole.mutateAsync({
        userId,
        role: "coordenador",
        action: "remove",
      });
    } else {
      // Abrir diálogo para selecionar a prova
      setSelectedUserForCoordenador({ id: userId, email });
      setSelectedProvaId("");
      setCoordenadorDialogOpen(true);
    }
  };

  const handleConfirmCoordenador = async () => {
    if (!selectedUserForCoordenador || !selectedProvaId) return;
    
    setIsSubmitting(true);
    try {
      await addCoordenadorAccess.mutateAsync({
        userId: selectedUserForCoordenador.id,
        provaId: selectedProvaId,
      });
      setCoordenadorDialogOpen(false);
      setSelectedUserForCoordenador(null);
      setSelectedProvaId("");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Obter provas não finalizadas para seleção
  const availableProvas = provas.filter(p => !p.prova_finalizada);

  const handleRoleToggle = async (userId: string, role: AppRole, currentlyHas: boolean) => {
    await updateRole.mutateAsync({
      userId,
      role,
      action: currentlyHas ? "remove" : "add",
    });
  };

  const filteredUsers = users.filter(
    (u) =>
      u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.full_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }


  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Users className="h-6 w-6" />
              Gestão de Usuários
            </h1>
            <p className="text-muted-foreground">
              Gerencie os usuários do sistema e suas permissões
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Novo Usuário
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Criar Novo Usuário</DialogTitle>
                <DialogDescription>
                  Preencha os dados para cadastrar um novo usuário no sistema.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateUser} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Nome Completo</Label>
                  <Input
                    id="fullName"
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    placeholder="Nome do usuário"
                  />
                  {formErrors.fullName && (
                    <p className="text-sm text-destructive">{formErrors.fullName}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="email@exemplo.com"
                  />
                  {formErrors.email && (
                    <p className="text-sm text-destructive">{formErrors.email}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Senha</Label>
                  <Input
                    id="password"
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="••••••"
                  />
                  {formErrors.password && (
                    <p className="text-sm text-destructive">{formErrors.password}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Permissão Inicial</Label>
                  <Select
                    value={formData.role}
                    onValueChange={(value: AppRole) => setFormData({ ...formData, role: value, provaId: "" })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="superadmin">Super Admin</SelectItem>
                      <SelectItem value="admin">Administrador</SelectItem>
                      <SelectItem value="coordenador">Coordenador</SelectItem>
                      <SelectItem value="user">Usuário</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {formData.role === "coordenador" && (
                  <div className="space-y-2">
                    <Label htmlFor="provaId">Prova do Coordenador *</Label>
                    <Select
                      value={formData.provaId}
                      onValueChange={(value) => setFormData({ ...formData, provaId: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione a prova..." />
                      </SelectTrigger>
                      <SelectContent>
                        {isLoadingProvas ? (
                          <SelectItem value="" disabled>Carregando...</SelectItem>
                        ) : availableProvas.length === 0 ? (
                          <SelectItem value="" disabled>Nenhuma prova disponível</SelectItem>
                        ) : (
                          availableProvas.map((prova) => (
                            <SelectItem key={prova.id} value={prova.id}>
                              {prova.editais?.nome}
                              {prova.prova_data && ` - ${format(new Date(prova.prova_data), "dd/MM/yyyy")}`}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    {formErrors.provaId && (
                      <p className="text-sm text-destructive">{formErrors.provaId}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      O coordenador terá acesso apenas a esta prova específica.
                    </p>
                  </div>
                )}
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Criando...
                      </>
                    ) : (
                      "Criar Usuário"
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search */}
        <div className="flex gap-4">
          <Input
            placeholder="Buscar por nome ou email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-sm"
          />
        </div>

        {/* Users Table */}
        <Card>
          <CardHeader>
            <CardTitle>Usuários Cadastrados</CardTitle>
            <CardDescription>
              Total de {filteredUsers.length} usuário(s) encontrado(s)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <User className="h-12 w-12 mb-2" />
                <p>Nenhum usuário encontrado</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Permissões Atuais</TableHead>
                    <TableHead>Cadastrado em</TableHead>
                    <TableHead className="text-center">Super Admin</TableHead>
                    <TableHead className="text-center">Admin</TableHead>
                    <TableHead className="text-center">Coordenador</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{u.full_name || "Sem nome"}</p>
                          <p className="text-sm text-muted-foreground">{u.email}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {u.roles.map((role) => (
                            <Badge
                              key={role}
                              variant={roleBadgeVariants[role]}
                              className={role === "superadmin" ? "bg-purple-600" : role === "admin" ? "bg-primary" : role === "coordenador" ? "border-primary text-primary" : ""}
                            >
                              {roleLabels[role]}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {u.created_at
                          ? format(new Date(u.created_at), "dd/MM/yyyy", { locale: ptBR })
                          : "-"}
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={u.roles.includes("superadmin")}
                          onCheckedChange={() => handleRoleToggle(u.id, "superadmin", u.roles.includes("superadmin"))}
                          disabled={updateRole.isPending}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={u.roles.includes("admin")}
                          onCheckedChange={() => handleRoleToggle(u.id, "admin", u.roles.includes("admin"))}
                          disabled={updateRole.isPending}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex flex-col items-center gap-1">
                          <Switch
                            checked={u.roles.includes("coordenador")}
                            onCheckedChange={() => handleCoordenadorToggle(u.id, u.email, u.roles.includes("coordenador"))}
                            disabled={updateRole.isPending || addCoordenadorAccess.isPending}
                          />
                          {u.roles.includes("coordenador") && userCoordenadorProvas[u.id] && (
                            <span className="text-xs text-muted-foreground max-w-[120px] truncate" title={userCoordenadorProvas[u.id]?.join(", ")}>
                              {userCoordenadorProvas[u.id]?.length === 1 
                                ? userCoordenadorProvas[u.id][0] 
                                : `${userCoordenadorProvas[u.id]?.length} provas`}
                            </span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Dialog para selecionar prova do coordenador */}
        <Dialog open={coordenadorDialogOpen} onOpenChange={setCoordenadorDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adicionar Acesso de Coordenador</DialogTitle>
              <DialogDescription>
                Selecione a prova que o usuário <strong>{selectedUserForCoordenador?.email}</strong> terá acesso como coordenador.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  O coordenador terá acesso apenas à prova selecionada e suas unidades vinculadas.
                </AlertDescription>
              </Alert>
              <div className="space-y-2">
                <Label>Prova</Label>
                <Select value={selectedProvaId} onValueChange={setSelectedProvaId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a prova..." />
                  </SelectTrigger>
                  <SelectContent>
                    {isLoadingProvas ? (
                      <SelectItem value="" disabled>Carregando...</SelectItem>
                    ) : availableProvas.length === 0 ? (
                      <SelectItem value="" disabled>Nenhuma prova disponível</SelectItem>
                    ) : (
                      availableProvas.map((prova) => (
                        <SelectItem key={prova.id} value={prova.id}>
                          {prova.editais?.nome}
                          {prova.prova_data && ` - ${format(new Date(prova.prova_data), "dd/MM/yyyy")}`}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCoordenadorDialogOpen(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={handleConfirmCoordenador} 
                disabled={!selectedProvaId || isSubmitting || addCoordenadorAccess.isPending}
              >
                {isSubmitting || addCoordenadorAccess.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Adicionando...
                  </>
                ) : (
                  "Confirmar"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
