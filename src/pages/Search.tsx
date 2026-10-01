import { useDeferredValue, useMemo, useState } from 'react';
import { useData } from '../ctx';
import { broadCandidates, cheapestPerSupplier, searchProducts, sortHits, type SortBy } from '../lib/search';
import { aiAvailable, aiMatch, type AiMatch } from '../lib/ai';
import type { Product } from '../types';
import { DRINK_CATEGORIES } from '../lib/categories';
import { eur, fmtVol } from '../lib/text';
import { toast } from '../lib/toast';

export default function Search({ goTo }: { goTo: (t: 'suppliers' | 'invoices') => void }) {
  const { products, suppliers, supplierName, addToCart, cart } = useData();
  const [q, setQ] = useState('');
  const dq = useDeferredValue(q);
  const [sortBy, setSortBy] = useState<SortBy>('bottle');
  const [perSupplier, setPerSupplier] = useState(false);
  const [vol, setVol] = useState<number | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [drink, setDrink] = useState('');

  const allowed = useMemo(
    () => new Set(suppliers.filter((s) => !excluded.has(s.id!)).map((s) => s.id!)),
    [suppliers, excluded],
  );

  const raw0 = useMemo(
    () => (dq.trim()
      ? searchProducts(products, dq, allowed)
      : drink
        ? products.filter((p) => allowed.has(p.supplierId)).map((p) => ({ product: p, perLitre: p.volume ? p.priceBottle / p.volume : undefined }))
        : []),
    [products, dq, allowed, drink],
  );
  const drinkCounts = useMemo(() => {
    const m = new Map<string, number>();
    raw0.forEach((h) => m.set(h.product.drink, (m.get(h.product.drink) ?? 0) + 1));
    return m;
  }, [raw0]);
  const raw = useMemo(() => raw0.filter((h) => !drink || h.product.drink === drink), [raw0, drink]);
  const volumes = useMemo(
    () => [...new Set(raw.map((h) => h.product.volume).filter((v): v is number => v != null))].sort((a, b) => a - b),
    [raw],
  );
  const filtered = useMemo(() => raw.filter((h) => vol == null || h.product.volume === vol), [raw, vol]);
  const sorted = useMemo(() => {
    const s = sortHits(filtered, sortBy);
    return perSupplier ? cheapestPerSupplier(s) : s;
  }, [filtered, sortBy, perSupplier]);

  const [ai, setAi] = useState<{ title: string; busy: boolean; error: string; result: AiMatch | null } | null>(null);
  async function runAi(query: string, reference?: Product) {
    setAi({ title: query, busy: true, error: '', result: null });
    try {
      // heuristic hits first, then loosely related products so differently worded entries are included
      const seen = new Set<string | undefined>();
      const cands: Product[] = [];
      for (const p of [...raw.map((h) => h.product), ...broadCandidates(products, query, 80), ...(reference ? broadCandidates(products, reference.description, 40) : [])]) {
        if (!seen.has(p.id) && allowed.has(p.supplierId)) { seen.add(p.id); cands.push(p); }
      }
      const result = await aiMatch(query, cands, supplierName, reference);
      setAi({ title: query, busy: false, error: '', result });
    } catch (e) {
      setAi({ title: query, busy: false, error: (e as Error).message, result: null });
    }
  }

  const top = sorted.slice(0, 5);
  const rest = sorted.slice(0, 300);

  if (!products.length) {
    return (
      <div className="card empty">
        <div className="glyph">📄</div>
        <h2>Nog geen prijslijsten</h2>
        <p>Laad een Excel-prijslijst in en begin direct met vergelijken.</p>
        <button className="primary" onClick={() => goTo('suppliers')}>Prijslijst inladen</button>
      </div>
    );
  }

  return (
    <div>
      <input
        className="bigsearch"
        autoFocus
        placeholder="Zoek een product… bijv. 'chivas 12 1l', 'gin sul 0,5' of een EAN-code"
        value={q}
        onChange={(e) => { setQ(e.target.value); setVol(null); }}
      />

      <div className="toolbar">
        <label>Sorteer op{' '}
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)}>
            <option value="bottle">Prijs per fles</option>
            <option value="litre">Prijs per liter</option>
            <option value="name">Omschrijving</option>
          </select>
        </label>
        <label><input type="checkbox" checked={perSupplier} onChange={(e) => setPerSupplier(e.target.checked)} /> Alleen goedkoopste per leverancier</label>
        {volumes.length > 1 && (
          <span className="chips">
            Inhoud:
            <button className={vol == null ? 'chip on' : 'chip'} onClick={() => setVol(null)}>alle</button>
            {volumes.map((v) => (
              <button key={v} className={vol === v ? 'chip on' : 'chip'} onClick={() => setVol(v)}>{fmtVol(v)}</button>
            ))}
          </span>
        )}
      </div>
      <div className="chips">
        Categorie:
        <button className={drink === '' ? 'chip on' : 'chip'} onClick={() => { setDrink(''); setVol(null); }}>Alle</button>
        {DRINK_CATEGORIES.filter((c) => dq.trim() ? drinkCounts.has(c) : products.some((p) => p.drink === c)).map((c) => (
          <button key={c} className={drink === c ? 'chip on' : 'chip'} onClick={() => { setDrink(drink === c ? '' : c); setVol(null); }}>
            {c}{dq.trim() && drinkCounts.has(c) ? <span className="muted small"> {drinkCounts.get(c)}</span> : null}
          </button>
        ))}
      </div>
      {suppliers.length > 1 && (
        <div className="chips">
          Leveranciers:
          {suppliers.map((s) => (
            <button
              key={s.id}
              className={excluded.has(s.id!) ? 'chip' : 'chip on'}
              onClick={() => setExcluded((e) => { const n = new Set(e); n.has(s.id!) ? n.delete(s.id!) : n.add(s.id!); return n; })}
            >{s.name}</button>
          ))}
        </div>
      )}

      {aiAvailable && dq.trim() && (
        <div className="toolbar">
          <button className="primary" disabled={ai?.busy} onClick={() => runAi(dq)}>✨ Slim vergelijken met AI</button>
          <span className="muted small">Herkent hetzelfde product ook als het anders is beschreven.</span>
        </div>
      )}
      {ai && (
        <div className="card ai">
          <div className="between">
            <h3>✨ AI-vergelijking: {ai.title}</h3>
            <button className="small" onClick={() => setAi(null)}>Sluiten</button>
          </div>
          {ai.busy && <p className="muted">De AI vergelijkt de prijslijsten…</p>}
          {ai.error && <p className="err">{ai.error}</p>}
          {ai.result && (
            <>
              {ai.result.note && <p className="muted small">{ai.result.note}</p>}
              {ai.result.same.length === 0 && <p className="muted">Geen zeker hetzelfde product gevonden.</p>}
              <table>
                <tbody>
                  {[...ai.result.same].sort((a, b) => a.priceBottle - b.priceBottle).map((p, i) => (
                    <tr key={p.id}>
                      <td className="muted">{i + 1}</td>
                      <td>{p.description}{p.extra && <div className="muted small">{p.extra}</div>}</td>
                      <td>{fmtVol(p.volume)}{p.abv ? ` · ${p.abv}%` : ''}</td>
                      <td>{supplierName(p.supplierId)}</td>
                      <td className="r"><b>{eur(p.priceBottle, p.currency)}</b></td>
                      <td className="r">{eur(p.priceCase, p.currency)}</td>
                      <td><button className="small" onClick={() => { addToCart(p.id!, p.packSize || 1); toast('Toegevoegd aan bestelling'); }}>+</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {ai.result.maybe.length > 0 && (
                <>
                  <h3>Mogelijk hetzelfde</h3>
                  <table>
                    <tbody>
                      {ai.result.maybe.map((m) => (
                        <tr key={m.product.id}>
                          <td>{m.product.description}<div className="muted small">{m.reason}</div></td>
                          <td>{fmtVol(m.product.volume)}</td>
                          <td>{supplierName(m.product.supplierId)}</td>
                          <td className="r"><b>{eur(m.product.priceBottle, m.product.currency)}</b></td>
                          <td><button className="small" onClick={() => { addToCart(m.product.id!, m.product.packSize || 1); toast('Toegevoegd aan bestelling'); }}>+</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </>
          )}
        </div>
      )}
      {!dq.trim() && !drink ? (
        <p className="muted">Typ een productnaam, inhoud (0,7 · 70cl · 1l), percentage of EAN — alle prijslijsten worden doorzocht. Druk op <span className="kbd">/</span> om overal naar het zoekveld te springen.</p>
      ) : sorted.length === 0 ? (
        <p className="muted">Niets gevonden voor “{dq}”.</p>
      ) : (
        <>
          <h3>Top {top.length} — goedkoopste eerst</h3>
          <div className="top5">
            {top.map((h, i) => (
              <div key={h.product.id} className={'topcard' + (i === 0 ? ' best' : '')}>
                <div className="rank">{i + 1}</div>
                <div className="topmain">
                  <div className="prodname">{h.product.description}</div>
                  <div className="muted small">
                    {[h.product.extra, fmtVol(h.product.volume), h.product.abv ? `${h.product.abv}%` : '', h.product.sku && `art. ${h.product.sku}`, h.product.ean && `EAN ${h.product.ean}`]
                      .filter(Boolean).join(' · ')}
                  </div>
                </div>
                <div className="supplier">{supplierName(h.product.supplierId)}</div>
                <div className="price">
                  <b>{eur(h.product.priceBottle, h.product.currency)}</b>
                  <span className="muted small">per fles</span>
                </div>
                <div className="price">
                  <span>{eur(h.perLitre, h.product.currency)}</span>
                  <span className="muted small">per liter</span>
                </div>
                <div className="price">
                  <span>{eur(h.product.priceCase, h.product.currency)}</span>
                  <span className="muted small">{h.product.packSize ? `per doos (${h.product.packSize})` : 'per doos'}</span>
                </div>
                <span>
                  {aiAvailable && <button className="small" title="Zoek dit product bij alle leveranciers" onClick={() => runAi(`${h.product.description} ${fmtVol(h.product.volume)}`, h.product)}>✨</button>}{' '}
                  <button onClick={() => { addToCart(h.product.id!, h.product.packSize || 1); toast('Toegevoegd aan bestelling'); }} title="Voeg toe aan bestelling">+ Bestelling</button>
                </span>
              </div>
            ))}
          </div>

          <h3>Alle resultaten ({sorted.length}{sorted.length > 300 ? ', eerste 300' : ''})</h3>
          <table>
            <thead>
              <tr><th>#</th><th>Omschrijving</th><th>Inhoud</th><th>Leverancier</th><th className="r">Per fles</th><th className="r">Per liter</th><th className="r">Per doos</th><th>EAN</th><th /></tr>
            </thead>
            <tbody>
              {rest.map((h, i) => (
                <tr key={h.product.id}>
                  <td className="muted">{i + 1}</td>
                  <td>{h.product.description}{h.product.extra && <div className="muted small">{h.product.extra}</div>}</td>
                  <td>{fmtVol(h.product.volume)}{h.product.abv ? ` · ${h.product.abv}%` : ''}</td>
                  <td>{supplierName(h.product.supplierId)}</td>
                  <td className="r"><b>{eur(h.product.priceBottle, h.product.currency)}</b></td>
                  <td className="r">{eur(h.perLitre, h.product.currency)}</td>
                  <td className="r">{eur(h.product.priceCase, h.product.currency)}</td>
                  <td className="small">{h.product.ean}</td>
                  <td><button className="small" onClick={() => { addToCart(h.product.id!, h.product.packSize || 1); toast('Toegevoegd aan bestelling'); }}>+</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {cart.length > 0 && (
        <div className="cartbar no-print">
          {cart.length} product(en) in bestelling <button onClick={() => goTo('invoices')}>Naar bestelling →</button>
        </div>
      )}
    </div>
  );
}
