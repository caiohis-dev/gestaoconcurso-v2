import { useState, useEffect } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { useColaboradorAuth } from "@/hooks/useColaboradorAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import fevreLogo from "@/assets/fevre-logo.png";
import { Settings, CheckCircle2, X, ArrowLeft } from "lucide-react";
import ForgotCodeCard from "@/components/ForgotCodeCard";
import { z } from "zod";

const loginSchema = z.object({
  cpf: z.string().min(11, "CPF deve ter 11 dígitos").max(14, "CPF inválido"),
  codigoAcesso: z.string().length(4, "Código de acesso deve ter 4 dígitos"),
});

export default function Auth() {
  const navigate = useNavigate();
  const location = useLocation();
  const { colaborador, loading, signIn } = useColaboradorAuth();
  const { toast } = useToast();
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  // Show success message if redirected after saving profile
  useEffect(() => {
    const state = location.state as { successMessage?: string } | null;
    if (state?.successMessage) {
      setSuccessMessage(state.successMessage);
      setShowSuccessModal(true);
      // Clear the state to prevent showing the message again on refresh
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loginData, setLoginData] = useState({ cpf: "", codigoAcesso: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showForgotCode, setShowForgotCode] = useState(false);


  useEffect(() => {
    if (colaborador && !loading) {
      navigate("/perfil-colaborador");
    }
  }, [colaborador, loading, navigate]);

  const formatCpf = (value: string) => {
    const numbers = value.replace(/\D/g, "");
    return numbers
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})/, "$1-$2")
      .replace(/(-\d{2})\d+?$/, "$1");
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    try {
      loginSchema.parse(loginData);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fieldErrors: Record<string, string> = {};
        error.errors.forEach((err) => {
          if (err.path[0]) {
            fieldErrors[err.path[0] as string] = err.message;
          }
        });
        setErrors(fieldErrors);
        return;
      }
    }

    setIsSubmitting(true);
    const cpfClean = loginData.cpf.replace(/\D/g, "");
    const { error } = await signIn(cpfClean, loginData.codigoAcesso);
    setIsSubmitting(false);

    if (error) {
      toast({
        title: "Erro ao entrar",
        description: error,
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
      {/* Success Modal Overlay */}
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
              <h2 className="text-3xl font-bold text-green-600 dark:text-green-400">
                Sucesso!
              </h2>
              <p className="text-xl text-foreground font-medium">
                {successMessage}
              </p>
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
          <p className="text-muted-foreground text-center text-sm">Sistema de Cadastro de Colaboradores</p>
        </div>

        {!showForgotCode && (
          <Card className="border-none shadow-lg">
            <CardHeader className="space-y-1 pb-4">
              <CardTitle className="text-xl text-center">Área do Colaborador</CardTitle>
              <CardDescription className="text-center">
                Digite seu CPF e código de acesso para entrar
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-cpf">CPF</Label>
                  <Input
                    id="login-cpf"
                    type="text"
                    placeholder="000.000.000-00"
                    value={loginData.cpf}
                    onChange={(e) =>
                      setLoginData({ ...loginData, cpf: formatCpf(e.target.value) })
                    }
                    maxLength={14}
                    disabled={isSubmitting}
                  />
                  {errors.cpf && <p className="text-sm text-destructive">{errors.cpf}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-codigo">Código de Acesso</Label>
                  <Input
                    id="login-codigo"
                    type="text"
                    inputMode="numeric"
                    placeholder="0000"
                    value={loginData.codigoAcesso}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, "").slice(0, 4);
                      setLoginData({ ...loginData, codigoAcesso: value });
                    }}
                    maxLength={4}
                    disabled={isSubmitting}
                    className="text-center text-2xl tracking-[0.5em] font-mono"
                  />
                  {errors.codigoAcesso && <p className="text-sm text-destructive">{errors.codigoAcesso}</p>}
                </div>
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? "Entrando..." : "Entrar"}
                </Button>

                <Button
                  type="button"
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={() => navigate('/cadastro-publico')}
                  disabled={isSubmitting}
                >
                  Novo Colaborador
                </Button>

                <button
                  type="button"
                  onClick={() => setShowForgotCode(true)}
                  className="w-full text-sm text-primary hover:underline"
                  disabled={isSubmitting}
                >
                  Estou sem meu código
                </button>
              </form>
            </CardContent>
          </Card>
        )}

        {showForgotCode && (
          <>
            <button
              type="button"
              onClick={() => setShowForgotCode(false)}
              className="mb-4 flex items-center gap-2 text-sm text-primary hover:underline"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </button>
            <ForgotCodeCard onClose={() => setShowForgotCode(false)} />
          </>
        )}

        <div className="flex justify-center mt-6">
          <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-foreground">
            <Link to="/auth-admin" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Acesso Administrativo
            </Link>
          </Button>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-4">Fundação Educacional de Volta Redonda</p>
      </div>
    </div>
  );
}
