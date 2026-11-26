import React, { useEffect, useState } from 'react';
import {
  ArrowDown, ArrowRight, ArrowUp, ChevronDown, CheckCircle2, CircleAlert, Database, Globe,
  Layers3, Play, Plus, RotateCcw, Server, SkipForward, Terminal, Trash2,
} from 'lucide-react';

const components = {
  client: { name: 'Web client', detail: 'Sends the request', icon: Globe },
  gateway: { name: 'API gateway', detail: 'Routes the request', icon: Layers3 },
  database: { name: 'PostgreSQL', detail: 'Loads the fixture', icon: Database },
  service: { name: 'Spring Boot service', detail: 'Processes the fixture', icon: Server },
  downstream: { name: 'Downstream stub', detail: 'Handles the external call', icon: Server },
};

const initialFlow = [
  { id: 'client', type: 'client' },
  { id: 'gateway', type: 'gateway' },
  { id: 'database', type: 'database' },
  { id: 'service', type: 'service' },
  { id: 'downstream', type: 'downstream' },
];

const statusLabel = {
  ready: 'Ready', passed: 'Passed', failed: 'Failed', skipped: 'Not reached', running: 'Running', waiting: 'Waiting',
};

function Dropdown({ label, value, options, onChange }) {
  return <details className="scenario-dropdown"
    onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
    }}
    onKeyDown={(event) => {
      if (event.key !== 'Escape') return;
      event.currentTarget.open = false;
      event.currentTarget.querySelector('summary').focus();
    }}>
    <summary aria-label={label}><span className="dropdown-label">{label}</span><span className="dropdown-value">{options.find(([key]) => key === value)?.[1]}<ChevronDown size={14} /></span></summary>
    <div className="dropdown-options">
      {options.map(([key, title]) => <button type="button" key={key} aria-pressed={key === value} onClick={(event) => {
        const dropdown = event.currentTarget.closest('details');
        dropdown.querySelector('summary').focus();
        dropdown.open = false;
        onChange(key);
      }}>{title}</button>)}
    </div>
  </details>;
}

export default function ScenarioPreview({ incident }) {
  const [flow, setFlow] = useState(initialFlow);
  const [component, setComponent] = useState('service');
  const [failure, setFailure] = useState('service');
  const [selected, setSelected] = useState('service');
  const [results, setResults] = useState([]);
  const [playing, setPlaying] = useState(false);
  const [dataset, setDataset] = useState(null);
  const [datasetError, setDatasetError] = useState('');
  const [range, setRange] = useState(false);
  const [start, setStart] = useState('1');
  const [end, setEnd] = useState('');
  const [field, setField] = useState('');
  const total = dataset?.rows.length ?? 0;
  const first = range ? Number(start) : 1;
  const last = range ? Number(end) : total;
  const hasService = flow.some((node) => node.type === 'service');
  const canRun = flow.length > 0 && (!dataset || (
    Number.isInteger(first) && Number.isInteger(last) && first >= 1 &&
    last >= first && last <= total && field.trim() && hasService
  ));

  function execute(node) {
    if (node.id === failure) return { id: node.id, status: 'failed' };
    if (!dataset || node.type !== 'service') return { id: node.id, status: 'passed' };

    const requiredField = field.trim();
    let invalidCount = 0;
    let firstInvalid;
    for (let index = first - 1; index < last; index += 1) {
      const row = dataset.rows[index];
      const value = row[requiredField];
      if (!Object.hasOwn(row, requiredField) || value == null || value === '') {
        invalidCount += 1;
        firstInvalid ??= index + 1;
      }
    }
    const checked = last - first + 1;
    const message = invalidCount
      ? `${invalidCount} of ${checked} rows are missing "${requiredField}". First failure at dataset row ${firstInvalid}.`
      : `All ${checked} rows have "${requiredField}".`;
    return { id: node.id, status: invalidCount ? 'failed' : 'passed', message };
  }

  async function loadDataset(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    try {
      const rows = JSON.parse(await file.text());
      if (!Array.isArray(rows) || !rows.length || !rows.every((row) =>
        row && typeof row === 'object' && !Array.isArray(row)
      )) throw new Error();
      reset();
      setDataset({ name: file.name, rows });
      setDatasetError('');
      setFailure('');
      setRange(false);
      setStart('1');
      setEnd(String(rows.length));
      setField(Object.hasOwn(incident.fixture, 'currency') ? 'currency' : Object.keys(incident.fixture)[0]);
    } catch {
      setDatasetError('Choose a JSON file containing a non-empty array of record objects.');
    }
  }
  const failed = results.some((result) => result.status === 'failed');
  const done = failed || (flow.length > 0 && results.length === flow.length);
  const focused = flow.find((node) => node.id === selected);
  const focusedResult = results.find((result) => result.id === selected);
  const failedNode = flow.find((node) => node.id === results.at(-1)?.id);

  useEffect(() => {
    if (!playing || done) return;
    const timer = window.setTimeout(() => {
      const node = flow[results.length];
      setResults([...results, execute(node)]);
      setSelected(node.id);
    }, 550);
    return () => window.clearTimeout(timer);
  }, [playing, done, flow, results, failure, dataset, first, last, field]);

  function reset() {
    setResults([]);
    setPlaying(false);
  }

  function move(index, direction) {
    const next = [...flow];
    const target = index + direction;
    [next[index], next[target]] = [next[target], next[index]];
    reset();
    setFlow(next);
  }

  function step() {
    setPlaying(false);
    const previous = done ? [] : results;
    const node = flow[previous.length];
    setResults([...previous, execute(node)]);
    setSelected(node.id);
  }

  function statusAt(node, index) {
    if (results[index]) return results[index].status;
    if (failed) return 'skipped';
    if (playing && index === results.length) return 'running';
    return results.length || playing ? 'waiting' : 'ready';
  }

  function logFor(result) {
    if (result.message) return result.message;
    const node = flow.find((entry) => entry.id === result.id);
    if (result.status === 'passed') return components[node.type].detail + ' · completed';
    if (node.type === 'service') return incident.exception + ' · ' + incident.error;
    return components[node.type].name + ' · simulated component failure';
  }

  return <div className="content scenario">
    <header className="scenario-header">
      <div><h1>Replay Lab</h1><p>Build a request flow and watch where it succeeds or stops.</p></div>
      <span className="badge purple">Simulation</span>
    </header>
    <section className="comparison scenario-controls" aria-label="Scenario controls">
      <div className="scenario-fields">
        <Dropdown label="Component to add" value={component} onChange={setComponent}
          options={Object.entries(components).map(([type, item]) => [type, item.name])} />
        <button className="secondary" onClick={() => {
          const node = { id: crypto.randomUUID(), type: component };
          reset();
          setFlow([...flow, node]);
          setSelected(node.id);
        }}><Plus size={16} /> Add component</button>
        <Dropdown label="Simulated failure" value={failure}
          onChange={(value) => { reset(); setFailure(value); }}
          options={[
            ['', 'None'],
            ...flow.map((node, index) => [node.id, (index + 1) + '. ' + components[node.type].name]),
          ]} />
      </div>
      <div className="scenario-actions">
        <button className="primary" disabled={!canRun} onClick={() => {
          if (done) setResults([]);
          setPlaying(!playing || done);
        }}><Play size={16} />{playing && !done ? 'Pause preview' : 'Play preview'}</button>
        <button className="secondary" disabled={!canRun || (playing && !done)} onClick={step}><SkipForward size={16} /> Step</button>
        <button className="secondary" onClick={reset} disabled={!results.length && !playing}><RotateCcw size={16} /> Reset run</button>
      </div>
    </section>
    <section className="comparison dataset-panel" aria-label="Test dataset">
      <h2>Test dataset</h2>
      <p>Load a JSON file of records to check a required field at the Spring Boot step. Files stay in this browser tab.</p>
      <label className="dataset-file">JSON dataset<input type="file" accept=".json,application/json" onChange={loadDataset} /></label>
      {datasetError && <p role="alert">{datasetError}{dataset && ' The previous dataset is still loaded.'}</p>}
      {dataset && <>
        <div className="dataset-info"><strong>{dataset.name}</strong><span>{total} rows</span>
          <button className="secondary" onClick={() => {
            reset();
            setDataset(null);
            setDatasetError('');
          }}>Remove dataset</button>
        </div>
        <fieldset className="scenario-fields dataset-scope">
          <legend>Rows to test</legend>
          <label><input type="radio" name="dataset-scope" checked={!range} onChange={() => { reset(); setRange(false); }} /> Entire dataset</label>
          <label><input type="radio" name="dataset-scope" checked={range} onChange={() => { reset(); setRange(true); }} /> Row range</label>
        </fieldset>
        <div className="scenario-fields dataset-inputs">
          {range && <>
            <label>First row<input type="number" min="1" max={total} value={start} onChange={(event) => { reset(); setStart(event.target.value); }} /></label>
            <label>Last row<input type="number" min="1" max={total} value={end} onChange={(event) => { reset(); setEnd(event.target.value); }} /></label>
          </>}
          <label>Required field<input value={field} onChange={(event) => { reset(); setField(event.target.value); }} /></label>
        </div>
        {!canRun && <p role="status">Add a Spring Boot service, enter a required field, and select a valid row range to run the dataset.</p>}
      </>}
    </section>
    <section className="comparison scenario-diagram">
      <div className="scenario-title"><div><h2>Request flow</h2><p><code>{incident.endpoint}</code> · {incident.id}</p></div>
        <span className={'badge ' + (failed ? 'red' : done ? 'green' : 'purple')} role="status">
          {failed ? 'Stopped at ' + components[failedNode.type].name : done ? 'Request completed' : playing ? 'Running' : results.length ? 'Paused' : 'Ready'}
        </span>
      </div>
      {flow.length ? <ol className="scenario-flow" aria-label="Components in execution order">
        {flow.map((node, index) => {
          const item = components[node.type];
          const Icon = item.icon;
          const status = statusAt(node, index);
          return <li key={node.id} className="scenario-flow-item">
            {index > 0 && <ArrowRight className="flow-connector" aria-hidden="true" size={18} />}
            <div className={'scenario-node ' + status + (selected === node.id ? ' selected' : '')}>
              <button className="node-select" aria-pressed={selected === node.id} onClick={() => setSelected(node.id)}>
                <Icon size={20} /><strong>{item.name}</strong><span>{statusLabel[status]}</span>
              </button>
              <div className="node-actions">
                <button aria-label={'Move ' + item.name + ' earlier'} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={15} /></button>
                <button aria-label={'Move ' + item.name + ' later'} disabled={index === flow.length - 1} onClick={() => move(index, 1)}><ArrowDown size={15} /></button>
                <button aria-label={'Remove ' + item.name} onClick={() => {
                  const next = flow.filter((entry) => entry.id !== node.id);
                  reset();
                  setFlow(next);
                  if (failure === node.id) setFailure('');
                  if (selected === node.id) setSelected(next[index]?.id ?? next.at(-1)?.id);
                }}><Trash2 size={15} /></button>
              </div>
            </div>
          </li>;
        })}
      </ol> : <p className="empty">Add a component to start building a flow.</p>}
      {focused && <div className="scenario-inspector"><strong>{components[focused.type].name}</strong>
        <p>{focusedResult ? logFor(focusedResult) : failed ? 'The request stopped before it could execute this component.' : components[focused.type].detail + (focused.id === failure ? ' · configured to fail' : '')}</p>
        {focusedResult?.status === 'failed' && focused.type === 'service' && !focusedResult.message && <code>{incident.source}</code>}
      </div>}
    </section>
    <section className="log-panel" aria-label="Simulation log">
      <div className="log-heading"><Terminal size={16} /> Simulation log</div>
      {results.length ? <ol className="scenario-log">{results.map((result) => <li key={result.id}>
        {result.status === 'failed' ? <CircleAlert size={16} className="error-text" /> : <CheckCircle2 size={16} />}
        <span>{components[flow.find((node) => node.id === result.id).type].name}</span>
        <code>{logFor(result)}</code>
      </li>)}</ol> : <p>Play the preview or step through the flow to see each result.</p>}
    </section>
  </div>;
}
