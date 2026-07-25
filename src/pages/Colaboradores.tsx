import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import Layout from "@/components/Layout";
import ColaboradoresList from "@/components/ColaboradoresList";
import { Button } from "@/components/ui/button";
import { Loader2, UserPlus, Briefcase, FileSpreadsheet } from "lucide-react";

export default function Colaboradores() {
  const { user, loading, rolesLoaded, isAdmin, isCoordenador, isLoggingOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoggingOut) return;
    // Esperar `rolesLoaded`, não só `loading`: um refresh de token reabre a janela em
    // que o usuário já existe e os papéis ainda não — decidir ali expulsaria coordenador.
    if (loading || !rolesLoaded) return;
    if (!user) {
      navigate("/auth", { replace: true });
    } else if (!isAdmin && !isCoordenador) {
      // O módulo Aplicação de Provas é de gestão (ver src/lib/modulos.ts). A RLS já
      // devolve lista vazia a quem não é admin/coordenador; este guard é a barreira
      // de UX que faltava aqui e que as outras páginas do módulo já tinham.
      navigate("/", { replace: true });
    }
  }, [user, loading, rolesLoaded, isAdmin, isCoordenador, navigate, isLoggingOut]);


  if (loading || !rolesLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || (!isAdmin && !isCoordenador)) {
    return null;
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Cadastro de Colaboradores</h1>
            <p className="text-muted-foreground">Gerencie os colaboradores cadastrados para o concurso público</p>
          </div>
          {(isAdmin || isCoordenador) && (
            <div className="flex flex-wrap gap-2">
              {isCoordenador && !isAdmin && (
                <Link to="/provas">
                  <Button variant="default" className="gap-2">
                    <Briefcase className="h-4 w-4" />
                    Minhas Provas
                  </Button>
                </Link>
              )}
              {isAdmin && (
                <Link to="/funcoes-colaboradores">
                  <Button variant="outline" className="gap-2">
                    <Briefcase className="h-4 w-4" />
                    Funções
                  </Button>
                </Link>
              )}
              {(isAdmin || isCoordenador) && (
                <Link to="/cadastro-lote">
                  <Button variant="outline" className="gap-2">
                    <FileSpreadsheet className="h-4 w-4" />
                    Cadastro em Lote
                  </Button>
                </Link>
              )}
              <Link to="/cadastro">
                <Button className="gap-2">
                  <UserPlus className="h-4 w-4" />
                  Novo Colaborador
                </Button>
              </Link>
            </div>
          )}
        </div>

        <ColaboradoresList />
      </div>
    </Layout>
  );
}
