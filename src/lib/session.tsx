import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

type SessionState = { session: Session | null; loading: boolean };

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ session: null, loading: true });

  useEffect(() => {
    async function update(session: Session | null) {
      // A session whose account has no profile (deleted or reset account) can't use the app: sign it out.
      if (session) {
        const { data: profile } = await supabase.from('profiles').select('id').eq('id', session.user.id).maybeSingle();
        if (!profile) return void supabase.auth.signOut();
      }
      setState({ session, loading: false });
    }
    // Deferred: awaiting Supabase calls inside this callback can deadlock the auth client.
    const { data } = supabase.auth.onAuthStateChange((_event, session) => void setTimeout(() => update(session)));
    return () => data.subscription.unsubscribe();
  }, []);

  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}
