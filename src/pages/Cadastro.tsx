import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import Layout from '@/components/Layout';
import ColaboradorDialog from '@/components/ColaboradorDialog';

export default function Cadastro() {
  const { user, loading, isAdmin, isCoordenador } = useAuth();
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    } else if (!loading && !isAdmin && !isCoordenador) {
      navigate('/');
    }
  }, [user, loading, isAdmin, isCoordenador, navigate]);

  useEffect(() => {
    if (!dialogOpen) {
      navigate('/');
    }
  }, [dialogOpen, navigate]);

  if (loading || !user || (!isAdmin && !isCoordenador)) return null;

  return (
    <Layout>
      <ColaboradorDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </Layout>
  );
}
