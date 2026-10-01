import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Session } from '@supabase/supabase-js';
import App from './App';
import Login from './Login';
import { createBackend, supabase } from './backend';
import { DataProvider } from './ctx';
import { OrgGate } from './org';
import './styles.css';

function Shared({ orgId, email }: { orgId: string; email: string | null }) {
  // a fresh backend (and therefore a fresh store) per organisation, so nothing leaks between them
  const backend = useMemo(() => createBackend(orgId), [orgId]);
  return (
    <DataProvider backend={backend}>
      <App userEmail={email} />
    </DataProvider>
  );
}

function Root() {
  const [session, setSession] = useState<Session | null | undefined>(supabase ? undefined : null);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const localBackend = useMemo(() => (supabase ? null : createBackend()), []);

  if (!supabase && localBackend) {
    return (
      <DataProvider backend={localBackend}>
        <App userEmail={null} />
      </DataProvider>
    );
  }
  if (session === undefined) return <div className="boot">Laden…</div>;
  if (!session) return <Login />;
  const email = session.user.email ?? null;
  return <OrgGate key={session.user.id} userEmail={email}>{(orgId) => <Shared orgId={orgId} email={email} />}</OrgGate>;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
