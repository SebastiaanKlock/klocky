import { useState } from 'react';
import { useData } from '../ctx';
import type { Customer } from '../types';

const EMPTY: Customer = { name: '', address: '', postalCity: '', country: 'Nederland', vatNumber: '', email: '', phone: '', notes: '' };

export default function Customers() {
  const { customers, store } = useData();
  const [edit, setEdit] = useState<Customer | null>(null);

  async function save() {
    if (!edit || !edit.name.trim()) return;
    await store.saveCustomer(edit);
    setEdit(null);
  }
  const field = (k: keyof Customer, label: string) => (
    <label><span>{label}</span>
      <input value={(edit?.[k] as string) ?? ''} onChange={(e) => setEdit({ ...edit!, [k]: e.target.value })} />
    </label>
  );

  return (
    <div>
      <div className="toolbar"><button className="primary" onClick={() => setEdit({ ...EMPTY })}>+ Nieuwe klant</button></div>
      {edit && (
        <div className="card">
          <h3>{edit.id ? 'Klant bewerken' : 'Nieuwe klant'}</h3>
          <div className="mapgrid">
            {field('name', 'Naam / bedrijf *')}{field('address', 'Adres')}{field('postalCity', 'Postcode en plaats')}
            {field('country', 'Land')}{field('vatNumber', 'BTW-nummer')}{field('email', 'E-mail')}{field('phone', 'Telefoon')}{field('notes', 'Notities')}
          </div>
          <div className="row"><button className="primary" onClick={save}>Opslaan</button><button onClick={() => setEdit(null)}>Annuleren</button></div>
        </div>
      )}
      <table>
        <thead><tr><th>Naam</th><th>Adres</th><th>BTW-nr</th><th>Contact</th><th /></tr></thead>
        <tbody>
          {customers.map((c) => (
            <tr key={c.id}>
              <td><b>{c.name}</b></td>
              <td>{c.address}<div className="muted small">{c.postalCity} {c.country}</div></td>
              <td>{c.vatNumber}</td>
              <td>{c.email}<div className="muted small">{c.phone}</div></td>
              <td className="r">
                <button onClick={() => setEdit(c)}>Bewerken</button>{' '}
                <button className="danger" onClick={() => confirm(`"${c.name}" verwijderen?`) && store.deleteCustomer(c.id!)}>Verwijderen</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!customers.length && <p className="muted">Nog geen klanten.</p>}
    </div>
  );
}
