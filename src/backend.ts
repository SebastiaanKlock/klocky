import Dexie, { type Table } from 'dexie';
import { createClient, type SupabaseClient, type Session } from '@supabase/supabase-js';

/** Everything is stored as documents: (kind, id) → JSON. Kinds: suppliers, pricelists, customers, invoices, settings. */
export type Kind = 'suppliers' | 'pricelists' | 'customers' | 'invoices' | 'settings';
export interface Doc { kind: Kind; id: string; data: unknown }

export interface Backend {
  mode: 'shared' | 'local';
  loadAll(onProgress?: (n: number) => void): Promise<Doc[]>;
  fetchOne(kind: Kind, id: string): Promise<Doc | null>;
  put(kind: Kind, id: string, data: unknown): Promise<void>;
  remove(kind: Kind, id: string): Promise<void>;
  clearAll(): Promise<void>;
  subscribe(onChange: (kind: Kind, id: string) => void): () => void;
}

/* ------------------------------ local (this browser only) ------------------------------ */

class LocalDB extends Dexie {
  docs!: Table<Doc, [string, string]>;
  constructor() {
    super('prijsvergelijker-docs');
    this.version(1).stores({ docs: '[kind+id]' });
  }
}

function localBackend(): Backend {
  const db = new LocalDB();
  const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('prijsvergelijker') : null;
  return {
    mode: 'local',
    loadAll: () => db.docs.toArray(),
    fetchOne: async (kind, id) => (await db.docs.get([kind, id])) ?? null,
    put: async (kind, id, data) => { await db.docs.put({ kind, id, data }); bc?.postMessage({ kind, id }); },
    remove: async (kind, id) => { await db.docs.delete([kind, id]); bc?.postMessage({ kind, id }); },
    clearAll: async () => { await db.docs.clear(); },
    subscribe(cb) {
      if (!bc) return () => {};
      const h = (e: MessageEvent) => cb(e.data.kind, e.data.id);
      bc.addEventListener('message', h);
      return () => bc.removeEventListener('message', h);
    },
  };
}

/* ------------------------------ shared (Supabase) ------------------------------ */

const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY_ = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const sharedConfigured = !!(URL_ && KEY_);
export const supabase: SupabaseClient | null = sharedConfigured
  ? createClient(URL_!, KEY_!, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;

function sharedBackend(sb: SupabaseClient): Backend {
  const PAGE = 100;
  return {
    mode: 'shared',
    async loadAll(onProgress) {
      const out: Doc[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await sb.from('docs').select('kind,id,data').order('kind').order('id').range(from, from + PAGE - 1);
        if (error) throw error;
        out.push(...(data as Doc[]));
        onProgress?.(out.length);
        if (!data || data.length < PAGE) break;
      }
      return out;
    },
    async fetchOne(kind, id) {
      const { data, error } = await sb.from('docs').select('kind,id,data').eq('kind', kind).eq('id', id).maybeSingle();
      if (error) throw error;
      return (data as Doc) ?? null;
    },
    async put(kind, id, data) {
      const { error } = await sb.from('docs').upsert({ kind, id, data, updated_at: new Date().toISOString() });
      if (error) throw error;
    },
    async remove(kind, id) {
      const { error } = await sb.from('docs').delete().eq('kind', kind).eq('id', id);
      if (error) throw error;
    },
    async clearAll() {
      const { error } = await sb.from('docs').delete().neq('id', '');
      if (error) throw error;
    },
    subscribe(cb) {
      const ch = sb
        .channel('docs-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'docs' }, (p) => {
          const row = (p.new && 'id' in p.new ? p.new : p.old) as { kind?: Kind; id?: string };
          if (row?.kind && row?.id) cb(row.kind, row.id);
        })
        .subscribe();
      return () => { sb.removeChannel(ch); };
    },
  };
}

export function createBackend(): Backend {
  return supabase ? sharedBackend(supabase) : localBackend();
}

export type { Session };
