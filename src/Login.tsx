import { useState, type FormEvent } from 'react';
import { supabase } from './backend';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) setError(/invalid/i.test(error.message) ? 'E-mailadres of wachtwoord klopt niet.' : error.message);
    setBusy(false);
  }

  return (
    <div className="login">
      <form className="loginbox" onSubmit={submit}>
        <div className="brand big"><i>€</i></div>
        <h1>Prijsvergelijker</h1>
        <p className="muted">Log in om de prijslijsten te bekijken.</p>
        <input type="email" placeholder="E-mailadres" autoComplete="username" autoFocus required value={email} onChange={(e) => setEmail(e.target.value)} />
        <input type="password" placeholder="Wachtwoord" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <div className="err">{error}</div>}
        <button className="primary" disabled={busy}>{busy ? 'Bezig…' : 'Inloggen'}</button>
      </form>
    </div>
  );
}
