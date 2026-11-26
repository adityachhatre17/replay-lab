import React, { useState } from 'react';
import { UserRound } from 'lucide-react';
import ThemeToggle from './ThemeToggle';

export default function ProfileSettings({ account, onProfileUpdate, dark, toggleTheme }) {
  const [name, setName] = useState(account.name);
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);
  const displayName = name.trim();

  async function save(event) {
    event.preventDefault();
    setStatus(null);
    setSaving(true);
    try {
      const response = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: displayName }),
      });
      if (response.status === 401) throw new Error('Your session expired. Refresh and sign in to continue.');
      if (!response.ok) throw new Error('Could not save your display name. Try again.');
      const updated = await response.json();
      onProfileUpdate(updated);
      setName(updated.name);
      setStatus({ message: 'Display name saved.' });
    } catch (error) {
      setStatus({ message: error.message, error: true });
    } finally {
      setSaving(false);
    }
  }

  return <div className="content profile-settings">
    <header className="scenario-header"><h1>My profile</h1></header>
    <section className="comparison">
      <div className="section-heading"><span className="section-icon purple-icon"><UserRound size={19} /></span><h2>Account details</h2></div>
      <dl className="profile-details">
        <div><dt>Email address</dt><dd>{account.email}</dd></div>
        <div><dt>Account type</dt><dd>{account.type === 'organization' ? 'Organization' : 'Individual'}</dd></div>
        {account.organization && <div><dt>Organization</dt><dd>{account.organization}</dd></div>}
      </dl>
      <form className="profile-form" onSubmit={save}>
        <label>Display name<input value={name} required maxLength={100} autoComplete="name" disabled={saving}
          onChange={(event) => { setName(event.target.value); setStatus(null); }} /></label>
        <button className="primary" disabled={saving || !displayName || displayName === account.name}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        {status && <p className={status.error ? 'account-error' : 'profile-status'} role={status.error ? 'alert' : 'status'}>{status.message}</p>}
      </form>
    </section>
    <section className="comparison">
      <h2>Appearance</h2>
      <ThemeToggle dark={dark} onToggle={toggleTheme} />
    </section>
  </div>;
}
