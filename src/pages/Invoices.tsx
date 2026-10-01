import { useEffect, useMemo, useRef, useState } from 'react';
import { useData } from '../ctx';
import { calcInvoice, lineNet, round2, type Calc } from '../lib/invoice';
import { searchProducts, sortHits } from '../lib/search';
import { eur, fmtVol } from '../lib/text';
import { toast } from '../lib/toast';
import type { Customer, Invoice, InvoiceLine, Product, Settings } from '../types';

const STATUSES: Invoice['status'][] = ['concept', 'verzonden', 'betaald'];
const today = () => new Date().toISOString().slice(0, 10);

export default function Invoices() {
  const { customers, invoices, store, settings } = useData();
  const [draft, setDraft] = useState<Invoice | null>(null);
  const [statusFilter, setStatusFilter] = useState<'' | Invoice['status']>('');

  const cname = (id?: string) => customers.find((c) => c.id === id)?.name ?? '—';

  if (draft) return <Editor invoice={draft} onClose={() => setDraft(null)} />;

  const list = invoices.filter((i) => !statusFilter || i.status === statusFilter);
  const sum = (st: Invoice['status']) =>
    invoices.filter((i) => i.status === st).reduce((a, i) => a + calcInvoice(i, settings.defaultVat).gross, 0);

  return (
    <div>
      <OrderPanel onCreated={setDraft} />
      <div className="card">
        <div className="between">
          <h2>Facturen</h2>
          <button onClick={() => setDraft({ number: store.nextInvoiceNumber(settings.invoicePrefix), date: today(), dueDays: 14, status: 'concept', lines: [], notes: '' })}>+ Lege factuur</button>
        </div>
        <div className="winrow">
          {STATUSES.map((s) => (
            <button key={s} className={'win clickable' + (statusFilter === s ? ' on' : '')} onClick={() => setStatusFilter(statusFilter === s ? '' : s)}>
              <div className="muted small">{s}</div>
              <b>{eur(sum(s))}</b>
              <div className="muted small">{invoices.filter((i) => i.status === s).length} facturen</div>
            </button>
          ))}
        </div>
        <table>
          <thead><tr><th>Nummer</th><th>Datum</th><th>Klant</th><th className="r">Totaal incl. btw</th><th>Status</th><th /></tr></thead>
          <tbody>
            {list.map((i) => (
              <tr key={i.id}>
                <td><b>{i.number}</b></td>
                <td>{new Date(i.date).toLocaleDateString('nl-NL')}</td>
                <td>{cname(i.customerId)}</td>
                <td className="r">{eur(calcInvoice(i, settings.defaultVat).gross)}</td>
                <td>
                  <select className={'status ' + i.status} value={i.status}
                    onChange={async (e) => { await store.saveInvoice({ ...i, status: e.target.value as Invoice['status'] }); toast(`${i.number} → ${e.target.value}`); }}>
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td className="r">
                  <button onClick={() => setDraft(i)}>Openen</button>{' '}
                  <button onClick={async () => { const { id: _i, ...rest } = i; setDraft({ ...rest, number: store.nextInvoiceNumber(settings.invoicePrefix), date: today(), status: 'concept' }); }} title="Maak een kopie als nieuw concept">Kopie</button>{' '}
                  <button className="danger" onClick={() => confirm(`Factuur ${i.number} verwijderen?`) && store.deleteInvoice(i.id!)}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.length && <p className="muted">{invoices.length ? 'Geen facturen met deze status.' : 'Nog geen facturen.'}</p>}
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
        <p className="muted">Leeg. Voeg producten toe via Zoeken of Vergelijken (knop “+”), of maak hieronder een lege factuur.</p>
      </div>
    );
  }

  const sell = (p: Product) => round2(p.priceBottle * (1 + m / 100));
  const total = lines.reduce((a, l) => a + l.qty * sell(l.p), 0);

  function create() {
    onCreated({
      number: store.nextInvoiceNumber(settings.invoicePrefix),
      date: today(),
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
    });
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

const num = (v: string) => (v === '' ? 0 : Number(v));
const SENDER_FIELDS = [
  ['company', 'Bedrijfsnaam'], ['address', 'Adres'], ['postalCity', 'Postcode en plaats'], ['vatNumber', 'BTW-nummer'],
  ['kvk', 'KvK-nummer'], ['iban', 'IBAN'], ['email', 'E-mail'], ['phone', 'Telefoon'],
] as const;

function Editor({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const { customers, settings, products, supplierName, store } = useData();
  const [inv, setInv] = useState<Invoice>(invoice);
  const [q, setQ] = useState('');
  const [saved, setSaved] = useState(!!invoice.id);
  const latest = useRef(inv);
  latest.current = inv;

  const upd = (patch: Partial<Invoice>) => { setInv((i) => ({ ...i, ...patch })); setSaved(false); };
  const setLine = (idx: number, patch: Partial<InvoiceLine>) => upd({ lines: inv.lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)) });
  const customer = customers.find((c) => c.id === inv.customerId);
  const calc = calcInvoice(inv, settings.defaultVat);
  const vatMode = inv.vatMode ?? (inv.vatShifted ? 'shifted' : 'standard');

  const hits = useMemo(() => (q.trim() ? sortHits(searchProducts(products, q), 'bottle').slice(0, 6) : []), [q, products]);

  async function save(silent = false) {
    const id = await store.saveInvoice(latest.current);
    setInv((i) => ({ ...i, id }));
    setSaved(true);
    if (!silent) toast('Factuur opgeslagen');
    return id;
  }

  // autosave: nothing is lost when the page is closed or navigated away from
  useEffect(() => {
    if (saved) return;
    const t = setTimeout(() => { save(true).catch(() => toast('Opslaan mislukt')); }, 1500);
    return () => clearTimeout(t);
  }, [inv, saved]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= inv.lines.length) return;
    const l = [...inv.lines];
    [l[i], l[j]] = [l[j], l[i]];
    upd({ lines: l });
  };

  const marginTotal = inv.lines.reduce((a, l) => a + (l.cost ? lineNet(l) - l.cost * l.qty : 0), 0);

  return (
    <div>
      <div className="no-print">
        <div className="between">
          <h2>Factuur {inv.number}</h2>
          <div className="row">
            <button onClick={async () => { if (!saved) await save(true); onClose(); }}>← Terug</button>
            <button className="primary" onClick={() => save()}>{saved ? 'Opgeslagen ✓' : 'Opslaan'}</button>
            <button onClick={async () => { await save(true); window.print(); }}>Afdrukken / PDF</button>
          </div>
        </div>

        <div className="card">
          <div className="between">
            <div className="segmented">
              {STATUSES.map((s) => (
                <button key={s} className={inv.status === s ? 'on ' + s : ''} onClick={() => upd({ status: s })}>{s}</button>
              ))}
            </div>
            <span className="muted small">{saved ? 'Alles is opgeslagen' : 'Wordt automatisch opgeslagen…'}</span>
          </div>
          <div className="mapgrid" style={{ marginTop: 14 }}>
            <label><span>Klant</span>
              <select value={inv.customerId ?? ''} onChange={(e) => upd({ customerId: e.target.value || undefined })}>
                <option value="">— kies klant —</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></label>
            <label><span>Factuurnummer</span><input value={inv.number} onChange={(e) => upd({ number: e.target.value })} /></label>
            <label><span>Datum</span><input type="date" value={inv.date} onChange={(e) => upd({ date: e.target.value })} /></label>
            <label><span>Betaaltermijn (dagen)</span><input type="number" value={inv.dueDays} onChange={(e) => upd({ dueDays: num(e.target.value) })} /></label>
            <label><span>Referentie / ordernummer klant</span><input value={inv.reference ?? ''} onChange={(e) => upd({ reference: e.target.value })} /></label>
            <label><span>Afleveradres (indien anders)</span><input value={inv.deliveryAddress ?? ''} onChange={(e) => upd({ deliveryAddress: e.target.value })} /></label>
          </div>
        </div>

        <div className="card">
          <details>
            <summary><b>Afzender op deze factuur</b> <span className="muted small">— {{ ...settings, ...inv.sender }.company || 'bedrijfsnaam invullen'}</span></summary>
            <p className="muted small">Standaard komen deze gegevens uit Instellingen. Pas ze hier aan voor alleen deze factuur.</p>
            <div className="mapgrid">
              {SENDER_FIELDS.map(([k, label]) => (
                <label key={k}><span>{label}</span>
                  <input value={inv.sender?.[k] ?? settings[k]} onChange={(e) => upd({ sender: { ...inv.sender, [k]: e.target.value } })} />
                </label>
              ))}
            </div>
            {inv.sender && <button className="small" onClick={() => upd({ sender: undefined })}>Standaardgegevens terugzetten</button>}
          </details>
        </div>

        <div className="card">
          <h3>Regels</h3>
          <div className="scroll big">
            <table>
              <thead><tr><th /><th>Omschrijving</th><th>Aantal</th><th>Prijs/stuk excl.</th><th>Korting %</th>{vatMode === 'standard' && <th>Btw %</th>}<th className="r">Inkoop</th><th>Totaal excl.</th><th /></tr></thead>
              <tbody>
                {inv.lines.map((l, i) => (
                  <tr key={i}>
                    <td className="nowrap">
                      <button className="mini" onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
                      <button className="mini" onClick={() => move(i, 1)} disabled={i === inv.lines.length - 1}>↓</button>
                    </td>
                    <td style={{ minWidth: 260 }}>
                      <input className="wide" value={l.description} placeholder="Omschrijving" onChange={(e) => setLine(i, { description: e.target.value })} />
                      {l.supplierName && <div className="muted small">via {l.supplierName}{l.sku && ` · art. ${l.sku}`}</div>}
                    </td>
                    <td><input type="number" className="num" value={l.qty} onChange={(e) => setLine(i, { qty: num(e.target.value) })} /></td>
                    <td><input type="number" step="0.01" className="num" value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: num(e.target.value), amount: undefined })} /></td>
                    <td><input type="number" className="num" value={l.discount ?? 0} onChange={(e) => setLine(i, { discount: num(e.target.value), amount: undefined })} /></td>
                    {vatMode === 'standard' && <td><input type="number" className="num" value={l.vat} onChange={(e) => setLine(i, { vat: num(e.target.value) })} /></td>}
                    <td className="r muted">{l.cost ? eur(l.cost) : ''}</td>
                    <td className="nowrap">
                      <input type="number" step="0.01" className={'num' + (l.amount != null ? ' manual' : '')} value={lineNet(l)} title="Typ hier om het regelbedrag handmatig te bepalen"
                        onChange={(e) => setLine(i, { amount: num(e.target.value) })} />
                      {l.amount != null && <button className="mini" title="Weer automatisch berekenen" onClick={() => setLine(i, { amount: undefined })}>↺</button>}
                    </td>
                    <td className="nowrap">
                      <button className="mini" title="Dupliceren" onClick={() => upd({ lines: [...inv.lines.slice(0, i + 1), { ...l }, ...inv.lines.slice(i + 1)] })}>⧉</button>
                      <button className="danger small" onClick={() => upd({ lines: inv.lines.filter((_, j) => j !== i) })}>×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
        </div>

        <div className="card">
          <h3>Totalen</h3>
          <div className="mapgrid">
            <label><span>Korting op de factuur (%)</span><input type="number" value={inv.discountPct ?? 0} onChange={(e) => upd({ discountPct: num(e.target.value) })} /></label>
            <label><span>Korting (vast bedrag)</span><input type="number" step="0.01" value={inv.discountAmount ?? 0} onChange={(e) => upd({ discountAmount: num(e.target.value) })} /></label>
            <label><span>Verzendkosten (excl. btw)</span><input type="number" step="0.01" value={inv.shipping ?? 0} onChange={(e) => upd({ shipping: num(e.target.value) })} /></label>
            <label><span>Btw</span>
              <select value={vatMode} onChange={(e) => upd({ vatMode: e.target.value as Invoice['vatMode'], vatShifted: undefined })}>
                <option value="standard">Met btw (per regel)</option>
                <option value="shifted">Btw verlegd (0%, intracommunautair / export)</option>
                <option value="none">Zonder btw</option>
              </select></label>
            {vatMode !== 'standard' && (
              <label><span>Tekst op de factuur</span>
                <input value={inv.vatNote ?? ''} placeholder={vatMode === 'shifted' ? 'Btw verlegd' : 'Vrijgesteld van btw'} onChange={(e) => upd({ vatNote: e.target.value })} /></label>
            )}
          </div>

          <div className="segmented" style={{ margin: '16px 0 10px' }}>
            <button className={!inv.manual ? 'on' : ''} onClick={() => upd({ manual: null })}>Automatisch berekenen</button>
            <button className={inv.manual ? 'on' : ''} onClick={() => upd({ manual: inv.manual ?? { net: calc.net, vat: calc.vat, gross: calc.gross } })}>Handmatig invullen</button>
          </div>

          {inv.manual ? (
            <div className="mapgrid">
              <label><span>Totaal excl. btw</span><input type="number" step="0.01" value={inv.manual.net} onChange={(e) => upd({ manual: { ...inv.manual!, net: num(e.target.value), gross: round2(num(e.target.value) + inv.manual!.vat) } })} /></label>
              {vatMode !== 'none' && <label><span>Btw</span><input type="number" step="0.01" value={inv.manual.vat} onChange={(e) => upd({ manual: { ...inv.manual!, vat: num(e.target.value), gross: round2(inv.manual!.net + num(e.target.value)) } })} /></label>}
              <label><span>{vatMode === 'none' ? 'Totaal te betalen' : 'Totaal incl. btw'}</span><input type="number" step="0.01" value={inv.manual.gross} onChange={(e) => upd({ manual: { ...inv.manual!, gross: num(e.target.value) } })} /></label>
              <div className="muted small">Berekend zou zijn: {eur(calcInvoice({ ...inv, manual: null }, settings.defaultVat).gross)}</div>
            </div>
          ) : (
            <div className="calc">
              <div><span>Subtotaal regels</span><span>{eur(calc.subtotal)}</span></div>
              {calc.discount > 0 && <div><span>Korting</span><span>− {eur(calc.discount)}</span></div>}
              {calc.shipping > 0 && <div><span>Verzendkosten</span><span>{eur(calc.shipping)}</span></div>}
              <div><span>Totaal excl. btw</span><span>{eur(calc.net)}</span></div>
              {!calc.noVat && calc.groups.map((g) => <div key={g.rate}><span>Btw {g.rate}% over {eur(g.net)}</span><span>{eur(g.vat)}</span></div>)}
              <div className="grand"><span>{calc.noVat ? 'Totaal te betalen' : 'Totaal incl. btw'}</span><span>{eur(calc.gross)}</span></div>
            </div>
          )}

          <label className="block" style={{ marginTop: 14 }}><span>Opmerking op factuur</span>
            <textarea value={inv.notes} onChange={(e) => upd({ notes: e.target.value })} /></label>
          <p className="r muted">Marge op deze factuur: <b>{eur(marginTotal)}</b></p>
        </div>
      </div>

      <InvoicePrint inv={inv} customer={customer} settings={{ ...settings, ...inv.sender }} calc={calc} />
    </div>
  );
}

function InvoicePrint({ inv, customer, settings, calc }: { inv: Invoice; customer?: Customer; settings: Settings; calc: Calc }) {
  const due = new Date(inv.date);
  due.setDate(due.getDate() + inv.dueDays);

  return (
    <div className="print-area">
      <div className="inv-head">
        <div>
          <h1>FACTUUR</h1>
          <div>Factuurnummer: <b>{inv.number}</b></div>
          <div>Datum: {new Date(inv.date).toLocaleDateString('nl-NL')}</div>
          <div>Vervaldatum: {due.toLocaleDateString('nl-NL')}</div>
          {inv.reference && <div>Uw referentie: {inv.reference}</div>}
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
        {inv.deliveryAddress && <div className="small" style={{ marginTop: 6 }}>Afleveradres: {inv.deliveryAddress}</div>}
      </div>
      <table>
        <thead><tr><th>Omschrijving</th><th className="r">Aantal</th><th className="r">Prijs</th>{inv.lines.some((l) => l.discount) && <th className="r">Korting</th>}{!calc.noVat && <th className="r">Btw</th>}<th className="r">Bedrag</th></tr></thead>
        <tbody>
          {inv.lines.map((l, i) => (
            <tr key={i}>
              <td>{l.description}{l.sku && <span className="muted small"> ({l.sku})</span>}</td>
              <td className="r">{l.qty || ''}</td><td className="r">{l.unitPrice ? eur(l.unitPrice) : ''}</td>
              {inv.lines.some((x) => x.discount) && <td className="r">{l.discount ? `${l.discount}%` : ''}</td>}
              {!calc.noVat && <td className="r">{calc.groups.length === 1 && calc.groups[0].rate === 0 ? '0%' : `${l.vat}%`}</td>}<td className="r">{eur(lineNet(l))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="inv-tot">
        {(calc.discount > 0 || calc.shipping > 0) && <div><span>Subtotaal</span><span>{eur(calc.subtotal)}</span></div>}
        {calc.discount > 0 && <div><span>Korting</span><span>− {eur(calc.discount)}</span></div>}
        {calc.shipping > 0 && <div><span>Verzendkosten</span><span>{eur(calc.shipping)}</span></div>}
        <div><span>Totaal excl. btw</span><span>{eur(calc.net)}</span></div>
        {!calc.noVat && (calc.manual
          ? <div><span>Btw</span><span>{eur(calc.vat)}</span></div>
          : calc.groups.map((g) => <div key={g.rate}><span>Btw {g.rate}%</span><span>{eur(g.vat)}</span></div>))}
        <div className="grand"><span>Totaal te betalen</span><span>{eur(calc.gross)}</span></div>
      </div>
      {(inv.vatMode === 'none' || inv.vatMode === 'shifted' || inv.vatShifted) && (
        <p className="small">{inv.vatNote || (inv.vatMode === 'none' ? 'Vrijgesteld van btw.' : `Btw verlegd${customer?.vatNumber ? ` naar ${customer.vatNumber}` : ''}.`)}</p>
      )}
      {inv.notes && <p>{inv.notes}</p>}
      <p className="small">Gelieve het bedrag voor {due.toLocaleDateString('nl-NL')} over te maken{settings.iban ? ` op ${settings.iban}` : ''} onder vermelding van {inv.number}.</p>
    </div>
  );
}
