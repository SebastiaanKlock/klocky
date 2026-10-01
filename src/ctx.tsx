import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { Backend } from './backend';
import { Store } from './db';
import type { Customer, Invoice, Product, Settings, Supplier } from './types';

export interface CartLine {
  productId: string;
  qty: number;
}

interface Ctx {
  store: Store;
  mode: 'shared' | 'local';
  suppliers: Supplier[];
  products: Product[];
  customers: Customer[];
  invoices: Invoice[];
  settings: Settings;
  supplierName: (id: string) => string;
  cart: CartLine[];
  addToCart: (productId: string, qty?: number) => void;
  setCartQty: (productId: string, qty: number) => void;
  clearCart: () => void;
  ready: boolean;
  error: string;
}

const C = createContext<Ctx>(null as unknown as Ctx);
export const useData = () => useContext(C);

const CART_KEY = 'prijsvergelijker.cart';

export function DataProvider({ backend, children }: { backend: Backend; children: ReactNode }) {
  const store = useMemo(() => new Store(backend), [backend]);
  useEffect(() => { store.start(); return () => store.stop(); }, [store]);
  const s = useSyncExternalStore(store.subscribe, store.getState);

  const [cart, setCart] = useState<CartLine[]>(() => {
    try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]'); } catch { return []; }
  });
  useEffect(() => {
    try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch { /* ignore */ }
  }, [cart]);

  const addToCart = useCallback((productId: string, qty = 6) => {
    setCart((c) => {
      const i = c.findIndex((l) => l.productId === productId);
      if (i >= 0) return c.map((l, j) => (j === i ? { ...l, qty: l.qty + qty } : l));
      return [...c, { productId, qty }];
    });
  }, []);
  const setCartQty = useCallback((productId: string, qty: number) => {
    setCart((c) => (qty <= 0 ? c.filter((l) => l.productId !== productId) : c.map((l) => (l.productId === productId ? { ...l, qty } : l))));
  }, []);
  const clearCart = useCallback(() => setCart([]), []);

  const value = useMemo<Ctx>(() => {
    const names = new Map(s.suppliers.map((x) => [x.id!, x.name]));
    return {
      store, mode: backend.mode,
      suppliers: s.suppliers, products: s.products, customers: s.customers, invoices: s.invoices, settings: s.settings,
      supplierName: (id) => names.get(id) ?? '?',
      cart, addToCart, setCartQty, clearCart,
      ready: s.ready, error: s.error,
    };
  }, [s, store, backend, cart, addToCart, setCartQty, clearCart]);

  return <C.Provider value={value}>{children}</C.Provider>;
}
