import { useEffect, useState } from 'react';
import { WEEKS, AGENTS, LEADS, AUDIT, DASHBOARD, ATTENDANCE, BOX_COLUMNS, BOX_SCORES } from './data';

const ICON_PATHS = {
  dashboard: 'M4 11 12 4l8 7v9h-5v-6H9v6H4z',
  evals: 'M6 3h12v18H6zM9 8h6M9 12h6M10 16h4',
  scrub: 'M4 5h16v6H4zM4 13h16v6H4zM15 8h2M15 16h2',
  audit: 'M4 4h12v12H4zM14 14l6 6M8 8h4v4H8z',
  setup: 'M4 6h16v14H4zM4 10h16M9 3v5M15 3v5',
  perf: 'M12 4a8 8 0 1 0 8 8M12 12l5-5',
  form: 'M6 3h9l3 3v15H6zM9 10h6M9 14h4',
  report: 'M6 3h12v18H6zM9 15v2M12 12v5M15 9v8',
  box: 'M5 3h14v18H5zM8 7h8M8 11h8M8 15h5',
  tiers: 'M6 3h12v18H6zM9 7h6v3H9zM9 13h1M12 13h1M15 13h0M9 17h1M12 17h1',
  callguard: 'M12 3 19 6v5c0 4.5-3 8-7 9.5C8 19 5 15.5 5 11V6zM8.5 12h2l1-2.5 2 5 1-2.5h1',
};

const NAV = [
  ['dashboard', 'Dashboard'], ['evals', 'My Evals'], ['scrub', 'Call Scrubbing'], ['audit', 'Team Audit'],
  ['callguard', 'CallGuard AI'],
  ['setup', 'Setup Week'], ['perf', 'Performance'], ['form', 'Attendance form'],
  ['report', 'Attendance Report'], ['box', 'Box Score'], ['tiers', 'Tiers Calculator'],
];

function Icon({ name }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round"><path d={ICON_PATHS[name]} /></svg>
  );
}

function Avatar({ name, hue = 220, size = 32 }) {
  const initials = name.split(' ').map((p) => p[0]).join('').slice(0, 2);
  return (
    <span className="avatar" style={{ width: size, height: size, background: `hsl(${hue} 55% 88%)`, color: `hsl(${hue} 45% 30%)` }}>
      {initials}
    </span>
  );
}

function WeekPicker({ week, setWeek }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="week-picker">
      <button className="pill" onClick={() => setOpen(!open)}>{week.label} <span className="chev">⌄</span></button>
      {open && (
        <div className="menu">
          {WEEKS.map((w) => (
            <button key={w.label} className={w === week ? 'active' : ''} onClick={() => { setWeek(w); setOpen(false); }}>
              {w.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Sidebar({ page, setPage, open, setOpen }) {
  return (
    <aside className={`sidebar ${open ? 'open' : ''}`}>
      <button className="nav-btn" onClick={() => setOpen(!open)} title="Menu">
        <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 7h16M4 12h12M4 17h8" /></svg>
      </button>
      <nav>
        {NAV.map(([key, label]) => (
          <button key={key} className={`nav-btn ${page === key ? 'active' : ''}`} title={label} onClick={() => setPage(key)}>
            <Icon name={key} />{open && <span>{label}</span>}
          </button>
        ))}
      </nav>
      <div className="me"><Avatar name="Ramitha Vasu" hue={20} size={30} />{open && <span>Ramitha Vasu</span>}</div>
    </aside>
  );
}

/* ---------- Pages ---------- */

function Dashboard({ week, setWeek }) {
  const d = DASHBOARD;
  return (
    <div className="page">
      <WeekPicker week={week} setWeek={setWeek} />
      <div className="cards">
        <div className="card"><h3>Box Score</h3><div className="stats">
          <Stat label="Ready" value={d.boxScore.ready} unit="%" blue /><Stat label="ACW" value={d.boxScore.acw} unit="%" />
        </div></div>
        <div className="card"><h3>QA</h3><div className="stats">
          <Stat label="Total Pts" value={d.qa.total} /><Stat label="Good Job" value={d.qa.good} labelClass="blue" />
          <Stat label="Not Yet" value={d.qa.notYet} labelClass="orange" />
        </div></div>
        <div className="card"><h3>Learning Time</h3><div className="stats">
          <Stat label="Last wk" value={d.learning.lastWk} blue /><Stat label="4 wkAvg" value={d.learning.avg4} />
          <Stat label="12 wkAvg" value={d.learning.avg12} />
        </div></div>
        <div className="card small"><h3>Attendance</h3><div className="stats"><Stat label="6 Month" value={d.attendance} blue /></div></div>
        <div className="card"><h3>Hours Worked</h3><div className="stats">
          <div className="stat"><span>8 Weeks Avg</span><b>{d.hours.h}<small>h</small> {d.hours.m}<small>m</small></b></div>
        </div></div>
      </div>

      <div className="table-wrap">
        <div className="table-head-bar">
          <span>{week.month} | <b>Week {week.week}</b></span>
          <span>Soft skills: <b>0/30</b></span><span>Technical skills: <b>0/30</b></span>
        </div>
        <table>
          <thead><tr><th>Calls</th><th>Date</th><th>Soft skills</th><th>Technical skills</th><th>Evaluator</th><th>Evaluated date</th></tr></thead>
          <tbody>
            {d.calls.map((c) => (
              <tr key={c.n}><td><b>#{c.n}</b></td><td>{c.date}</td><td>N/A</td><td>N/A</td><td>{c.evaluator}</td><td>N/A</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value, unit, blue, labelClass }) {
  return (
    <div className="stat">
      <span className={labelClass}>{label}</span>
      <b className={blue ? 'blue' : ''}>{value}{unit && <small>{unit}</small>}</b>
    </div>
  );
}

function PeopleList({ people, selected, setSelected, renderSub }) {
  const [q, setQ] = useState('');
  return (
    <div className="people">
      <label className="search">⌕<input placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      <ul>
        {people.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())).map((p) => (
          <li key={p.id} className={selected?.id === p.id ? 'active' : ''} onClick={() => setSelected(p)}>
            <Avatar name={p.name} hue={p.hue} />
            <div><div className="pname">{p.name}</div>{renderSub && <div className="psub">{renderSub(p)}</div>}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MyEvals({ week, setWeek }) {
  const [status, setStatus] = useState('open');
  const [sel, setSel] = useState(AGENTS[0]);
  return (
    <div className="split">
      <div className="split-left">
        <WeekPicker week={week} setWeek={setWeek} />
        <div className="radios">
          <label><input type="radio" checked={status === 'open'} onChange={() => setStatus('open')} /> Open ({AGENTS.length})</label>
          <label><input type="radio" checked={status === 'closed'} onChange={() => setStatus('closed')} /> Closed (0)</label>
        </div>
        {status === 'open'
          ? <PeopleList people={AGENTS} selected={sel} setSelected={setSel} />
          : <p className="muted pad">No closed evals.</p>}
      </div>
      <div className="split-right">
        {status === 'open' && sel && (
          <div className="detail">
            <div className="detail-head"><Avatar name={sel.name} hue={sel.hue} size={44} /><div><h2>{sel.name}</h2><span className="muted">ID {sel.id}</span></div></div>
            <table>
              <thead><tr><th>Call</th><th>Date</th><th>Soft skills</th><th>Technical skills</th><th>Status</th></tr></thead>
              <tbody>
                {[1, 2].map((n) => <tr key={n}><td><b>#{n}</b></td><td>2026-10-1{6 + n}</td><td>N/A</td><td>N/A</td><td><span className="tag">Open</span></td></tr>)}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function CallScrubbing() {
  return (
    <div className="page empty-state">
      <h2>Call Scrubbing</h2>
      <p className="muted">No calls to scrub for this week.</p>
    </div>
  );
}

function TeamAudit({ week, setWeek }) {
  const [sel, setSel] = useState(AUDIT[0]);
  return (
    <div className="split">
      <div className="split-left">
        <div className="row-gap">
          <WeekPicker week={week} setWeek={setWeek} />
          <span className="lead-chip"><Avatar name={AUDIT[0].name} hue={AUDIT[0].hue} size={22} /> {AUDIT[0].name.split(' ')[0]}</span>
        </div>
        <PeopleList people={AUDIT} selected={sel} setSelected={setSel}
          renderSub={(p) => <><b>SOFT</b> {p.soft}/{p.of}&nbsp;&nbsp; <b>TECH</b> {p.tech}/{p.of}</>} />
      </div>
      <div className="split-right">
        <h3 className="section-title">QA Scores</h3>
        <p className="muted">{sel.name} has {sel.of} call{sel.of === 1 ? '' : 's'} assigned this week, none scored yet.</p>
      </div>
    </div>
  );
}

function SetupWeek({ week }) {
  const [rows, setRows] = useState(Array.from({ length: 5 }, () => ({ evaluator: '', spanish: false })));
  const [done, setDone] = useState(false);
  const ready = rows.every((r) => r.evaluator);
  const update = (i, patch) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="page narrow">
      <h1>{week.month} Week {week.week + 2}</h1>
      <p className="sub">Set call parameters for your team.</p>
      <table className="plain">
        <thead><tr><th>Evaluator</th><th>Language</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="with-avatar"><Avatar name={r.evaluator || '?'} hue={200} size={26} />
                <select value={r.evaluator} onChange={(e) => update(i, { evaluator: e.target.value })}>
                  <option value="">Select</option>
                  {LEADS.map((l) => <option key={l.name}>{l.name}</option>)}
                </select>
              </td>
              <td><label className="check"><input type="checkbox" checked={r.spanish} onChange={(e) => update(i, { spanish: e.target.checked })} /> Spanish</label></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="btn" disabled={!ready} onClick={() => setDone(true)}>Submit</button>
      {done && <p className="ok">Saved (sample only, nothing is stored).</p>}
    </div>
  );
}

function Performance({ week, setWeek }) {
  const [tab, setTab] = useState('teams');
  const rows = tab === 'teams' ? LEADS : AGENTS.map((a, i) => ({ ...LEADS[i % LEADS.length], name: a.name }));
  return (
    <div className="page">
      <WeekPicker week={week} setWeek={setWeek} />
      <div className="table-wrap">
        <div className="tabs">
          <button className={tab === 'teams' ? 'active' : ''} onClick={() => setTab('teams')}>Teams ({LEADS.length})</button>
          <button className={tab === 'agents' ? 'active' : ''} onClick={() => setTab('agents')}>All Agents ({AGENTS.length})</button>
          <button className="icon-btn" title="Download CSV" onClick={() => downloadCsv(rows)}>⤓</button>
        </div>
        <table>
          <thead><tr><th className="left">{tab === 'teams' ? 'Lead_name' : 'Agent_name'}</th><th>Total calls</th><th>Evaluated calls</th><th>Soft skills</th><th>Tech skills</th><th>Possible points</th><th>Avg</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name}>
                <td className="left">{r.name}</td><td>{r.total}</td>
                {r.evaluated ? <><td>{r.evaluated}</td><td>{r.soft}</td><td>{r.tech}</td><td>{r.possible}</td>
                  <td><b>{Math.round(((r.soft + r.tech) / r.possible) * 100)} %</b></td></> : <td colSpan={5} />}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function downloadCsv(rows) {
  const lines = ['name,total,evaluated,soft,tech,possible', ...rows.map((r) => [r.name, r.total, r.evaluated, r.soft, r.tech, r.possible].join(','))];
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
  a.download = 'performance.csv';
  a.click();
}

function AttendanceForm() {
  const empty = { name: '', type: '', date: '', tz: 'Pacific Standard Time (PST)', reason: '', comments: '' };
  const [f, setF] = useState(empty);
  const [shifts, setShifts] = useState(null);
  const [sent, setSent] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const ready = f.name && f.type && f.date && f.reason && f.comments;
  return (
    <div className="page form-page">
      <div className="form-top">
        <h2>Attendance form</h2>
        <div><button className="link" onClick={() => { setF(empty); setShifts(null); setSent(false); }}>Reset</button>
          <button className="btn pill-btn" disabled={!ready} onClick={() => setSent(true)}>Submit</button></div>
      </div>
      <div className="notice">
        <b>ⓘ All fields required. Data not retained.</b>
        <ul><li>Report absences within 15 minutes of the start of your scheduled shift.</li>
          <li>Some regions may need to call their support line instead of using this form.</li></ul>
      </div>
      {sent && <p className="ok">Submitted (sample only, nothing is stored).</p>}
      <section><h4>Employee's details</h4><div>
        <label>Name<select value={f.name} onChange={set('name')}><option value="">Enter name</option>{AGENTS.map((a) => <option key={a.id}>{a.name}</option>)}</select></label>
      </div></section>
      <section><h4>Incident details</h4><div>
        <label>Type of attendance matter<select value={f.type} onChange={set('type')}><option value="">Select attendance matter</option><option>Absence</option><option>Late Arrival</option><option>Early Logout</option></select></label>
        <label>Date of Incident<input type="date" value={f.date} onChange={set('date')} /></label>
        <label>Select preferred time zone<small>Shift timings will adjust according to the chosen time zone.</small>
          <select value={f.tz} onChange={set('tz')}><option>Pacific Standard Time (PST)</option><option>Central Standard Time (CST)</option><option>Eastern Standard Time (EST)</option><option>India Standard Time (IST)</option></select></label>
        <label>Shifts on the date of incident</label>
        <button className="btn ghost" onClick={() => setShifts(['08:00 - 12:00', '12:30 - 16:30'])}>Get shifts</button>
        {shifts && <div className="shifts">{shifts.map((s) => <span key={s} className="tag">{s}</span>)}</div>}
      </div></section>
      <section><h4>Reason</h4><div>
        <label>Reason<select value={f.reason} onChange={set('reason')}><option value="">Pick a reason</option><option>Sick</option><option>Personal</option><option>IT Issue</option><option>Others</option></select></label>
        <label>Comments<textarea placeholder="Write your comments here" value={f.comments} onChange={set('comments')} /></label>
      </div></section>
    </div>
  );
}

function AttendanceReport() {
  const [q, setQ] = useState('');
  const rows = ATTENDANCE.filter((r) => !q || String(r.empId).includes(q) || r.emp.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="page">
      <h2>Attendance Report</h2>
      <div className="filters">
        <label>From <input type="date" defaultValue="2026-10-26" /></label>
        <label>To <input type="date" defaultValue="2026-10-26" /></label>
        <label>Lead <select><option>Select Lead</option>{LEADS.map((l) => <option key={l.name}>{l.name}</option>)}</select></label>
        <label>Attendance Matter <select><option>Select Attendance</option><option>Absence</option><option>Late Arrival</option></select></label>
        <input placeholder="⌕ Employee ID / name" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn blue">Filter</button>
      </div>
      <div className="scroll-x">
        <table className="dense">
          <thead><tr>{['#', 'Submitted By', 'Type of Attendance', 'System generated', 'Employee Name', 'Employee ID', 'Lead Name', 'Department', 'Date of Incident', 'Call in Time', 'Shifts', 'Reason', 'Comment', 'Point', 'HR Approval', 'Duration', 'Point Deducted', 'Final Point'].map((h) => <th key={h} className="left">{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="left">{i + 1}</td><td className="left">{r.by}</td><td className="left">{r.type}</td><td className="left">{r.system}</td>
                <td className="left">{r.emp}</td><td className="left">{r.empId}</td><td className="left">{r.lead}</td><td className="left">{r.dept}</td>
                <td className="left">{r.date}</td><td className="left">{r.callIn}</td><td className="left">{r.shift}</td><td className="left">{r.reason}</td>
                <td className="left">{r.comment}</td><td className="left">{r.point}</td><td className="left">nil</td><td className="left">{r.duration}</td><td className="left">0</td><td className="left">{r.point}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BoxScore() {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState(null);
  let rows = BOX_SCORES.filter((r) => r.email.includes(q.toLowerCase()));
  if (sort !== null) rows = [...rows].sort((a, b) => String(a.values[sort]).localeCompare(String(b.values[sort]), undefined, { numeric: true }));
  return (
    <div className="page">
      <h2>BoxScores</h2>
      <div className="filters">
        <label>From <input type="date" defaultValue="2026-10-25" /></label>
        <label>To <input type="date" defaultValue="2026-10-25" /></label>
        <label>Lead <select><option>Select Lead</option>{LEADS.map((l) => <option key={l.name}>{l.name}</option>)}</select></label>
        <input placeholder="⌕ Enter login" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn blue">Submit</button>
      </div>
      <div className="scroll-x">
        <table className="dense">
          <thead><tr><th className="left">Employee Name</th>{BOX_COLUMNS.map((c, i) => <th key={c} className="left sortable" onClick={() => setSort(i)}>{c} ⇅</th>)}</tr></thead>
          <tbody>{rows.map((r) => <tr key={r.email}><td className="left">{r.email}</td>{r.values.map((v, i) => <td key={i} className="left">{v}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

function TiersCalculator() {
  const [region, setRegion] = useState('US');
  const [s, setS] = useState({ ready: '', acw: '', qa: '', jsr: '', noQa: false, mf: false, sun: false });
  const [result, setResult] = useState(null);
  const set = (k) => (e) => setS({ ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  // Placeholder rule: average of the entered scores. Replace with your real tier rules.
  const estimate = () => {
    const nums = [s.ready, 100 - Number(s.acw || 0), s.noQa ? null : s.qa, s.jsr].filter((v) => v !== null && v !== '').map(Number);
    const avg = nums.reduce((a, b) => a + b, 0) / (nums.length || 1) + (s.mf ? 1 : 0) + (s.sun ? 1 : 0);
    setResult(avg >= 95 ? 'Tier 1' : avg >= 88 ? 'Tier 2' : avg >= 80 ? 'Tier 3' : 'Tier 4');
  };
  return (
    <div className="page narrow-wide">
      <div className="tabs center">
        {['US', 'UK', 'Lex'].map((r) => <button key={r} className={region === r ? 'active' : ''} onClick={() => { setRegion(r); setResult(null); }}>{r} Tier Calculator</button>)}
      </div>
      <section><h4>Enter your scores:</h4><div>
        {[['ready', 'Ready'], ['acw', 'ACW'], ['qa', 'QA'], ['jsr', 'JSR']].map(([k, l]) => (
          <label key={k}>{l}<input type="number" placeholder={`Enter your ${l} score`} value={s[k]} onChange={set(k)} disabled={k === 'qa' && s.noQa} /></label>
        ))}
        <label className="check"><input type="checkbox" checked={s.noQa} onChange={set('noQa')} /> No QA Available.</label>
        <label className="check"><input type="checkbox" checked={s.mf} onChange={set('mf')} /> 93% + 6 or more hours worked in total on Monday and/or Friday in the tiering period between 1:00 PM - 4:00 PM Pacific.</label>
        <label className="check"><input type="checkbox" checked={s.sun} onChange={set('sun')} /> Check if you worked 4 hours between 1:00 PM - 3:00 PM PST any Sunday or Monday within the tier period.</label>
        <button className="btn blue" onClick={estimate}>Estimate</button>
        {result && <p className="ok">{region} estimate: <b>{result}</b> <span className="muted">(sample formula)</span></p>}
      </div></section>
    </div>
  );
}

// CallGuard AI is a self-contained prototype page (public/callguard/), shown here in a frame.
function CallGuard() {
  return (
    <div className="callguard-frame">
      <iframe title="CallGuard AI" src={`${import.meta.env.BASE_URL}callguard/index.html?embed=1`} />
    </div>
  );
}

const PAGES = { dashboard: Dashboard, callguard: CallGuard, evals: MyEvals, scrub: CallScrubbing, audit: TeamAudit, setup: SetupWeek, perf: Performance, form: AttendanceForm, report: AttendanceReport, box: BoxScore, tiers: TiersCalculator };

const pageFromHash = () => {
  const h = decodeURIComponent(window.location.hash.slice(1));
  return PAGES[h] ? h : 'dashboard';
};

export default function App() {
  const [page, setPageState] = useState(pageFromHash);
  // Labels show by default on wider screens so every section is easy to find.
  const [open, setOpen] = useState(() => window.innerWidth >= 900);
  const [week, setWeek] = useState(WEEKS[1]);
  const setPage = (p) => {
    setPageState(p);
    window.history.pushState(null, '', `#${p}`);
    window.scrollTo(0, 0);
  };
  useEffect(() => {
    const onPop = () => setPageState(pageFromHash());
    window.addEventListener('popstate', onPop);
    window.addEventListener('hashchange', onPop);
    return () => { window.removeEventListener('popstate', onPop); window.removeEventListener('hashchange', onPop); };
  }, []);
  const Page = PAGES[page];
  return (
    <main className="app">
      <Sidebar page={page} setPage={setPage} open={open} setOpen={setOpen} />
      <div className="content"><Page week={week} setWeek={setWeek} /></div>
    </main>
  );
}
