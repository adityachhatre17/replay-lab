import React, { useEffect, useState } from 'react';
import ThemeToggle from './ThemeToggle';
import { Activity, Building2, Database, GitCompare, ShieldCheck, UserRound } from 'lucide-react';

const modes = ['welcome', 'login', 'signup'];

function currentScreen() {
  const screen = location.hash.slice(1);
  return modes.includes(screen) ? screen : 'welcome';
}

export default function AccountEntry({ Workspace }) {
  const [dark, setDark] = useState(() => localStorage.getItem('incident-replay-theme') === 'dark');
  const toggleTheme = () => setDark((value) => !value);
  const [screen, setScreen] = useState(currentScreen);
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [signoutError, setSignoutError] = useState('');

  useEffect(() => {
    const theme = dark ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]').content = dark ? '#080a08' : '#ffffff';
    localStorage.setItem('incident-replay-theme', theme);
  }, [dark]);

  useEffect(() => {
    const sync = () => setScreen(currentScreen());
    window.addEventListener('hashchange', sync);
    const controller = new AbortController();
    fetch('/api/account', { signal: controller.signal })
      .then(async (response) => {
        if (response.ok) setAccount(await response.json());
      })
      .catch(() => {})
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => {
      controller.abort();
      window.removeEventListener('hashchange', sync);
    };
  }, []);

  async function signOut() {
    setSignoutError('');
    try {
      const response = await fetch('/api/account/logout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      });
      if (!response.ok) throw new Error();
      setAccount(null);
      location.hash = 'welcome';
    } catch {
      setSignoutError('Could not sign out. Try again.');
    }
  }

  if (loading) return <main className="account-loading" role="status">Loading Incident Replay…</main>;
  if (account) return <Workspace account={account} onProfileUpdate={setAccount} signOut={signOut} signoutError={signoutError} dark={dark} toggleTheme={toggleTheme} />;

  return <div className="entry-shell">
    <header className="entry-header">
      <a className="entry-brand" href="#welcome"><span className="brand-icon"><Activity size={23} /></span>Incident Replay</a>
      <nav aria-label="Account navigation"><ThemeToggle dark={dark} onToggle={toggleTheme} /><a className="secondary" href="#login">Sign in</a><a className="primary" href="#signup">Create account</a></nav>
    </header>
    {screen === 'welcome' ? <main className="welcome">
      <section><h1>Reproduce the failure.<br /><em>Verify the fix.</em></h1>
        <p>Replay a production-like checkout case in an isolated sandbox. Compare the original and patched behavior against the same prepared dataset.</p>
        <a className="primary" href="#signup">Create your workspace</a>
      </section>
      <section className="welcome-flow" aria-label="Replay Lab workflow">
        <h2>From incident to verified fix</h2>
        <ol>
          <li><Database /><div><strong>Load a prepared dataset</strong><p>Use the full fixture or the records linked to one order.</p></div></li>
          <li><GitCompare /><div><strong>Compare two runs</strong><p>See where the original checkout stops and how the patch behaves.</p></div></li>
          <li><ShieldCheck /><div><strong>Verify the outcome</strong><p>Check that the patched run records exactly one payment.</p></div></li>
        </ol>
      </section>
    </main> : <main className="account-main"><AccountForm key={screen} signup={screen === 'signup'} onAccount={setAccount} /></main>}
  </div>;
}

function AccountForm({ signup, onAccount }) {
  const [type, setType] = useState('individual');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const { accountType, ...fields } = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const response = await fetch(signup ? '/api/account/signup' : '/api/account/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...fields, type: accountType }),
      });
      if (!response.ok) {
        const messages = {
          400: 'Check your account details and try again.',
          401: 'Check your account type, email, password, and organization name.',
          409: 'This account already exists. Sign in instead.',
        };
        throw new Error(messages[response.status] || 'The account service is unavailable. Try again shortly.');
      }
      onAccount(await response.json());
      location.hash = 'workspace';
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  return <form className="account-card" onSubmit={submit}>
    <h1>{signup ? 'Create an account' : 'Sign in'}</h1>
    <p>{signup ? 'Choose how you want to use Replay Lab.' : 'Choose the account type you registered with.'}</p>
    <fieldset className="account-types" disabled={busy}>
      <legend>Account type</legend>
      {[['individual', 'Individual', UserRound], ['organization', 'Organization', Building2]].map(([value, title, Icon]) =>
        <label key={value}><input type="radio" name="accountType" value={value} checked={type === value} onChange={() => { setType(value); setError(''); }} /><Icon size={17} />{title}</label>
      )}
    </fieldset>
    {signup && <label>Full name<input name="name" autoComplete="name" required maxLength={100} /></label>}
    {type === 'organization' && <label>Organization name<input name="organization" autoComplete="organization" required maxLength={100} /></label>}
    <label>Email<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>
    <label>Password<input name="password" type="password" autoComplete={signup ? 'new-password' : 'current-password'} required minLength={signup ? 12 : undefined} maxLength={128} /></label>
    {signup && <small>Use at least 12 characters.</small>}
    {error && <p className="account-error" role="alert">{error}</p>}
    <button className="primary" disabled={busy}>{busy ? 'Please wait…' : signup ? 'Create account' : 'Sign in'}</button>
    <p>{signup ? 'Already have an account?' : 'New to Replay Lab?'} <a href={signup ? '#login' : '#signup'}>{signup ? 'Sign in' : 'Create an account'}</a></p>
  </form>;
}
