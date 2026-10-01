import { useState, type FormEvent } from 'react';
import { supabase } from './backend';
import { LogoMark } from './Logo';

type Mode = 'in' | 'new' | 'join';
export const PENDING_KEY = 'prijsvergelijker.pending';

const COPY: Record<Mode, { title: string; sub: string; button: string }> = {
  in: { title: 'Welkom terug.', sub: 'Log in om je prijslijsten, klanten en facturen te bekijken.', button: 'Inloggen' },
  new: { title: 'Begin met je eigen omgeving.', sub: 'Maak een account en een organisatie aan. Daarna nodig je collega’s uit met een code.', button: 'Account en organisatie aanmaken' },
  join: { title: 'Deelnemen aan je team.', sub: 'Maak een account aan en vul de uitnodigingscode van je collega in.', button: 'Account aanmaken en deelnemen' },
};

export default function Login() {
  const [mode, setMode] = useState<Mode>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [extra, setExtra] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  const switchTo = (m: Mode) => { setMode(m); setError(''); setInfo(''); setExtra(''); };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError('');
    setInfo('');
    if (mode === 'in') {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) setError(/invalid/i.test(error.message) ? 'E-mailadres of wachtwoord klopt niet.' : error.message);
    } else {
      if (password.length < 8) { setError('Kies een wachtwoord van minstens 8 tekens.'); setBusy(false); return; }
      // remembered so the organisation is created / joined right after the first login
      try { localStorage.setItem(PENDING_KEY, JSON.stringify({ type: mode, value: extra.trim() })); } catch { /* ignore */ }
      const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
      if (error) {
        try { localStorage.removeItem(PENDING_KEY); } catch { /* ignore */ }
        setError(/registered|already/i.test(error.message) ? 'Dit e-mailadres heeft al een account. Log in.' : error.message);
      } else if (!data.session) {
        setInfo('We hebben je een e-mail gestuurd. Bevestig je account met de link erin en log daarna in.');
      }
    }
    setBusy(false);
  }

  const c = COPY[mode];
  return (
    <div className="login">
      <div className="welcome">
        <div className="brand big"><LogoMark size={72} /></div>
        <div className="wordmark">KLOCKY</div>
        <h1>{c.title}</h1>
        <p className="lead">{c.sub}</p>

        <div className="segmented center">
          <button type="button" className={mode === 'in' ? 'on' : ''} onClick={() => switchTo('in')}>Inloggen</button>
          <button type="button" className={mode === 'new' ? 'on' : ''} onClick={() => switchTo('new')}>Nieuwe organisatie</button>
          <button type="button" className={mode === 'join' ? 'on' : ''} onClick={() => switchTo('join')}>Ik heb een code</button>
        </div>

        <form className="loginbox" onSubmit={submit}>
          {mode === 'new' && (
            <input required value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Naam van je bedrijf" autoFocus />
          )}
          {mode === 'join' && (
            <input required value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Uitnodigingscode" autoFocus />
          )}
          <input type="email" placeholder="E-mailadres" autoComplete="username" autoFocus={mode === 'in'} required value={email} onChange={(e) => setEmail(e.target.value)} />
          <input type="password" placeholder={mode === 'in' ? 'Wachtwoord' : 'Kies een wachtwoord (min. 8 tekens)'} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} required value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <div className="err">{error}</div>}
          {info && <div className="ok">{info}</div>}
          <button className="primary" disabled={busy}>{busy ? 'Bezig…' : c.button}</button>
        </form>
        <p className="fine">Je gegevens zijn alleen zichtbaar voor de leden van je eigen organisatie.</p>
      </div>
    </div>
  );
}
