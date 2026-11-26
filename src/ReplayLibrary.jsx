import React, { useEffect, useState } from 'react';
import { ExecutionTrace, replayRequest } from './CheckoutReplay';

const pageSize = 25;

export default function ReplayLibrary({ saved, openLab }) {
  const title = saved ? 'Regression cases' : 'Replay history';
  const [offset, setOffset] = useState(0);
  const [entries, setEntries] = useState([]);
  const [selection, setSelection] = useState(null);
  const [rerun, setRerun] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetch('/api/replays?saved=' + saved + '&offset=' + offset, { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401) throw new Error('Your session expired. Refresh and sign in to continue.');
        if (!response.ok) throw new Error('Could not load replay records.');
        setEntries(await response.json());
      })
      .catch((failure) => { if (!controller.signal.aborted) setError(failure.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [saved, offset]);

  async function update() {
    setBusy(true);
    setError('');
    try {
      if (saved) {
        setRerun(await replayRequest('/' + selection.id + '/rerun'));
      } else {
        await replayRequest('/' + selection.id + '/regression');
        const updated = { ...selection, saved: true };
        setEntries((items) => items.map((entry) => entry.id === updated.id ? updated : entry));
        setSelection(updated);
      }
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  return <div className="content collection">
    <header><h1>{title}</h1><p>{saved ? 'Rerun saved checkout fixtures against both sandbox releases.' : 'Review checkout comparisons stored for your account.'}</p></header>
    {error && <p className="account-error" role="alert">{error}</p>}
    {loading ? <p role="status">Loading…</p> : entries.length ? <div className="collection-list">
      {entries.map((entry) => <button key={entry.id} aria-pressed={selection?.id === entry.id} disabled={busy} onClick={() => { setSelection(entry); setRerun(null); }}>
        <span><strong>{entry.orderId}</strong><time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString()}</time></span>
        <span className={'badge ' + (entry.comparison.fixVerified ? 'green' : 'neutral')}>{entry.comparison.fixVerified ? 'Fix verified' : 'Completed'}</span>
      </button>)}
    </div> : !error && <div className="collection-empty"><p>{offset ? 'No more records.' : saved ? 'Save a checkout run to create a regression case.' : 'Run a checkout comparison to create your first record.'}</p><button className="secondary" onClick={openLab}>Open Replay Lab</button></div>}
    {(offset > 0 || entries.length === pageSize) && <div className="scenario-actions save">
      <button className="secondary" disabled={loading || busy || offset === 0} onClick={() => { setSelection(null); setRerun(null); setOffset(offset - pageSize); }}>Previous page</button>
      <button className="secondary" disabled={loading || busy || entries.length < pageSize} onClick={() => { setSelection(null); setRerun(null); setOffset(offset + pageSize); }}>Next page</button>
    </div>}
    {selection && <div className="save">
      <ExecutionTrace result={(rerun || selection).comparison} />
      <button className="secondary" disabled={busy || (!saved && selection.saved)} onClick={update}>
        {busy ? 'Working…' : saved ? 'Rerun case' : selection.saved ? 'Regression case saved' : 'Save as regression case'}
      </button>
    </div>}
  </div>;
}
