import { useMemo, useState } from 'react';
import { useData } from '../ctx';
import { searchProducts, sortHits } from '../lib/search';
import { eur, fmtVol } from '../lib/text';
import { toast } from '../lib/toast';
import type { Customer, Invoice, InvoiceLine, Product, Settings } from '../types';

const round2 = (n: number) => Math.round(n * 100) / 100;
const totals = (lines: InvoiceLine[]) => {
  const net = lines.reduce((a, l) => a + l.qty * l.unitPrice, 0);
  const vat = lines.reduce((a, l) => a + l.qty * l.unitPrice * (l.vat / 100), 0);
  return { net: round2(net), vat: round2(vat), gross: round2(net + vat) };
};

export default function Invoices() {
  const { customers, invoices, store, settings } = useData();
  const [draft, setDraft] = useState<Invoice | null>(null);

  const cname = (id?: string) => customers.find((c) => c.id === id)?.name ?? '—';

  if (draft) {
    return <Editor invoice={draft} onClose={() => { setDraft(null); }} />;
  }

  return (
    <div>
      <OrderPanel onCreated={(inv) => { setDraft(inv); }} />
      <div className="card">
        <div className="between">
          <h2>Facturen</h2>
          <button onClick={() => {
            setDraft({ number: store.nextInvoiceNumber(settings.invoicePrefix), date: new Date().toISOString().slice(0, 10), dueDays: 14, status: 'concept', lines: [], notes: '' });
          }}>+ Lege factuur</button>
        </div>
        <table>
          <thead><tr><th>Nummer</th><th>Datum</th><th>Klant</th><th className="r">Totaal incl. btw</th><th>Status</th><th /></tr></thead>
          <tbody>
            {invoices.map((i) => (
              <tr key={i.id}>
                <td><b>{i.number}</b></td>
                <td>{new Date(i.date).toLocaleDateString('nl-NL')}</td>
                <td>{cname(i.customerId)}</td>
                <td className="r">{eur(totals(i.lines).gross)}</td>
                <td><span className={'tag ' + i.status}>{i.status}</span></td>
                <td className="r">
                  <button onClick={() => setDraft(i)}>Openen</button>{' '}
                  <button className="danger" onClick={() => confirm(`Factuur ${i.number} verwijderen?`) && store.deleteInvoice(i.id!)}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!invoices.length && <p className="muted">Nog geen facturen.</p>}
      </div>
    </div>
  );
}

function OrderPanel({ onCreated }: { onCreated: (i: Invoice) => void }) {
  const { cart, products, customers, settings, supplierName, setCartQty, clearCart, store } = useData();
  const [margin, setMargin] = useState<number | null>(null);
  const [customerId, setCustomerId] = useState<string>('');
  const m = margin ?? settings.defaultMargin;

  const lines = cart
    .map((l) => ({ ...l, p: products.find((p) => p.id === l.productId) }))
    .filter((l): l is typeof l & { p: Product } => !!l.p);

  if (!lines.length) {
    return (
      <div className="card">
        <h2>Bestelling</h2>
        <p className="muted">Leeg. Voeg producten toe via Zoeken (knop “+ Bestelling”) of maak hieronder een lege factuur.</p>
      </div>
    );
  }

  const sell = (p: Product) => round2(p.priceBottle * (1 + m / 100));
  const total = lines.reduce((a, l) => a + l.qty * sell(l.p), 0);

  function create() {
    const inv: Invoice = {
      number: store.nextInvoiceNumber(settings.invoicePrefix),
      date: new Date().toISOString().slice(0, 10),
      dueDays: 14,
      customerId: customerId || undefined,
      status: 'concept',
      notes: '',
      lines: lines.map((l) => ({
        description: [l.p.description, fmtVol(l.p.volume)].filter(Boolean).join(' · '),
        sku: l.p.sku,
        supplierName: supplierName(l.p.supplierId),
        qty: l.qty,
        cost: l.p.priceBottle,
        unitPrice: sell(l.p),
        vat: settings.defaultVat,
      })),
    };
    onCreated(inv);
    clearCart();
  }

  return (
    <div className="card">
      <div className="between"><h2>Bestelling ({lines.length})</h2><button onClick={clearCart}>Leegmaken</button></div>
      <table>
        <thead><tr><th>Product</th><th>Leverancier</th><th className="r">Inkoop/fles</th><th>Aantal flessen</th><th className="r">Verkoop/fles</th><th className="r">Totaal</th><th /></tr></thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.productId}>
              <td>{l.p.description} <span className="muted small">{fmtVol(l.p.volume)}</span></td>
              <td>{supplierName(l.p.supplierId)}</td>
              <td className="r">{eur(l.p.priceBottle, l.p.currency)}</td>
              <td><input type="number" className="num" min={0} value={l.qty} onChange={(e) => setCartQty(l.productId, Number(e.target.value))} />
                {l.p.packSize ? <span className="muted small"> doos = {l.p.packSize}</span> : null}</td>
              <td className="r">{eur(sell(l.p))}</td>
              <td className="r">{eur(l.qty * sell(l.p))}</td>
              <td><button className="danger small" onClick={() => setCartQty(l.productId, 0)}>×</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row">
        <label>Marge % <input type="number" className="num" value={m} onChange={(e) => setMargin(Number(e.target.value))} /></label>
        <label>Klant{' '}
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">— kies klant —</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <b>Totaal excl. btw: {eur(total)}</b>
        <button className="primary" onClick={create}>Factuur maken</button>
      </div>
    </div>
  );
}

function Editor({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const { customers, settings, products, supplierName, store } = useData();
  const [inv, setInv] = useState<Invoice>(invoice);
  const [q, setQ] = useState('');
  const [saved, setSaved] = useState(!!invoice.id);
  const upd = (patch: Partial<Invoice>) => { setInv((i) => ({ ...i, ...patch })); setSaved(false); };
  const setLine = (idx: number, patch: Partial<InvoiceLine>) => upd({ lines: inv.lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)) });
  const customer = customers.find((c) => c.id === inv.customerId);
  const t = totals(inv.lines);

  const hits = useMemo(() => (q.trim() ? sortHits(searchProducts(products, q), 'bottle').slice(0, 6) : []), [q, products]);

  function addProduct(p: Product) {
    upd({
      lines: [...inv.lines, {
        description: [p.description, fmtVol(p.volume)].filter(Boolean).join(' · '),
        sku: p.sku, supplierName: supplierName(p.supplierId), qty: p.packSize || 1, cost: p.priceBottle,
        unitPrice: round2(p.priceBottle * (1 + settings.defaultMargin / 100)), vat: settings.defaultVat,
      }],
    });
    setQ('');
  }

  async function save() {
    const id = await store.saveInvoice(inv);
    setInv((i) => ({ ...i, id }));
    setSaved(true);
    toast('Factuur opgeslagen');
  }

  return (
    <div>
      <div className="no-print">
        <div className="between">
          <h2>Factuur {inv.number}</h2>
          <div className="row">
            <button onClick={onClose}>← Terug</button>
            <button className="primary" onClick={save}>{saved ? 'Opgeslagen ✓' : 'Opslaan'}</button>
            <button onClick={async () => { await save(); window.print(); }}>Afdrukken / PDF</button>
          </div>
        </div>

        <div className="card">
          <div className="mapgrid">
            <label><span>Klant</span>
              <select value={inv.customerId ?? ''} onChange={(e) => upd({ customerId: e.target.value || undefined })}>
                <option value="">— kies klant —</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></label>
            <label><span>Factuurnummer</span><input value={inv.number} onChange={(e) => upd({ number: e.target.value })} /></label>
            <label><span>Datum</span><input type="date" value={inv.date} onChange={(e) => upd({ date: e.target.value })} /></label>
            <label><span>Betaaltermijn (dagen)</span><input type="number" value={inv.dueDays} onChange={(e) => upd({ dueDays: Number(e.target.value) })} /></label>
            <label><span>Status</span>
              <select value={inv.status} onChange={(e) => upd({ status: e.target.value as Invoice['status'] })}>
                <option value="concept">concept</option><option value="verzonden">verzonden</option><option value="betaald">betaald</option>
              </select></label>
          </div>
        </div>

        <div className="card">
          <h3>Regels</h3>
          <table>
            <thead><tr><th>Omschrijving</th><th>Aantal</th><th>Prijs/stuk excl.</th><th>Btw %</th><th className="r">Inkoop</th><th className="r">Marge</th><th className="r">Totaal excl.</th><th /></tr></thead>
            <tbody>
              {inv.lines.map((l, i) => (
                <tr key={i}>
                  <td>
                    <input className="wide" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} />
                    {l.supplierName && <div className="muted small">via {l.supplierName}{l.sku && ` · art. ${l.sku}`}</div>}
                  </td>
                  <td><input type="number" className="num" value={l.qty} onChange={(e) => setLine(i, { qty: Number(e.target.value) })} /></td>
                  <td><input type="number" step="0.01" className="num" value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: Number(e.target.value) })} /></td>
                  <td><input type="number" className="num" value={l.vat} onChange={(e) => setLine(i, { vat: Number(e.target.value) })} /></td>
                  <td className="r muted">{l.cost ? eur(l.cost) : ''}</td>
                  <td className="r muted">{l.cost ? eur((l.unitPrice - l.cost) * l.qty) : ''}</td>
                  <td className="r">{eur(l.qty * l.unitPrice)}</td>
                  <td><button className="danger small" onClick={() => upd({ lines: inv.lines.filter((_, j) => j !== i) })}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row">
            <button onClick={() => upd({ lines: [...inv.lines, { description: '', sku: '', supplierName: '', qty: 1, cost: 0, unitPrice: 0, vat: settings.defaultVat }] })}>+ Lege regel</button>
            <input className="wide" placeholder="Of zoek een product om toe te voegen…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {hits.length > 0 && (
            <table>
              <tbody>
                {hits.map((h) => (
                  <tr key={h.product.id}>
                    <td>{h.product.description} <span className="muted small">{fmtVol(h.product.volume)}</span></td>
                    <td>{supplierName(h.product.supplierId)}</td>
                    <td className="r">{eur(h.product.priceBottle, h.product.currency)}</td>
                    <td><button onClick={() => addProduct(h.product)}>Toevoegen</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <label className="block"><span>Opmerking op factuur</span>
            <textarea value={inv.notes} onChange={(e) => upd({ notes: e.target.value })} /></label>
          <p className="r">Marge totaal: <b>{eur(inv.lines.reduce((a, l) => a + (l.cost ? (l.unitPrice - l.cost) * l.qty : 0), 0))}</b></p>
        </div>
      </div>

      <InvoicePrint inv={inv} customer={customer} settings={settings} t={t} />
    </div>
  );
}

function InvoicePrint({ inv, customer, settings, t }: { inv: Invoice; customer?: Customer; settings: Settings; t: ReturnType<typeof totals> }) {
  const due = new Date(inv.date);
  due.setDate(due.getDate() + inv.dueDays);
  const vatGroups = new Map<number, number>();
  inv.lines.forEach((l) => vatGroups.set(l.vat, (vatGroups.get(l.vat) ?? 0) + l.qty * l.unitPrice * (l.vat / 100)));

  return (
    <div className="print-area">
      <div className="inv-head">
        <div>
          <h1>FACTUUR</h1>
          <div>Factuurnummer: <b>{inv.number}</b></div>
          <div>Datum: {new Date(inv.date).toLocaleDateString('nl-NL')}</div>
          <div>Vervaldatum: {due.toLocaleDateString('nl-NL')}</div>
        </div>
        <div className="r">
          <b>{settings.company || 'Uw bedrijfsnaam'}</b>
          <div>{settings.address}</div><div>{settings.postalCity}</div>
          {settings.vatNumber && <div>BTW: {settings.vatNumber}</div>}
          {settings.kvk && <div>KvK: {settings.kvk}</div>}
          {settings.email && <div>{settings.email}</div>}{settings.phone && <div>{settings.phone}</div>}
        </div>
      </div>
      <div className="inv-to">
        <b>{customer?.name ?? '—'}</b>
        {customer && <><div>{customer.address}</div><div>{customer.postalCity}</div><div>{customer.country}</div>{customer.vatNumber && <div>BTW: {customer.vatNumber}</div>}</>}
      </div>
      <table>
        <thead><tr><th>Omschrijving</th><th className="r">Aantal</th><th className="r">Prijs</th><th className="r">Btw</th><th className="r">Bedrag</th></tr></thead>
        <tbody>
          {inv.lines.map((l, i) => (
            <tr key={i}>
              <td>{l.description}{l.sku && <span className="muted small"> ({l.sku})</span>}</td>
              <td className="r">{l.qty}</td><td className="r">{eur(l.unitPrice)}</td><td className="r">{l.vat}%</td><td className="r">{eur(l.qty * l.unitPrice)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="inv-tot">
        <div><span>Totaal excl. btw</span><span>{eur(t.net)}</span></div>
        {[...vatGroups].map(([rate, amt]) => <div key={rate}><span>Btw {rate}%</span><span>{eur(round2(amt))}</span></div>)}
        <div className="grand"><span>Totaal te betalen</span><span>{eur(t.gross)}</span></div>
      </div>
      {inv.notes && <p>{inv.notes}</p>}
      <p className="small">Gelieve het bedrag voor {due.toLocaleDateString('nl-NL')} over te maken{settings.iban ? ` op ${settings.iban}` : ''} onder vermelding van {inv.number}.</p>
    </div>
  );
}
