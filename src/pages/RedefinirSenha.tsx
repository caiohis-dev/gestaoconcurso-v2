import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import fevreLogo from "@/assets/fevre-logo.png";
import { z } from "zod";

const senhaSchema = z
  .object({
    password: z.string().min(6, "A senha deve ter no mínimo 6 caracteres"),
    confirmacao: z.string(),
  })
  .refine((d) => d.password === d.confirmacao, {
    message: "As senhas não conferem",
    path: ["confirmacao"],
  });

/**
 * Destino do link de recuperação de senha do Supabase Auth.
 *
 * O link do e-mail chega com uma sessão de recuperação já ativa — é por isso que aqui
 * basta `updateUser`, sem senha antiga. Se a pessoa abrir esta rota sem vir do link,
 * não há sessão e não há o que redefinir.
 */
export default function RedefinirSenha() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [temSessao, setTemSessao] = useState<boolean | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({ password: "", confirmacao: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    // O SDK processa o token da URL e emite PASSWORD_RECOVERY; getSession() logo depois
    // já enxerga a sessão criada por ele.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setTemSessao(true);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setTemSessao((atual) => atual ?? !!session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    try {
      senhaSchema.parse(form);
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
    const { error } = await supabase.auth.updateUser({ password: form.password });
    setIsSubmitting(false);

    if (error) {
      toast({
        title: "Erro ao redefinir",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Senha redefinida",
      description: "Entre novamente com a sua senha nova.",
    });
    await supabase.auth.signOut();
    navigate("/auth", { replace: true });
  };

  if (temSessao === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="flex flex-col items-center mb-8">
          <img src={fevreLogo} alt="FEVRE Logo" className="h-24 w-auto mb-4" />
          <h1 className="text-2xl font-bold text-foreground">Departamento de Concurso</h1>
        </div>

        <Card className="border-none shadow-lg">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-xl text-center">Definir nova senha</CardTitle>
            <CardDescription className="text-center">
              {temSessao
                ? "Escolha a senha que você vai usar para entrar"
                : "Este link não é válido ou já expirou"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {temSessao ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="nova-senha">Nova senha</Label>
                  <Input
                    id="nova-senha"
                    type="password"
                    placeholder="••••••"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    disabled={isSubmitting}
                  />
                  {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmar-senha">Confirmar senha</Label>
                  <Input
                    id="confirmar-senha"
                    type="password"
                    placeholder="••••••"
                    value={form.confirmacao}
                    onChange={(e) => setForm({ ...form, confirmacao: e.target.value })}
                    disabled={isSubmitting}
                  />
                  {errors.confirmacao && (
                    <p className="text-sm text-destructive">{errors.confirmacao}</p>
                  )}
                </div>
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? "Salvando..." : "Salvar senha"}
                </Button>
              </form>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground text-center">
                  Peça um link novo na tela de login, em "Esqueci minha senha".
                </p>
                <Button className="w-full" onClick={() => navigate("/auth")}>
                  Voltar para o login
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Fundação Educacional de Volta Redonda
        </p>
      </div>
    </div>
  );
}
