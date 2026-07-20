import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AlertTriangle, Loader2 } from 'lucide-react';

// Etapa 2 — ponto de entrada da reconciliação do estado B (conta de acesso pendente
// criada no e-mail errado). Toda a lógica e a decisão de recusa vivem na Edge Function
// corrigir-email-acesso; aqui só se pergunta o estado ('consultar') e se envia a
// correção ('corrigir'). O front nunca lê o Auth.

interface Consulta {
  estado: 'A' | 'B' | 'C';
  email_cadastro: string | null;
  email_conta: string | null;
  divergentes: boolean;
}

interface CorrigirEmailAcessoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  colaboradorId: string;
  colaboradorNome: string | null;
}

export default function CorrigirEmailAcessoDialog({
  open,
  onOpenChange,
  colaboradorId,
  colaboradorNome,
}: CorrigirEmailAcessoDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [consulta, setConsulta] = useState<Consulta | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [novoEmail, setNovoEmail] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setConsulta(null);
    setNovoEmail('');
    setErro(null);
    setIsLoading(true);

    (async () => {
      const { data, error } = await supabase.functions.invoke('corrigir-email-acesso', {
        body: { acao: 'consultar', colaborador_id: colaboradorId },
      });
      if (error || data?.error) {
        setErro(data?.error || 'Não foi possível consultar a conta de acesso.');
      } else {
        setConsulta(data as Consulta);
        // O caso típico: colab_email já foi corrigido por alguém e a conta ficou no
        // endereço velho. Aí o cadastro é o palpite certo para o campo.
        if (data?.divergentes && data?.email_cadastro) setNovoEmail(data.email_cadastro);
      }
      setIsLoading(false);
    })();
  }, [open, colaboradorId]);

  const handleSubmit = async () => {
    setErro(null);
    setIsSaving(true);

    const { data, error } = await supabase.functions.invoke('corrigir-email-acesso', {
      body: { acao: 'corrigir', colaborador_id: colaboradorId, novo_email: novoEmail.trim() },
    });

    setIsSaving(false);

    if (error || data?.error) {
      setErro(data?.error || 'Não foi possível corrigir o e-mail de acesso.');
      return;
    }

    queryClient.invalidateQueries({ queryKey: ['colaboradores'] });

    toast({
      title: data?.ok ? 'E-mail de acesso corrigido' : 'E-mail corrigido, mas o link não saiu',
      description:
        data?.aviso ??
        `A conta de acesso foi movida para ${data?.email_mascarado ?? 'o e-mail informado'}, e o link para criar a senha foi enviado para lá.`,
      variant: data?.ok ? undefined : 'destructive',
    });

    onOpenChange(false);
  };

  const podeCorrigir = consulta?.estado === 'B';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Corrigir e-mail de acesso</DialogTitle>
          <DialogDescription>
            {colaboradorNome ?? 'Colaborador'} — a conta de acesso é criada no e-mail do cadastro.
            Se o endereço estava errado, é aqui que se conserta.
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Consultando a conta de acesso...
          </div>
        )}

        {!isLoading && consulta?.estado === 'C' && (
          <div className="space-y-3 py-2">
            <p className="text-sm">
              Esta conta <strong>já foi confirmada</strong> e está em uso — o colaborador entra com{' '}
              <strong>{consulta.email_conta}</strong>.
            </p>
            <p className="text-sm text-muted-foreground">
              Trocar o e-mail dela seria trocar o login de alguém, então não acontece por aqui. A
              mudança pertence ao próprio colaborador.
            </p>
          </div>
        )}

        {!isLoading && consulta?.estado === 'A' && (
          <p className="py-2 text-sm">
            Este cadastro ainda não tem conta de acesso. O e-mail pode ser editado normalmente no
            próprio cadastro.
          </p>
        )}

        {!isLoading && consulta?.estado === 'B' && (
          <div className="space-y-4">
            <div className="rounded-md border border-amber-500/40 bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
              <div className="flex gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div className="space-y-1">
                  <p className="font-medium">Conta de acesso pendente, nunca usada.</p>
                  <p className="text-muted-foreground">
                    Foi criada em <strong>{consulta.email_conta}</strong> e ninguém a confirmou.
                    {consulta.divergentes && (
                      <>
                        {' '}
                        O cadastro já diz <strong>{consulta.email_cadastro}</strong> — é essa
                        divergência que deixa a pessoa sem entrar.
                      </>
                    )}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="novo_email_acesso">E-mail correto</Label>
              <Input
                id="novo_email_acesso"
                type="email"
                value={novoEmail}
                onChange={(e) => setNovoEmail(e.target.value)}
                maxLength={255}
                placeholder="email@exemplo.com"
              />
              <p className="text-xs text-muted-foreground">
                A conta de acesso passa a ser este endereço, o cadastro acompanha, e o link para
                criar a senha é enviado para ele. A conta continua pendente até a pessoa abrir o
                link — é assim que ela prova que a caixa é dela.
              </p>
            </div>
          </div>
        )}

        {erro && <p className="text-sm text-destructive">{erro}</p>}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {podeCorrigir ? 'Cancelar' : 'Fechar'}
          </Button>
          {podeCorrigir && (
            <Button type="button" onClick={handleSubmit} disabled={isSaving || !novoEmail.trim()}>
              {isSaving ? 'Corrigindo...' : 'Corrigir e reenviar'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
