import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface SessionInfo {
  colaborador_id: string;
  last_activity: string;
}

export function useOnlineColaboradores() {
  const [sessions, setSessions] = useState<Map<string, string>>(new Map());
  const [isLoading, setIsLoading] = useState(true);

  const fetchOnlineSessions = async () => {
    const { data, error } = await supabase
      .from('colaborador_sessions')
      .select('colaborador_id, last_activity');

    if (!error && data) {
      const sessionMap = new Map<string, string>();
      data.forEach(s => {
        sessionMap.set(s.colaborador_id, s.last_activity || '');
      });
      setSessions(sessionMap);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchOnlineSessions();

    // Refresh every 30 seconds
    const interval = setInterval(fetchOnlineSessions, 30 * 1000);

    // Subscribe to realtime changes
    const channel = supabase
      .channel('colaborador_sessions_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'colaborador_sessions'
        },
        () => {
          fetchOnlineSessions();
        }
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, []);

  const isOnline = (colaboradorId: string) => {
    const lastActivity = sessions.get(colaboradorId);
    if (!lastActivity) return false;
    const fifteenMinutesAgo = Date.now() - 15 * 60 * 1000;
    return new Date(lastActivity).getTime() > fifteenMinutesAgo;
  };

  const getLastActivity = (colaboradorId: string) => {
    return sessions.get(colaboradorId) || null;
  };

  const onlineCount = Array.from(sessions.entries()).filter(([id]) => isOnline(id)).length;

  return {
    sessions,
    isOnline,
    getLastActivity,
    isLoading,
    onlineCount,
    refetch: fetchOnlineSessions
  };
}
