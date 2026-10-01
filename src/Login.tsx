import { useState, type FormEvent } from 'react';
import { supabase } from './backend';

export default function Login() {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

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
      const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
      if (error) setError(error.message);
      else if (!data.session) setInfo('We hebben je een e-mail gestuurd. Klik op de link erin om je account te bevestigen en log daarna in.');
    }
    setBusy(false);
  }

  return (
    <div className="login">
      <form className="loginbox" onSubmit={submit}>
        <div className="brand big"><i>€</i></div>
        <h1>Prijsvergelijker</h1>
        <p className="muted">{mode === 'in' ? 'Log in om de prijslijsten te bekijken.' : 'Maak een account aan. Daarna maak je een organisatie aan of neem je deel met een code.'}</p>
        <input type="email" placeholder="E-mailadres" autoComplete="username" autoFocus required value={email} onChange={(e) => setEmail(e.target.value)} />
        <input type="password" placeholder="Wachtwoord" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} required value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <div className="err">{error}</div>}
        {info && <div className="ok">{info}</div>}
        <button className="primary" disabled={busy}>{busy ? 'Bezig…' : mode === 'in' ? 'Inloggen' : 'Account aanmaken'}</button>
        <button type="button" className="linkbtn" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setError(''); setInfo(''); }}>
          {mode === 'in' ? 'Nog geen account? Maak er een aan' : 'Heb je al een account? Inloggen'}
        </button>
      </form>
    </div>
  );
}
