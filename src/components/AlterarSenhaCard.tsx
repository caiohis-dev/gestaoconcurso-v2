import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Lock } from 'lucide-react';

/**
 * Trocar a própria senha, estando logado. Usado pelo `/perfil` (gestão) e pelo
 * `/perfil-colaborador`.
 *
 * Nasceu extraído do `Perfil.tsx` em 2026-09-18, quando o colaborador sem papel de
 * gestão passou a ser mandado para `/perfil-colaborador`: aquela página não monta o
 * `Layout`, logo não alcança o link "Alterar Cadastro" do menu — o caminho logado que
 * essas 40 pessoas usavam. Sem este card, sobraria só sair e pedir link por e-mail.
 *
 * 🔵 O `loading` é DESTE formulário. No `Perfil.tsx` ele era compartilhado com o de
 * nome, então salvar o nome desabilitava o botão de senha.
 */
export default function AlterarSenhaCard() {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      toast.error('As senhas não coincidem');
      return;
    }

    // ⚠️ 6 é o `minimum_password_length` do Auth em produção. Pedir menos aqui só
    // trocaria o erro nosso pelo erro do GoTrue, em inglês.
    if (newPassword.length < 6) {
      toast.error('A nova senha deve ter pelo menos 6 caracteres');
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;

      toast.success('Senha atualizada com sucesso!');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      toast.error(error.message || 'Erro ao atualizar senha');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lock className="h-5 w-5" />
          Alterar Senha
        </CardTitle>
        <CardDescription>Atualize sua senha de acesso</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleUpdatePassword} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="newPassword">Nova Senha</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="pl-10"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirmar Nova Senha</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repita a nova senha"
                className="pl-10"
              />
            </div>
          </div>

          <Button type="submit" disabled={loading} variant="secondary" className="gap-2">
            <Lock className="h-4 w-4" />
            Atualizar Senha
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
