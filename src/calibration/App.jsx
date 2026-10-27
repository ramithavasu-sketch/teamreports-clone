import { useEffect, useState } from 'react';
import { store, resetDemo } from './store.js';
import { PEOPLE, PARTICIPANTS, FACILITATORS, CALL_LIBRARY, FORMATS, INTERNAL_CHECKS, isAdmin, person } from './model.js';
import { go, fmtDate, Header, Metric, Panel, Tag, StatusTag, Notice, ErrorNote, Field } from './ui.jsx';
import { SessionPage } from './Session.jsx';

const EMBEDDED = new URLSearchParams(window.location.search).has('embed');
const USER_KEY = 'tr-calibration-user';
const readUser = () => { try { return PEOPLE[localStorage.getItem(USER_KEY)] ? localStorage.getItem(USER_KEY) : null; } catch { return null; } };
const writeUser = (id) => { try { if (id) localStorage.setItem(USER_KEY, id); else localStorage.removeItem(USER_KEY); } catch { /* ignore */ } };

function useRoute() {
  const parse = () => (window.location.hash.replace(/^#\/?/, '') || '').split('/').filter(Boolean);
  const [parts, setParts] = useState(parse);
  useEffect(() => {
    const on = () => setParts(parse());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return parts;
}

/* ---------- demo login ---------- */

function Login({ onLogin }) {
  const [pick, setPick] = useState('admin');
  const [msg, setMsg] = useState('');
  return (
    <div className="tr-login">
      <section className="tr-login-card">
        <div className="tr-brand"><span className="tr-brandmark">▥</span><div><b>Reports</b><div className="tiny tr-muted">Call Calibration · Interactive demo</div></div></div>
        <div className="tr-eyebrow">Demo login</div>
        <h1>Explore the Call Calibration workflow</h1>
        <p className="tr-muted">Choose a demo role. Use the “Viewing as” switcher in the app to test the Admin view and each participant view.</p>
        <div className="tr-rolecards">
          <button className="tr-rolecard" onClick={() => onLogin('admin')}><Tag tone="green">ADMIN</Tag><b>Admin workspace</b>
            <p>Create sessions, assign Connection IDs, track submissions and compare individual verdicts after all responses are locked.</p></button>
          <button className="tr-rolecard" onClick={() => onLogin(PARTICIPANTS[0].id)}><Tag tone="blue">CX / CAM LEAD</Tag><b>Participant workspace</b>
            <p>See only your assigned Connection IDs, submit your verdict and review your own saved response.</p></button>
        </div>
        <Field label="Or choose a specific demo account">
          <select value={pick} onChange={(e) => setPick(e.target.value)}>{Object.values(PEOPLE).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        </Field>
        <div className="tr-row">
          <button onClick={() => onLogin(pick)}>Open Team Reports demo</button>
          <button className="secondary" onClick={() => { resetDemo(); setMsg('Demo data reset to the sample sessions.'); }}>Reset demo data</button>
        </div>
        {msg && <Notice tone="good">{msg}</Notice>}
        <Notice tone="warn"><b>Prototype only.</b> The accounts and call records are sample data. This demo simulates role-specific screens in one browser; real access control needs signed-in users, server-side permissions and a shared database.</Notice>
      </section>
    </div>
  );
}

/* ---------- admin: all sessions ---------- */

const STEPS = [
  ['Call Library', 'Find the Connection ID and confirm the correct recording.'],
  ['Internal QA check', 'Review the recording, task context and required information.'],
  ['External calibration', 'Choose Blind, Team or Agent and assign the participants.'],
  ['Outcome', 'Compare or discuss, then save the agreed result and actions.'],
];

function Workflow({ steps }) {
  return <div className="tr-workflow">{steps.map(([t, d], i) => <div key={t} className="tr-step"><span className="tr-step-no">{i + 1}</span><b>{t}</b><p>{d}</p></div>)}</div>;
}

function ProgressCell({ s }) {
  if (s.format !== 'blind') return <>Group session</>;
  const pct = Math.round((s.submitted / Math.max(1, s.participants.length)) * 100);
  return <>{s.submitted} / {s.participants.length} submitted<div className="tr-mini-bar"><div style={{ width: `${pct}%` }} /></div></>;
}

function AdminCalibration({ userId }) {
  const [filter, setFilter] = useState('All');
  const [q, setQ] = useState('');
  const all = store.list(userId);
  const rows = all.filter((s) => filter === 'All' || (filter === 'Needs action' ? s.status.key !== 'completed' : s.status.key === 'completed'))
    .filter((s) => `${s.connectionId} ${s.id} ${FORMATS[s.format].name}`.toLowerCase().includes(q.toLowerCase()));
  const activeBlind = all.filter((s) => s.format === 'blind' && s.status.key !== 'completed');
  const audit = store.audit(userId).slice(0, 6);
  return (
    <>
      <Header eyebrow="Team Reports / QA workspace" title="Call Calibration" desc="Prepare the call internally, schedule the right calibration format, and record the final learning or benchmark.">
        <button onClick={() => go('new')}>＋ New calibration</button>
      </Header>
      <div className="tr-metrics">
        <Metric title="Sessions" label="All sessions" value={all.length} />
        <Metric title="Blind reviews pending" label="Across active blind sessions" value={activeBlind.reduce((n, s) => n + s.participants.length - s.submitted, 0)} blue />
        <Metric title="Ready to discuss" label="Blind submissions received" value={activeBlind.filter((s) => s.status.key === 'ready').length} />
        <Metric title="Completed" label="Outcome saved" value={all.filter((s) => s.status.key === 'completed').length} />
      </div>
      <Workflow steps={STEPS} />
      <Panel title="Calibration sessions" tag={<Tag tone="green">Admin access</Tag>}>
        <div className="tr-filters">
          <input placeholder="Search Connection ID or session" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search sessions" />
          <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter sessions"><option>All</option><option>Needs action</option><option>Completed</option></select>
        </div>
        <div className="tr-tablewrap">
          {rows.length ? (
            <table>
              <thead><tr><th>Connection ID</th><th>Session</th><th>Date / time</th><th>Participants</th><th>Progress</th><th>Status</th><th /></tr></thead>
              <tbody>{rows.map((s) => (
                <tr key={s.id}>
                  <td><b className="tr-callnum">{s.connectionId}</b><div className="tiny tr-muted">{s.id}</div></td>
                  <td>{FORMATS[s.format].name}</td>
                  <td>{fmtDate(s.date)}<div className="tiny tr-muted">{s.time}</div></td>
                  <td>{s.participants.length}</td>
                  <td><ProgressCell s={s} /></td>
                  <td><StatusTag status={s.status} /></td>
                  <td><button className="secondary small" onClick={() => go(`session/${s.id}`)}>Manage</button></td>
                </tr>
              ))}</tbody>
            </table>
          ) : <div className="tr-empty">No sessions match this filter.</div>}
        </div>
        <Notice>Blind submissions stay hidden from other participants. Admin can compare reviewer-level verdicts only after all assigned reviewers have submitted.</Notice>
      </Panel>
      <Panel title="Recent activity" tag={<span className="tr-muted tiny">Local demo audit trail</span>}>
        <div className="tr-tablewrap">
          <table>
            <thead><tr><th>When</th><th>Activity</th><th>By</th><th>Session</th></tr></thead>
            <tbody>{audit.length ? audit.map((a, i) => <tr key={i}><td>{fmtStampShort(a.at)}</td><td>{a.action}</td><td>{a.actor}</td><td>{a.session}</td></tr>)
              : <tr><td colSpan={4}>No activity yet.</td></tr>}</tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

const fmtStampShort = (iso) => { const d = new Date(iso); return `${fmtDate(iso)}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

/* ---------- participant: assigned sessions ---------- */

function ParticipantCalibration({ userId }) {
  const ss = store.list(userId);
  const blind = ss.filter((s) => s.format === 'blind');
  return (
    <>
      <Header eyebrow="Team Reports / My work" title="Call Calibration" desc="Your assigned calibration sessions. Only Connection IDs assigned to your account are shown.">
        <Tag tone="blue">Participant view</Tag>
      </Header>
      <div className="tr-metrics">
        <Metric title="Assigned" label="Your sessions" value={ss.length} />
        <Metric title="Blind reviews due" label="Awaiting your verdict" value={blind.filter((s) => !s.mine && !s.completed).length} blue />
        <Metric title="Blind reviews submitted" label="Your locked responses" value={blind.filter((s) => s.mine).length} />
        <Metric title="Completed" label="Shared outcomes" value={ss.filter((s) => s.completed).length} />
      </div>
      <Panel title="Your assigned sessions" tag={<Tag tone="blue">Restricted access</Tag>}>
        <Notice>You can open only sessions assigned to your account. For Blind sessions, submit independently. For Team and Agent sessions, use the scheduled meeting to review and discuss the interaction.</Notice>
        <div className="tr-tablewrap">
          <table>
            <thead><tr><th>Connection ID</th><th>Format</th><th>Date / time</th><th>Your action</th><th>Status</th><th /></tr></thead>
            <tbody>{ss.length ? ss.map((s) => (
              <tr key={s.id}>
                <td><b className="tr-callnum">{s.connectionId}</b><div className="tiny tr-muted">{s.id}</div></td>
                <td>{FORMATS[s.format].name}</td>
                <td>{fmtDate(s.date)}<div className="tiny tr-muted">{s.time}</div></td>
                <td>{s.format === 'blind' ? (s.mine ? <Tag tone="green">Submitted &amp; locked</Tag> : s.completed ? <Tag>Closed</Tag> : <Tag tone="amber">Submit verdict</Tag>) : <Tag tone="blue">Join group session</Tag>}</td>
                <td><StatusTag status={s.status} /></td>
                <td><button className="secondary small" onClick={() => go(`session/${s.id}`)}>{s.format === 'blind' ? (s.mine ? 'View my response' : 'Open call') : 'Open session'}</button></td>
              </tr>
            )) : <tr><td colSpan={6}><div className="tr-empty"><strong>No calibration assigned</strong>Your assigned Connection IDs will appear here when an Admin schedules a session.</div></td></tr>}</tbody>
          </table>
        </div>
      </Panel>
      <Notice>Individual reviewer-level verdicts and comments are never shown to other participants. Completed sessions show the shared outcome and learning points.</Notice>
    </>
  );
}

/* ---------- admin: create ---------- */

function CreatePage({ userId }) {
  const [f, setF] = useState({
    connectionId: CALL_LIBRARY[0].id, format: 'blind', date: '', time: '10:00', facilitator: FACILITATORS[0], meetLink: '',
    participants: PARTICIPANTS.slice(0, 3).map((p) => p.id), internalReview: {},
  });
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const toggle = (id) => setF({ ...f, participants: f.participants.includes(id) ? f.participants.filter((x) => x !== id) : [...f.participants, id] });
  const create = (e) => {
    e.preventDefault();
    setError(null);
    try { const id = store.createSession(userId, f); go(`session/${id}`); } catch (err) { setError(err); }
  };
  const ready = INTERNAL_CHECKS.every(([k]) => f.internalReview[k]);
  return (
    <>
      <Header eyebrow="Call Calibration / Admin" title="Create calibration session" desc="Confirm the call internally first. Then schedule the external calibration and assign participants.">
        <button className="secondary" onClick={() => go('')}>Cancel</button>
      </Header>
      <Panel title="Before Team Reports: internal QA preparation" tag={<Tag tone="amber">Required before scheduling</Tag>}>
        <Workflow steps={[['Call Library', 'Obtain the Connection ID and locate the interaction.'], ['Review recording', 'Listen to the call and confirm it is the right sample.'],
          ['Confirm context', 'Check task notes, documentation and relevant configuration.'], ['Approve sample', 'Only then schedule the external calibration.']]} />
        <Notice>This demo uses sample Call Library records. A production version should pull the actual recording and metadata from Call Library.</Notice>
      </Panel>
      <form className="tr-grid2" onSubmit={create}>
        <Panel title="Session details">
          <Field label="Connection ID from Call Library *">
            <select value={f.connectionId} onChange={set('connectionId')}>{CALL_LIBRARY.map((c) => <option key={c.id} value={c.id}>{c.id} · {c.line} · {fmtDate(c.date)} · {c.duration}</option>)}</select>
          </Field>
          <Field label="Calibration format *">
            <select value={f.format} onChange={set('format')}>{Object.entries(FORMATS).map(([k, x]) => <option key={k} value={k}>{x.name}</option>)}</select>
          </Field>
          <p className="tr-muted tiny">{FORMATS[f.format].help}</p>
          <div className="tr-grid2 tight">
            <Field label="Date *"><input type="date" value={f.date} onChange={set('date')} /></Field>
            <Field label="Time *"><input type="time" value={f.time} onChange={set('time')} /></Field>
          </div>
          <Field label="Facilitator *"><select value={f.facilitator} onChange={set('facilitator')}>{FACILITATORS.map((x) => <option key={x}>{x}</option>)}</select></Field>
          <Field label="Google Meet link (optional)"><input type="url" value={f.meetLink} onChange={set('meetLink')} placeholder="https://meet.google.com/…" /></Field>
          <div className="tr-rule" />
          <h3>Internal QA confirmation</h3>
          {INTERNAL_CHECKS.map(([k, t, d]) => (
            <label key={k} className="tr-checkline"><input type="checkbox" checked={!!f.internalReview[k]} onChange={(e) => setF({ ...f, internalReview: { ...f.internalReview, [k]: e.target.checked } })} />
              <span><b>{t}</b><br />{d}</span></label>
          ))}
          {!ready && <Notice tone="warn">Complete all internal checks before creating the external calibration session.</Notice>}
          <ErrorNote error={error} />
          <button type="submit" disabled={!ready}>Confirm preparation &amp; create session</button>
        </Panel>
        <Panel title="Assign participants">
          <p className="tr-muted tiny">Select the CAMs, CX members and leads who should join this session. Only assigned participants will see this Connection ID.</p>
          {PARTICIPANTS.map((p) => (
            <label key={p.id} className="tr-checkline"><input type="checkbox" checked={f.participants.includes(p.id)} onChange={() => toggle(p.id)} /><span><b>{p.name}</b></span></label>
          ))}
          <div className="tr-rule" />
          <h3>Access and privacy</h3>
          {[['Assigned Connection IDs only', 'Participants see only sessions assigned to them.'], ['Lock blind submissions', 'Blind verdicts lock when submitted.'],
            ['Admin-only comparison', 'Other reviewers’ verdicts remain hidden from participants.']].map(([t, d]) => (
            <label key={t} className="tr-checkline"><input type="checkbox" checked disabled /><span><b>{t}</b><br />{d}</span></label>
          ))}
          <Notice tone="warn">Prototype limitation: invitations, real Call Library playback and signed-in users are not connected.</Notice>
        </Panel>
      </form>
    </>
  );
}

/* ---------- shell ---------- */

export default function CalibrationApp() {
  const [userId, setUserId] = useState(readUser);
  const [collapsed, setCollapsed] = useState(false);
  const [, setVersion] = useState(0);
  const refresh = () => setVersion((v) => v + 1);
  const [top, id] = useRoute();
  const login = (uid) => { writeUser(uid); setUserId(uid); go(''); };
  const logout = () => { writeUser(null); setUserId(null); };

  if (!userId) return <Login onLogin={login} />;
  const me = person(userId);
  const admin = isAdmin(userId);

  let page;
  if (top === 'new') page = admin ? <CreatePage userId={userId} /> : <Header eyebrow="Access restricted" title="Admin only" desc="Only Admin can create a calibration session." />;
  else if (top === 'session' && id) page = <SessionPage key={`${id}-${userId}`} id={id} userId={userId} refresh={refresh} />;
  else page = admin ? <AdminCalibration userId={userId} /> : <ParticipantCalibration userId={userId} />;

  return (
    <div className={`tr-app ${collapsed ? 'collapsed' : ''} ${EMBEDDED ? 'embedded' : ''}`}>
      {!EMBEDDED && (
        <aside className="tr-side">
          <div className="tr-brandrow"><span className="tr-brandmark">▥</span><span className="tr-brandname">Reports</span>
            <button className="tr-collapse" title="Collapse navigation" onClick={() => setCollapsed(!collapsed)}>{collapsed ? '›' : '‹'}</button></div>
          <nav className="tr-navlist" aria-label="Main navigation">
            <a className="tr-nav active" href="#/" aria-label="Call Calibration" title="Call Calibration"><span className="tr-navicon">◎</span><span className="tr-navtext">Call Calibration</span><span className="tr-newtag">NEW</span></a>
            <a className="tr-nav" href={import.meta.env.BASE_URL} aria-label="Back to Team Reports" title="Back to Team Reports"><span className="tr-navicon">⌂</span><span className="tr-navtext">Back to Team Reports</span></a>
          </nav>
          <div className="tr-sidefoot"><span className="tr-avatar">{me.initials}</span><div className="tr-foottext"><b>{me.name}</b><span>{me.role}</span></div></div>
        </aside>
      )}
      <div className="tr-mainwrap">
        <div className="tr-topline">
          <span className="tr-demo-pill">DEMO MODE</span>
          <span className="tr-demo-label">Viewing as</span>
          <select value={userId} onChange={(e) => login(e.target.value)} aria-label="Switch demo account">
            {Object.values(PEOPLE).map((p) => <option key={p.id} value={p.id}>{p.name} · {p.role}</option>)}
          </select>
          <button className="secondary small" onClick={logout}>Exit demo</button>
        </div>
        <main className="tr-main">{page}</main>
      </div>
    </div>
  );
}
