import { useDeferredValue, useMemo, useState } from 'react';
import { useData } from '../ctx';
import { cheapestPerSupplier, searchProducts, sortHits, type SortBy } from '../lib/search';
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

  const allowed = useMemo(
    () => new Set(suppliers.filter((s) => !excluded.has(s.id!)).map((s) => s.id!)),
    [suppliers, excluded],
  );

  const raw = useMemo(() => searchProducts(products, dq, allowed), [products, dq, allowed]);
  const volumes = useMemo(
    () => [...new Set(raw.map((h) => h.product.volume).filter((v): v is number => v != null))].sort((a, b) => a - b),
    [raw],
  );
  const filtered = useMemo(() => raw.filter((h) => vol == null || h.product.volume === vol), [raw, vol]);
  const sorted = useMemo(() => {
    const s = sortHits(filtered, sortBy);
    return perSupplier ? cheapestPerSupplier(s) : s;
  }, [filtered, sortBy, perSupplier]);

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

      {!dq.trim() ? (
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
                <button onClick={() => { addToCart(h.product.id!, h.product.packSize || 1); toast('Toegevoegd aan bestelling'); }} title="Voeg toe aan bestelling">+ Bestelling</button>
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
