import React, { useEffect, useState } from 'react';
import { ExecutionTrace } from './CheckoutReplay';

async function request(path, body) {
  const response = await fetch(path, body === undefined ? undefined : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!response.ok) {
    const messages = {
      400: 'Check the details and try again.', 401: 'Sign in again to continue.',
      403: 'An organization account is required.', 404: 'This item or invitation is unavailable for your account.',
      409: 'You already manage a team with this name.',
    };
    throw new Error(messages[response.status] || 'The team request failed. Try again.');
  }
  return response.headers.get('content-type')?.includes('application/json') ? response.json() : null;
}

export default function Teams() {
  const [teams, setTeams] = useState([]);
  const [selected, setSelected] = useState('');
  const [details, setDetails] = useState(null);
  const [runs, setRuns] = useState([]);
  const [trace, setTrace] = useState(null);
  const [invitation, setInvitation] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const team = teams.find((item) => item.id === selected);
  const path = '/api/teams/' + selected;

  useEffect(() => {
    let active = true;
    Promise.all([request('/api/teams'), request('/api/replays')]).then(([items, ownRuns]) => {
      if (active) { setTeams(items); setRuns(ownRuns); }
    }).catch((failure) => { if (active) setError(failure.message); });
    return () => { active = false; };
  }, []);

  async function perform(action) {
    setBusy(true);
    setError('');
    setNotice('');
    try { await action(); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }

  async function open(id) {
    setSelected(id);
    setDetails(null);
    setTrace(null);
    setInvitation(null);
    setDetails(await request('/api/teams/' + id));
  }

  function submit(event, action) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = Object.fromEntries(new FormData(form));
    void perform(async () => { await action(fields); form.reset(); });
  }

  return <div className="content teams-page">
    <header className="scenario-header"><div><h1>Teams</h1><p>Create a team, invite coworkers, and review shared checkout tests.</p></div></header>
    {error && <p className="account-error" role="alert">{error}</p>}
    {notice && <p className="profile-status" role="status">{notice}</p>}
    <section className="comparison team-controls">
      <form className="profile-form" onSubmit={(event) => submit(event, async (fields) => {
        const created = await request('/api/teams', fields);
        setTeams((items) => [...items, created]);
        await open(created.id);
      })}>
        <label>Team name<input name="name" required maxLength={100} /></label>
        <button className="primary" disabled={busy}>Create team</button>
      </form>
      <form className="profile-form" onSubmit={(event) => submit(event, async (fields) => {
        await request('/api/teams/join', { token: fields.token.trim() });
        setTeams(await request('/api/teams'));
        setNotice('You joined the team. Select it below to see its tests.');
      })}>
        <label>Invitation code<input name="token" required maxLength={36} autoComplete="off" /></label>
        <button className="secondary" disabled={busy}>Join team</button>
      </form>
    </section>
    {teams.length > 0 && <div className="collection-list">
      {teams.map((item) => <button key={item.id} disabled={busy} aria-pressed={selected === item.id} onClick={() => perform(() => open(item.id))}>
        <strong>{item.name}</strong><span className="badge purple">{item.manager ? 'Manager' : 'Member'}</span>
      </button>)}
    </div>}
    {details && <div className="save">
      <section className="comparison">
        <div className="scenario-title"><h2>{team.name}</h2><span className="badge purple">{details.members.length} members</span></div>
        <ul className="team-roster">{details.members.map((member) => <li key={member.email}>
          <strong>{member.name}</strong> <span>{member.email}</span> <span className="badge neutral">{member.manager ? 'Manager' : 'Member'}</span>
        </li>)}</ul>
        {team.manager && <>
          <form className="profile-form" onSubmit={(event) => submit(event, async (fields) => {
            setInvitation({ ...await request(path + '/invitations', fields), email: fields.email });
          })}>
            <label>Coworker’s email<input name="email" type="email" required maxLength={254} /></label>
            <button className="secondary" disabled={busy}>Generate invitation</button>
          </form>
          {invitation && <p className="team-invitation" role="status">Share this one-time code with {invitation.email}. It expires in seven days. <code>{invitation.token}</code></p>}
        </>}
      </section>
      <section className="comparison">
        <h2>Team test analytics</h2>
        <div className="metadata">
          <span>{details.summary.sharedTests} shared tests</span>
          <span>{details.summary.verifiedFixes} verified fixes</span>
          <span>{details.summary.sharedTests - details.summary.verifiedFixes} without a verified fix</span>
        </div>
        {runs.length ? <form className="profile-form replay-fixture" onSubmit={(event) => submit(event, async (fields) => {
          await request(path + '/runs', fields);
          setDetails(await request(path));
          setNotice('Test results shared with the team.');
        })}>
          <label>Share a recent checkout run<select name="runId" required defaultValue="">
            <option value="" disabled>Select a run</option>
            {runs.map((run) => <option key={run.id} value={run.id}>{run.orderId} · {new Date(run.createdAt).toLocaleString()}</option>)}
          </select></label>
          <button className="secondary" disabled={busy}>Share results</button>
        </form> : <p>Run a checkout comparison in Replay Lab to share your first test.</p>}
        {details.tests.length > 0 && <div className="collection-list save">
          {details.tests.map((test) => <button key={test.id} aria-pressed={trace?.id === test.id} onClick={() => setTrace(test)}>
            <strong>{test.orderId}</strong><span className={'badge ' + (test.comparison.fixVerified ? 'green' : 'neutral')}>
              {test.comparison.fixVerified ? 'Fix verified' : 'Fix not verified'}
            </span>
          </button>)}
        </div>}
      </section>
      {trace && <ExecutionTrace result={trace.comparison} />}
    </div>}
  </div>;
}
