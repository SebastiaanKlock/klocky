import type { Backend, Doc, Kind } from './backend';
import type { Customer, Invoice, Product, Settings, Supplier } from './types';
import { normText } from './lib/text';

export const DEFAULT_SETTINGS: Settings = {
  company: '',
  address: '',
  postalCity: '',
  vatNumber: '',
  kvk: '',
  iban: '',
  email: '',
  phone: '',
  defaultMargin: 10,
  defaultVat: 21,
  invoicePrefix: new Date().getFullYear() + '-',
};

export const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

/** Price lists are stored without derived fields to keep the documents small. */
type StoredProduct = Omit<Product, 'supplierId' | 'search'>;

export interface State {
  ready: boolean;
  error: string;
  suppliers: Supplier[];
  products: Product[];
  customers: Customer[];
  invoices: Invoice[];
  settings: Settings;
}

const withSearch = (supplierId: string, p: StoredProduct): Product => ({
  ...p,
  supplierId,
  search: normText(`${p.description} ${p.extra} ${p.category} ${p.sku} ${p.ean}`),
});
const strip = ({ supplierId: _s, search: _q, ...rest }: Product): StoredProduct => rest;

export class Store {
  state: State = { ready: false, error: '', suppliers: [], products: [], customers: [], invoices: [], settings: DEFAULT_SETTINGS };
  private listeners = new Set<() => void>();
  private suppliers = new Map<string, Supplier>();
  private lists = new Map<string, Product[]>();
  private customers = new Map<string, Customer>();
  private invoices = new Map<string, Invoice>();
  private settings: Settings = DEFAULT_SETTINGS;
  private unsub: (() => void) | null = null;

  constructor(public backend: Backend) {}

  subscribe = (l: () => void) => { this.listeners.add(l); return () => { this.listeners.delete(l); }; };
  getState = () => this.state;

  private publish(patch: Partial<State> = {}) {
    const sup = [...this.suppliers.values()].sort((a, b) => a.name.localeCompare(b.name, 'nl'));
    const products: Product[] = [];
    for (const s of sup) for (const p of this.lists.get(s.id!) ?? []) products.push(p);
    this.state = {
      ...this.state,
      suppliers: sup,
      products,
      customers: [...this.customers.values()].sort((a, b) => a.name.localeCompare(b.name, 'nl')),
      invoices: [...this.invoices.values()].sort((a, b) => b.number.localeCompare(a.number, 'nl', { numeric: true })),
      settings: this.settings,
      ...patch,
    };
    this.listeners.forEach((l) => l());
  }

  private apply(doc: Doc | { kind: Kind; id: string; data: null }) {
    const { kind, id, data } = doc;
    switch (kind) {
      case 'suppliers':
        if (data) this.suppliers.set(id, { ...(data as Supplier), id });
        else { this.suppliers.delete(id); this.lists.delete(id); }
        break;
      case 'pricelists':
        if (data) this.lists.set(id, (data as StoredProduct[]).map((p) => withSearch(id, p)));
        else this.lists.delete(id);
        break;
      case 'customers':
        if (data) this.customers.set(id, { ...(data as Customer), id }); else this.customers.delete(id);
        break;
      case 'invoices':
        if (data) this.invoices.set(id, { ...(data as Invoice), id }); else this.invoices.delete(id);
        break;
      case 'settings':
        if (data) this.settings = { ...DEFAULT_SETTINGS, ...(data as Partial<Settings>) };
        break;
    }
  }

  async start() {
    try {
      const docs = await this.backend.loadAll();
      docs.forEach((d) => this.apply(d));
      this.publish({ ready: true, error: '' });
    } catch (e) {
      this.publish({ ready: true, error: (e as Error).message ?? String(e) });
    }
    this.unsub = this.backend.subscribe(async (kind, id) => {
      try {
        const d = await this.backend.fetchOne(kind, id);
        this.apply(d ?? { kind, id, data: null });
        this.publish();
      } catch { /* a missed update is picked up on the next refresh */ }
    });
    window.addEventListener('focus', this.refresh);
  }

  stop() {
    this.unsub?.();
    window.removeEventListener('focus', this.refresh);
  }

  /** Re-read everything (used when the window regains focus, in case a realtime event was missed). */
  refresh = async () => {
    try {
      const docs = await this.backend.loadAll();
      this.suppliers.clear(); this.lists.clear(); this.customers.clear(); this.invoices.clear();
      docs.forEach((d) => this.apply(d));
      this.publish({ error: '' });
    } catch { /* offline: keep what we have */ }
  };

  private async write(kind: Kind, id: string, data: unknown) {
    await this.backend.put(kind, id, data);
    this.apply({ kind, id, data } as Doc);
    this.publish();
  }
  private async erase(kind: Kind, id: string) {
    await this.backend.remove(kind, id);
    this.apply({ kind, id, data: null });
    this.publish();
  }

  /* ---------- suppliers & price lists ---------- */
  async saveSupplier(s: Supplier): Promise<string> {
    const id = s.id ?? uid();
    const { id: _i, ...data } = s;
    await this.write('suppliers', id, data);
    return id;
  }

  async deleteSupplier(id: string) {
    await this.erase('pricelists', id).catch(() => {});
    await this.erase('suppliers', id);
  }

  /** Replace a supplier's imported list; manually added products survive. */
  async replacePricelist(supplierId: string, imported: Omit<Product, 'supplierId'>[]) {
    const manual = (this.lists.get(supplierId) ?? []).filter((p) => p.manual);
    const fresh: StoredProduct[] = imported.map(({ search: _s, ...p }) => ({ ...p, id: uid() }));
    await this.write('pricelists', supplierId, [...fresh, ...manual.map(strip)]);
  }

  async addManualProduct(p: Omit<Product, 'id' | 'search'>) {
    const cur = (this.lists.get(p.supplierId) ?? []).map(strip);
    const { supplierId: _s, ...rest } = p;
    await this.write('pricelists', p.supplierId, [...cur, { ...rest, id: uid(), manual: true }]);
  }

  async deleteProduct(p: Product) {
    const cur = (this.lists.get(p.supplierId) ?? []).filter((x) => x.id !== p.id).map(strip);
    await this.write('pricelists', p.supplierId, cur);
  }

  /* ---------- customers, invoices, settings ---------- */
  async saveCustomer(c: Customer) { const id = c.id ?? uid(); const { id: _i, ...d } = c; await this.write('customers', id, d); }
  deleteCustomer(id: string) { return this.erase('customers', id); }

  async saveInvoice(i: Invoice): Promise<string> { const id = i.id ?? uid(); const { id: _i, ...d } = i; await this.write('invoices', id, d); return id; }
  deleteInvoice(id: string) { return this.erase('invoices', id); }

  saveSettings(s: Settings) { return this.write('settings', 'main', s); }

  nextInvoiceNumber(prefix: string): string {
    let max = 0;
    for (const i of this.invoices.values()) {
      if (!i.number.startsWith(prefix)) continue;
      const n = parseInt(i.number.slice(prefix.length), 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
    return prefix + String(max + 1).padStart(3, '0');
  }

  /* ---------- backup ---------- */
  async exportAll() {
    return { version: 2, docs: await this.backend.loadAll() };
  }

  async importAll(data: { version?: number; docs?: Doc[] }) {
    if (!data.docs) throw new Error('Dit is geen geldige back-up.');
    await this.backend.clearAll();
    for (const d of data.docs) await this.backend.put(d.kind, d.id, d.data);
    await this.refresh();
  }
}
