import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Mail, CheckCircle2, Send, XCircle } from "lucide-react";

const formatCpf = (value: string) => {
  const numbers = value.replace(/\D/g, "");
  return numbers
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})/, "$1-$2")
    .replace(/(-\d{2})\d+?$/, "$1");
};

interface ForgotCodeCardProps {
  onClose: () => void;
}

const buildEmailHtml = (nome: string, codigo: string) => `
<!doctype html>
<html lang="pt-BR">
  <head><meta charset="utf-8" /><title>Seu código de acesso</title></head>
  <body style="margin:0;padding:0;background-color:#ffffff;font-family:Inter,Arial,sans-serif;color:#1a1a1a;line-height:1.6;">
    <div style="max-width:600px;margin:0 auto;padding:32px 24px;background-color:#ffffff;">
      <div style="text-align:center;margin:0 0 24px;">
        <img src="https://fevre.online/fevre-logo.png" alt="Logo FEVRE" width="160" style="display:inline-block;max-width:160px;height:auto;" />
      </div>
      <h1 style="color:hsl(0,84%,45%);font-size:24px;font-weight:700;margin:0 0 24px;line-height:1.3;">
        Olá, ${nome || "Colaborador"}!
      </h1>
      <p style="font-size:16px;color:hsl(220,9%,46%);margin:0 0 24px;">
        Você solicitou o código de acesso para o sistema do <strong>FEVRE</strong>.
        Use o código abaixo para entrar na plataforma.
      </p>
      <div style="text-align:center;margin:32px 0;">
        <p style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:hsl(220,9%,46%);margin:0 0 8px;">
          Código de acesso
        </p>
        <p style="display:inline-block;font-size:36px;font-weight:700;letter-spacing:8px;color:hsl(0,84%,45%);background-color:hsl(230,75%,95%);border:2px dashed hsl(230,75%,35%);border-radius:8px;padding:20px 32px;margin:0;">
          ${codigo}
        </p>
      </div>
      <p style="font-size:14px;color:hsl(220,9%,46%);text-align:center;margin:24px 0 0;">
        Este código é pessoal e intransferível. Não o compartilhe com ninguém.
      </p>
      <div style="text-align:center;margin:32px 0;">
        <a href="https://fevre.online/auth" style="display:inline-block;background-color:hsl(0,84%,45%);color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;text-align:center;padding:14px 28px;border-radius:8px;">
          Acessar o sistema
        </a>
      </div>
      <p style="font-size:12px;color:hsl(220,9%,46%);text-align:center;margin:32px 0 0;border-top:1px solid hsl(220,13%,91%);padding-top:24px;">
        Se você não solicitou este código, entre em contato com o administrador do sistema.
      </p>
    </div>
  </body>
</html>`;

export default function ForgotCodeCard({ onClose }: ForgotCodeCardProps) {
  const [cpf, setCpf] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ exists: boolean; email: string | null } | null>(null);
  const [sendStatus, setSendStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [emailInput, setEmailInput] = useState("");

  const busy = isChecking || isSending;
  const needsEmail = result?.exists && !result?.email;
  const verified = result?.exists && !!result?.email;


  const handleCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (verified) return;
    setError(null);
    setResult(null);
    setSendStatus(null);

    const cpfClean = cpf.replace(/\D/g, "");
    if (cpfClean.length !== 11) {
      setError("Digite um CPF válido com 11 dígitos.");
      return;
    }

    setIsChecking(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/check-cpf-colaborador`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ cpf: cpfClean }),
      });
      const data = await res.json().catch(() => ({} as any));

      if (!res.ok) {
        setError(data?.error || "Erro ao verificar CPF. Tente novamente.");
        return;
      }

      setResult({ exists: !!data?.exists, email: data?.email ?? null });
    } catch (err: any) {
      setError(err?.message || "Falha de conexão. Tente novamente.");
    } finally {
      setIsChecking(false);
    }
  };

  const handleSend = async (overrideEmail?: string) => {
    const emailForRequest = overrideEmail ?? result?.email ?? null;
    if (!emailForRequest) return;
    setSendStatus(null);
    setIsSending(true);

    const cpfClean = cpf.replace(/\D/g, "");
    const base = import.meta.env.VITE_SUPABASE_URL;
    const apikey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const headers = {
      "Content-Type": "application/json",
      apikey,
      Authorization: `Bearer ${apikey}`,
    };

    try {
      // 1) Gera novo código e persiste (envia email caso o colaborador não tenha)
      const resetRes = await fetch(`${base}/functions/v1/reset-codigo-acesso`, {
        method: "POST",
        headers,
        body: JSON.stringify({ cpf: cpfClean, ...(overrideEmail ? { email: overrideEmail } : {}) }),
      });
      const resetData = await resetRes.json().catch(() => ({} as any));
      if (!resetRes.ok) {
        throw new Error(resetData?.error || "Não foi possível gerar um novo código.");
      }


      const { email, nome, codigo } = resetData as {
        email: string;
        nome: string;
        codigo: string;
      };

      // 2) Envia email via send-email
      const html = buildEmailHtml(nome, codigo);
      const sendRes = await fetch(`${base}/functions/v1/send-email`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          to: email,
          subject: "Seu código de acesso",
          html,
        }),
      });
      const sendData = await sendRes.json().catch(() => ({} as any));
      if (!sendRes.ok) {
        throw new Error(sendData?.error || "Falha ao enviar o email.");
      }

      if (overrideEmail) {
        setResult({ exists: true, email: overrideEmail });
        setEmailInput("");
      }

      setSendStatus({
        type: "success",
        message: `Novo código enviado para ${email}.`,
      });
    } catch (err: any) {
      setSendStatus({
        type: "error",
        message: err?.message || "Erro ao enviar o código. Tente novamente.",
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <>
    <Card className="border-none shadow-lg mt-6">
      <CardHeader className="space-y-1 pb-4">
        <CardTitle className="text-xl text-center">Estou sem meu código</CardTitle>
        {!verified && !needsEmail && (
          <CardDescription className="text-center">
            Informe seu CPF para localizarmos o email cadastrado
          </CardDescription>
        )}
        {verified && (
          <CardDescription className="text-center">
            Após enviar, confira sua Caixa de Spam
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        <form onSubmit={handleCheck} className="space-y-4">
          {!verified && !needsEmail && (
            <div className="space-y-2">
              <Label htmlFor="forgot-cpf">CPF</Label>
              <Input
                id="forgot-cpf"
                type="text"
                inputMode="numeric"
                placeholder="000.000.000-00"
                value={cpf}
                onChange={(e) => {
                  setCpf(formatCpf(e.target.value));
                  if (error) setError(null);
                  if (result) setResult(null);
                  if (sendStatus) setSendStatus(null);
                }}
                maxLength={14}
                disabled={busy}
                autoFocus
              />
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {result && !result.exists && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                CPF não encontrado em nosso cadastro.
              </AlertDescription>
            </Alert>
          )}

          {result && result.exists && result.email && (
            <Alert>
              <Mail className="h-4 w-4" />
              <AlertDescription>
                Email cadastrado: <strong>{result.email}</strong>
              </AlertDescription>
            </Alert>
          )}

          {needsEmail && (
            <div className="space-y-2">
              <Alert>
                <Mail className="h-4 w-4" />
                <AlertDescription>
                  Não há email cadastrado. Digite seu email para prosseguir com seu cadastro.
                </AlertDescription>
              </Alert>
              <Label htmlFor="forgot-email">Email</Label>
              <Input
                id="forgot-email"
                type="email"
                placeholder="seu@email.com"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                disabled={busy}
                autoFocus
              />
              <Button
                type="button"
                onClick={() => {
                  const v = emailInput.trim();
                  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
                    setSendStatus({ type: "error", message: "Digite um email válido." });
                    return;
                  }
                  handleSend(v);
                }}
                disabled={busy || !emailInput.trim()}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Send className="mr-2 h-4 w-4" />
                {isSending ? "Enviando..." : "Enviar email"}
              </Button>
            </div>
          )}

          {/* inline status removido — feedback exibido em modal dedicado abaixo */}

          {verified && (
            <Button
              type="button"
              onClick={() => handleSend()}
              disabled={busy}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Send className="mr-2 h-4 w-4" />
              {isSending ? "Enviando..." : "Enviar novo código por email"}
            </Button>
          )}

          {!verified && !needsEmail && (
            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={onClose}
                disabled={busy}
              >
                Voltar
              </Button>
              <Button
                type="submit"
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                disabled={busy}
              >
                {isChecking ? "Verificando..." : "Verificar"}
              </Button>
            </div>
          )}
        </form>
      </CardContent>
    </Card>

    {sendStatus && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in p-4"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div
          className={`bg-background border-4 ${
            sendStatus.type === "success" ? "border-green-500" : "border-red-500"
          } rounded-2xl p-10 max-w-lg w-full shadow-2xl relative`}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="flex flex-col items-center text-center space-y-6">
            <div
              className={`w-24 h-24 rounded-full flex items-center justify-center ${
                sendStatus.type === "success"
                  ? "bg-green-100 dark:bg-green-900/30 animate-pulse"
                  : "bg-red-100 dark:bg-red-900/30"
              }`}
            >
              {sendStatus.type === "success" ? (
                <CheckCircle2 className="w-16 h-16 text-green-600 dark:text-green-400" />
              ) : (
                <XCircle className="w-16 h-16 text-red-600 dark:text-red-400" />
              )}
            </div>
            <h2
              className={`text-3xl font-bold ${
                sendStatus.type === "success"
                  ? "text-green-600 dark:text-green-400"
                  : "text-red-600 dark:text-red-400"
              }`}
            >
              {sendStatus.type === "success" ? "Email enviado!" : "Falha no envio"}
            </h2>
            <p className="text-lg text-foreground font-medium">
              {sendStatus.message}
            </p>
            {sendStatus.type === "success" && (
              <p className="text-sm text-red-600 font-semibold">
                Confira também sua caixa de Spam.
              </p>
            )}
            <Button
              type="button"
              onClick={() => {
                if (sendStatus.type === "success") {
                  onClose();
                }
                setSendStatus(null);
              }}
              className={`mt-2 text-white px-10 py-3 text-lg font-semibold ${
                sendStatus.type === "success"
                  ? "bg-green-600 hover:bg-green-700"
                  : "bg-red-600 hover:bg-red-700"
              }`}
            >
              {sendStatus.type === "success" ? "Continuar" : "Fechar"}
            </Button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
