import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import Layout from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import AlterarSenhaCard from '@/components/AlterarSenhaCard';
import { toast } from 'sonner';
import { User, Mail, Save, Loader2 } from 'lucide-react';

export default function Perfil() {
  // `loading` do useAuth vira `authLoading`: já existe um `loading` local, do submit.
  const { user, loading: authLoading, rolesLoaded, isColaboradorSemGestao, isLoggingOut } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState(user?.user_metadata?.full_name || '');
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
    } else if (isColaboradorSemGestao) {
      // `isColaboradorSemGestao` (src/lib/papeis.ts) é a definição CANÔNICA, a mesma de
      // Inicio.tsx e Auth.tsx. Ele tem página própria (/perfil-colaborador) e não deve
      // ver duas telas concorrentes de "meus dados".
      //
      // ⚠️ Não troque por `!isAdmin && !isCoordenador`: hoje é equivalente, mas um
      // degrau novo na escada de gestão passaria a cair aqui em silêncio. (Este aviso
      // já existia por outro motivo — dizia respeito ao `role === null` — e continua
      // valendo; ver o helper.)
      navigate('/perfil-colaborador', { replace: true });
    }
    // Quem tem `role === 'user'` SEM ser colaborador ENTRA, de propósito: tem conta no
    // Auth, o hub o aceita (com estado vazio) e é aqui que ele troca a própria senha.
    // São 3 contas, medido em 2026-09-18.
    //
    // 🔵 Até 18/09 quem tinha `user` + `colaborador` também entrava, pela mesma razão.
    // Agora ele é mandado ao portal — e leva a troca de senha junto, no
    // `AlterarSenhaCard`, que nasceu para esta mudança não virar regressão.
  }, [user, authLoading, rolesLoaded, isColaboradorSemGestao, navigate, isLoggingOut]);

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


  if (authLoading || !rolesLoaded) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || isColaboradorSemGestao) {
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

        <AlterarSenhaCard />
      </div>
    </Layout>
  );
}
