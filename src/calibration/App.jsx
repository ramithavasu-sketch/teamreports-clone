import { useEffect, useState } from 'react';
import { store, resetDemo } from './store.js';
import { ACTIVE, REVIEWERS, FACILITATORS, SECTIONS } from './model.js';
import { Icon, StatusBadge, ActionBadge, PageHead, Card, Stat, ErrorNote, Empty, Confirm, fmtDate, fmtTime } from './ui.jsx';
import { SessionPage } from './SessionPage.jsx';

/* ---------- hash router: #/calibration/ses-1/evaluate ---------- */

const parse = () => (window.location.hash.replace(/^#\/?/, '') || '').split('/').filter(Boolean);
const go = (path) => { window.location.hash = `#/${path}`; window.scrollTo(0, 0); };

function useRoute() {
  const [parts, setParts] = useState(parse);
  useEffect(() => {
    const on = () => setParts(parse());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return parts;
}

const TEAM_REPORTS_URL = `${import.meta.env.BASE_URL}`;
const EMBEDDED = new URLSearchParams(window.location.search).has('embed');

const NAV = [
  ['', 'Dashboard', 'dashboard'],
  ['calibration', 'QA Calibration', 'calibration'],
  ['reports', 'Reports', 'reports'],
  ['guidelines', 'Guidelines', 'guidelines'],
];

/* ---------- shared session table ---------- */

function SessionTable({ sessions }) {
  if (!sessions.length) return <Empty title="No sessions here yet">Create a calibration session to get started.</Empty>;
  return (
    <div className="cx-table-wrap">
      <table className="cx-table">
        <thead><tr><th>Session name</th><th>Connection ID</th><th>Date &amp; time</th><th>Facilitator</th><th>Reviewers</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>
          {sessions.map((s) => (
            <tr key={s.id}>
              <td className="strong">{s.name || 'Untitled draft'}</td>
              <td className="mono">{s.connectionId || '—'}</td>
              <td>{fmtDate(s.date)}<small>{fmtTime(s.time)}</small></td>
              <td>{s.facilitator || '—'}</td>
              <td>{s.reviewers.join(', ') || '—'}<small>{s.submitted}/{s.required} submitted</small></td>
              <td><StatusBadge status={s.status} /></td>
              <td><a className="cx-link" href={s.status === 'draft' ? `#/calibration/${s.id}/edit` : `#/calibration/${s.id}`}>{s.status === 'draft' ? 'Continue draft' : 'View session'}</a></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- dashboard ---------- */

const STEPS = [
  ['Create session', 'Pick the Connection ID and assign the reviewers.'],
  ['Blind review & lock', 'Each reviewer evaluates on their own, then submits and locks.'],
  ['Reveal & compare', 'The facilitator reveals once every reviewer has submitted.'],
  ['Discuss & agree', 'Record the agreed interpretation separately from the originals.'],
  ['Summarise & follow up', 'Assign actions and mark the session completed.'],
];

function Dashboard() {
  const sessions = store.list().filter((s) => s.status !== 'draft');
  const upcoming = sessions.filter((s) => ACTIVE.includes(s.status));
  const actions = store.allActions().filter((a) => a.status !== 'completed');
  const attention = sessions.filter((s) => ['ready_to_reveal', 'in_discussion'].includes(s.status));
  const drafts = store.list().filter((s) => s.status === 'draft');
  return (
    <>
      <PageHead eyebrow="Overview" title="Calibration dashboard" sub="Track CX QA calibration sessions, reviewer progress and follow-up actions in one place.">
        <a className="cx-btn" href="#/calibration/new"><Icon name="plus" /> Create Calibration Session</a>
      </PageHead>
      <div className="cx-stats">
        <Stat label="Total sessions" value={sessions.length} sub="All calibration sessions" icon="list" />
        <Stat label="Upcoming sessions" value={upcoming.length} sub="Scheduled or in progress" icon="calendar" />
        <Stat label="Completed sessions" value={sessions.filter((s) => s.status === 'completed').length} sub="Marked completed by facilitator" icon="done" tone="green" />
        <Stat label="Open follow-up actions" value={actions.length} icon="clipboard" tone="amber"
          sub={`${actions.filter((a) => a.status === 'open').length} open · ${actions.filter((a) => a.status === 'in_progress').length} in progress`} />
      </div>
      <Card title="Upcoming sessions" sub="Sessions that are scheduled, in review or awaiting discussion." right={<a className="cx-link" href="#/calibration">View all</a>}>
        <SessionTable sessions={upcoming} />
      </Card>
      <div className="cx-grid-2">
        <Card title="Needs facilitator attention">
          {attention.length || drafts.length ? (
            <ul className="cx-attention">
              {[...attention, ...drafts].map((s) => (
                <li key={s.id}>
                  <div><b>{s.name || 'Untitled draft'}</b><small className="mono">{s.connectionId || 'No Connection ID yet'}{s.date && ` · ${fmtDate(s.date)} ${fmtTime(s.time)}`}</small></div>
                  <div className="cx-row"><StatusBadge status={s.status} /><a className="cx-btn small ghost" href={s.status === 'draft' ? `#/calibration/${s.id}/edit` : `#/calibration/${s.id}/reveal`}>Open</a></div>
                </li>
              ))}
            </ul>
          ) : <p className="cx-muted">Nothing needs your attention right now.</p>}
        </Card>
        <Card title="How calibration works">
          <ol className="cx-steps-list">{STEPS.map(([t, d], i) => <li key={t}><span>{i + 1}</span><div><b>{t}</b><p className="cx-muted">{d}</p></div></li>)}</ol>
        </Card>
      </div>
    </>
  );
}

/* ---------- sessions list ---------- */

function Sessions() {
  const [filter, setFilter] = useState('all');
  const all = store.list();
  const rows = all.filter((s) => filter === 'all' || (filter === 'active' ? s.status !== 'completed' : s.status === 'completed'));
  return (
    <>
      <PageHead eyebrow="QA Calibration" title="Calibration sessions" sub="Open a session to run the reviewer blind evaluation, facilitator reveal, discussion and summary.">
        <a className="cx-btn" href="#/calibration/new"><Icon name="plus" /> Create Calibration Session</a>
      </PageHead>
      <Card title={`${rows.length} session${rows.length === 1 ? '' : 's'}`} right={
        <div className="cx-seg">{[['all', 'All'], ['active', 'Active'], ['completed', 'Completed']].map(([k, l]) => <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}</button>)}</div>
      }>
        <SessionTable sessions={rows} />
      </Card>
    </>
  );
}

/* ---------- create / edit draft ---------- */

const RULES = [
  ['Blind evaluation', 'Enabled'],
  ['Lock original responses after submission', 'Enabled'],
  ['Reveal evaluations', 'Only after all required reviewers submit'],
  ['Evaluation sections', 'Soft Skills and Technical Skills'],
];

function CreateSession({ editId, refresh }) {
  const existing = editId ? store.list().find((s) => s.id === editId) : null;
  const [f, setF] = useState(existing || { name: '', connectionId: '', date: '', time: '', facilitator: 'Self', reviewers: ['A', 'B', 'C'] });
  const [error, setError] = useState(null);
  if (editId && (!existing || existing.status !== 'draft')) return <Empty title="This draft can no longer be edited">It may have been published already. <a className="cx-link" href="#/calibration">Back to sessions</a></Empty>;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = (publish) => {
    setError(null);
    try {
      const id = store.saveSession(f, editId, { publish });
      refresh();
      go(publish ? `calibration/${id}` : 'calibration');
    } catch (e) { setError(e); }
  };
  return (
    <>
      <a className="cx-back" href="#/calibration"><Icon name="back" size={14} /> All calibration sessions</a>
      <PageHead title={editId ? 'Continue draft session' : 'Create calibration session'} sub="Set up a blind calibration for one customer call. Reviewers evaluate independently before anything is revealed." />
      <div className="cx-grid-side">
        <div>
          <Card title="Session details">
            <div className="cx-form">
              <label className="wide"><span>Session name<span className="req">*</span></span><input value={f.name} onChange={set('name')} placeholder="e.g. CX QA Calibration – Billing Dispute" /></label>
              <label className="wide"><span>Connection ID<span className="req">*</span></span><input className="mono" value={f.connectionId} onChange={set('connectionId')} placeholder="e.g. CONN-48213-0914" />
                <small>The unique ID of the customer call all reviewers will evaluate.</small></label>
              <label><span>Date<span className="req">*</span></span><input type="date" value={f.date} onChange={set('date')} /></label>
              <label><span>Time<span className="req">*</span></span><input type="time" value={f.time} onChange={set('time')} /></label>
              <label className="wide"><span>Facilitator<span className="req">*</span></span>
                <select value={f.facilitator} onChange={set('facilitator')}>{FACILITATORS.map((x) => <option key={x}>{x}</option>)}</select></label>
              <fieldset className="wide"><legend><span>Reviewers<span className="req">*</span></span></legend>
                <div className="cx-checks">{REVIEWERS.map((r) => (
                  <label key={r} className={`cx-check ${f.reviewers.includes(r) ? 'on' : ''}`}>
                    <input type="checkbox" checked={f.reviewers.includes(r)} onChange={(e) => setF({ ...f, reviewers: e.target.checked ? [...f.reviewers, r].sort() : f.reviewers.filter((x) => x !== r) })} /> Reviewer {r}
                  </label>
                ))}</div>
              </fieldset>
            </div>
          </Card>
          <Card title="Calibration rules" sub="These rules protect independent judgement and are fixed for every session.">
            <dl className="cx-dl">{RULES.map(([k, v]) => <div key={k}><dt>{k}</dt><dd><span className="cx-pill">{v}</span></dd></div>)}</dl>
          </Card>
          <ErrorNote error={error} />
          <div className="cx-actions-row">
            <button className="cx-btn ghost" onClick={() => save(false)}>Save Draft</button>
            <button className="cx-btn" onClick={() => save(true)}>Create Session</button>
          </div>
        </div>
        <Card title="What happens next">
          <ol className="cx-steps-list">
            {['Each selected reviewer opens the evaluation form and reviews the call independently.',
              'Reviewers submit and lock their original verdicts — they can’t be edited afterwards.',
              'The facilitator can reveal evaluations only once every required reviewer has submitted.',
              'Discussion outcomes are captured separately, so original verdicts are always preserved.'].map((t, i) => <li key={t}><span>{i + 1}</span><p>{t}</p></li>)}
          </ol>
          <p className="cx-muted small">Prototype: sessions are stored in your browser only.</p>
        </Card>
      </div>
    </>
  );
}

/* ---------- reports ---------- */

function Bar({ pct }) {
  return <span className="cx-bar"><span style={{ width: `${pct || 0}%` }} /></span>;
}

function Reports() {
  const r = store.report();
  return (
    <>
      <PageHead eyebrow="Reports" title="Calibration reports" sub="Agreement is calculated from original submitted verdicts, before discussion. Missing submissions are never treated as agreement." />
      <div className="cx-stats">
        <Stat label="Sessions completed" value={r.completed} sub={`of ${r.total} total sessions`} icon="done" tone="green" />
        <Stat label="Submission completion" value={r.submission.pct === null ? '—' : `${r.submission.pct}%`} icon="list"
          sub={`${r.submission.submitted} of ${r.submission.required} required submissions · ${r.submission.sessions} active/completed sessions`} />
        <Stat label="Initial verdict agreement" value={r.agreement.pct === null ? '—' : `${r.agreement.pct}%`} icon="check"
          sub={`${r.agreement.unanimous} of ${r.agreement.total} section verdicts unanimous${r.agreement.excluded ? ` · ${r.agreement.excluded} session(s) excluded for missing submissions` : ''}`} />
        <Stat label="Open follow-up actions" value={r.openActions.length} icon="clipboard" tone="amber"
          sub={`${r.openActions.filter((a) => a.status === 'open').length} open · ${r.openActions.filter((a) => a.status === 'in_progress').length} in progress`} />
      </div>
      <div className="cx-grid-2">
        <Card title="Agreement breakdown" sub="Overall verdict agreement and parameter-level agreement are measured separately.">
          <div className="cx-eyebrow">Overall verdict agreement</div>
          {r.sections.map((s) => <div key={s.id} className="cx-meter"><span>{s.name}</span><Bar pct={s.pct} /><b>{s.pct ?? '—'}{s.pct !== null && '%'} <small>({s.agreed}/{s.total})</small></b></div>)}
          <div className="cx-eyebrow" style={{ marginTop: 18 }}>Parameter-level agreement</div>
          <div className="cx-meter"><span>Parameters observed by 2+ reviewers</span><Bar pct={r.params.pct} /><b>{r.params.pct ?? '—'}{r.params.pct !== null && '%'} <small>({r.params.agreed}/{r.params.compared})</small></b></div>
          <p className="cx-muted small">A section counts as agreed only when every required reviewer submitted the same verdict. Parameter agreement compares Met / Not Met findings where at least two reviewers observed the same parameter.</p>
        </Card>
        <Card title="Common disagreement areas" sub="Parameters where reviewers’ original findings differed.">
          {r.disagreements.length ? (
            <table className="cx-table compact">
              <thead><tr><th>Parameter</th><th>Section</th><th>Compared</th><th>Disagreed</th><th>Frequency</th></tr></thead>
              <tbody>{r.disagreements.map((d) => <tr key={`${d.section}${d.parameter}`}><td className="strong">{d.parameter}</td><td>{d.section}</td><td>{d.compared}</td><td>{d.disagreed}</td><td><Bar pct={(d.disagreed / d.compared) * 100} /></td></tr>)}</tbody>
            </table>
          ) : <p className="cx-muted">No parameter disagreements yet.</p>}
        </Card>
      </div>
      <Card title="Recent calibration sessions" sub="Initial agreement per session, from original submissions.">
        {r.rows.length ? (
          <div className="cx-table-wrap">
            <table className="cx-table">
              <thead><tr><th>Session</th><th>Connection ID</th><th>Date</th><th>Status</th><th>Submissions</th><th>Soft Skills</th><th>Technical Skills</th><th>Parameters</th><th>Action</th></tr></thead>
              <tbody>{r.rows.map((s) => (
                <tr key={s.id}>
                  <td className="strong">{s.name}</td><td className="mono">{s.connectionId}</td><td>{fmtDate(s.date)}</td><td><StatusBadge status={s.status} /></td>
                  <td>{s.submitted}/{s.required}</td>
                  {SECTIONS.map((x) => <td key={x.id}><span className={`cx-agree ${s.sectionResult[x.id].toLowerCase()}`}>{s.sectionResult[x.id]}</span></td>)}
                  <td>{s.paramPct === null ? '—' : `${s.paramPct}%`}</td>
                  <td><a className="cx-link" href={`#/calibration/${s.id}`}>View</a></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <Empty title="No sessions with submissions yet" />}
      </Card>
      <Card title="Outstanding follow-up actions">
        {r.openActions.length ? (
          <table className="cx-table compact">
            <thead><tr><th>Action</th><th>Owner</th><th>Due</th><th>Status</th><th>Session</th></tr></thead>
            <tbody>{r.openActions.map((a) => <tr key={a.id}><td className="strong">{a.description}</td><td>{a.owner}</td><td>{fmtDate(a.dueDate)}</td><td><ActionBadge status={a.status} /></td><td><a className="cx-link mono" href={`#/calibration/${a.sessionId}/summary`}>{a.session.connectionId}</a></td></tr>)}</tbody>
          </table>
        ) : <p className="cx-muted">All follow-up actions are completed.</p>}
      </Card>
    </>
  );
}

/* ---------- guidelines ---------- */

const PARAM_GUIDE = {
  Tone: ['Warm, calm and confident, even under pressure.', 'Sighing, sarcasm, flat or rushed delivery.'],
  'Active Listening': ['Paraphrases the issue; no repeated questions.', 'Interrupts or asks the customer to repeat details.'],
  Empathy: ['Acknowledges the impact and follows it with an action.', 'Scripted empathy with no ownership or follow-through.'],
  Professionalism: ['Branded greeting, courteous language, clear close.', 'Casual language, missing greeting or close.'],
  Accountability: ['Owns the issue on behalf of the company.', 'Blames systems, other teams or the customer.'],
  'Call Control': ['Sets an agenda and steers back to resolution.', 'Call drifts without direction.'],
  'Query Resolution': ['Correct resolution path in a single contact.', 'Wrong or incomplete resolution.'],
  'Required Answer Phrase': ['Mandatory phrases used where applicable.', 'Required phrase missing or changed.'],
  Verification: ['All verification steps done before account access.', 'Steps skipped or done after disclosure.'],
  'Hold Procedure': ['Asks permission, gives a time frame, thanks on return.', 'Hold without permission or longer than stated.'],
  Documentation: ['Notes complete and accurate, with the right codes.', 'Key details or required codes missing.'],
  'Follow-up': ['Clear commitment on next steps and timings.', 'No follow-up committed when one is needed.'],
};

function Guidelines() {
  return (
    <>
      <PageHead eyebrow="Guidelines" title="QA calibration guidelines" sub="Sample reference rubric for this prototype. Replace with your team’s official QA guidelines." />
      <div className="cx-grid-2">
        <Card title="Overall verdicts">
          <dl className="cx-dl stacked">
            <div><dt><span className="cx-verdict good">Good Job</span></dt><dd>The section meets the expected standard. Minor, non-critical misses can still be noted as observations.</dd></div>
            <div><dt><span className="cx-verdict notyet">Not Yet</span></dt><dd>A critical expectation was missed, or several smaller misses together affected the customer outcome.</dd></div>
          </dl>
        </Card>
        <Card title="Calibration rules">
          <ol className="cx-steps-list">
            {['All reviewers evaluate the same Connection ID independently — blind evaluation is always on.',
              'Every observation needs a QA parameter, an evidence timestamp (00:42 or 01:15–01:30) and supporting evidence.',
              'Submitting locks the reviewer’s original verdicts and observations; they are never edited afterwards.',
              'The facilitator can reveal evaluations only after every required reviewer has submitted.',
              'Discussion outcomes and the final agreed interpretation are stored separately from original submissions.',
              'Agreement metrics use original verdicts only. Missing submissions never count as agreement.'].map((t, i) => <li key={t}><span>{i + 1}</span><p>{t}</p></li>)}
          </ol>
        </Card>
      </div>
      {SECTIONS.map((s) => (
        <Card key={s.id} title={`${s.name} parameters`}>
          <table className="cx-table compact">
            <thead><tr><th>Parameter</th><th>Met looks like</th><th>Not Met indicators</th></tr></thead>
            <tbody>{s.params.map((p) => <tr key={p}><td className="strong">{p}</td><td>{PARAM_GUIDE[p][0]}</td><td>{PARAM_GUIDE[p][1]}</td></tr>)}</tbody>
          </table>
        </Card>
      ))}
    </>
  );
}

/* ---------- layout ---------- */

export default function CalibrationApp() {
  const parts = useRoute();
  const [, setVersion] = useState(0);
  const [dialog, setDialog] = useState(null);
  const refresh = () => setVersion((v) => v + 1);
  const [top, id, sub, extra] = parts;

  let page;
  if (!top) page = <Dashboard />;
  else if (top === 'calibration' && !id) page = <Sessions />;
  else if (top === 'calibration' && id === 'new') page = <CreateSession refresh={refresh} />;
  else if (top === 'calibration' && sub === 'edit') page = <CreateSession key={id} editId={id} refresh={refresh} />;
  else if (top === 'calibration') page = <SessionPage key={id} id={id} tab={sub || 'details'} reviewer={extra} refresh={refresh} setDialog={setDialog} />;
  else if (top === 'reports') page = <Reports />;
  else if (top === 'guidelines') page = <Guidelines />;
  else page = <Empty title="Page not found"><a className="cx-link" href="#/">Go to the dashboard</a></Empty>;

  return (
    <div className="cx-app">
      <aside className="cx-side">
        <div className="cx-brand"><span className="cx-logo"><Icon name="logo" size={18} /></span><div><b>CX QA Calibration</b><span className="cx-proto">Prototype</span></div></div>
        <nav>
          {NAV.map(([path, label, icon]) => (
            <a key={label} href={`#/${path}`} className={(top || '') === path ? 'active' : ''}><Icon name={icon} /> {label}</a>
          ))}
          {!EMBEDDED && <a href={TEAM_REPORTS_URL}><Icon name="external" /> Back to Team Reports</a>}
        </nav>
        <div className="cx-demo">
          <b><Icon name="flask" size={14} /> Demo environment</b>
          <p>Sample data is stored in this browser only. Not connected to any production QA system.</p>
          <button className="cx-btn ghost small" onClick={() => setDialog({
            title: 'Reset demo data?', body: 'All sessions, evaluations and actions in this browser are replaced with the sample set.', confirm: 'Reset',
            onConfirm: () => { resetDemo(); refresh(); go(''); },
          })}><Icon name="reset" size={14} /> Reset demo data</button>
        </div>
      </aside>
      <div className="cx-main">
        <div className="cx-banner"><b>Prototype</b> — for internal demonstration only. Data is sample data held in local browser storage.</div>
        <main className="cx-content">{page}</main>
      </div>
      {dialog && <Confirm dialog={dialog} onClose={() => setDialog(null)} />}
    </div>
  );
}

