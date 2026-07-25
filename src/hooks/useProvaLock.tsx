import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface ProvaLockState {
  isLoading: boolean;
  hasAccess: boolean;
  isLocked: boolean;
  lockedByName: string | null;
  lockedSince: Date | null;
  error: string | null;
}

interface UseProvaLockOptions {
  provaId: string | undefined;
  userId: string | undefined;
  userName: string | undefined;
  enabled?: boolean;
}

const HEARTBEAT_INTERVAL = 30000; // 30 seconds

export function useProvaLock({ provaId, userId, userName, enabled = true }: UseProvaLockOptions): ProvaLockState {
  const [state, setState] = useState<ProvaLockState>({
    isLoading: true,
    hasAccess: false,
    isLocked: false,
    lockedByName: null,
    lockedSince: null,
    error: null,
  });

  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasLockRef = useRef(false);
  // Token de acesso espelhado em ref porque o handler de saída da página é síncrono:
  // não dá para esperar um `getSession()` enquanto a aba está sendo fechada.
  const accessTokenRef = useRef<string | null>(null);

  const acquireLock = useCallback(async () => {
    if (!provaId || !userId || !userName || !enabled) {
      setState(prev => ({ ...prev, isLoading: false }));
      return;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('acquire_prova_lock', {
        p_prova_id: provaId,
        p_user_id: userId,
        p_user_name: userName,
      });

      if (error) {
        console.error('Error acquiring lock:', error);
        setState({
          isLoading: false,
          hasAccess: false,
          isLocked: false,
          lockedByName: null,
          lockedSince: null,
          error: error.message,
        });
        return;
      }

      const result = data?.[0];
      
      if (result?.success) {
        hasLockRef.current = true;
        setState({
          isLoading: false,
          hasAccess: true,
          isLocked: false,
          lockedByName: null,
          lockedSince: null,
          error: null,
        });
      } else {
        hasLockRef.current = false;
        setState({
          isLoading: false,
          hasAccess: false,
          isLocked: true,
          lockedByName: result?.locked_by_name || 'Outro usuário',
          lockedSince: result?.locked_since ? new Date(result.locked_since) : null,
          error: null,
        });
      }
    } catch (err) {
      console.error('Exception acquiring lock:', err);
      setState({
        isLoading: false,
        hasAccess: false,
        isLocked: false,
        lockedByName: null,
        lockedSince: null,
        error: 'Erro ao verificar acesso à prova',
      });
    }
  }, [provaId, userId, userName, enabled]);

  const updateHeartbeat = useCallback(async () => {
    if (!provaId || !userId || !hasLockRef.current) return;

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.rpc as any)('update_prova_lock_activity', {
        p_prova_id: provaId,
        p_user_id: userId,
      });
    } catch (err) {
      console.error('Error updating heartbeat:', err);
    }
  }, [provaId, userId]);

  const releaseLock = useCallback(async () => {
    if (!provaId || !userId || !hasLockRef.current) return;

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.rpc as any)('release_prova_lock', {
        p_prova_id: provaId,
        p_user_id: userId,
      });
      hasLockRef.current = false;
    } catch (err) {
      console.error('Error releasing lock:', err);
    }
  }, [provaId, userId]);

  // Acquire lock on mount
  useEffect(() => {
    if (enabled && provaId && userId && userName) {
      acquireLock();
    } else {
      // Sem os parâmetros (ou desabilitado) não há lock a adquirir — mas o estado
      // precisa sair de `isLoading`, senão quem renderiza spinner enquanto ele for
      // true (GerenciarColaboradoresProva) fica preso sem erro nem saída. A guarda
      // equivalente dentro de `acquireLock` não resolve isso: ela nunca é alcançada,
      // porque a condição acima já impede a chamada.
      setState(prev => (prev.isLoading ? { ...prev, isLoading: false } : prev));
    }
  }, [acquireLock, enabled, provaId, userId, userName]);

  // Setup heartbeat interval
  useEffect(() => {
    if (state.hasAccess && enabled) {
      heartbeatRef.current = setInterval(updateHeartbeat, HEARTBEAT_INTERVAL);
    }

    return () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    };
  }, [state.hasAccess, updateHeartbeat, enabled]);

  // Release lock on unmount
  useEffect(() => {
    return () => {
      if (hasLockRef.current) {
        // Use synchronous approach for cleanup
        releaseLock();
      }
    };
  }, [releaseLock]);

  // Mantém o token de acesso disponível de forma síncrona para o handler de saída.
  useEffect(() => {
    supabase.auth.getSession().then(
      ({ data }) => {
        accessTokenRef.current = data.session?.access_token ?? null;
      },
      () => {
        accessTokenRef.current = null;
      },
    );

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      accessTokenRef.current = session?.access_token ?? null;
    });

    return () => subscription.unsubscribe();
  }, []);

  // Libera o lock quando a pessoa sai da página.
  //
  // Por que `pagehide` e não `beforeunload`: a versão anterior usava
  // `navigator.sendBeacon`, que **não permite definir header nenhum** — a requisição
  // saía sem `apikey` e sem `Authorization`, que o PostgREST exige, então nunca
  // liberava nada. Quem devolvia a prova era o timeout de 10 minutos. `fetch` com
  // `keepalive: true` dá a mesma sobrevivência ao unload E aceita headers.
  //
  // `pagehide` cobre tudo que o `beforeunload` cobre e mais: navegador mobile mandando
  // a aba para segundo plano, e navegação que entra no bfcache. Daí ele ser o único.
  useEffect(() => {
    const releaseOnHide = () => {
      if (!hasLockRef.current || !provaId || !userId) return;

      const token = accessTokenRef.current;
      if (!token) return;

      hasLockRef.current = false;

      fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/release_prova_lock`, {
        method: 'POST',
        keepalive: true,
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ p_prova_id: provaId, p_user_id: userId }),
      }).catch(() => {
        // A aba está indo embora; não há a quem reportar. O timeout de 10 min cobre.
      });
    };

    // Volta do bfcache: a página foi restaurada, mas o lock já foi liberado acima.
    // Sem readquirir, a tela seguiria editável com o servidor achando que ninguém
    // tem a prova — e o heartbeat NÃO conserta isso, porque `update_prova_lock_activity`
    // é um UPDATE que não recria a linha apagada.
    const reacquireOnRestore = (event: PageTransitionEvent) => {
      if (event.persisted) acquireLock();
    };

    window.addEventListener('pagehide', releaseOnHide);
    window.addEventListener('pageshow', reacquireOnRestore);
    return () => {
      window.removeEventListener('pagehide', releaseOnHide);
      window.removeEventListener('pageshow', reacquireOnRestore);
    };
  }, [provaId, userId, acquireLock]);

  return state;
}
