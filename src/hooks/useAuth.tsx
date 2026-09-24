import { useState, useEffect, createContext, useContext, ReactNode, useCallback, useRef } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { colaboradorSemGestao, type AppRole } from '@/lib/papeis';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  role: AppRole | null;
  roles: AppRole[];
  rolesLoaded: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isCoordenador: boolean;
  isColaborador: boolean;
  /** Papel do módulo Financeiro — dimensão paralela, como `isColaborador`: não entra
   * na escada `resolveRoleGestao` nem compete com admin/coordenador por `role`. */
  isFinanceiro: boolean;
  /** Colaborador sem papel de gestão que abra porta — o destino dele é `/perfil-colaborador`. */
  isColaboradorSemGestao: boolean;
  isLoggingOut: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<AppRole | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [rolesLoaded, setRolesLoaded] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Use ref to track logout state without causing re-renders
  const isLoggingOutRef = useRef(false);

  // `role` é a escada de gestão: superadmin > admin > coordenador > user.
  // 'colaborador' NÃO entra nela — é uma dimensão paralela. Medido em 2026-09-18: das
  // 53 contas com papel `colaborador`, 13 têm gestão (11 coordenadores + 2 admins) e
  // 40 não têm. Espremê-las num papel único rebaixaria a gestão dos 13. Quem precisa
  // saber "é colaborador?" usa isColaborador.
  //
  // ⚠️ `user` é degrau desta escada mas não abre módulo nenhum — quem tem só ele cai
  // no hub vazio. Quem decide DESTINO não pergunta "tem papel de gestão?" e sim
  // "tem gestão que abra porta?": é o `isColaboradorSemGestao` abaixo.
  const resolveRoleGestao = (all: AppRole[]): AppRole | null => {
    if (all.includes('superadmin')) return 'superadmin';
    if (all.includes('admin')) return 'admin';
    if (all.includes('coordenador')) return 'coordenador';
    if (all.includes('user')) return 'user';
    return null;
  };

  const fetchUserRoles = async (userId: string): Promise<AppRole[]> => {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);

      if (!error && data) {
        const all = data.map(r => r.role as AppRole);
        setRoles(all);
        setRole(resolveRoleGestao(all));
        return all;
      }
      setRoles([]);
      setRole(null);
      return [];
    } catch (err) {
      console.error('Error fetching user roles:', err);
      setRoles([]);
      setRole(null);
      return [];
    }
  };

  useEffect(() => {
    let cancelled = false;
    let didInit = false;

    const applySession = async (session: Session | null) => {
      if (cancelled || isLoggingOutRef.current) return;

      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        // Entre `setUser` e o fim do fetch existe uma janela em que o usuário já
        // está setado e os papéis ainda não. Quem decide para onde navegar precisa
        // esperar `rolesLoaded`, senão decide sobre um conjunto vazio.
        setRolesLoaded(false);
        try {
          await fetchUserRoles(session.user.id);
        } catch (err) {
          console.error('Error resolving roles:', err);
        }
        if (!cancelled) setRolesLoaded(true);
      } else {
        setRole(null);
        setRoles([]);
        setRolesLoaded(true);
      }

      if (!cancelled) setLoading(false);
    };

    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        // Skip the initial SIGNED_IN/INITIAL_SESSION echo — getSession() handles it
        // to avoid double role fetches and loading flicker.
        if (!didInit) return;
        applySession(session);
      }
    );

    // THEN check for existing session (single source of truth for first paint)
    supabase.auth.getSession()
      .then(({ data: { session } }) => applySession(session))
      .catch(() => {
        if (!cancelled) setLoading(false);
      })
      .finally(() => {
        didInit = true;
      });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);


  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName,
        },
      },
    });
    return { error: error as Error | null };
  };

  const signOut = useCallback(async () => {
    // Set logging out flag to prevent race conditions
    isLoggingOutRef.current = true;
    setIsLoggingOut(true);

    // Clear local state immediately
    setRole(null);
    setRoles([]);
    setUser(null);
    setSession(null);

    try {
      // Clear all Supabase-related keys from localStorage
      const keysToRemove = Object.keys(localStorage).filter(key => 
        key.startsWith('sb-') || key.includes('supabase')
      );
      keysToRemove.forEach(key => localStorage.removeItem(key));

      // Sign out with global scope to clear all sessions on all devices
      await supabase.auth.signOut({ scope: 'global' });
    } catch (error) {
      console.error('Error signing out:', error);
    }
    
    // Force full page reload to the login page - this ensures all React state is cleared.
    // `/auth` é a porta única desde a etapa 2A: colaborador e gestor saem no mesmo lugar.
    window.location.href = '/auth';
  }, []);

  // superadmin has all admin permissions
  const isSuperAdmin = role === 'superadmin';
  const isAdmin = role === 'admin' || role === 'superadmin';
  const isCoordenador = role === 'coordenador';
  const isColaborador = roles.includes('colaborador');
  // Papel do módulo Financeiro: superadmin também passa (has_role o herda no banco,
  // migration 20260924013238), mas isso é decidido pela ROTA (RequireAcesso lista
  // ["superadmin", "financeiro"]), não aqui — isFinanceiro só reflete o papel literal,
  // igual isColaborador.
  const isFinanceiro = roles.includes('financeiro');
  // A pergunta de DESTINO, num lugar só. `Auth`, `Inicio` e `Perfil` têm de responder
  // igual — até 2026-09-18 a expressão estava copiada nos quatro pontos, e a cópia
  // afirmava `role === null`, que o trigger `handle_new_user` torna inalcançável.
  const isColaboradorSemGestao = colaboradorSemGestao(isColaborador, role);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        role,
        roles,
        rolesLoaded,
        isAdmin,
        isSuperAdmin,
        isCoordenador,
        isColaborador,
        isFinanceiro,
        isColaboradorSemGestao,
        isLoggingOut,
        signIn,
        signUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
