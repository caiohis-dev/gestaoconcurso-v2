import { useEffect } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Loader2, ArrowRight } from "lucide-react";
import { modulosDoUsuario } from "@/lib/modulos";

/**
 * A tela de entrada (hub) — a nova rota raiz "/". Lista os módulos a que o usuário
 * tem acesso. É UX: esconde módulos, não barra ninguém (RLS+EF+guards fazem isso).
 * O colaborador puro NUNCA vê o hub — cai direto no /perfil-colaborador.
 *
 * A rota só é plugada na etapa 3 (troca atômica). Aqui o arquivo só precisa compilar.
 */
export default function Inicio() {
  const { user, loading, rolesLoaded, role, isAdmin, isSuperAdmin, isCoordenador, isColaborador, isLoggingOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoggingOut) return;
    if (loading || !rolesLoaded) return;
    if (!user) navigate("/auth", { replace: true });
  }, [user, loading, rolesLoaded, navigate, isLoggingOut]);

  // Não competir com o reload disparado pelo signOut.
  if (isLoggingOut) return null;

  // Esperar os papéis é obrigatório: decidir com roles não carregados renderiza um hub
  // vazio para todo mundo num piscar (useAuth.tsx:85-88).
  if (loading || !rolesLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return null;

  // Colaborador puro (tem a dimensão colaborador, mas nenhum papel de gestão) não tem
  // hub. Cobre o caso de ele digitar "/" na barra do navegador.
  if (isColaborador && role === null) {
    return <Navigate to="/perfil-colaborador" replace />;
  }

  const ctx = { isAdmin, isSuperAdmin, isCoordenador };
  const modulos = modulosDoUsuario(ctx);

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Início</h1>
          <p className="text-muted-foreground">Escolha um módulo para começar</p>
        </div>

        {modulos.length === 0 ? (
          // Estado real de uma conta recém-criada sem papel — não é erro.
          <Card>
            <CardHeader>
              <CardTitle>Nenhum módulo disponível</CardTitle>
              <CardDescription>
                Seu usuário ainda não tem acesso a nenhum módulo. Fale com a administração.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {modulos.map((modulo, index) => {
              const Icone = modulo.icone;
              return (
                <Card key={modulo.id} className="flex flex-col relative">
                  <div className="absolute top-4 right-4 flex h-6 w-6 items-center justify-center rounded-full bg-blue-900 text-xs font-bold text-white">
                    {index + 1}
                  </div>
                  <CardHeader>
                    <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icone className="h-6 w-6" />
                    </div>
                    <CardTitle>{modulo.nome}</CardTitle>
                    <CardDescription>{modulo.descricao}</CardDescription>
                  </CardHeader>
                  <CardFooter className="mt-auto">
                    <Button className="w-full gap-2" onClick={() => navigate(modulo.rotaEntrada(ctx))}>
                      Entrar
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
