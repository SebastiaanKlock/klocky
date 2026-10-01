import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { useData } from '../ctx';
import { detect, detectMapping, FIELD_LABELS, FIELD_ORDER, signature, type Grid } from '../lib/detect';
import { parseGrid } from '../lib/importer';
import { eur, fmtVol } from '../lib/text';
import { toast } from '../lib/toast';
import { aiAvailable, aiDetectMapping } from '../lib/ai';
import type { FieldKey, Mapping, Supplier } from '../types';

const colLetter = (i: number) => {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

interface Loaded {
  fileName: string;
  sheets: { name: string; grid: Grid }[];
}

export default function Suppliers() {
  const { suppliers, products, store } = useData();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [target, setTarget] = useState<string | 'new'>('new');
  const [error, setError] = useState('');
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    products.forEach((p) => m.set(p.supplierId, (m.get(p.supplierId) ?? 0) + 1));
    return m;
  }, [products]);

  async function onFile(file: File, supplierId: string | 'new') {
    setError('');
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheets = wb.SheetNames.map((name) => ({
        name,
        grid: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: null }),
      })).filter((s) => s.grid.length > 1);
      if (!sheets.length) throw new Error('Geen gegevens gevonden in dit bestand.');
      setTarget(supplierId);
      setLoaded({ fileName: file.name, sheets });
    } catch (e) {
      setError('Kon het bestand niet lezen: ' + (e as Error).message + ' (ondersteund: .xlsx, .xls, .csv)');
    }
  }

  async function clearList(s: Supplier) {
    if (!confirm(`De prijslijst van "${s.name}" verwijderen? De leverancier blijft bestaan.`)) return;
    try { await store.clearPricelist(s.id!); toast('Prijslijst verwijderd'); } catch (e) { toast('Verwijderen mislukt: ' + (e as Error).message); }
  }

  async function removeSupplier(s: Supplier) {
    if (!confirm(`"${s.name}" en alle bijbehorende producten verwijderen?`)) return;
    try { await store.deleteSupplier(s.id!); } catch (e) { toast('Verwijderen mislukt: ' + (e as Error).message); }
  }

  return (
    <div>
      <div className="card">
        <h2>Prijslijst inladen</h2>
        <p className="muted">Sleep een Excel- of CSV-bestand hierheen. De app herkent zelf de kolommen, ook als de volgorde per leverancier anders is.</p>
        <DropZone onFile={(f) => onFile(f, 'new')} />
        {error && <p className="err">{error}</p>}
      </div>

      <div className="card">
        <h2>Leveranciers</h2>
        {suppliers.length === 0 && <p className="muted">Nog geen leveranciers. Laad een prijslijst in om er een aan te maken.</p>}
        <table>
          <thead><tr><th>Naam</th><th>Producten</th><th>Laatste import</th><th /></tr></thead>
          <tbody>
            {suppliers.map((s) => (
              <tr key={s.id}>
                <td>
                  <input value={s.name} onChange={(e) => store.saveSupplier({ ...s, name: e.target.value })} />
                </td>
                <td>{(counts.get(s.id!) ?? 0).toLocaleString('nl-NL')}</td>
                <td className="small muted">
                  {s.lastImport ? `${new Date(s.lastImport.date).toLocaleDateString('nl-NL')} · ${s.lastImport.file}` : '—'}
                </td>
                <td className="r">
                  <label className="btn">
                    Nieuwe prijslijst
                    <input type="file" hidden accept=".xlsx,.xls,.csv,.xlsm"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f, s.id!); e.target.value = ''; }} />
                  </label>{' '}
                  <button className="danger" disabled={!(counts.get(s.id!) ?? 0)} onClick={() => clearList(s)}>Prijslijst verwijderen</button>{' '}
                  <button className="danger" onClick={() => removeSupplier(s)}>Leverancier verwijderen</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {loaded && <ImportWizard loaded={loaded} initialTarget={target} onClose={() => setLoaded(null)} />}
    </div>
  );
}

function DropZone({ onFile }: { onFile: (f: File) => void }) {
  const [over, setOver] = useState(false);
  return (
    <label
      className={'drop' + (over ? ' over' : '')}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}
    >
      Sleep een prijslijst hierheen of klik om te kiezen
      <input type="file" hidden accept=".xlsx,.xls,.csv,.xlsm"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
    </label>
  );
}

function ImportWizard({ loaded, initialTarget, onClose }: { loaded: Loaded; initialTarget: string | 'new'; onClose: () => void }) {
  const { suppliers, store } = useData();
  const guessName = loaded.fileName.replace(/\.[^.]+$/, '').replace(/[-_ ]*(offer.?list|price.?list|prijslijst|preisliste|\d{4}|june|july|juni|juli).*$/i, '').trim() || loaded.fileName;

  const [target, setTarget] = useState<string | 'new'>(initialTarget);
  const [newName, setNewName] = useState(guessName);
  const [sheetIdx, setSheetIdx] = useState(() => {
    // best sheet = the one with the best header detection
    let best = 0, bestScore = -1;
    loaded.sheets.forEach((s, i) => {
      const d = detect(s.grid);
      const sc = d.score * 1000 + Math.min(s.grid.length, 999);
      if (sc > bestScore) { best = i; bestScore = sc; }
    });
    return best;
  });
  const grid = loaded.sheets[sheetIdx].grid;
  const supplier = target !== 'new' ? suppliers.find((s) => s.id === target) : undefined;

  const auto = useMemo(() => detect(grid), [grid]);
  const [override, setOverride] = useState<{ sheet: number; headerRow: number; mapping: Mapping } | null>(null);

  // Reuse a mapping the user corrected earlier if the layout is identical
  const saved = useMemo(() => {
    if (supplier?.mapping && supplier.headerSignature === signature(auto.headers)) {
      return { headerRow: supplier.headerRow ?? auto.headerRow, mapping: supplier.mapping };
    }
    return null;
  }, [supplier, auto]);

  const active = override && override.sheet === sheetIdx ? override : null;
  const headerRow = active?.headerRow ?? saved?.headerRow ?? auto.headerRow;
  const mapping = active?.mapping ?? saved?.mapping ?? auto.mapping;
  const headers = useMemo(() => detectMapping(grid, headerRow).headers, [grid, headerRow]);

  const currency = supplier?.currency ?? 'EUR';
  const result = useMemo(() => parseGrid(grid, headerRow, mapping, currency), [grid, headerRow, mapping, currency]);

  const setMap = (f: FieldKey, v: string) =>
    setOverride({ sheet: sheetIdx, headerRow, mapping: { ...mapping, [f]: v === '' ? undefined : Number(v) } });
  const setHeaderRow = (r: number) => {
    const d = detectMapping(grid, r);
    setOverride({ sheet: sheetIdx, headerRow: r, mapping: d.mapping });
  };

  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState('');

  async function runAi() {
    setAiBusy(true);
    setAiNote('');
    try {
      const r = await aiDetectMapping(grid);
      setOverride({ sheet: sheetIdx, headerRow: r.headerRow, mapping: r.mapping });
      setAiNote(r.note || 'De AI heeft de kolommen herkend.');
    } catch (e) {
      setAiNote('AI-herkenning mislukt: ' + (e as Error).message);
    } finally {
      setAiBusy(false);
    }
  }
  const canImport = result.products.length > 0 && (target !== 'new' || newName.trim());

  async function doImport() {
    setBusy(true);
    try {
      const meta = {
        mapping,
        headerRow,
        headerSignature: signature(headers),
        lastImport: { file: loaded.fileName, date: new Date().toISOString(), count: result.products.length },
      };
      const base = supplier ?? { name: newName.trim(), currency: 'EUR' };
      const id = await store.saveSupplier({ ...base, ...meta });
      // replaces the previous list; manually added products stay
      await store.replacePricelist(id, result.products);
      toast(`${result.products.length.toLocaleString('nl-NL')} producten geïmporteerd`);
      onClose();
    } catch (e) {
      alert('Importeren mislukt: ' + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const missingPrice = mapping.priceBottle == null && mapping.priceCase == null;
  const preview = result.products.slice(0, 8);

  return (
    <div className="modal">
      <div className="modalbody">
        <div className="between">
          <h2>Prijslijst importeren — {loaded.fileName}</h2>
          <button onClick={onClose}>Sluiten</button>
        </div>

        <div className="row">
          <label>Leverancier{' '}
            <select value={String(target)} onChange={(e) => setTarget(e.target.value)}>
              <option value="new">+ Nieuwe leverancier</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          {target === 'new' && <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Naam leverancier" />}
          {loaded.sheets.length > 1 && (
            <label>Tabblad{' '}
              <select value={sheetIdx} onChange={(e) => setSheetIdx(Number(e.target.value))}>
                {loaded.sheets.map((s, i) => <option key={s.name} value={i}>{s.name} ({s.grid.length} rijen)</option>)}
              </select>
            </label>
          )}
          <label>Koprij (rij){' '}
            <input type="number" className="num" min={1} value={headerRow + 1} onChange={(e) => setHeaderRow(Math.max(0, Number(e.target.value) - 1))} />
          </label>
        </div>

        {aiAvailable && (
          <div className="row">
            <button onClick={runAi} disabled={aiBusy}>{aiBusy ? 'AI is aan het lezen…' : '✨ Laat AI de kolommen herkennen'}</button>
            {aiNote && <span className="muted small">{aiNote}</span>}
          </div>
        )}
        {saved && !active && <p className="ok">Eerder opgeslagen kolomindeling van deze leverancier wordt gebruikt.</p>}

        <h3>Kolommen (automatisch herkend — pas aan waar nodig)</h3>
        <div className="mapgrid">
          {FIELD_ORDER.map((f) => (
            <label key={f} className={(f === 'description' || f === 'priceBottle') && mapping[f] == null && !(f === 'priceBottle' && mapping.priceCase != null) ? 'missing' : ''}>
              <span>{FIELD_LABELS[f]}</span>
              <select value={mapping[f] ?? ''} onChange={(e) => setMap(f, e.target.value)}>
                <option value="">— niet aanwezig —</option>
                {headers.map((h, i) => (
                  <option key={i} value={i}>{colLetter(i)}{h ? `: ${h}` : ''}{sampleOf(grid, headerRow, i)}</option>
                ))}
              </select>
            </label>
          ))}
        </div>
        {missingPrice && <p className="err">Kies minstens een prijskolom (per fles of per doos){aiAvailable ? ' of laat de AI het proberen' : ''}.</p>}

        <h3>Voorbeeld — {result.products.length.toLocaleString('nl-NL')} producten herkend{result.skipped ? `, ${result.skipped} regels overgeslagen (geen prijs/omschrijving)` : ''}</h3>
        <div className="scroll">
          <table>
            <thead><tr><th>Art.</th><th>Omschrijving</th><th>Inhoud</th><th>%</th><th>Doos</th><th className="r">Per fles</th><th className="r">Per doos</th><th>EAN</th><th>Categorie</th></tr></thead>
            <tbody>
              {preview.map((p, i) => (
                <tr key={i}>
                  <td>{p.sku}</td>
                  <td>{p.description}{p.extra && <div className="muted small">{p.extra}</div>}</td>
                  <td>{fmtVol(p.volume)}</td><td>{p.abv ?? ''}</td><td>{p.packSize ?? ''}</td>
                  <td className="r">{eur(p.priceBottle, p.currency)}</td><td className="r">{eur(p.priceCase, p.currency)}</td>
                  <td className="small">{p.ean}</td><td className="small">{p.category}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="between">
          <span className="muted small">
            {target !== 'new' && 'De bestaande prijslijst van deze leverancier wordt vervangen (handmatig toegevoegde producten blijven staan).'}
          </span>
          <button className="primary" disabled={!canImport || busy || missingPrice} onClick={doImport}>
            {busy ? 'Bezig…' : `Importeer ${result.products.length.toLocaleString('nl-NL')} producten`}
          </button>
        </div>
      </div>
    </div>
  );
}

function sampleOf(grid: Grid, headerRow: number, col: number) {
  for (let r = headerRow + 1; r < Math.min(grid.length, headerRow + 12); r++) {
    const v = grid[r]?.[col];
    if (v != null && String(v).trim() !== '') return ` (bijv. ${String(v).slice(0, 24)})`;
  }
  return '';
}
