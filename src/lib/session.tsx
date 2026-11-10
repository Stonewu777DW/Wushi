import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

type SessionState = {
  session: Session | null;
  username: string | null;
  loading: boolean;
  setUsername: (name: string) => void;
};

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange(async (_event, next) => {
      setSession(next);
      if (next) {
        const { data: profile } = await supabase.from('profiles').select('username').eq('id', next.user.id).maybeSingle();
        setUsername(profile?.username ?? null);
      } else {
        setUsername(null);
      }
      setLoading(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return (
    <SessionContext.Provider value={{ session, username, loading, setUsername }}>{children}</SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}
