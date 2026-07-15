import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ColaboradorDialog from '@/components/ColaboradorDialog';
import ReivindicarAcessoCard from '@/components/ReivindicarAcessoCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, ArrowLeft } from 'lucide-react';
import fevreLogo from '@/assets/fevre-logo.png';

const formatCpf = (value: string) => {
  const numbers = value.replace(/\D/g, '');
  return numbers
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})/, '$1-$2')
    .replace(/(-\d{2})\d+?$/, '$1');
};

export default function CadastroPublico() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'check' | 'form' | 'ja_existe'>('check');
  const [cpf, setCpf] = useState('');
  const [cpfValido, setCpfValido] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cpfClean = cpf.replace(/\D/g, '');
    if (cpfClean.length !== 11) {
      setError('Digite um CPF válido com 11 dígitos.');
      return;
    }

    setIsChecking(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/check-cpf-colaborador`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ cpf: cpfClean }),
      });
      const result = await res.json().catch(() => ({} as any));

      if (!res.ok) {
        setError(result?.error || 'Erro ao verificar CPF. Tente novamente.');
        return;
      }

      if (result?.exists) {
        // As duas portas convergem: quem já está cadastrado não recomeça um cadastro —
        // segue para a reivindicação (recebe o link no e-mail do cadastro).
        setStep('ja_existe');
        return;
      }

      setCpfValido(cpfClean);
      setStep('form');
      setDialogOpen(true);
    } catch (err: any) {
      setError(err?.message || 'Falha de conexão. Tente novamente.');
    } finally {
      setIsChecking(false);
    }
  };

  const handleDialogChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      navigate('/auth');
    }
  };

  if (step === 'form') {
    return (
      <div className="min-h-screen bg-muted/30">
        <ColaboradorDialog
          open={dialogOpen}
          onOpenChange={handleDialogChange}
          publicMode
          initialCpf={cpfValido}
        />
      </div>
    );
  }

  if (step === 'ja_existe') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-muted/30 p-4">
        <div className="w-full max-w-md animate-fade-in">
          <div className="flex flex-col items-center mb-6">
            <img src={fevreLogo} alt="FEVRE Logo" className="h-24 w-auto mb-4" />
            <h1 className="text-2xl font-bold text-foreground">Você já tem cadastro</h1>
            <p className="text-muted-foreground text-center text-sm">
              Encontramos um cadastro com esse CPF. Vamos criar o seu acesso.
            </p>
          </div>
          <ReivindicarAcessoCard onClose={() => navigate('/auth')} initialCpf={cpf.replace(/\D/g, '')} />
          <button
            type="button"
            onClick={() => { setStep('check'); setCpf(''); }}
            className="mt-4 w-full flex items-center justify-center gap-2 text-sm text-primary hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            Usar outro CPF
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="flex flex-col items-center mb-8">
          <img src={fevreLogo} alt="FEVRE Logo" className="h-24 w-auto mb-4" />
          <h1 className="text-2xl font-bold text-foreground">Novo Colaborador</h1>
          <p className="text-muted-foreground text-center text-sm">
            Primeiro, informe seu CPF para verificarmos se já existe cadastro
          </p>
        </div>

        <Card className="border-none shadow-lg">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-xl text-center">Verificar CPF</CardTitle>
            <CardDescription className="text-center">
              Digite o CPF do colaborador para continuar
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCheck} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="check-cpf">CPF</Label>
                <Input
                  id="check-cpf"
                  type="text"
                  inputMode="numeric"
                  placeholder="000.000.000-00"
                  value={cpf}
                  onChange={(e) => {
                    setCpf(formatCpf(e.target.value));
                    if (error) setError(null);
                  }}
                  maxLength={14}
                  disabled={isChecking}
                  autoFocus
                />
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => navigate('/auth')}
                  disabled={isChecking}
                >
                  Voltar
                </Button>
                <Button
                  type="submit"
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                  disabled={isChecking}
                >
                  {isChecking ? 'Verificando...' : 'Continuar'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
