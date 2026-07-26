import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import Layout from '@/components/Layout';
import ColaboradorDialog from '@/components/ColaboradorDialog';

export default function Cadastro() {
  const { user, loading, isAdmin, isCoordenador } = useAuth();
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(true);

  // NÃO é guard: fechar o diálogo devolve a pessoa à lista. A autorização mora no
  // RequireAcesso da rota, no App.tsx.
  useEffect(() => {
    if (!dialogOpen) {
      navigate('/colaboradores');
    }
  }, [dialogOpen, navigate]);

  if (loading || !user || (!isAdmin && !isCoordenador)) return null;

  return (
    <Layout>
      <ColaboradorDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </Layout>
  );
}
