import React, { useState } from 'react';
import { ArrowRight, CheckCircle2, CircleAlert, Play, Upload } from 'lucide-react';

import sample from '../submission/fixtures/legacy-checkout.json';

function ReleaseTrace({ run, title }) {
  return <article className="run-card">
    <div className="run-label">{title}<code>{run.release}</code></div>
    <strong className="http">{run.status === 200 ? '200 OK' : '500 Internal Server Error'}</strong>
    <p>{run.payments} {run.payments === 1 ? 'payment' : 'payments'} recorded</p>
    <ol className="release-trace">{run.events.map((event) => <li key={event.component}>
      <div><strong>{event.component}</strong><span className={'badge ' + (event.status === 'failed' ? 'red' : event.status === 'passed' ? 'green' : 'neutral')}>{event.status === 'skipped' ? 'Not reached' : event.status}</span></div>
      <p>{event.message}</p>
    </li>)}</ol>
  </article>;
}

export async function replayRequest(path = '', payload) {
  const response = await fetch('/api/replays' + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
  });
  if (response.status === 401) throw new Error('Your session expired. Refresh and sign in to continue.');
  if (response.status === 400) throw new Error('Check that fixture IDs are unique, orders reference valid accounts, and amounts and currencies are valid.');
  if (response.status === 404) throw new Error('This replay is unavailable.');
  if (!response.ok) throw new Error('The replay service is unavailable. Try again.');
  return path.endsWith('/regression') ? null : response.json();
}

export function ExecutionTrace({ result }) {
  return <section className="comparison">
    <div className="scenario-title"><div><h2>Execution trace</h2><p>{result.orders} orders and {result.accounts} accounts seeded per run</p></div>
      <span role="status" className={'badge ' + (result.fixVerified ? 'green' : 'neutral')}>{result.fixVerified ? <CheckCircle2 size={15} /> : <CircleAlert size={15} />}
        {result.fixVerified ? 'Fix verified' : 'Expected failure-to-pass transition absent'}</span>
    </div>
    <div className="release-grid"><ReleaseTrace title="Original logic" run={result.original} /><ArrowRight className="release-arrow" size={20} /><ReleaseTrace title="Patched logic" run={result.patched} /></div>
  </section>;
}

export default function CheckoutReplay() {
  const [fixture, setFixture] = useState(sample);
  const [name, setName] = useState('Legacy checkout sample');
  const [orderId, setOrderId] = useState(sample.orders[0].id);
  const [scope, setScope] = useState('related');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function useFixture(data, filename) {
    setFixture(data);
    setName(filename);
    setOrderId(data.orders[0].id);
    setResult(null);
    setError('');
  }

  async function importFixture(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      if (file.size > 5_000_000) throw new Error('Choose a fixture smaller than 5 MB.');
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data?.orders) || !data.orders.length || !Array.isArray(data.accounts)
          || !data.orders.every((row) => typeof row?.id === 'string' && row.id)) {
        throw new Error('Use a JSON object with orders and accounts arrays. Each order needs an id.');
      }
      useFixture(data, file.name);
    } catch (failure) {
      setError(failure instanceof SyntaxError ? 'The selected file is not valid JSON.' : failure.message);
    } finally {
      setBusy(false);
    }
  }

  async function replay() {
    setBusy(true);
    setError('');
    setResult(null);
    try {
      setResult(await replayRequest('', {
        orders: fixture.orders, accounts: fixture.accounts, orderId, subset: scope === 'related',
      }));
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  return <div className="content checkout-lab">
    <header className="scenario-header">
      <div><h1>Replay Lab</h1><p>Run the same checkout against the original and patched logic using an isolated PostgreSQL fixture.</p></div>
      <span className="badge purple">Checkout sandbox</span>
    </header>
    <section className="comparison dataset-panel">
      <h2>Prepared dataset</h2>
      <p>Use synthetic IDs and prepared data. Replay fixtures and results are stored in your account history. Upload JSON with <code>orders</code> and <code>accounts</code> arrays.</p>
      <div className="dataset-info"><strong>{name}</strong><span>{fixture.orders.length} orders · {fixture.accounts.length} accounts</span></div>
      <fieldset className="replay-fixture" disabled={busy}>
        <label className="dataset-file"><span><Upload size={15} /> Import JSON fixture</span><input type="file" accept=".json,application/json" onChange={importFixture} /></label>
        <button className="secondary" onClick={() => useFixture(sample, 'Legacy checkout sample')}>Use sample</button>
        <label>Order to replay<select value={orderId} onChange={(event) => { setOrderId(event.target.value); setResult(null); }}>
          {fixture.orders.map((order, index) => <option key={index} value={order.id}>{order.id}</option>)}
        </select></label>
        <label>Dataset scope<select value={scope} onChange={(event) => { setScope(event.target.value); setResult(null); }}>
          <option value="related">Selected order and its account</option><option value="all">Entire dataset</option>
        </select></label>
      </fieldset>
      <p>Both runs replay the selected order. Dataset scope controls which rows are seeded.</p>
      <button className="primary save" disabled={busy} onClick={replay}><Play size={16} />{busy ? 'Working…' : 'Run checkout comparison'}</button>
      {error && <p role="alert">{error}</p>}
    </section>
    {result && <>
      <ExecutionTrace result={result.comparison} />
      <button className="secondary" disabled={busy || result.saved} onClick={async () => {
        setBusy(true);
        setError('');
        try {
          await replayRequest('/' + result.id + '/regression');
          setResult({ ...result, saved: true });
        } catch (failure) {
          setError(failure.message);
        } finally {
          setBusy(false);
        }
      }}>{result.saved ? 'Regression case saved' : 'Save as regression case'}</button>
    </>}
  </div>;
}
