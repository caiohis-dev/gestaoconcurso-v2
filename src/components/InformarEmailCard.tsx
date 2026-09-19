import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

/**
 * O colaborador cujo cadastro está SEM e-mail informa o próprio.
 *
 * 🔴 ESTE CAMINHO NÃO PROVA IDENTIDADE, e isso é decisão explícita de 2026-09-19, não
 * esquecimento: pede CPF + e-mail, e o CPF não é segredo. A fragilidade inteira — o que
 * ela permite, o que a contém e o que a desfaz — está em
 * `my_rules/analises/dividas-auth-colaborador.md` §5.
 *
 * ⚠️ Nada de regra de negócio mora aqui. Quem decide se o cadastro pode receber o e-mail
 * é a RPC `registrar_email_do_proprio_cadastro`, numa transação, com as guardas. Esta
 * tela só coleta, compara os dois campos e mostra o que o servidor respondeu.
 *
 * Saiu de dentro do `ReivindicarAcessoCard` porque aquele arquivo já passava de 300
 * linhas com cinco ramos — e porque um formulário com efeito irreversível merece ser
 * lido (e testado) sozinho.
 */
interface Props {
  /** O CPF que o SERVIDOR confirmou existir e estar sem e-mail — nunca o do input. */
  cpf: string;
  /** 'auth' ou 'cadastro-publico': vai para a trilha, para dizer por onde entrou. */
  origem: "auth" | "cadastro-publico";
  onEnviado: (emailMascarado: string) => void;
  onCancel: () => void;
}

export default function InformarEmailCard({ cpf, origem, onEnviado, onCancel }: Props) {
  const [email, setEmail] = useState("");
  const [confirma, setConfirma] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const informado = email.trim();

    if (!informado) {
      setError("Informe o seu e-mail.");
      return;
    }
    // A dupla digitação não é cerimônia: um erro aqui é IRREVERSÍVEL para a pessoa. O
    // cadastro passa a ter e-mail, esta porta se fecha, e o link vai para uma caixa que
    // não é dela — só a coordenação desfaz.
    //
    // Comparação normalizada: "Ana@x.com" e "ana@x.com " são o mesmo endereço, e o
    // servidor compara por lower(trim(...)) de qualquer forma. Recusar aí seria inventar
    // uma regra que o banco não tem.
    if (informado.toLowerCase() !== confirma.trim().toLowerCase()) {
      setError("Os dois e-mails não são iguais. Confira e tente de novo.");
      return;
    }

    setIsSubmitting(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/incluir-email-cadastro`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ cpf, email: informado, origem }),
      });
      const data = await res.json().catch(() => ({} as Record<string, unknown>));

      if (res.status === 429) {
        setError("Muitas tentativas. Aguarde alguns minutos e tente de novo.");
        return;
      }
      if (!res.ok) {
        // A recusa do banco é escrita para ser lida (CLAUDE.md §2) — repassa-se inteira,
        // sem trocar por um texto genérico que desfaria o trabalho que ela teve.
        setError((data.error as string) || "Não foi possível registrar o seu e-mail.");
        return;
      }

      onEnviado(data.email_mascarado as string);
    } catch {
      setError("Falha de conexão. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="border-none shadow-lg">
      <CardHeader className="space-y-1 pb-4">
        <CardTitle className="text-xl text-center">Cadastro sem e-mail</CardTitle>
        <CardDescription className="text-center">
          Encontramos o seu cadastro, mas ele não tem e-mail. Informe o seu para receber o
          link de acesso.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={enviar} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email-novo">Seu e-mail</Label>
            <Input
              id="email-novo"
              type="email"
              inputMode="email"
              autoComplete="email"
              maxLength={255}
              placeholder="voce@exemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email-confirma">Repita o e-mail</Label>
            <Input
              id="email-confirma"
              type="email"
              inputMode="email"
              autoComplete="off"
              maxLength={255}
              placeholder="voce@exemplo.com"
              value={confirma}
              onChange={(e) => setConfirma(e.target.value)}
              required
            />
          </div>

          {/* Não é aviso decorativo: depois disto o cadastro passa a ter e-mail, esta
              porta se fecha, e desfazer passa a depender da coordenação. */}
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-left">
              Confira com atenção: este e-mail vira o <strong>seu login</strong> e só a
              coordenação consegue trocá-lo depois. Use uma caixa que só você acessa.
            </AlertDescription>
          </Alert>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Enviando..." : "Usar este e-mail"}
          </Button>
          <Button type="button" variant="ghost" className="w-full" onClick={onCancel}>
            Voltar para o login
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
