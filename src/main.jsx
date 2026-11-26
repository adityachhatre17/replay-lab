import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity, ArrowLeft, Box, Check, ChevronDown, CircleHelp, Clock3, Code2,
  FlaskConical, GitCompare, Layers3, ListFilter, Play, Search, ShieldCheck,
  Sparkles, Terminal, UserRound, Users, X,
} from 'lucide-react';
import Teams from './Teams';
import ProfileSettings from './ProfileSettings';
import ThemeToggle from './ThemeToggle';
import AccountEntry from './AccountEntry';
import ReplayLibrary from './ReplayLibrary';
import CheckoutReplay from './CheckoutReplay';
import ScenarioPreview from './ScenarioPreview';
import { incidents } from './incidents';
import './style.css';

const tabs = ['Overview', 'Logs', 'Request fixture'];
const navigation = [
  { label: 'Incidents', icon: Activity },
  { label: 'Replay Lab', icon: Play },
  { label: 'Replay history', icon: GitCompare },
  { label: 'Regression cases', icon: ShieldCheck },
];

function Badge({ children, tone = 'neutral' }) {
  return <span className={'badge ' + tone}>{children}</span>;
}

function LogPanel({ incident }) {
  return <div className="log-panel">
    <div className="log-heading"><Terminal size={15} /> Application logs <span>UTC</span></div>
    <div className="log-line"><time>{incident.time}.204</time><b className="error-text">ERROR</b><code>{incident.exception}</code></div>
    <div className="log-line"><time>{incident.time}.204</time><b className="muted">DETAIL</b><code>{incident.error}</code></div>
    <div className="log-line"><time>{incident.time}.204</time><b className="muted">SOURCE</b><code>{incident.source}</code></div>
  </div>;
}

function RunCard({ kind, incident, passed, captured, complete }) {
  const release = passed ? incident.patch : incident.version;
  return <article className={'run-card ' + (passed ? 'patched' : '')}>
    <div className="run-label"><span>{kind}</span><Badge tone={passed ? 'green' : 'red'}>{passed ? 'Passed' : captured ? 'Failed' : 'Reproduced'}</Badge></div>
    <strong className="http">{passed ? '200 OK' : '500 Internal Server Error'}</strong>
    <p>{passed ? incident.assertion : incident.exception}</p>
    <div className="run-footer"><Box size={14} /><code>{release}</code><span>{captured ? 'Captured' : complete}</span></div>
  </article>;
}

function App({ account, onProfileUpdate, signOut, signoutError, dark, toggleTheme }) {
  const [selected, setSelected] = useState(incidents[0].id);
  const [view, setView] = useState('Incidents');
  const [simulation, setSimulation] = useState(false);
  const [tab, setTab] = useState('Overview');
  const [query, setQuery] = useState('');
  const [priority, setPriority] = useState('All');
  const [pending, setPending] = useState(null);
  const [runs, setRuns] = useState({});
  const [help, setHelp] = useState(false);
  const [listOpen, setListOpen] = useState(true);
  const [notice, setNotice] = useState('');
  const incident = incidents.find((item) => item.id === selected);
  const run = runs[selected];
  const filtered = incidents.filter((item) =>
    (priority === 'All' || item.priority === priority) &&
    [item.title, item.service, item.id].some((value) => value.toLowerCase().includes(query.trim().toLowerCase()))
  );

  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => {
      const completed = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date());
      setRuns((previous) => ({ ...previous, [pending]: completed }));
      setPending(null);
      setNotice('Replay complete. The original failure reproduced and the patched release passed.');
    }, 950);
    return () => window.clearTimeout(timer);
  }, [pending]);

  function openIncident(id) {
    setSelected(id);
    setView('Incidents');
    setTab('Overview');
    setListOpen(false);
    setNotice('');
  }

  function selectView(label) {
    setView(label);
    setNotice('');
    if (label === 'Incidents') setListOpen(true);
  }


  return <>
    <header className="topbar">
      <div>
        <span>Workspace</span><span className="slash">/</span><strong>{view}</strong>
        {view === 'Incidents' && <><span className="slash">/</span><code>{incident.id}</code></>}
      </div>
      <div className="topbar-actions">
        <Badge tone="purple"><FlaskConical size={13} /> Demo mode</Badge>
        <ThemeToggle dark={dark} onToggle={toggleTheme} />
        <button type="button" className="secondary" aria-current={view === 'My profile' ? 'page' : undefined}
          onClick={() => selectView('My profile')}><UserRound size={16} /> My profile</button>
      </div>
    </header>
    <div className="shell">
      <aside className="sidebar" aria-label="Main navigation">
        <div className="brand"><span className="brand-icon"><Activity size={23} strokeWidth={2.5} /></span><div>Incident<span>Replay</span><small>Developer workspace</small></div></div>
        <p className="nav-label">Workspace</p>
        <nav>{(account.type === 'organization' ? [...navigation, { label: 'Teams', icon: Users }] : navigation).map(({ label, icon: Icon }) => <button key={label} className={view === label ? 'nav-item active' : 'nav-item'} aria-current={view === label ? 'page' : undefined} onClick={() => selectView(label)}><Icon size={18} />{label}</button>)}</nav>
        <button className="nav-item sign-out" onClick={signOut}>Sign out</button>
        {signoutError && <p className="account-error" role="alert">{signoutError}</p>}
        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => setHelp((value) => !value)} aria-expanded={help}><CircleHelp size={18} />About this demo</button>
          {help && <p className="help">Explore synthetic incidents, then open Replay Lab to run a checkout comparison and save a regression case.</p>}
          <div className="workspace"><span className="workspace-icon"><FlaskConical size={18} /></span><div><strong>{account.organization || 'Individual workspace'}</strong><small>{account.name}</small></div></div>
        </div>
      </aside>
      {view === 'Incidents' && <aside className={'inbox ' + (listOpen ? 'list-open' : '')} aria-label="Incident inbox">
        <div className="inbox-header"><div className="section-heading"><h2>Incidents</h2><span className="count">{filtered.length}</span></div>
          <div className="filters"><label className="search"><Search size={17} /><input type="search" placeholder="Search incidents…" aria-label="Search incidents" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
            <label className="filter"><ListFilter size={17} /><select aria-label="Filter incidents by priority" value={priority} onChange={(event) => setPriority(event.target.value)}><option value="All">All</option><option>P1</option><option>P2</option></select><ChevronDown size={12} /></label></div>
        </div>
        <div className="incident-list">{filtered.map((item) => <button key={item.id} className={item.id === selected ? 'incident active' : 'incident'} aria-pressed={item.id === selected} onClick={() => openIncident(item.id)}>
          <span className="incident-top"><Badge tone={item.priority === 'P1' ? 'red' : 'amber'}>{item.priority}</Badge><code>{item.id}</code><time>{item.time.slice(0, 5)} UTC</time></span>
          <strong>{item.title}</strong><span className="incident-service"><Layers3 size={14} />{item.service}</span>
        </button>)}
        {filtered.length === 0 && <p className="empty">No incidents match your filters.</p>}</div>
      </aside>}
      <main className={'main ' + (view === 'Incidents' && listOpen ? 'show-inbox' : '')}>
        {view === 'Replay Lab' ? <><div className="content lab-mode"><button className="secondary" onClick={() => setSimulation(!simulation)}>
          {simulation ? 'Open checkout sandbox' : 'Open diagram simulator'}
        </button></div>{simulation ? <ScenarioPreview incident={incident} /> : <CheckoutReplay />}</> : view === 'Incidents' ? <div className="content">
          <button className="back secondary" onClick={() => setListOpen(true)}><ArrowLeft size={16} /> Incident inbox</button>
          <header className="incident-header">
            <div className="incident-heading"><div className="eyebrow"><Badge tone={incident.priority === 'P1' ? 'red' : 'amber'}>{incident.priority} incident</Badge><code>{incident.id}</code></div><h1>{incident.title}</h1><p>{incident.description}</p></div>
            <button className="primary" disabled={Boolean(pending)} onClick={() => { setPending(selected); setNotice(''); setTab('Overview'); }}><Play size={17} fill="currentColor" />{pending === selected ? 'Replaying…' : run ? 'Replay again' : 'Run replay'}</button>
          </header>
          <div className="metadata"><span><Layers3 size={16} />{incident.service}</span><span><Code2 size={17} /><code>{incident.endpoint}</code></span><span><Clock3 size={16} />{incident.time} UTC</span></div>
          <div className="tabs" aria-label="Incident details">{tabs.map((label) => <button key={label} className={tab === label ? 'current' : ''} aria-pressed={tab === label} onClick={() => setTab(label)}>{label}</button>)}</div>
          {notice && <div className="notice" role="status"><Check size={17} />{notice}<button aria-label="Dismiss message" onClick={() => setNotice('')}><X size={16} /></button></div>}
          {tab === 'Overview' && <>
            <section className="comparison"><div className="section-heading"><span className="section-icon"><GitCompare size={19} /></span><div><h2>Replay comparison</h2><p>Compare the captured failure with both sandbox releases.</p></div></div>
            <div className="run-grid"><RunCard kind="Production capture" incident={incident} captured />
              {run ? <><RunCard kind="Original release" incident={incident} complete={run} /><RunCard kind="Patched release" incident={incident} passed complete={run} /></> :
                ['Original release', 'Patched release'].map((label, index) => <article className="run-card waiting" key={label}><div className="run-label"><span>{label}</span></div><strong className="http">{pending === selected ? 'Running…' : 'Awaiting replay'}</strong><p>{pending === selected ? 'Simulating sandbox execution' : 'Results appear after a replay.'}</p><div className="run-footer"><Box size={14} /><code>{index ? incident.patch : incident.version}</code></div></article>)}
            </div>
            {run && <button className="secondary save" onClick={() => { setSimulation(false); selectView('Replay Lab'); }}><ShieldCheck size={16} /> Open checkout sandbox</button>}
            </section>
            <section className="analysis"><div className="section-heading"><span className="section-icon purple-icon"><Sparkles size={19} /></span><div><h2>Incident analysis</h2><p>Sample AI brief</p></div></div><div className="analysis-body"><div><h3>Likely cause</h3><p>{incident.diagnosis}</p></div><div><h3>Suggested fix</h3><p>{incident.fix}</p></div></div><button className="evidence" onClick={() => setTab('Logs')}><Terminal size={15} />{incident.source}</button></section>
          </>}
          {tab === 'Logs' && <LogPanel incident={incident} />}
          {tab === 'Request fixture' && <section className="log-panel"><div className="log-heading"><Code2 size={16} /> Synthetic request fixture <span>{incident.endpoint}</span></div><pre>{JSON.stringify(incident.fixture, null, 2)}</pre></section>}
        </div> : view === 'Teams' ? <Teams /> : view === 'My profile' ?
          <ProfileSettings account={account} onProfileUpdate={onProfileUpdate} dark={dark} toggleTheme={toggleTheme} /> :
          <ReplayLibrary key={view} saved={view === 'Regression cases'} openLab={() => { setSimulation(false); selectView('Replay Lab'); }} />}
      </main>
    </div>
  </>;
}

createRoot(document.getElementById('root')).render(<AccountEntry Workspace={App} />);
