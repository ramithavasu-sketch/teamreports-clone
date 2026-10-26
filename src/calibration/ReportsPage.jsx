import { useState } from 'react';
import { api } from './store.js';
import { FORMATS, STATUS_LABEL, ACTION_KINDS } from './service.js';
import { qaStaff } from './people.js';
import { useLoad, FormatBadge, StatusBadge, fmtDate, Loading, ErrorBox, Empty } from './ui.jsx';

const monthName = (m) => new Date(`${m}-01T00:00:00`).toLocaleString('en-GB', { month: 'short', year: 'numeric' });

function toCsv(rows) {
  const head = ['Date', 'Title', 'Format', 'Status', 'Facilitator', 'Connection ID', 'Agent', 'Reviewers', 'Submitted', 'Completion %', 'Agreement %', 'Agreed score %', 'Score spread', 'Items over baseline', 'Unresolved', 'Decision'];
  const esc = (x) => `"${String(x ?? '').replace(/"/g, '""')}"`;
  const lines = rows.map((r) => [r.scheduledAt?.slice(0, 10), r.title, FORMATS[r.format], STATUS_LABEL[r.status], r.facilitatorName, r.connectionId, r.agentName, r.reviewers,
    r.submitted ?? '', r.completionRate ?? '', r.agreementPct ?? '', r.finalOverall ?? '', r.overallSpread ?? '', r.flagged.map((f) => f.name).join('; '), r.unresolved.join('; '),
    r.consensus === 'lead_decision' ? 'QA Lead decision' : r.consensus ? 'Consensus' : ''].map(esc).join(','));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([[head.map(esc).join(','), ...lines].join('\n')], { type: 'text/csv' }));
  a.download = 'calibration-results.csv';
  a.click();
}

function Bar({ value, goal }) {
  if (value === null || value === undefined) return <span className="muted">–</span>;
  return (
    <span className="cal-bar" title={`${value}%`}>
      <span style={{ width: `${Math.min(100, value)}%` }} className={goal !== undefined && value < goal ? 'low' : ''} />
      <b>{value}%</b>
    </span>
  );
}

export function ReportsPage({ viewer, open }) {
  const [f, setF] = useState({ from: '', to: '', format: '', facilitatorId: '', agent: '', connectionId: '', status: '' });
  const [expanded, setExpanded] = useState(null);
  const { data, loading, error, reload } = useLoad(() => api.getReport(viewer, f), [viewer, JSON.stringify(f)]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return <Loading />;
  const s = data.summary;
  const target = data.rows[0]?.baseline ?? 5;
  return (
    <div className="cal-reports">
      <div className="cal-toolbar">
        <h2>Calibration Results and Reports</h2>
        <button className="cal-btn ghost" onClick={() => toCsv(data.rows)} disabled={!data.rows.length}>⤓ Download CSV</button>
      </div>
      <div className="cal-filters wrap">
        <label>From <input type="date" value={f.from} onChange={set('from')} /></label>
        <label>To <input type="date" value={f.to} onChange={set('to')} /></label>
        <select value={f.format} onChange={set('format')} aria-label="Format"><option value="">All formats</option>{Object.entries(FORMATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select value={f.status} onChange={set('status')} aria-label="Status"><option value="">All statuses</option>{Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select value={f.facilitatorId} onChange={set('facilitatorId')} aria-label="Facilitator"><option value="">All facilitators</option>{qaStaff().map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <input placeholder="Agent" value={f.agent} onChange={set('agent')} aria-label="Agent" />
        <input placeholder="Connection ID" value={f.connectionId} onChange={set('connectionId')} aria-label="Connection ID" />
        {Object.values(f).some(Boolean) && <button className="link" onClick={() => setF({ from: '', to: '', format: '', facilitatorId: '', agent: '', connectionId: '', status: '' })}>Clear</button>}
        {loading && <span className="cal-spinner" />}
      </div>

      <div className="cal-stats">
        <div className="cal-stat"><span>Sessions</span><b>{s.total}</b></div>
        <div className="cal-stat"><span>Upcoming</span><b>{s.upcoming}</b></div>
        <div className="cal-stat"><span>Active</span><b>{s.active}</b></div>
        <div className="cal-stat"><span>Completed</span><b>{s.completed}</b></div>
        <div className="cal-stat"><span>Submission completion</span><b>{s.completionRate ?? '–'}{s.completionRate !== null && <small>%</small>}</b></div>
        <div className="cal-stat"><span>Avg agreement</span><b className="blue">{s.avgAgreement ?? '–'}{s.avgAgreement !== null && <small>%</small>}</b></div>
        <div className="cal-stat"><span>Sessions over baseline</span><b className={s.overBaseline ? 'orange' : ''}>{s.overBaseline}</b></div>
        <div className="cal-stat"><span>Unresolved items</span><b className={s.unresolved ? 'orange' : ''}>{s.unresolved}</b></div>
        <div className="cal-stat"><span>QA Lead decisions</span><b>{s.leadDecisions}</b></div>
      </div>
      <p className="cal-method">The variance baseline (default 5%) is an operational goal for how closely reviewers should match. Meeting it does not by itself prove quality or fairness.</p>

      <div className="cal-report-grid">
        <section className="cal-panel">
          <h3>Sessions by format</h3>
          <table className="cal-table"><tbody>
            {Object.entries(s.byFormat).map(([k, n]) => <tr key={k}><td className="left"><FormatBadge format={k} /></td><td><Bar value={s.total ? Math.round((n / s.total) * 100) : 0} /></td><td>{n}</td></tr>)}
          </tbody></table>
        </section>
        <section className="cal-panel">
          <h3>Agreement trend</h3>
          {data.trend.length ? (
            <table className="cal-table">
              <thead><tr><th className="left">Month</th><th className="left">Avg agreement</th><th>Revealed sessions</th><th>Over baseline</th></tr></thead>
              <tbody>{data.trend.map((t) => <tr key={t.month}><td className="left">{monthName(t.month)}</td><td className="left"><Bar value={t.avgAgreement} goal={100 - target} /></td><td>{t.sessions}</td><td>{t.overBaseline}</td></tr>)}</tbody>
            </table>
          ) : <p className="muted">No revealed sessions in this range yet.</p>}
        </section>
        <section className="cal-panel">
          <h3>Recurring disagreement</h3>
          {data.recurringDisagreements.length ? (
            <table className="cal-table">
              <thead><tr><th className="left">Scorecard item</th><th>Sessions over baseline</th></tr></thead>
              <tbody>{data.recurringDisagreements.map((r) => <tr key={r.name}><td className="left"><small className="muted">{r.categoryName}</small><br />{r.name}</td><td>{r.count}</td></tr>)}</tbody>
            </table>
          ) : <p className="muted">No items over the baseline.</p>}
        </section>
      </div>

      <section className="cal-panel">
        <h3>Calibration history</h3>
        {data.rows.length ? (
          <div className="scroll-x">
            <table className="cal-table">
              <thead><tr><th className="left">Date</th><th className="left">Session</th><th>Status</th><th>Reviewers</th><th>Submitted</th><th className="left">Agreement</th><th>Agreed score</th><th>Spread</th><th>Over baseline</th><th>Unresolved</th><th>Decision</th><th /></tr></thead>
              <tbody>
                {data.rows.map((r) => [
                  <tr key={r.id} className={r.flagged.length ? 'flagged-soft' : ''}>
                    <td className="left">{fmtDate(r.scheduledAt, false)}</td>
                    <td className="left"><button className="link strong" onClick={() => open(r.id)}>{r.title}</button><br /><FormatBadge format={r.format} /> <small className="muted mono">{r.connectionId}</small></td>
                    <td><StatusBadge status={r.status} /></td>
                    <td>{r.reviewers}</td>
                    <td>{r.submitted === null ? <small className="muted">n/a</small> : `${r.submitted}/${r.reviewers}`}</td>
                    <td className="left"><Bar value={r.agreementPct} goal={100 - r.baseline} /></td>
                    <td>{r.finalOverall !== null ? `${r.finalOverall}%` : '–'}</td>
                    <td>{r.overallSpread ?? '–'}</td>
                    <td>{r.flagged.length ? <span className="orange">{r.flagged.length}</span> : r.revealed ? 0 : '–'}</td>
                    <td>{r.unresolved.length ? <span className="orange" title={r.unresolved.join(', ')}>{r.unresolved.length}</span> : 0}</td>
                    <td><small>{r.consensus === 'lead_decision' ? 'QA Lead' : r.consensus ? 'Consensus' : ''}</small></td>
                    <td>{r.revealed && <button className="link" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>{expanded === r.id ? 'Less' : 'Details'}</button>}</td>
                  </tr>,
                  expanded === r.id && (
                    <tr key={`${r.id}-x`} className="cal-expand"><td colSpan={12}>
                      <div className="cal-report-grid">
                        <div><b>Reviewer scores vs agreed</b>
                          <ul>{r.reviewerScores.map((x) => <li key={x.reviewerId}>{x.name}: {x.overall ?? '–'}%{x.diffFromFinal !== null && <span className="muted"> (±{x.diffFromFinal} from agreed)</span>}</li>)}</ul></div>
                        <div><b>Items over the {r.baseline}% baseline</b>
                          {r.flagged.length ? <ul>{r.flagged.map((x) => <li key={x.id}>{x.name}: {x.agreement.matching}/{x.agreement.total} agree, variance {x.variancePct}%</li>)}</ul> : <p className="muted">None</p>}</div>
                      </div>
                    </td></tr>
                  ),
                ])}
              </tbody>
            </table>
          </div>
        ) : <Empty title="No calibrations match these filters" />}
      </section>

      <section className="cal-panel">
        <h3>Action items and rubric follow-ups</h3>
        {data.actions.length ? (
          <table className="cal-table">
            <thead><tr><th className="left">Action</th><th className="left">Type</th><th className="left">Owner</th><th>Due</th><th>Status</th><th className="left">Session</th></tr></thead>
            <tbody>{data.actions.map((a) => (
              <tr key={a.id}><td className="left">{a.body}</td><td className="left">{ACTION_KINDS[a.kind]}</td><td className="left">{a.ownerName}</td>
                <td className={a.overdue ? 'orange' : ''}>{a.dueDate || '–'}{a.overdue && ' (overdue)'}</td>
                <td>{a.status === 'done' ? <span className="cal-sub s-submitted">Done</span> : <span className="cal-sub s-draft">Open</span>}</td>
                <td className="left"><button className="link" onClick={() => open(a.sessionId)}>{a.sessionTitle}</button></td></tr>
            ))}</tbody>
          </table>
        ) : <p className="muted">No action items.</p>}
      </section>
    </div>
  );
}
