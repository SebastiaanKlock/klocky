import { useEffect, useState } from 'react';
import { useData } from '../ctx';
import type { Settings } from '../types';
import OrgCard from './OrgCard';

export default function SettingsPage() {
  const { settings, store, mode } = useData();
  const [s, setS] = useState<Settings>(settings);
  const [saved, setSaved] = useState(false);
  useEffect(() => setS(settings), [settings]);

  const txt = (k: keyof Settings, label: string) => (
    <label><span>{label}</span><input value={String(s[k])} onChange={(e) => setS({ ...s, [k]: e.target.value })} /></label>
  );
  const num = (k: keyof Settings, label: string) => (
    <label><span>{label}</span><input type="number" value={Number(s[k])} onChange={(e) => setS({ ...s, [k]: Number(e.target.value) })} /></label>
  );

  async function backup() {
    const blob = new Blob([JSON.stringify(await store.exportAll())], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `prijsvergelijker-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  }
  async function restore(f: File) {
    if (!confirm('Alle huidige gegevens worden vervangen door de back-up. Doorgaan?')) return;
    await store.importAll(JSON.parse(await f.text()));
  }

  return (
    <div>
      {mode === 'shared' && <OrgCard />}
      <div className="card">
        <h2>Uw bedrijfsgegevens (op de factuur)</h2>
        <div className="mapgrid">
          {txt('company', 'Bedrijfsnaam')}{txt('address', 'Adres')}{txt('postalCity', 'Postcode en plaats')}
          {txt('vatNumber', 'BTW-nummer')}{txt('kvk', 'KvK-nummer')}{txt('iban', 'IBAN')}{txt('email', 'E-mail')}{txt('phone', 'Telefoon')}
        </div>
        <h3>Facturen</h3>
        <div className="mapgrid">
          {num('defaultMargin', 'Standaard marge op inkoopprijs (%)')}{num('defaultVat', 'BTW-percentage')}{txt('invoicePrefix', 'Factuurnummer-voorvoegsel')}
        </div>
        <div className="row">
          <button className="primary" onClick={async () => { await store.saveSettings(s); setSaved(true); setTimeout(() => setSaved(false), 1500); }}>Opslaan</button>
          {saved && <span className="ok">Opgeslagen</span>}
        </div>
      </div>
      <div className="card">
        <h2>Back-up</h2>
        <p className="muted">{mode === 'shared' ? 'De gegevens staan op de server en zijn op elke computer beschikbaar.' : 'De gegevens staan alleen in deze browser.'} Een back-up is een extra zekerheid.</p>
        <div className="row">
          <button onClick={backup}>Back-up downloaden</button>
          <label className="btn">Back-up terugzetten
            <input type="file" hidden accept=".json" onChange={(e) => { const f = e.target.files?.[0]; if (f) restore(f); e.target.value = ''; }} />
          </label>
        </div>
      </div>
    </div>
  );
}
