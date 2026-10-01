import { useEffect, useState } from 'react';
import { useData } from './ctx';
import { supabase } from './backend';
import { onToast } from './lib/toast';
import Search from './pages/Search';
import Compare from './pages/Compare';
import Suppliers from './pages/Suppliers';
import Products from './pages/Products';
import Customers from './pages/Customers';
import Invoices from './pages/Invoices';
import SettingsPage from './pages/SettingsPage';

const TABS = [
  ['search', 'Zoeken'],
  ['compare', 'Vergelijken'],
  ['suppliers', 'Prijslijsten'],
  ['products', 'Producten'],
  ['customers', 'Klanten'],
  ['invoices', 'Bestelling & facturen'],
  ['settings', 'Instellingen'],
] as const;
type Tab = (typeof TABS)[number][0];

export default function App({ userEmail }: { userEmail: string | null }) {
  const [tab, setTab] = useState<Tab>('search');
  const { cart, ready, products, error, mode } = useData();
  const [msg, setMsg] = useState('');

  useEffect(() => {
    let t: number;
    onToast((m) => { setMsg(m); window.clearTimeout(t); t = window.setTimeout(() => setMsg(''), 2600); });
    return () => onToast(null);
  }, []);

  // "/" jumps to the search box from anywhere
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) {
        e.preventDefault();
        setTab('search');
        setTimeout(() => document.querySelector<HTMLInputElement>('.bigsearch')?.focus(), 30);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  return (
    <div className="app">
      <header className="top no-print">
        <div className="brand"><i>€</i>Prijsvergelijker</div>
        <nav>
          {TABS.map(([k, label]) => (
            <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>
              {label}
              {k === 'invoices' && cart.length > 0 && <span className="badge">{cart.length}</span>}
            </button>
          ))}
        </nav>
        <div className="muted small right">
          {ready ? `${products.length.toLocaleString('nl-NL')} producten` : 'Laden…'}
          {mode === 'local' && <span className="tag">alleen deze computer</span>}
          {supabase && userEmail && <button className="small" onClick={() => supabase!.auth.signOut()} title={userEmail}>Uitloggen</button>}
        </div>
      </header>
      {error && <div className="banner">Kon de gegevens niet laden: {error}</div>}
      <main key={tab}>
        {tab === 'search' && <Search goTo={setTab} />}
        {tab === 'compare' && <Compare />}
        {tab === 'suppliers' && <Suppliers />}
        {tab === 'products' && <Products />}
        {tab === 'customers' && <Customers />}
        {tab === 'invoices' && <Invoices />}
        {tab === 'settings' && <SettingsPage />}
      </main>
      {msg && <div className="toast">{msg}</div>}
    </div>
  );
}
