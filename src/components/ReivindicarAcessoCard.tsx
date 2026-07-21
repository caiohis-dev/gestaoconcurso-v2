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
  | { tipo: "nao_encontrado" }
  | { tipo: "generico" };

interface Props {
  onClose: () => void;
  initialCpf?: string;
  /**
   * Porta única da tela de login: o campo aceita CPF **ou** e-mail. Fora dela (o
   * CadastroPublico, que chega aqui com o CPF já conferido) segue só CPF — lá a
   * pessoa acabou de digitar o CPF, oferecer e-mail seria passo a mais sem ganho.
   */
  permitirEmail?: boolean;
}

/**
 * Acesso de quem já é cadastrado e está sem senha.
 *
 * Com `permitirEmail` (tela de login, 2026-07-20) é a **porta única**: um campo só,
 * CPF ou e-mail, detectado pelo `@`. A pessoa não precisa saber se "nunca teve senha"
 * ou "esqueceu a senha" — essa classificação depende de `user_id`/`email_confirmed_at`,
 * que ela não tem como conhecer. Quem decide é o servidor: manda invite ou recovery.
 *
 * ⚠️ AS DUAS RESPOSTAS SÃO ASSIMÉTRICAS DE PROPÓSITO — não uniformize:
 *   - **CPF** (reivindicar-acesso) REVELA: mostra o e-mail MASCARADO, e distingue
 *     "sem e-mail no cadastro" de "CPF não encontrado". É concessão consciente, já
 *     registrada como dívida contida e segurada por rate limit por IP. O mascarado é
 *     o que diz à pessoa QUAL caixa abrir — quem tem três e-mails depende disso.
 *   - **E-mail** (recuperar-senha) NÃO REVELA NADA: resposta idêntica para conta
 *     existente, inexistente ou em cooldown. É anti-enumeração: sem isso, a tela vira
 *     oráculo de quem tem cadastro, testável em massa com uma lista de e-mails comprada.
 * Uniformizar "para ficar consistente" quebra um dos dois lados. Ver o item da porta
 * única em my_rules/backlog.md.
 */
export default function ReivindicarAcessoCard({ onClose, initialCpf, permitirEmail }: Props) {
  const [cpf, setCpf] = useState(initialCpf ? formatCpf(initialCpf) : "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const valor = cpf.trim();
  const ehEmail = permitirEmail === true && valor.includes("@");

  // Caminho do e-mail: a resposta é sempre a mesma, por desenho (ver o aviso acima).
  // A EF resolve sozinha se o caso é recovery (já tem conta) ou invite (estado A,
  // cadastro sem conta) — o front não sabe e não deve saber qual dos dois aconteceu.
  const enviarPorEmail = async (email: string) => {
    setIsSubmitting(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/recuperar-senha`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ email }),
      });

      if (res.status === 429) {
        setError("Muitas tentativas. Aguarde alguns minutos e tente de novo.");
        return;
      }
      if (res.status === 400) {
        setError("Digite um e-mail válido.");
        return;
      }
      if (!res.ok) {
        setError("Não foi possível enviar agora. Tente novamente.");
        return;
      }

      setResultado({ tipo: "generico" });
    } catch {
      setError("Falha de conexão. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (ehEmail) return enviarPorEmail(valor);

    const cpfClean = valor.replace(/\D/g, "");
    if (cpfClean.length !== 11) {
      setError(
        permitirEmail
          ? "Digite um CPF com 11 dígitos ou um e-mail."
          : "Digite um CPF válido com 11 dígitos.",
      );
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

  // Caminho do e-mail. Uma tela só, deliberadamente sem veredicto: não diz se a conta
  // existe, se foi criada agora ou se o envio foi suprimido pelo cooldown.
  if (resultado?.tipo === "generico") {
    return (
      <Card className="border-none shadow-lg">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <Mail className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <h3 className="text-lg font-semibold">Link enviado</h3>
            <p className="text-muted-foreground">
              Se existir um cadastro com esse e-mail, o link acabou de ser enviado para lá. Abra-o
              para definir a sua senha.
            </p>
            <p className="text-sm text-muted-foreground">Não esqueça de conferir a caixa de spam.</p>
            {/* Sem esta dica, quem tem cadastro SEM e-mail (254 pessoas) digita o e-mail
                pessoal, não recebe nada e não tem como saber por quê — a resposta é
                genérica por desenho. Pelo CPF, o servidor acha e explica o caso. */}
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-left">
                Não chegou nada em alguns minutos? Tente de novo <strong>pelo CPF</strong>. Se o seu
                cadastro não tiver e-mail, só o CPF consegue te encontrar.
              </AlertDescription>
            </Alert>
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
              Você já pode entrar com o seu e-mail e senha.
              {permitirEmail
                ? " Se não lembra a senha, volte e informe o seu e-mail neste mesmo campo — o link de redefinição vai para lá."
                : ' Se não lembra a senha, use "Estou sem minha senha" na tela de login.'}
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
        <CardTitle className="text-xl text-center">
          {permitirEmail ? "Estou sem minha senha" : "Primeiro acesso"}
        </CardTitle>
        <CardDescription className="text-center">
          {permitirEmail
            ? "Informe o seu CPF ou o seu e-mail. Enviaremos um link para você definir a sua senha — tanto faz se você nunca teve uma ou se esqueceu."
            : "Informe o seu CPF. Enviaremos um link para o e-mail do seu cadastro."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reivindicar-cpf">{permitirEmail ? "CPF ou e-mail" : "CPF"}</Label>
            <Input
              id="reivindicar-cpf"
              type="text"
              placeholder={permitirEmail ? "000.000.000-00 ou seu@email.com" : "000.000.000-00"}
              value={cpf}
              // A máscara de CPF só entra enquanto o valor puder SER um CPF. Assim que
              // aparece @ ou letra, o texto passa intacto — senão o formatCpf comeria
              // o e-mail (ele descarta tudo que não é dígito).
              onChange={(e) => {
                const v = e.target.value;
                const pareceCpf = !permitirEmail || /^[\d.\-\s]*$/.test(v);
                setCpf(pareceCpf ? formatCpf(v) : v);
              }}
              // maxLength fixo em 14 truncaria e-mail: 14 é o tamanho do CPF mascarado.
              maxLength={permitirEmail && !/^[\d.\-\s]*$/.test(cpf) ? 255 : 14}
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
            {isSubmitting ? "Enviando..." : permitirEmail ? "Enviar link" : "Enviar link de acesso"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
