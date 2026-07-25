import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import fevreLogo from "@/assets/fevre-logo.png";
import { CheckCircle2, X, ArrowLeft } from "lucide-react";
import ReivindicarAcessoCard from "@/components/ReivindicarAcessoCard";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email("E-mail inválido"),
  password: z.string().min(6, "Senha deve ter no mínimo 6 caracteres"),
});

export default function Auth() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading, rolesLoaded, signIn, isColaborador, role } = useAuth();
  const { toast } = useToast();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loginData, setLoginData] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showReivindicar, setShowReivindicar] = useState(false);

  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  // Show success message if redirected after saving profile
  useEffect(() => {
    const state = location.state as { successMessage?: string } | null;
    if (state?.successMessage) {
      setSuccessMessage(state.successMessage);
      setShowSuccessModal(true);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  // Para onde a pessoa vai depois de entrar. Colaborador PURO (só a dimensão
  // colaborador, nenhum papel de gestão) vai direto ao portal dele. Todo o resto —
  // gestor, os 12 híbridos, ou conta sem papel — cai no hub, que mostra os módulos de
  // cada um (ou o estado vazio). Mesma definição de "puro" que o guard do Inicio.tsx.
  useEffect(() => {
    if (loading || !rolesLoaded || !user) return;

    if (isColaborador && role === null) navigate("/perfil-colaborador", { replace: true });
    else navigate("/", { replace: true });
  }, [user, loading, rolesLoaded, isColaborador, role, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    try {
      loginSchema.parse(loginData);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fieldErrors: Record<string, string> = {};
        error.errors.forEach((err) => {
          if (err.path[0]) fieldErrors[err.path[0] as string] = err.message;
        });
        setErrors(fieldErrors);
        return;
      }
    }

    setIsSubmitting(true);
    const { error } = await signIn(loginData.email, loginData.password);
    setIsSubmitting(false);

    if (error) {
      toast({
        title: "Erro ao entrar",
        description:
          error.message === "Invalid login credentials"
            ? "E-mail ou senha incorretos."
            : error.message,
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-muted/30 p-4 relative">
      {showSuccessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-background border-4 border-green-500 rounded-2xl p-10 max-w-lg w-full mx-4 shadow-2xl relative">
            <button
              onClick={() => setShowSuccessModal(false)}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
            <div className="flex flex-col items-center text-center space-y-6">
              <div className="w-24 h-24 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center animate-pulse">
                <CheckCircle2 className="w-16 h-16 text-green-600 dark:text-green-400" />
              </div>
              <h2 className="text-3xl font-bold text-green-600 dark:text-green-400">Sucesso!</h2>
              <p className="text-xl text-foreground font-medium">{successMessage}</p>
              <Button
                onClick={() => setShowSuccessModal(false)}
                className="mt-4 bg-green-600 hover:bg-green-700 text-white px-10 py-3 text-lg font-semibold"
              >
                Continuar
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="w-full max-w-md animate-fade-in">
        <div className="flex flex-col items-center mb-8">
          <img src={fevreLogo} alt="FEVRE Logo" className="h-24 w-auto mb-4" />
          <h1 className="text-2xl font-bold text-foreground">Departamento de Concurso</h1>
          <p className="text-muted-foreground text-center text-sm">
            Sistema de Cadastro de Colaboradores
          </p>
        </div>

        {!showReivindicar && (
          <Card className="border-none shadow-lg">
            <CardHeader className="space-y-1 pb-4">
              <CardTitle className="text-xl text-center">Entrar</CardTitle>
              <CardDescription className="text-center">
                Use seu e-mail e senha para acessar o sistema
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">E-mail</Label>
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="seu@email.com"
                    value={loginData.email}
                    onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                    disabled={isSubmitting}
                  />
                  {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Senha</Label>
                  <Input
                    id="login-password"
                    type="password"
                    placeholder="••••••"
                    value={loginData.password}
                    onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                    disabled={isSubmitting}
                  />
                  {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
                </div>

                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? "Entrando..." : "Entrar"}
                </Button>

                <Button
                  type="button"
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={() => navigate("/cadastro-publico")}
                  disabled={isSubmitting}
                >
                  Novo Colaborador
                </Button>

                {/* Porta única (2026-07-20). Antes eram dois links — "Primeiro acesso
                    (já sou cadastrado)" e "Esqueci minha senha" — que pediam à pessoa
                    para se classificar segundo user_id/email_confirmed_at, estado do
                    banco a que ela não tem acesso. Agora ela só diz quem é, e o
                    servidor decide entre invite e recovery. */}
                <button
                  type="button"
                  onClick={() => setShowReivindicar(true)}
                  className="w-full text-sm text-primary hover:underline"
                  disabled={isSubmitting}
                >
                  Estou sem minha senha
                </button>
              </form>
            </CardContent>
          </Card>
        )}

        {showReivindicar && (
          <>
            <button
              type="button"
              onClick={() => setShowReivindicar(false)}
              className="mb-4 flex items-center gap-2 text-sm text-primary hover:underline"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </button>
            <ReivindicarAcessoCard onClose={() => setShowReivindicar(false)} permitirEmail />
          </>
        )}

        <p className="text-center text-xs text-muted-foreground mt-6">
          Fundação Educacional de Volta Redonda
        </p>
      </div>
    </div>
  );
}
