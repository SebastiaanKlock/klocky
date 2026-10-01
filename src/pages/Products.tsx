import { useDeferredValue, useMemo, useState } from 'react';
import { useData } from '../ctx';
import { normText } from '../lib/text';
import { eur, fmtVol, parseNum, parseAbvFromText, parseVolumeFromText } from '../lib/text';
import type { Product } from '../types';
import { DRINK_CATEGORIES } from '../lib/categories';

type SortKey = 'description' | 'volume' | 'supplier' | 'priceBottle' | 'ean' | 'category';

export default function Products() {
  const { products, suppliers, supplierName, store } = useData();
  const [filter, setFilter] = useState('');
  const df = useDeferredValue(filter);
  const [supplierId, setSupplierId] = useState<string>('');
  const [drink, setDrink] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'description', dir: 1 });
  const [page, setPage] = useState(0);
  const [adding, setAdding] = useState(false);
  const PAGE = 200;

  const rows = useMemo(() => {
    const t = normText(df).split(' ').filter(Boolean);
    let r = products.filter((p) => (supplierId === '' || p.supplierId === supplierId) && (!drink || p.drink === drink) && t.every((x) => (' ' + p.search).includes(x)));
    const val = (p: Product): string | number => {
      switch (sort.key) {
        case 'supplier': return supplierName(p.supplierId);
        case 'volume': return p.volume ?? 0;
        case 'priceBottle': return p.priceBottle;
        case 'ean': return p.ean;
        case 'category': return p.drink;
        default: return p.description;
      }
    };
    r = [...r].sort((a, b) => {
      const x = val(a), y = val(b);
      const c = typeof x === 'number' ? x - (y as number) : String(x).localeCompare(String(y), 'nl', { numeric: true });
      return c * sort.dir || a.description.localeCompare(b.description, 'nl');
    });
    return r;
  }, [products, df, supplierId, drink, sort, supplierName]);

  const th = (key: SortKey, label: string, cls = '') => (
    <th className={'sortable ' + cls} onClick={() => { setSort((s) => ({ key, dir: s.key === key ? (-s.dir as 1 | -1) : 1 })); setPage(0); }}>
      {label}{sort.key === key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
    </th>
  );

  const slice = rows.slice(page * PAGE, (page + 1) * PAGE);
  const pages = Math.ceil(rows.length / PAGE);

  return (
    <div>
      <div className="toolbar">
        <input placeholder="Filter op naam, maat, EAN, artikelnummer…" value={filter} onChange={(e) => { setFilter(e.target.value); setPage(0); }} />
        <select value={supplierId} onChange={(e) => { setSupplierId(e.target.value); setPage(0); }}>
          <option value="">Alle leveranciers</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={drink} onChange={(e) => { setDrink(e.target.value); setPage(0); }}>
          <option value="">Alle categorieën</option>
          {DRINK_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <span className="muted">{rows.length.toLocaleString('nl-NL')} producten</span>
        <button onClick={() => setAdding(true)} disabled={!suppliers.length}>+ Product handmatig toevoegen</button>
      </div>

      {adding && <ManualForm onClose={() => setAdding(false)} />}

      <table>
        <thead>
          <tr>{th('description', 'Omschrijving')}{th('volume', 'Inhoud')}{th('supplier', 'Leverancier')}{th('priceBottle', 'Per fles', 'r')}<th className="r">Per doos</th>{th('ean', 'EAN')}{th('category', 'Categorie')}<th /></tr>
        </thead>
        <tbody>
          {slice.map((p) => (
            <tr key={p.id}>
              <td>{p.description}{p.extra && <div className="muted small">{p.extra}</div>}{p.manual && <span className="tag">handmatig</span>}</td>
              <td>{fmtVol(p.volume)}{p.abv ? ` · ${p.abv}%` : ''}</td>
              <td>{supplierName(p.supplierId)}</td>
              <td className="r"><b>{eur(p.priceBottle, p.currency)}</b></td>
              <td className="r">{eur(p.priceCase, p.currency)}</td>
              <td className="small">{p.ean}</td>
              <td className="small">{p.drink}{p.category && p.category.toLowerCase() !== p.drink.toLowerCase() ? <div className="muted">{p.category}</div> : null}</td>
              <td>{p.manual && <button className="danger small" onClick={() => store.deleteProduct(p)}>×</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {pages > 1 && (
        <div className="toolbar">
          <button disabled={page === 0} onClick={() => setPage(page - 1)}>← Vorige</button>
          <span>Pagina {page + 1} van {pages}</span>
          <button disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Volgende →</button>
        </div>
      )}
    </div>
  );
}

function ManualForm({ onClose }: { onClose: () => void }) {
  const { suppliers, store } = useData();
  const [f, setF] = useState({ supplierId: suppliers[0]?.id ?? '', description: '', volume: '', abv: '', packSize: '', price: '', ean: '', sku: '' });
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  async function save() {
    const price = parseNum(f.price);
    if (!f.description.trim() || price == null) return;
    const volume = parseNum(f.volume) ?? parseVolumeFromText(f.description);
    const abv = parseNum(f.abv) ?? parseAbvFromText(f.description);
    const packSize = parseNum(f.packSize);
    const sup = suppliers.find((s) => s.id === f.supplierId);
    await store.addManualProduct({
      supplierId: f.supplierId, sku: f.sku.trim(), description: f.description.trim(), extra: '', category: '',
      volume: volume != null ? (volume > 10 ? volume / 100 : volume) : undefined, abv, packSize,
      priceBottle: price, priceCase: packSize ? price * packSize : undefined, currency: sup?.currency ?? 'EUR',
      ean: f.ean.replace(/\D/g, ''), eanCase: '', manual: true,
    });
    onClose();
  }

  return (
    <div className="card">
      <h3>Product handmatig toevoegen</h3>
      <div className="row">
        <select value={f.supplierId} onChange={(e) => set('supplierId', e.target.value)}>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <input placeholder="Omschrijving *" value={f.description} onChange={(e) => set('description', e.target.value)} />
        <input className="num" placeholder="Inhoud (L)" value={f.volume} onChange={(e) => set('volume', e.target.value)} />
        <input className="num" placeholder="Alc. %" value={f.abv} onChange={(e) => set('abv', e.target.value)} />
        <input className="num" placeholder="Fles/doos" value={f.packSize} onChange={(e) => set('packSize', e.target.value)} />
        <input className="num" placeholder="Prijs/fles *" value={f.price} onChange={(e) => set('price', e.target.value)} />
        <input placeholder="EAN" value={f.ean} onChange={(e) => set('ean', e.target.value)} />
        <input placeholder="Art.nr" value={f.sku} onChange={(e) => set('sku', e.target.value)} />
        <button className="primary" onClick={save}>Opslaan</button>
        <button onClick={onClose}>Annuleren</button>
      </div>
    </div>
  );
}
