import { useState, useEffect, createContext, useContext, ReactNode, useCallback, useRef } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

type AppRole = 'admin' | 'user' | 'coordenador' | 'superadmin';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  role: AppRole | null;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isCoordenador: boolean;
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
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  
  // Use ref to track logout state without causing re-renders
  const isLoggingOutRef = useRef(false);

  const fetchUserRole = async (userId: string): Promise<AppRole | null> => {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);

      if (!error && data && data.length > 0) {
        const roles = data.map(r => r.role as AppRole);
        let resolved: AppRole;
        if (roles.includes('superadmin')) resolved = 'superadmin';
        else if (roles.includes('admin')) resolved = 'admin';
        else if (roles.includes('coordenador')) resolved = 'coordenador';
        else resolved = 'user';
        setRole(resolved);
        return resolved;
      }
      setRole(null);
      return null;
    } catch (err) {
      console.error('Error fetching user role:', err);
      setRole(null);
      return null;
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
        try {
          await fetchUserRole(session.user.id);
        } catch (err) {
          console.error('Error resolving role:', err);
        }
      } else {
        setRole(null);
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
    
    // Force full page reload to admin login - this ensures all React state is cleared
    window.location.href = '/auth-admin';
  }, []);

  // superadmin has all admin permissions
  const isSuperAdmin = role === 'superadmin';
  const isAdmin = role === 'admin' || role === 'superadmin';
  const isCoordenador = role === 'coordenador';

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        role,
        isAdmin,
        isSuperAdmin,
        isCoordenador,
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
