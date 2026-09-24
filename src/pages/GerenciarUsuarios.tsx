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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useBuscarColaboradoresParaAcesso } from "@/hooks/useColaboradores";
import type { PapelSistema } from "@/hooks/useUsers";
import { concederPapelSchema, DESCRICAO_SITUACAO, situacaoAcesso } from "@/lib/acesso-sistema";

const roleLabels: Record<AppRole, string> = {
  superadmin: "Super Admin",
  admin: "Administrador",
  coordenador: "Coordenador",
  user: "Usuário",
  financeiro: "Financeiro",
};

const roleBadgeVariants: Record<AppRole, "default" | "secondary" | "outline"> = {
  superadmin: "default",
  admin: "default",
  coordenador: "outline",
  user: "secondary",
  financeiro: "outline",
};

export default function GerenciarUsuarios() {
  const { user, loading, isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  const { users, isLoading, updateRole, concederPapelSistema, userCoordenadorProvas } = useUsers();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [termoColaborador, setTermoColaborador] = useState("");
  const [colaboradorId, setColaboradorId] = useState("");
  const [papel, setPapel] = useState<PapelSistema>("admin");
  const [formErro, setFormErro] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const busca = useBuscarColaboradoresParaAcesso(termoColaborador);
  const selecionado = busca.colaboradores.find((c) => c.id === colaboradorId);

  const fecharDialogo = (aberto: boolean) => {
    setDialogOpen(aberto);
    if (!aberto) {
      setTermoColaborador("");
      setColaboradorId("");
      setPapel("admin");
      setFormErro("");
    }
  };

  const handleConceder = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErro("");

    const r = concederPapelSchema.safeParse({ colaboradorId, role: papel });
    if (!r.success) {
      setFormErro(r.error.issues[0].message);
      return;
    }

    setIsSubmitting(true);
    try {
      await concederPapelSistema.mutateAsync({ colaboradorId, role: papel });
      fecharDialogo(false);
    } catch {
      // O toast de erro já foi mostrado pelo `onError` do hook; o diálogo fica aberto.
    } finally {
      setIsSubmitting(false);
    }
  };


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
          <Dialog open={dialogOpen} onOpenChange={fecharDialogo}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Conceder acesso
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Conceder acesso a colaborador</DialogTitle>
                <DialogDescription>
                  Escolha o colaborador e o papel. Quem ainda não tem conta recebe, no e-mail do
                  cadastro, o link para criar a própria senha.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleConceder} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="busca-colaborador">Colaborador</Label>
                  <Input
                    id="busca-colaborador"
                    value={termoColaborador}
                    onChange={(e) => {
                      setTermoColaborador(e.target.value);
                      setColaboradorId("");
                    }}
                    placeholder="Nome, CPF ou matrícula"
                    autoComplete="off"
                  />
                  {busca.isFetching && (
                    <p className="text-sm text-muted-foreground flex items-center gap-2">
                      <Loader2 className="h-3 w-3 animate-spin" /> Buscando...
                    </p>
                  )}
                  {busca.error && (
                    <p className="text-sm text-destructive">Não foi possível buscar: {busca.error.message}</p>
                  )}
                  {busca.buscou && busca.colaboradores.length === 0 && (
                    <p className="text-sm text-muted-foreground">Nenhum colaborador encontrado.</p>
                  )}
                  {busca.colaboradores.length > 0 && (
                    <div role="listbox" aria-label="Colaboradores encontrados" className="max-h-56 overflow-y-auto rounded-md border">
                      {busca.colaboradores.map((c) => {
                        const situacao = situacaoAcesso(c);
                        const desabilitado = situacao === "sem-email";
                        const ativo = c.id === colaboradorId;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            role="option"
                            aria-selected={ativo}
                            disabled={desabilitado}
                            onClick={() => setColaboradorId(c.id)}
                            className={`w-full text-left px-3 py-2 border-b last:border-b-0 text-sm ${
                              ativo ? "bg-primary/10" : "hover:bg-muted"
                            } ${desabilitado ? "opacity-60 cursor-not-allowed" : ""}`}
                          >
                            <div className="font-medium">{c.colab_nome_completo}</div>
                            <div className={`text-xs ${desabilitado ? "text-destructive" : "text-muted-foreground"}`}>
                              {DESCRICAO_SITUACAO[situacao]}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {busca.total > busca.colaboradores.length && (
                    <p className="text-xs text-muted-foreground">
                      Mostrando {busca.colaboradores.length} de {busca.total} — refine a busca.
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Papel</Label>
                  <Select value={papel} onValueChange={(value: PapelSistema) => setPapel(value)}>
                    <SelectTrigger id="role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="superadmin">Super Admin</SelectItem>
                      <SelectItem value="admin">Administrador</SelectItem>
                      <SelectItem value="financeiro">Financeiro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {selecionado && (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      {selecionado.colab_nome_completo}: {DESCRICAO_SITUACAO[situacaoAcesso(selecionado)]}.
                    </AlertDescription>
                  </Alert>
                )}
                {formErro && <p className="text-sm text-destructive">{formErro}</p>}
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => fecharDialogo(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={isSubmitting || !selecionado}>
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Concedendo...
                      </>
                    ) : (
                      "Conceder acesso"
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
                    <TableHead className="text-center">Financeiro</TableHead>
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
                              className={role === "superadmin" ? "bg-purple-600" : role === "admin" ? "bg-primary" : role === "coordenador" || role === "financeiro" ? "border-primary text-primary" : ""}
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
                      {/* Somente leitura desde 2026-07-26: superadmin e admin são papéis
                          PUROS e se concedem aqui; coordenação depende de alocação numa
                          prova, então é concedida e revogada no CoordenadoresProvaDialog.
                          A informação fica — saber POR QUE alguém tem o papel é útil num
                          painel de usuários —, o controle é que saiu. */}
                      <TableCell className="text-center">
                        {u.roles.includes("coordenador") ? (
                          <div className="flex flex-col items-center gap-1">
                            <Badge variant="outline" className="border-primary text-primary">
                              Sim
                            </Badge>
                            {userCoordenadorProvas[u.id] && (
                              <span
                                className="text-xs text-muted-foreground max-w-[120px] truncate"
                                title={userCoordenadorProvas[u.id]?.join(", ")}
                              >
                                {userCoordenadorProvas[u.id]?.length === 1
                                  ? userCoordenadorProvas[u.id][0]
                                  : `${userCoordenadorProvas[u.id]?.length} provas`}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={u.roles.includes("financeiro")}
                          onCheckedChange={() => handleRoleToggle(u.id, "financeiro", u.roles.includes("financeiro"))}
                          disabled={updateRole.isPending}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
