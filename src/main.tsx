import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Session } from '@supabase/supabase-js';
import App from './App';
import Login from './Login';
import { createBackend, supabase } from './backend';
import { DataProvider } from './ctx';
import './styles.css';

function Root() {
  const [session, setSession] = useState<Session | null | undefined>(supabase ? undefined : null);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const authed = !supabase || !!session;
  // a fresh backend (and therefore a fresh store) per login, so nothing leaks between users
  const backend = useMemo(() => (authed ? createBackend() : null), [authed]);

  if (session === undefined) return <div className="boot">Laden…</div>;
  if (!authed || !backend) return <Login />;
  return (
    <DataProvider backend={backend}>
      <App userEmail={session?.user.email ?? null} />
    </DataProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
