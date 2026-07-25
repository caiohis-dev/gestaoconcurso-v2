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

  // Handle beforeunload event
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (hasLockRef.current && provaId && userId) {
        // Use sendBeacon for reliable cleanup on page unload
        const payload = JSON.stringify({
          p_prova_id: provaId,
          p_user_id: userId,
        });
        
        navigator.sendBeacon?.(
          `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/release_prova_lock`,
          new Blob([payload], { type: 'application/json' })
        );
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [provaId, userId]);

  return state;
}
