import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Mail, CheckCircle2 } from "lucide-react";

const formatCpf = (value: string) => {
  const numbers = value.replace(/\D/g, "");
  return numbers
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})/, "$1-$2")
    .replace(/(-\d{2})\d+?$/, "$1");
};

type Resultado =
  | { tipo: "enviado"; emailMascarado: string }
  | { tipo: "ja_vinculado" }
  | { tipo: "sem_email" }
  | { tipo: "nao_encontrado" };

interface Props {
  onClose: () => void;
  initialCpf?: string;
}

/**
 * Primeiro acesso de quem JÁ é cadastrado (subetapa 2B). Substitui o ForgotCodeCard,
 * que devolvia o código de 4 dígitos por e-mail. Aqui: CPF → o servidor localiza o
 * cadastro e envia um link do Supabase Auth para o e-mail dele; a tela só mostra o
 * e-mail MASCARADO, nunca por extenso. Sem e-mail no cadastro → procurar o coordenador
 * (não há mais o ramo "digite um e-mail agora", que gravava e-mail sem prova).
 */
export default function ReivindicarAcessoCard({ onClose, initialCpf }: Props) {
  const [cpf, setCpf] = useState(initialCpf ? formatCpf(initialCpf) : "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cpfClean = cpf.replace(/\D/g, "");
    if (cpfClean.length !== 11) {
      setError("Digite um CPF válido com 11 dígitos.");
      return;
    }

    setIsSubmitting(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/reivindicar-acesso`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ cpf: cpfClean }),
      });
      const data = await res.json().catch(() => ({} as Record<string, unknown>));

      if (res.status === 429) {
        setError("Muitas tentativas. Aguarde alguns minutos e tente de novo.");
        return;
      }
      if (!res.ok) {
        setError((data.error as string) || "Não foi possível verificar o CPF. Tente novamente.");
        return;
      }

      if (!data.existe) {
        setResultado({ tipo: "nao_encontrado" });
      } else if (data.ja_vinculado) {
        setResultado({ tipo: "ja_vinculado" });
      } else if (!data.email_mascarado) {
        setResultado({ tipo: "sem_email" });
      } else {
        setResultado({ tipo: "enviado", emailMascarado: data.email_mascarado as string });
      }
    } catch {
      setError("Falha de conexão. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (resultado?.tipo === "enviado") {
    return (
      <Card className="border-none shadow-lg">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <Mail className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <h3 className="text-lg font-semibold">Link enviado</h3>
            <p className="text-muted-foreground">
              Enviamos um link para <strong>{resultado.emailMascarado}</strong>. Abra-o para criar a
              sua senha e acessar o sistema.
            </p>
            <p className="text-sm text-muted-foreground">Não esqueça de conferir a caixa de spam.</p>
            <Button className="w-full" onClick={onClose}>
              Voltar para o login
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (resultado?.tipo === "ja_vinculado") {
    return (
      <Card className="border-none shadow-lg">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center text-center space-y-4">
            <CheckCircle2 className="w-12 h-12 text-primary" />
            <h3 className="text-lg font-semibold">Este cadastro já tem acesso</h3>
            <p className="text-muted-foreground">
              Você já pode entrar com o seu e-mail e senha. Se não lembra a senha, use "Esqueci minha
              senha" na tela de login.
            </p>
            <Button className="w-full" onClick={onClose}>
              Voltar para o login
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (resultado?.tipo === "sem_email" || resultado?.tipo === "nao_encontrado") {
    const semEmail = resultado.tipo === "sem_email";
    return (
      <Card className="border-none shadow-lg">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center text-center space-y-4">
            <AlertCircle className="w-12 h-12 text-amber-500" />
            <h3 className="text-lg font-semibold">
              {semEmail ? "Cadastro sem e-mail" : "CPF não encontrado"}
            </h3>
            <p className="text-muted-foreground">
              {semEmail
                ? "O seu cadastro não tem um e-mail. Procure o coordenador para incluir o seu e-mail — depois volte aqui para criar a sua senha."
                : "Não encontramos um cadastro com esse CPF. Confira o número, ou faça um novo cadastro na tela inicial."}
            </p>
            <Button className="w-full" onClick={onClose}>
              Voltar para o login
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-none shadow-lg">
      <CardHeader className="space-y-1 pb-4">
        <CardTitle className="text-xl text-center">Primeiro acesso</CardTitle>
        <CardDescription className="text-center">
          Informe o seu CPF. Enviaremos um link para o e-mail do seu cadastro.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reivindicar-cpf">CPF</Label>
            <Input
              id="reivindicar-cpf"
              type="text"
              placeholder="000.000.000-00"
              value={cpf}
              onChange={(e) => setCpf(formatCpf(e.target.value))}
              maxLength={14}
              disabled={isSubmitting}
            />
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Enviando..." : "Enviar link de acesso"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
