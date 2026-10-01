import { useCallback, useEffect, useState } from 'react';
import { listMembers, rpc, useOrg, type Member } from '../org';
import { supabase } from '../backend';
import { toast } from '../lib/toast';

export default function OrgCard() {
  const o = useOrg();
  const [members, setMembers] = useState<Member[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [name, setName] = useState(o?.org.name ?? '');
  const [legacy, setLegacy] = useState(false);
  const [code, setCode] = useState(o?.org.invite_code ?? '');

  const load = useCallback(async () => {
    if (!o) return;
    setMembers(await listMembers(o.org.id));
    setMe((await supabase!.auth.getUser()).data.user?.id ?? null);
  }, [o]);
  useEffect(() => { load().catch(() => {}); }, [load]);
  useEffect(() => { setName(o?.org.name ?? ''); setCode(o?.org.invite_code ?? ''); }, [o?.org.id, o?.org.name, o?.org.invite_code]);

  if (!o) return null;
  const { org } = o;
  const owner = org.role === 'owner';
  const link = `${location.origin}${location.pathname}`;

  async function rename() {
    const { error } = await supabase!.from('orgs').update({ name: name.trim() }).eq('id', org.id);
    if (error) return toast('Opslaan mislukt: ' + error.message);
    await o!.reload();
    toast('Naam opgeslagen');
  }
  async function rotate() {
    if (!confirm('Een nieuwe code maken? De oude code werkt dan niet meer (huidige leden blijven gewoon lid).')) return;
    setCode(await rpc<string>('rotate_invite', { p_org: org.id }));
    await o!.reload();
  }
  async function remove(m: Member) {
    if (!confirm(m.user_id === me ? 'Deze organisatie verlaten?' : `${m.email} verwijderen uit de organisatie?`)) return;
    try { await rpc('remove_member', { p_org: org.id, p_user: m.user_id }); } catch (e) { return toast((e as Error).message); }
    if (m.user_id === me) await o!.reload(); else await load();
  }
  async function claim() {
    try {
      const n = await rpc<number>('claim_legacy', { p_org: org.id });
      toast(`${n} oude gegevens overgezet — ververs de pagina`);
      setLegacy(false);
    } catch (e) { toast((e as Error).message); }
  }

  return (
    <div className="card">
      <h2>Organisatie</h2>
      <p className="muted">Alleen de leden van deze organisatie zien de prijslijsten, klanten en facturen.</p>

      {owner && (
        <div className="row">
          <input value={name} onChange={(e) => setName(e.target.value)} />
          <button disabled={!name.trim() || name === org.name} onClick={rename}>Naam wijzigen</button>
        </div>
      )}

      <h3>Leden</h3>
      <table>
        <tbody>
          {members.map((m) => (
            <tr key={m.user_id}>
              <td>{m.email}{m.user_id === me && <span className="tag">jij</span>}</td>
              <td className="muted">{m.role === 'owner' ? 'eigenaar' : 'collega'}</td>
              <td className="r">
                {(owner && m.user_id !== me) || (m.user_id === me && !(owner && members.filter((x) => x.role === 'owner').length <= 1)) ? (
                  <button className="danger small" onClick={() => remove(m)}>{m.user_id === me ? 'Verlaten' : 'Verwijderen'}</button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {owner && (
        <>
          <h3>Collega uitnodigen</h3>
          <p className="muted">Je collega maakt zelf een account aan op <b>{link}</b> en vult daarna deze code in.</p>
          <div className="row">
            <code className="code">{code}</code>
            <button onClick={() => { navigator.clipboard?.writeText(code); toast('Code gekopieerd'); }}>Kopieer code</button>
            <button onClick={rotate}>Nieuwe code</button>
          </div>
          <div className="row">
            <button className="small" onClick={() => setLegacy(true)}>Gegevens van vóór de organisaties overzetten…</button>
          </div>
          {legacy && (
            <div className="row">
              <span className="muted small">Zet alles over wat eerder in de gedeelde omgeving stond naar deze organisatie (eenmalig).</span>
              <button className="primary small" onClick={claim}>Overzetten</button>
              <button className="small" onClick={() => setLegacy(false)}>Annuleren</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
