import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AlertTriangle, Check, Copy, KeyRound, Loader2 } from 'lucide-react';
import { mensagemDeErroDaFuncao } from '@/lib/edge-function-error';

// "Resetar senha" do superadmin em /colaboradores (2026-11-25).
//
// Toda a regra vive na Edge Function `resetar-senha-colaborador`: quem pode (só
// superadmin), quem não pode ser alvo (sem conta, a própria conta), a senha (gerada lá)
// e a trilha (`log_reset_senha`). Esta tela só confirma, chama e mostra o resultado.
//
// ⚠️ A senha aparece UMA vez. Por isso o diálogo não fecha por clique fora (padrão de
// 2026-09-24 no ColaboradorDialog) — no passo do resultado, fechar sem querer é perder a
// senha e ter de resetar de novo.

interface Resultado {
  senha: string;
  email: string;
  nome: string;
}

interface ResetarSenhaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  colaboradorId: string;
  colaboradorNome: string | null;
}

export default function ResetarSenhaDialog({
  open,
  onOpenChange,
  colaboradorId,
  colaboradorNome,
}: ResetarSenhaDialogProps) {
  const [executando, setExecutando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (!open) return;
    setExecutando(false);
    setErro(null);
    setResultado(null);
    setCopiado(false);
  }, [open, colaboradorId]);

  const resetar = async () => {
    setErro(null);
    setExecutando(true);
    const { data, error } = await supabase.functions.invoke('resetar-senha-colaborador', {
      body: { colaborador_id: colaboradorId },
    });
    if (error || data?.error || !data?.senha) {
      setErro(mensagemDeErroDaFuncao(error, data, 'Não foi possível resetar a senha.'));
    } else {
      setResultado({ senha: data.senha, email: data.email, nome: data.nome });
    }
    setExecutando(false);
  };

  const copiar = async () => {
    if (!resultado) return;
    try {
      await navigator.clipboard.writeText(resultado.senha);
      setCopiado(true);
    } catch {
      // Sem permissão de área de transferência: a senha segue visível para copiar à mão.
      setCopiado(false);
    }
  };

  const nome = colaboradorNome || 'este colaborador';

  return (
    <Dialog open={open} onOpenChange={(v) => !executando && onOpenChange(v)}>
      <DialogContent onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            Resetar senha
          </DialogTitle>
          <DialogDescription>{nome}</DialogDescription>
        </DialogHeader>

        {resultado ? (
          <div className="space-y-4">
            <p className="text-sm">
              A senha foi trocada. Repasse à pessoa o login e a senha provisória abaixo, e peça que
              ela escolha uma senha própria na tela de perfil logo ao entrar.
            </p>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Login (e-mail da conta)</p>
              <p className="font-mono text-sm break-all">{resultado.email}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Senha provisória</p>
              <div className="flex items-center gap-2">
                <code
                  aria-label="Senha provisória"
                  className="flex-1 rounded-md border bg-muted px-3 py-2 font-mono text-lg tracking-wider select-all"
                >
                  {resultado.senha}
                </code>
                <Button type="button" variant="outline" size="icon" onClick={copiar} aria-label="Copiar senha">
                  {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <p className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              Esta senha não será exibida de novo.
            </p>
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <p>
              Uma senha provisória será gerada para a conta de <strong>{nome}</strong> e mostrada
              uma única vez, para você repassar.
            </p>
            <p>
              A senha atual deixa de valer na hora, e quem estiver logado com ela é desconectado.
              A operação fica registrada em seu nome.
            </p>
            {erro && (
              <p role="alert" className="text-destructive">
                {erro}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          {resultado ? (
            <Button type="button" onClick={() => onOpenChange(false)}>
              Concluir
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={executando}>
                Cancelar
              </Button>
              <Button type="button" variant="destructive" onClick={resetar} disabled={executando}>
                {executando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Resetar senha
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
