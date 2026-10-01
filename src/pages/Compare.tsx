import { useDeferredValue, useMemo, useState } from 'react';
import { useData } from '../ctx';
import { DRINK_CATEGORIES } from '../lib/categories';
import { groupProducts } from '../lib/compare';
import { eur, fmtVol, normText } from '../lib/text';
import { toast } from '../lib/toast';

type Order = 'saving' | 'name' | 'pct';

export default function Compare() {
  const { suppliers, products, addToCart } = useData();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [drink, setDrink] = useState('');
  const [filter, setFilter] = useState('');
  const df = useDeferredValue(filter);
  const [onlyShared, setOnlyShared] = useState(true);
  const [order, setOrder] = useState<Order>('saving');
  const [limit, setLimit] = useState(200);

  // nothing picked = compare everyone
  const chosen = useMemo(
    () => suppliers.filter((s) => picked.size === 0 || picked.has(s.id!)),
    [suppliers, picked],
  );
  const chosenIds = useMemo(() => new Set(chosen.map((s) => s.id!)), [chosen]);

  const groups = useMemo(
    () => groupProducts(products.filter((p) => chosenIds.has(p.supplierId))),
    [products, chosenIds],
  );

  const shown = useMemo(() => {
    const t = normText(df).split(' ').filter(Boolean);
    let g = groups.filter((x) => (!drink || x.drink === drink) && (!onlyShared || x.offers.size >= Math.min(2, chosen.length)));
    if (t.length) g = g.filter((x) => { const h = ' ' + normText(x.title); return t.every((w) => h.includes(w)); });
    const saving = (x: (typeof g)[number]) => x.max - x.min;
    const pct = (x: (typeof g)[number]) => (x.min > 0 ? (x.max - x.min) / x.min : 0);
    return [...g].sort((a, b) =>
      order === 'name' ? a.title.localeCompare(b.title, 'nl')
      : order === 'pct' ? (b.offers.size > 1 ? pct(b) : -1) - (a.offers.size > 1 ? pct(a) : -1)
      : (b.offers.size > 1 ? saving(b) : -1) - (a.offers.size > 1 ? saving(a) : -1));
  }, [groups, drink, df, onlyShared, order, chosen.length]);

  const drinkCounts = useMemo(() => {
    const m = new Map<string, number>();
    groups.forEach((g) => m.set(g.drink, (m.get(g.drink) ?? 0) + 1));
    return m;
  }, [groups]);

  // how often is each supplier the cheapest among the products they share with others
  const wins = useMemo(() => {
    const w = new Map<string, number>();
    let compared = 0;
    for (const g of shown) {
      if (g.offers.size < 2) continue;
      compared++;
      for (const [sid, p] of g.offers) if (p.priceBottle === g.min) w.set(sid, (w.get(sid) ?? 0) + 1);
    }
    return { w, compared };
  }, [shown]);

  const toggle = (id: string) => setPicked((s) => {
    if (s.size === 0) return new Set([id]); // from "Alle": start a selection with just this supplier
    const n = new Set(s);
    n.has(id) ? n.delete(id) : n.add(id);
    return n.size === suppliers.length ? new Set() : n;
  });

  if (suppliers.length < 2) {
    return (
      <div className="card empty">
        <div className="glyph">⚖️</div>
        <h2>Laad minstens twee prijslijsten in</h2>
        <p>Dan kun je leveranciers met elkaar vergelijken.</p>
      </div>
    );
  }

  const visible = shown.slice(0, limit);

  return (
    <div>
      <div className="card">
        <h2>Leveranciers vergelijken</h2>
        <p className="muted">Kies welke leveranciers je naast elkaar wilt zien: allemaal, twee, drie of meer. Gelijke producten worden herkend op EAN en op naam, ook als ze anders zijn geschreven.</p>
        <div className="chips">
          Leveranciers:
          <button className={picked.size === 0 ? 'chip on' : 'chip'} onClick={() => setPicked(new Set())}>Alle</button>
          {suppliers.map((s) => (
            <button key={s.id} className={picked.size === 0 || picked.has(s.id!) ? 'chip on' : 'chip'} onClick={() => toggle(s.id!)}>{s.name}</button>
          ))}
        </div>
        <div className="chips">
          Categorie:
          <button className={drink === '' ? 'chip on' : 'chip'} onClick={() => setDrink('')}>Alle</button>
          {DRINK_CATEGORIES.filter((c) => drinkCounts.has(c)).map((c) => (
            <button key={c} className={drink === c ? 'chip on' : 'chip'} onClick={() => setDrink(c)}>{c} <span className="muted small">{drinkCounts.get(c)}</span></button>
          ))}
        </div>
        <div className="toolbar">
          <input placeholder="Filter op naam…" value={filter} onChange={(e) => { setFilter(e.target.value); setLimit(200); }} />
          <label>Sorteer op{' '}
            <select value={order} onChange={(e) => setOrder(e.target.value as Order)}>
              <option value="saving">Grootste prijsverschil (€)</option>
              <option value="pct">Grootste prijsverschil (%)</option>
              <option value="name">Naam</option>
            </select>
          </label>
          <label><input type="checkbox" checked={onlyShared} onChange={(e) => setOnlyShared(e.target.checked)} /> Alleen producten die meerdere leveranciers hebben</label>
        </div>
      </div>

      {wins.compared > 0 && (
        <div className="card">
          <b>{wins.compared.toLocaleString('nl-NL')} producten vergeleken</b>
          <div className="winrow">
            {chosen.map((s) => (
              <div key={s.id} className="win">
                <div className="muted small">{s.name}</div>
                <b>{(wins.w.get(s.id!) ?? 0).toLocaleString('nl-NL')}×</b>
                <div className="muted small">goedkoopst</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="scroll big">
        <table>
          <thead>
            <tr>
              <th>Product</th><th>Inhoud</th>
              {chosen.map((s) => <th key={s.id} className="r">{s.name}</th>)}
              <th className="r">Verschil</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((g) => (
              <tr key={g.key}>
                <td>{g.title}<div className="muted small">{g.drink}</div></td>
                <td>{fmtVol(g.volume)}{g.abv ? ` · ${g.abv}%` : ''}</td>
                {chosen.map((s) => {
                  const p = g.offers.get(s.id!);
                  if (!p) return <td key={s.id} className="r muted">–</td>;
                  const best = g.offers.size > 1 && p.priceBottle === g.min;
                  return (
                    <td key={s.id} className={'r' + (best ? ' best-cell' : '')}>
                      <b>{eur(p.priceBottle, p.currency)}</b>
                      <button className="mini" title="Voeg toe aan bestelling" onClick={() => { addToCart(p.id!, p.packSize || 1); toast('Toegevoegd aan bestelling'); }}>+</button>
                    </td>
                  );
                })}
                <td className="r">{g.offers.size > 1 ? <><b>{eur(g.max - g.min)}</b><div className="muted small">{Math.round(((g.max - g.min) / g.min) * 100)}%</div></> : <span className="muted">–</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {shown.length > limit && (
        <div className="toolbar"><button onClick={() => setLimit(limit + 300)}>Meer tonen ({shown.length - limit} resterend)</button></div>
      )}
      {!shown.length && <p className="muted">Geen producten gevonden met deze selectie.</p>}
    </div>
  );
}
