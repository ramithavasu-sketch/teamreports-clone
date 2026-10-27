import { useState } from 'react';
import { store } from './store.js';
import { SECTIONS, VERDICTS, FINDINGS, OWNERS, ACTION_STATUS, analyse, sectionName, emptyEvaluation } from './model.js';
import { Icon, StatusBadge, Verdict, Finding, Locked, Card, ErrorNote, Empty, Toggle, fmtDate, fmtTime, fmtStamp } from './ui.jsx';

const TABS = [['details', 'Session details'], ['evaluate', 'Reviewer evaluation'], ['reveal', 'Reveal & discussion'], ['summary', 'Summary & actions']];

function tabDone(s, key) {
  if (key === 'details') return s.status !== 'draft';
  if (key === 'evaluate') return s.submitted === s.required;
  if (key === 'reveal') return !!s.revealedAt;
  return s.status === 'completed';
}

/* ---------- shared: original verdicts table ---------- */

function VerdictTable({ subs, analysis }) {
  return (
    <div className="cx-table-wrap">
      <table className="cx-table">
        <thead><tr><th>Reviewer</th>{analysis.sections.map((x) => <th key={x.id}>{x.name}</th>)}<th>Status</th><th>Submitted at</th></tr></thead>
        <tbody>
          {subs.map((s) => (
            <tr key={s.reviewer}>
              <td className="strong">Reviewer {s.reviewer}</td>
              {analysis.sections.map((x) => {
                const v = s.evaluation.sections[x.id].verdict;
                return <td key={x.id}><Verdict value={v} highlight={x.majority && v !== x.majority} /></td>;
              })}
              <td><Locked /></td>
              <td>{fmtStamp(s.submittedAt)}</td>
            </tr>
          ))}
          <tr className="cx-total">
            <td className="cx-eyebrow">Initial agreement</td>
            {analysis.sections.map((x) => <td key={x.id}><span className={`cx-agree ${x.unanimous ? 'agreed' : 'split'}`}>{x.unanimous ? 'Agreement' : 'Disagreement'}</span></td>)}
            <td colSpan={2} className="cx-muted small">Highlighted cells differ from the majority verdict.</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function sectionSentence(x) {
  if (x.unanimous) return `All ${x.verdicts.length} reviewers selected ${x.verdicts[0].verdict}.`;
  const counts = Object.entries(x.counts).map(([v, n]) => `${n} ${v}`).join(' · ');
  const odd = x.majority ? x.verdicts.filter((v) => v.verdict !== x.majority).map((v) => `Reviewer ${v.reviewer}`) : [];
  return `${counts}${odd.length ? ` — ${odd.join(', ')} ${odd.length === 1 ? 'differs' : 'differ'} from the majority.` : ' — no majority.'}`;
}

/* ---------- 1. details ---------- */

function Details({ s }) {
  const progress = store.progress(s.id);
  const ready = s.submitted === s.required;
  return (
    <div className="cx-grid-side">
      <Card title="Session details">
        <dl className="cx-dl">
          {[['Session name', s.name], ['Connection ID', <span className="mono" key="c">{s.connectionId}</span>], ['Date', fmtDate(s.date)], ['Time', fmtTime(s.time)],
            ['Facilitator', s.facilitator], ['Reviewers', s.reviewers.map((r) => `Reviewer ${r}`).join(', ')], ['Blind evaluation', 'Enabled'],
            ['Lock after submission', 'Enabled'], ['Reveal evaluations', 'Only after all required reviewers submit'], ['Evaluation sections', 'Soft Skills and Technical Skills']]
            .map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
        </dl>
      </Card>
      <div>
        <Card title="Reviewer progress" sub="Only submission status is shown — answers stay hidden until reveal.">
          <div className="cx-progress-head"><span>Submissions</span><b>{s.submitted} of {s.required} submitted</b></div>
          <div className="cx-progress"><span style={{ width: `${(s.submitted / s.required) * 100}%` }} /></div>
          <ul className="cx-reviewers">
            {progress.map((p) => (
              <li key={p.reviewer}>
                <div><b>Reviewer {p.reviewer}</b><small>{p.status === 'submitted' ? `Submitted ${fmtStamp(p.submittedAt)}` : p.status === 'draft' ? 'Draft saved' : 'Not started'}</small></div>
                {p.status === 'submitted' ? <Locked /> : <span className="cx-badge st-scheduled">{p.status === 'draft' ? 'In progress' : 'Pending'}</span>}
                <a className="cx-link" href={`#/calibration/${s.id}/evaluate/${p.reviewer}`}>Open</a>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Next step">
          <div className="cx-stack">
            <a className="cx-btn ghost" href={`#/calibration/${s.id}/evaluate`}>Open Reviewer Evaluation Form</a>
            {s.revealedAt
              ? <a className="cx-btn" href={`#/calibration/${s.id}/reveal`}>Go to discussion <Icon name="arrow" size={14} /></a>
              : <a className={`cx-btn ${ready ? '' : 'disabled'}`} aria-disabled={!ready} href={ready ? `#/calibration/${s.id}/reveal` : undefined}
                title={ready ? '' : 'Available once every reviewer has submitted'}>Reveal evaluations</a>}
            {!ready && <small className="cx-muted">Reveal unlocks when all {s.required} reviewers have submitted.</small>}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ---------- 2. reviewer evaluation (blind) ---------- */

function ObservationRow({ section, o, onChange, onRemove, readOnly }) {
  const sec = SECTIONS.find((x) => x.id === section);
  return (
    <div className="cx-obs">
      <div className="cx-obs-grid">
        <label>QA parameter
          <select value={o.parameter} disabled={readOnly} onChange={(e) => onChange({ ...o, parameter: e.target.value })}>
            <option value="">Select parameter</option>{sec.params.map((p) => <option key={p}>{p}</option>)}
          </select></label>
        <label>Evidence timestamp<input className="mono" value={o.timestamp} disabled={readOnly} placeholder="00:42 or 01:15–01:30" onChange={(e) => onChange({ ...o, timestamp: e.target.value })} /></label>
        <label>Parameter finding<Toggle options={FINDINGS} value={o.finding} disabled={readOnly} onChange={(v) => onChange({ ...o, finding: v })} className="small" label="Parameter finding" /></label>
        {!readOnly && <button className="cx-icon-btn" title="Remove observation" aria-label="Remove observation" onClick={onRemove}><Icon name="trash" /></button>}
      </div>
      <label>Observation and supporting evidence<textarea value={o.evidence} disabled={readOnly} placeholder="What happened, with a short quote if useful" onChange={(e) => onChange({ ...o, evidence: e.target.value })} /></label>
    </div>
  );
}

function EvaluationForm({ s, reviewer, refresh, setDialog }) {
  const mine = store.myEvaluation(s.id, reviewer);
  const locked = mine.status === 'submitted';
  const open = ['scheduled', 'in_review'].includes(s.status);
  const [ev, setEv] = useState({ sections: mine.sections || emptyEvaluation().sections, notes: mine.notes || '' });
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);
  const readOnly = locked || !open;
  const setSection = (id, patch) => setEv({ ...ev, sections: { ...ev.sections, [id]: { ...ev.sections[id], ...patch } } });
  const run = (fn, okMsg) => { setError(null); setMsg(null); try { fn(); refresh(); if (okMsg) setMsg(okMsg); } catch (e) { setError(e); } };

  return (
    <>
      <div className="cx-strip">
        <div><span>Session</span><b>{s.name}</b></div>
        <div><span>Connection ID</span><b className="mono">{s.connectionId}</b></div>
        <div><span>Date</span><b>{fmtDate(s.date)} · {fmtTime(s.time)}</b></div>
        <div><span>Reviewing as</span><b className="cx-blue">Reviewer {reviewer}</b></div>
        <div><span>Evaluation status</span><b>{locked ? <span className="cx-locked dark"><Icon name="lock" size={12} /> Locked</span> : mine.status === 'draft' ? 'Draft' : 'Not started'}</b></div>
      </div>
      {locked && (
        <div className="cx-notice locked">
          <Icon name="lock" size={18} />
          <div><b>This evaluation is submitted and locked</b>
            <p>Submitted {fmtStamp(mine.submittedAt)}. Original verdicts and observations can no longer be edited. Other reviewers’ evaluations stay hidden until the facilitator reveals them.</p>
            <a className="cx-btn small" href={`#/calibration/${s.id}/reveal`}>Facilitator reveal <Icon name="arrow" size={12} /></a></div>
        </div>
      )}
      <div className="cx-notice info"><Icon name="eyeOff" size={16} /> Blind evaluation: you can’t see other reviewers’ answers. {s.submitted} of {s.required} reviewers have submitted.</div>
      {SECTIONS.map((sec) => {
        const data = ev.sections[sec.id];
        return (
          <Card key={sec.id} title={sec.name} sub={`Parameters: ${sec.params.join(', ')}`} right={data.verdict && <Verdict value={data.verdict} />}>
            <div className="cx-label">Overall verdict</div>
            <Toggle options={VERDICTS} value={data.verdict} disabled={readOnly} onChange={(v) => setSection(sec.id, { verdict: v })} className="big" label={`${sec.name} overall verdict`} />
            <div className="cx-label">Observations <span className="cx-muted">({data.observations.length})</span></div>
            {data.observations.map((o, i) => (
              <ObservationRow key={o.id || i} section={sec.id} o={o} readOnly={readOnly}
                onChange={(n) => setSection(sec.id, { observations: data.observations.map((x, j) => (j === i ? n : x)) })}
                onRemove={() => setSection(sec.id, { observations: data.observations.filter((_, j) => j !== i) })} />
            ))}
            {!data.observations.length && <p className="cx-muted small">No observations yet.</p>}
            {!readOnly && <button className="cx-btn ghost small" onClick={() => setSection(sec.id, { observations: [...data.observations, { id: `new-${Date.now()}`, parameter: '', timestamp: '', finding: '', evidence: '' }] })}>
              <Icon name="plus" size={14} /> Add observation</button>}
          </Card>
        );
      })}
      <Card title="Additional reviewer notes" sub="Optional context for the facilitator. Shared only after reveal.">
        <textarea className="cx-textarea" value={ev.notes} disabled={readOnly} onChange={(e) => setEv({ ...ev, notes: e.target.value })} placeholder="Anything the facilitator should know" />
      </Card>
      <ErrorNote error={error} />
      {msg && <div className="cx-ok">{msg}</div>}
      {!readOnly && (
        <div className="cx-actions-row">
          <button className="cx-btn ghost" onClick={() => run(() => store.saveEvaluation(s.id, reviewer, ev), 'Draft saved. Only you can see it.')}>Save draft</button>
          <button className="cx-btn" onClick={() => setDialog({
            title: 'Submit and lock your evaluation?', confirm: 'Submit & lock',
            body: 'Your original verdicts and observations will be locked and cannot be edited afterwards.',
            onConfirm: () => { store.submitEvaluation(s.id, reviewer, ev); refresh(); },
          })}><Icon name="lock" size={14} /> Submit &amp; lock</button>
        </div>
      )}
      {locked && (
        <Card title="Review summary" sub="Your locked original submission.">
          <dl className="cx-dl">
            {SECTIONS.map((sec) => <div key={sec.id}><dt>{sec.name}<small>{mine.sections[sec.id].observations.length} observation(s)</small></dt><dd><Verdict value={mine.sections[sec.id].verdict} /></dd></div>)}
            <div><dt>Additional notes</dt><dd>{mine.notes || 'None'}</dd></div>
          </dl>
        </Card>
      )}
    </>
  );
}

function Evaluate({ s, reviewer, refresh, setDialog }) {
  const current = s.reviewers.includes(reviewer) ? reviewer : s.reviewers[0];
  return (
    <>
      <div className="cx-switch">
        <div><b><Icon name="flask" size={14} /> Prototype feature: switch reviewer</b><p>Simulates each reviewer’s view for demonstration. This is not real authentication.</p></div>
        <div className="cx-switch-btns">
          {s.reviewers.map((r) => <a key={r} className={r === current ? 'on' : ''} href={`#/calibration/${s.id}/evaluate/${r}`}><Icon name="lock" size={12} /> Reviewer {r}</a>)}
        </div>
      </div>
      <EvaluationForm key={`${current}-${s.submitted}`} s={s} reviewer={current} refresh={refresh} setDialog={setDialog} />
    </>
  );
}

/* ---------- 3. reveal & discussion ---------- */

function DiscussionLog({ s, refresh }) {
  const points = store.discussion(s.id);
  const blank = { section: 'soft', parameter: '', title: '', evidence: '', agreed: '', unresolved: '', clarification: '' };
  const [p, setP] = useState(blank);
  const [error, setError] = useState(null);
  const done = s.status === 'completed';
  const set = (k) => (e) => setP({ ...p, [k]: e.target.value });
  return (
    <Card title="Discussion log" sub="Capture each discussed observation. Saved separately from the original submissions.">
      {done && <div className="cx-notice info small">Session completed — the discussion log is read-only.</div>}
      {points.length > 0 && <div className="cx-eyebrow">Saved discussion points ({points.length})</div>}
      <ul className="cx-points">
        {points.map((d) => (
          <li key={d.id}>
            <div className="cx-point-meta"><span className="cx-pill">{sectionName(d.section)}</span><b>{d.parameter}</b><small>· {fmtStamp(d.at)}</small></div>
            <h4>{d.title}</h4>
            {d.evidence && <p><span className="cx-muted">Evidence:</span> {d.evidence}</p>}
            {d.agreed && <p className="agreed"><b>Agreed:</b> {d.agreed}</p>}
            {d.unresolved && <p className="unresolved"><b>Unresolved:</b> {d.unresolved}</p>}
            {d.clarification && <p className="clarify"><b>Clarification needed:</b> {d.clarification}</p>}
          </li>
        ))}
      </ul>
      {!done && (
        <div className="cx-form">
          <label>Section<select value={p.section} onChange={(e) => setP({ ...p, section: e.target.value, parameter: '' })}>{SECTIONS.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
          <label>QA parameter<select value={p.parameter} onChange={set('parameter')}><option value="">Select parameter</option>{SECTIONS.find((x) => x.id === p.section).params.map((x) => <option key={x}>{x}</option>)}</select></label>
          <label className="wide">Discussion point<input value={p.title} onChange={set('title')} placeholder="e.g. Empathy statement at 01:15–01:30" /></label>
          <label className="wide">Evidence<input value={p.evidence} onChange={set('evidence')} placeholder="Quote or timestamp discussed" /></label>
          <label className="wide">Agreed interpretation<textarea value={p.agreed} onChange={set('agreed')} /></label>
          <label>Unresolved disagreement<textarea value={p.unresolved} onChange={set('unresolved')} /></label>
          <label>Guideline clarification needed<textarea value={p.clarification} onChange={set('clarification')} /></label>
          <div className="wide"><ErrorNote error={error} />
            <button className="cx-btn" onClick={() => { setError(null); try { store.addDiscussionPoint(s.id, p); setP({ ...blank, section: p.section }); refresh(); } catch (e) { setError(e); } }}>
              <Icon name="plus" size={14} /> Save discussion point</button></div>
        </div>
      )}
    </Card>
  );
}

function FinalInterpretation({ s, analysis, refresh }) {
  const saved = store.finalInterpretation(s.id);
  const [f, setF] = useState(saved || { soft: '', tech: '', summary: '' });
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);
  const done = s.status === 'completed';
  return (
    <Card title="Final agreed interpretation" sub="The calibrated outcome. Stored separately — never overwrites original verdicts." className="final">
      <div className="cx-grid-2 tight">
        {analysis.sections.map((x) => (
          <div key={x.id} className="cx-final-sec">
            <div className="cx-label">{x.name} — agreed verdict</div>
            <small className="cx-muted">Original majority: {x.majority || 'no majority'}</small>
            <Toggle options={VERDICTS} value={f[x.id]} disabled={done} onChange={(v) => setF({ ...f, [x.id]: v })} label={`${x.name} agreed verdict`} />
          </div>
        ))}
      </div>
      <label className="cx-label">Summary of agreed interpretation</label>
      <textarea className="cx-textarea" value={f.summary} disabled={done} onChange={(e) => setF({ ...f, summary: e.target.value })} placeholder="What the group agreed, and why" />
      {saved && <small className="cx-muted">Saved {fmtStamp(saved.savedAt)}</small>}
      <ErrorNote error={error} />
      {msg && <div className="cx-ok">{msg}</div>}
      <div className="cx-actions-row">
        {!done && <button className="cx-btn ghost" onClick={() => { setError(null); try { store.saveFinal(s.id, f); setMsg('Final interpretation saved.'); refresh(); } catch (e) { setError(e); } }}>Save interpretation</button>}
        <a className="cx-btn" href={`#/calibration/${s.id}/summary`}>Continue to summary &amp; actions <Icon name="arrow" size={14} /></a>
      </div>
    </Card>
  );
}

function Reveal({ s, refresh, setDialog }) {
  if (!s.revealedAt) {
    const ready = s.submitted === s.required;
    return (
      <Card>
        <div className="cx-hidden-box">
          <Icon name="eyeOff" size={28} />
          <h3>Evaluations are hidden</h3>
          <p className="cx-muted">{ready ? 'All reviewers have submitted. Reveal to compare the original verdicts.' : `Reveal is available once every required reviewer has submitted. ${s.submitted} of ${s.required} submitted.`}</p>
          <button className="cx-btn" disabled={!ready} onClick={() => setDialog({
            title: 'Reveal evaluations?', confirm: 'Reveal evaluations',
            body: 'Every reviewer’s original verdicts and observations become visible for discussion. Original submissions stay locked.',
            onConfirm: () => { store.reveal(s.id); refresh(); },
          })}><Icon name="eye" size={14} /> Reveal evaluations</button>
        </div>
      </Card>
    );
  }
  const subs = store.revealedEvaluations(s.id);
  const analysis = analyse(subs);
  return (
    <>
      <div className="cx-notice reveal"><Icon name="eye" size={16} /><div>Evaluations revealed {fmtStamp(s.revealedAt)}. Original submissions are shown read-only.
        <a className="cx-btn small" href={`#/calibration/${s.id}/summary`}>Continue to summary <Icon name="arrow" size={12} /></a></div></div>
      <Card title="Original reviewer verdicts" sub="As submitted and locked by each reviewer, before any discussion.">
        <VerdictTable subs={subs} analysis={analysis} />
        <div className="cx-grid-2 tight">
          {analysis.sections.map((x) => (
            <div key={x.id} className={`cx-agree-card ${x.unanimous ? 'agreed' : 'split'}`}>
              <div><b>{x.name}</b><span className={`cx-agree ${x.unanimous ? 'agreed' : 'split'}`}>{x.unanimous ? 'Agreement' : 'Disagreement'}</span></div>
              <p>{sectionSentence(x)}</p>
            </div>
          ))}
        </div>
      </Card>
      {analysis.sections.map((x) => (
        <Card key={x.id} title={`${x.name} observations`} sub="Grouped by QA parameter with each reviewer’s evidence timestamp.">
          {x.params.length ? x.params.map((p) => (
            <div key={p.parameter} className="cx-param">
              <div className="cx-param-head"><b>{p.parameter}</b><span className={`cx-tag ${p.tag === 'Findings differ' ? 'differ' : p.tag === 'Findings agree' ? 'agree' : 'single'}`}>{p.tag}</span></div>
              {p.entries.map((e) => (
                <div key={e.id} className="cx-entry"><b>Reviewer {e.reviewer}</b><span className="mono">{e.timestamp}</span><Finding value={e.finding} /><p>{e.evidence}</p></div>
              ))}
            </div>
          )) : <p className="cx-muted">No observations recorded for this section.</p>}
        </Card>
      ))}
      {subs.some((x) => x.evaluation.notes) && (
        <Card title="Additional reviewer notes">
          <ul className="cx-notes">{subs.filter((x) => x.evaluation.notes).map((x) => <li key={x.reviewer}><b>Reviewer {x.reviewer}:</b> {x.evaluation.notes}</li>)}</ul>
        </Card>
      )}
      <DiscussionLog s={s} refresh={refresh} />
      <FinalInterpretation s={s} analysis={analysis} refresh={refresh} />
    </>
  );
}

/* ---------- 4. summary & actions ---------- */

function Actions({ s, refresh }) {
  const [a, setA] = useState({ description: '', owner: '', dueDate: '' });
  const [error, setError] = useState(null);
  const set = (k) => (e) => setA({ ...a, [k]: e.target.value });
  return (
    <Card title="Follow-up actions" sub="Add actions and update their status as they progress.">
      {s.actions.length ? (
        <table className="cx-table compact">
          <thead><tr><th>Action</th><th>Owner</th><th>Due date</th><th>Status</th></tr></thead>
          <tbody>{s.actions.map((x) => (
            <tr key={x.id}><td className="strong">{x.description}</td><td>{x.owner}</td><td>{fmtDate(x.dueDate)}</td>
              <td><select className={`cx-status-select act-${x.status}`} value={x.status} aria-label="Action status" onChange={(e) => { store.setActionStatus(x.id, e.target.value); refresh(); }}>
                {Object.entries(ACTION_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></td></tr>
          ))}</tbody>
        </table>
      ) : <p className="cx-muted">No follow-up actions yet.</p>}
      <div className="cx-form actions">
        <label className="wide"><span>Action description<span className="req">*</span></span><input value={a.description} onChange={set('description')} placeholder="e.g. Coach the agent on the hold procedure" /></label>
        <label><span>Assigned owner<span className="req">*</span></span><select value={a.owner} onChange={set('owner')}><option value="">Select owner</option>{OWNERS.map((o) => <option key={o}>{o}</option>)}</select></label>
        <label><span>Due date<span className="req">*</span></span><input type="date" value={a.dueDate} onChange={set('dueDate')} /></label>
        <div className="wide"><ErrorNote error={error} />
          <button className="cx-btn" onClick={() => { setError(null); try { store.addAction(s.id, a); setA({ description: '', owner: '', dueDate: '' }); refresh(); } catch (e) { setError(e); } }}><Icon name="plus" size={14} /> Add action</button></div>
      </div>
      <p className="cx-muted small">Original verdicts and discussion are locked; actions remain editable.</p>
    </Card>
  );
}

function Summary({ s, refresh, setDialog }) {
  if (!s.revealedAt) return <Empty title="Summary is available after the reveal">Every reviewer must submit, then the facilitator reveals the evaluations.</Empty>;
  const subs = store.revealedEvaluations(s.id);
  const analysis = analyse(subs);
  const final = store.finalInterpretation(s.id);
  const points = store.discussion(s.id);
  const agree = [];
  const differ = [];
  for (const x of analysis.sections) {
    if (x.unanimous) agree.push([`${x.name} — all reviewers selected ${x.verdicts[0].verdict}`, null]);
    else differ.push([`${x.name} — ${x.verdicts.map((v) => `${v.reviewer}: ${v.verdict}`).join(' · ')}`, null]);
    for (const p of x.params.filter((pp) => pp.compared)) {
      if (p.agree) agree.push([`${p.parameter} (${x.name})`, `${p.findings.length} reviewers · ${p.findings[0].finding}`]);
      else differ.push([`${p.parameter} (${x.name})`, p.findings.map((f) => `${f.reviewer}: ${f.finding}`).join(' · ')]);
    }
  }
  const open = points.filter((d) => d.unresolved || d.clarification);
  return (
    <>
      {s.status === 'completed'
        ? <div className="cx-notice done"><Icon name="done" size={16} /> Session completed {fmtStamp(s.completedAt)}. Follow-up action statuses can still be updated.</div>
        : (
          <div className="cx-notice reveal"><Icon name="flask" size={16} /><div>Record the final agreed interpretation, add follow-up actions, then mark the session completed.
            <button className="cx-btn small" onClick={() => setDialog({
              title: 'Mark this session completed?', confirm: 'Mark completed',
              body: 'The discussion log and final interpretation become read-only. Follow-up actions stay editable.',
              onConfirm: () => { store.complete(s.id); refresh(); },
            })}><Icon name="check" size={12} /> Mark session completed</button></div></div>
        )}
      <div className="cx-grid-side">
        <Card title="Session details">
          <dl className="cx-dl">
            {[['Session', s.name], ['Date & time', `${fmtDate(s.date)} · ${fmtTime(s.time)}`], ['Facilitator', s.facilitator],
              ['Reviewers', s.reviewers.map((r) => `Reviewer ${r}`).join(', ')], ['Revealed', fmtStamp(s.revealedAt)], ['Connection ID', <span className="mono" key="c">{s.connectionId}</span>]]
              .map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
          </dl>
        </Card>
        <Card title="Final agreed interpretation" sub="Recorded separately from original submissions." className="final">
          {final && (final.soft || final.tech) ? (
            <>
              <div className="cx-final-row">{SECTIONS.map((x) => <div key={x.id}><span className="cx-eyebrow">{x.name}</span><Verdict value={final[x.id]} /></div>)}</div>
              {final.summary && <p>{final.summary}</p>}
            </>
          ) : <p className="cx-muted">Not recorded yet. <a className="cx-link" href={`#/calibration/${s.id}/reveal`}>Record it on Reveal &amp; discussion</a>.</p>}
          {points.some((d) => d.agreed) && (
            <>
              <div className="cx-eyebrow">Agreed interpretations from discussion</div>
              <ul className="cx-notes">{points.filter((d) => d.agreed).map((d) => <li key={d.id}><b>{d.parameter}:</b> {d.agreed}</li>)}</ul>
            </>
          )}
        </Card>
      </div>
      <Card title="All original reviewer verdicts" sub="Locked submissions — unchanged by discussion.">
        <VerdictTable subs={subs} analysis={analysis} />
      </Card>
      <div className="cx-grid-2">
        <Card title="Areas of agreement">
          {agree.length ? <ul className="cx-areas agree">{agree.map(([t, d]) => <li key={t}><b>{t}</b>{d && <small>{d}</small>}</li>)}</ul> : <p className="cx-muted">None.</p>}
        </Card>
        <Card title="Areas of disagreement">
          {differ.length ? <ul className="cx-areas differ">{differ.map(([t, d]) => <li key={t}><b>{t}</b>{d && <small>{d}</small>}</li>)}</ul> : <p className="cx-muted">None.</p>}
        </Card>
      </div>
      <Card title="Unresolved questions">
        {open.length ? (
          <ul className="cx-points">{open.map((d) => (
            <li key={d.id}><h4>{d.parameter}</h4>
              {d.unresolved && <p className="unresolved"><b>Disagreement:</b> {d.unresolved}</p>}
              {d.clarification && <p className="clarify"><b>Clarification:</b> {d.clarification}</p>}</li>
          ))}</ul>
        ) : <p className="cx-muted">No unresolved questions.</p>}
      </Card>
      <Actions s={s} refresh={refresh} />
    </>
  );
}

/* ---------- page ---------- */

export function SessionPage({ id, tab, reviewer, refresh, setDialog }) {
  let s;
  try { s = store.get(id); } catch {
    return <Empty title="Calibration session not found"><a className="cx-link" href="#/calibration">Back to sessions</a></Empty>;
  }
  if (s.status === 'draft') {
    return <Empty title="This session is still a draft"><a className="cx-link" href={`#/calibration/${id}/edit`}>Continue the draft</a> to publish it.</Empty>;
  }
  return (
    <>
      <a className="cx-back" href="#/calibration"><Icon name="back" size={14} /> All calibration sessions</a>
      <div className="cx-session-head">
        <div>
          <h1>{s.name}</h1>
          <div className="cx-meta">Connection ID <span className="mono cx-chip">{s.connectionId}</span><span>{fmtDate(s.date)} · {fmtTime(s.time)}</span><span>Facilitator: <b>{s.facilitator}</b></span></div>
        </div>
        <StatusBadge status={s.status} />
      </div>
      <nav className="cx-tabs">
        {TABS.map(([key, label], i) => (
          <a key={key} href={`#/calibration/${id}${key === 'details' ? '' : `/${key}`}`} className={`${tab === key ? 'on' : ''} ${tabDone(s, key) && tab !== key ? 'done' : ''}`}>
            <span className="n">{tabDone(s, key) && tab !== key ? <Icon name="check" size={12} /> : i + 1}</span>{label}
          </a>
        ))}
      </nav>
      {tab === 'evaluate' ? <Evaluate s={s} reviewer={reviewer} refresh={refresh} setDialog={setDialog} />
        : tab === 'reveal' ? <Reveal key={`${s.status}`} s={s} refresh={refresh} setDialog={setDialog} />
          : tab === 'summary' ? <Summary s={s} refresh={refresh} setDialog={setDialog} />
            : <Details s={s} />}
    </>
  );
}
