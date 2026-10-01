import { createContext, useCallback, useContext, useEffect, useState, type FormEvent } from 'react';
import { supabase } from './backend';

export interface Org {
  id: string;
  name: string;
  role: 'owner' | 'member';
  invite_code: string;
}

export interface Member {
  user_id: string;
  email: string | null;
  role: 'owner' | 'member';
}

interface OrgCtx {
  org: Org;
  orgs: Org[];
  switchOrg: (id: string) => void;
  reload: () => Promise<void>;
}

const C = createContext<OrgCtx | null>(null);
/** null in local mode (no organisations there) */
export const useOrg = () => useContext(C);

const KEY = 'prijsvergelijker.org';

async function fetchOrgs(): Promise<Org[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('members').select('role, orgs(id, name, invite_code)');
  if (error) throw error;
  type Row = { role: 'owner' | 'member'; orgs: { id: string; name: string; invite_code: string } | { id: string; name: string; invite_code: string }[] | null };
  return (data as unknown as Row[])
    .map((r) => ({ role: r.role, o: Array.isArray(r.orgs) ? r.orgs[0] : r.orgs }))
    .filter((r) => !!r.o)
    .map((r) => ({ id: r.o!.id, name: r.o!.name, invite_code: r.o!.invite_code, role: r.role }));
}

export async function listMembers(orgId: string): Promise<Member[]> {
  const { data, error } = await supabase!.from('members').select('user_id, email, role').eq('org_id', orgId);
  if (error) throw error;
  return (data as Member[]).sort((a, b) => (a.role === b.role ? (a.email ?? '').localeCompare(b.email ?? '') : a.role === 'owner' ? -1 : 1));
}

export const rpc = async <T,>(fn: string, args: Record<string, unknown>): Promise<T> => {
  const { data, error } = await supabase!.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
};

/** Loads the user's organisations; asks to create/join one when there is none. */
export function OrgGate({ children, userEmail }: { children: (orgId: string) => React.ReactNode; userEmail: string | null }) {
  const [orgs, setOrgs] = useState<Org[] | null>(null);
  const [error, setError] = useState('');
  const [activeId, setActiveId] = useState<string | null>(() => {
    try { return localStorage.getItem(KEY); } catch { return null; }
  });

  const reload = useCallback(async () => {
    try { setOrgs(await fetchOrgs()); setError(''); } catch (e) { setError((e as Error).message); setOrgs([]); }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const switchOrg = (id: string) => {
    setActiveId(id);
    try { localStorage.setItem(KEY, id); } catch { /* ignore */ }
  };

  if (orgs === null) return <div className="boot">Laden…</div>;
  if (orgs.length === 0) return <Onboarding userEmail={userEmail} error={error} onDone={async (id) => { await reload(); switchOrg(id); }} />;

  const org = orgs.find((o) => o.id === activeId) ?? orgs[0];
  return (
    <C.Provider value={{ org, orgs, switchOrg, reload }}>
      {/* key: a new organisation gets a completely fresh data store */}
      <div key={org.id}>{children(org.id)}</div>
    </C.Provider>
  );
}

function Onboarding({ userEmail, error, onDone }: { userEmail: string | null; error: string; onDone: (id: string) => void }) {
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [value, setValue] = useState('');
  const [msg, setMsg] = useState(error);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    try {
      const id = await rpc<string>(mode === 'create' ? 'create_org' : 'join_org', mode === 'create' ? { p_name: value } : { p_code: value });
      onDone(id);
    } catch (err) {
      setMsg((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <form className="loginbox wide" onSubmit={submit}>
        <div className="brand big"><i>€</i></div>
        <h1>Welkom{userEmail ? '' : ''}</h1>
        <p className="muted">Ingelogd als {userEmail}. Alle prijslijsten, klanten en facturen horen bij een organisatie, en alleen de leden zien ze.</p>
        <div className="segmented center">
          <button type="button" className={mode === 'create' ? 'on' : ''} onClick={() => { setMode('create'); setValue(''); setMsg(''); }}>Nieuwe organisatie</button>
          <button type="button" className={mode === 'join' ? 'on' : ''} onClick={() => { setMode('join'); setValue(''); setMsg(''); }}>Ik heb een uitnodigingscode</button>
        </div>
        <input autoFocus required value={value} onChange={(e) => setValue(e.target.value)}
          placeholder={mode === 'create' ? 'Naam van het bedrijf' : 'Uitnodigingscode van je collega'} />
        {msg && <div className="err">{msg}</div>}
        <button className="primary" disabled={busy}>{busy ? 'Bezig…' : mode === 'create' ? 'Organisatie aanmaken' : 'Deelnemen'}</button>
        <button type="button" className="small" onClick={() => supabase?.auth.signOut()}>Uitloggen</button>
      </form>
    </div>
  );
}
