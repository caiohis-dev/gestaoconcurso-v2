import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface ColaboradorSession {
  id: string;
  nome: string;
  cpf: string;
}

interface ColaboradorAuthContextType {
  colaborador: ColaboradorSession | null;
  loading: boolean;
  signIn: (cpf: string, codigoAcesso: string) => Promise<{ error: string | null; colaboradorId?: string }>;
  signOut: () => void;
}

const STORAGE_KEY = 'colaborador_session';

const ColaboradorAuthContext = createContext<ColaboradorAuthContextType | undefined>(undefined);

export function ColaboradorAuthProvider({ children }: { children: ReactNode }) {
  const [colaborador, setColaborador] = useState<ColaboradorSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for existing session in localStorage
    const storedSession = localStorage.getItem(STORAGE_KEY);
    if (storedSession) {
      try {
        const session = JSON.parse(storedSession) as ColaboradorSession;
        setColaborador(session);
        // Register session in database
        supabase.rpc('register_colaborador_session', { p_colaborador_id: session.id });
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    setLoading(false);
  }, []);

  const signIn = async (cpf: string, codigoAcesso: string) => {
    const cpfClean = cpf.replace(/\D/g, '').padStart(11, '0');
    
    // Call the verify codigo acesso function
    const { data, error } = await supabase.rpc('verify_colaborador_codigo_acesso', {
      p_cpf: cpfClean,
      p_codigo: codigoAcesso
    });

    if (error) {
      console.error('Erro ao verificar credenciais:', error);
      return { error: 'Erro ao verificar credenciais. Tente novamente.' };
    }

    if (!data) {
      return { error: 'CPF ou código de acesso incorretos.' };
    }

    // Fetch colaborador details using RPC (bypasses RLS)
    const { data: colaboradorData, error: fetchError } = await supabase
      .rpc('get_colaborador_by_id', { p_colaborador_id: data });

    if (fetchError) {
      console.error('Erro ao buscar dados do colaborador:', fetchError);
      return { error: 'Erro ao buscar dados do colaborador. Tente novamente.' };
    }

    if (!colaboradorData || colaboradorData.length === 0) {
      return { error: 'Dados do colaborador não encontrados.' };
    }

    const colaboradorInfo = colaboradorData[0];
    const session: ColaboradorSession = {
      id: colaboradorInfo.id,
      nome: colaboradorInfo.nome_completo,
      cpf: colaboradorInfo.cpf
    };

    setColaborador(session);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    
    // Register session in database
    await supabase.rpc('register_colaborador_session', { p_colaborador_id: session.id });

    return { error: null, colaboradorId: session.id };
  };

  const signOut = async () => {
    // Unregister session from database before clearing local state
    if (colaborador?.id) {
      await supabase.rpc('unregister_colaborador_session', { p_colaborador_id: colaborador.id });
    }
    setColaborador(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  return (
    <ColaboradorAuthContext.Provider
      value={{
        colaborador,
        loading,
        signIn,
        signOut
      }}
    >
      {children}
    </ColaboradorAuthContext.Provider>
  );
}

export function useColaboradorAuth() {
  const context = useContext(ColaboradorAuthContext);
  if (context === undefined) {
    throw new Error('useColaboradorAuth must be used within a ColaboradorAuthProvider');
  }
  return context;
}
