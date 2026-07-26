import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import Layout from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { User, Mail, Lock, Save, Loader2 } from 'lucide-react';

export default function Perfil() {
  // `loading` do useAuth vira `authLoading`: já existe um `loading` local, do submit.
  const { user, loading: authLoading, rolesLoaded, role, isColaborador, isLoggingOut } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState(user?.user_metadata?.full_name || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Até 2026-07-26 esta página não tinha guard NENHUM: renderizava inteira para
  // visitante deslogado. Era a terceira ocorrência da mesma omissão (ver Colaboradores
  // e FuncoesColaboradores, 2026-07-25) — daí o idiom ser copiado delas.
  useEffect(() => {
    if (isLoggingOut) return;
    // Esperar `rolesLoaded`, e não só `authLoading`: este guard decide por PAPEL, e cada
    // refresh de token reabre a janela em que o usuário já existe e os papéis ainda não.
    if (authLoading || !rolesLoaded) return;
    if (!user) {
      navigate('/auth', { replace: true });
    } else if (isColaborador && role === null) {
      // `isColaborador && role === null` é a definição CANÔNICA de "colaborador puro",
      // a mesma de Inicio.tsx e Auth.tsx — não troque por `!isAdmin && !isCoordenador`.
      // Ele tem página própria (/perfil-colaborador) e não deve ver duas telas
      // concorrentes de "meus dados".
      navigate('/perfil-colaborador', { replace: true });
    }
    // Quem tem `role === 'user'` ENTRA, de propósito: tem conta no Auth e o hub já o
    // aceita (com estado vazio). Barrá-lo aqui o deixaria sem lugar para trocar a senha.
  }, [user, authLoading, rolesLoaded, role, isColaborador, navigate, isLoggingOut]);

  // O nome vinha só do `useState` inicial, que roda no primeiro render — quando a sessão
  // ainda não resolveu. Num reload direto em /perfil o campo aparecia VAZIO para quem
  // tinha nome salvo, e salvar assim apagava o nome. Sincroniza por `user?.id` (não pelo
  // objeto `user`): o refresh de token cria objeto novo com o mesmo id, e depender dele
  // sobrescreveria o que a pessoa acabou de digitar.
  useEffect(() => {
    if (user) setFullName(user.user_metadata?.full_name ?? '');
    // Depender de `user` inteiro é o BUG que este efeito evita: o refresh de token troca
    // a identidade do objeto e reescreveria o campo enquanto a pessoa digita. O id é o
    // que importa. (`PerfilColaborador.tsx:141` faz igual, e carrega o aviso.)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        data: { full_name: fullName }
      });

      if (error) throw error;

      // Update profiles table
      await supabase
        .from('profiles')
        .update({ full_name: fullName })
        .eq('id', user?.id);

      toast.success('Perfil atualizado com sucesso!');
    } catch (error: any) {
      toast.error(error.message || 'Erro ao atualizar perfil');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (newPassword !== confirmPassword) {
      toast.error('As senhas não coincidem');
      return;
    }

    if (newPassword.length < 6) {
      toast.error('A nova senha deve ter pelo menos 6 caracteres');
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) throw error;

      toast.success('Senha atualizada com sucesso!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      toast.error(error.message || 'Erro ao atualizar senha');
    } finally {
      setLoading(false);
    }
  };

  if (authLoading || !rolesLoaded) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || (isColaborador && role === null)) {
    return null;
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Meu Perfil</h1>
          <p className="text-muted-foreground">Gerencie suas informações pessoais e senha</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Informações Pessoais
            </CardTitle>
            <CardDescription>Atualize seu nome e informações de contato</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpdateProfile} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    value={user?.email || ''}
                    disabled
                    className="pl-10 bg-muted"
                  />
                </div>
                <p className="text-xs text-muted-foreground">O e-mail não pode ser alterado</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="fullName">Nome Completo</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="fullName"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Seu nome completo"
                    className="pl-10"
                  />
                </div>
              </div>

              <Button type="submit" disabled={loading} className="gap-2">
                <Save className="h-4 w-4" />
                Salvar Alterações
              </Button>
            </form>
          </CardContent>
        </Card>

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
      </div>
    </Layout>
  );
}
