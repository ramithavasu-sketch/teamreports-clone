import { useState } from 'react';
import { api } from './store.js';
import { ACTION_KINDS, NOTE_KINDS, SHARE_TARGETS } from './service.js';
import { criteriaOf, ratingOptions, categoryVerdict, overallPercent, NA } from './scorecards.js';
import { CALL_LIBRARY } from './callLibrary.js';
import { qaStaff } from './people.js';
import { useLoad, FormatBadge, StatusBadge, PersonChip, fmtDate, Loading, ErrorBox, Empty, Dialog } from './ui.jsx';

const ACTIVE = ['discussion', 'in_progress', 'awaiting_final_decision'];

/* ---------- four universal steps ---------- */

function stepOf(v) {
  const s = v.status;
  if (s === 'completed') return 5;
  if (s === 'awaiting_final_decision') return 4;
  if (s === 'discussion' || s === 'in_progress') return 3;
  if (s === 'awaiting_submissions' || s === 'ready_to_reveal') return 2;
  return 1;
}

function Steps({ v }) {
  const labels = ['Share the call and scorecard',
    v.format === 'blind' ? 'Review independently' : v.needsSubmissions ? 'Pre-review, then meet' : 'Review together',
    v.needsSubmissions ? 'Reveal and discuss differences' : 'Discuss differences', 'Agree, document, communicate'];
  const cur = v.status === 'cancelled' ? 0 : stepOf(v);
  return (
    <ol className="cal-steps">
      {labels.map((l, i) => <li key={l} className={i + 1 < cur ? 'done' : i + 1 === cur ? 'now' : ''}><span>{i + 1 < cur ? '✓' : i + 1}</span>{l}</li>)}
    </ol>
  );
}

/* ---------- rating input ---------- */

function RatingPicker({ scorecard, value, onChange, disabled, label }) {
  const opts = ratingOptions(scorecard);
  if (scorecard.type === 'numeric') {
    return (
      <select value={value || ''} onChange={(e) => onChange(e.target.value)} disabled={disabled} aria-label={label}>
        <option value="">–</option>
        {opts.map((o) => <option key={o} value={o}>{o === NA ? 'N/A' : `${o} / ${scorecard.max}`}</option>)}
      </select>
    );
  }
  return (
    <div className="cal-seg" role="radiogroup" aria-label={label}>
      {opts.map((o) => (
        <button key={o} type="button" role="radio" aria-checked={value === o} disabled={disabled}
          className={`${value === o ? 'on' : ''} r-${o.replace(/\W/g, '')}`} onClick={() => onChange(o)}>{o}</button>
      ))}
    </div>
  );
}

const Rating = ({ value }) => value ? <span className={`cal-rating r-${String(value).replace(/\W/g, '')}`}>{value}</span> : <span className="muted">–</span>;

/* ---------- independent scorecard ---------- */

function ScorecardForm({ v, viewer, reload, setDialog }) {
  const sc = v.scorecard;
  const [ratings, setRatings] = useState(v.mySubmission?.ratings || {});
  const [overall, setOverall] = useState(v.mySubmission?.overallComment || '');
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);
  const crit = criteriaOf(sc);
  const done = crit.filter((c) => ratings[c.id]?.value).length;
  const set = (cid, k, val) => setRatings({ ...ratings, [cid]: { ...ratings[cid], [k]: val } });
  const saveDraft = async () => {
    setError(null);
    try { await api.saveSubmission(viewer, v.id, { ratings, overallComment: overall }); setMsg('Draft saved. Only you can see it.'); } catch (e) { setError(e); }
  };
  return (
    <section className="cal-panel">
      <div className="cal-panel-head"><h3>Your scorecard</h3><span className="muted">{done} of {crit.length} rated</span></div>
      <p className="muted">Score on your own. Other reviewers cannot see your answers, and you cannot see theirs, until the reveal.</p>
      {sc.categories.map((cat) => (
        <div key={cat.id} className="cal-cat">
          <h4>{cat.name}</h4>
          {cat.criteria.map((c) => (
            <div key={c.id} className="cal-crit">
              <div className="cal-crit-name"><b>{c.name}</b><small className="muted">{c.guide}</small></div>
              <RatingPicker scorecard={sc} value={ratings[c.id]?.value} onChange={(val) => set(c.id, 'value', val)} label={c.name} />
              <div className="cal-crit-extra">
                <input placeholder="Comment" value={ratings[c.id]?.comment || ''} onChange={(e) => set(c.id, 'comment', e.target.value)} aria-label={`${c.name} comment`} />
                <input placeholder="Evidence e.g. 01:52" className="ts" value={ratings[c.id]?.evidence || ''} onChange={(e) => set(c.id, 'evidence', e.target.value)} aria-label={`${c.name} evidence`} />
              </div>
            </div>
          ))}
        </div>
      ))}
      <label className="cal-field">Overall comment<textarea value={overall} onChange={(e) => setOverall(e.target.value)} /></label>
      <ErrorBox error={error} />
      {msg && <p className="ok">{msg}</p>}
      <div className="cal-form-actions">
        <button className="cal-btn ghost" onClick={saveDraft}>Save draft</button>
        <button className="cal-btn" disabled={done < crit.length} title={done < crit.length ? 'Rate every item first' : ''}
          onClick={() => setDialog({
            title: 'Submit your scorecard?', confirmLabel: 'Submit and lock',
            body: 'Once submitted your verdict is locked. Only a QA Lead can reopen it, with a reason that is recorded.',
            onConfirm: async () => { await api.submit(viewer, v.id, { ratings, overallComment: overall }); reload(); },
          })}>Submit verdict</button>
      </div>
    </section>
  );
}

function LockedSubmission({ v }) {
  const sub = v.mySubmission;
  const sc = v.scorecard;
  return (
    <section className="cal-panel">
      <div className="cal-panel-head">
        <h3>Your scorecard</h3>
        <span className="cal-lock">🔒 {sub.status === 'closed' ? 'Closed at the reveal (not submitted)' : `Submitted ${fmtDate(sub.submittedAt)}, locked`}</span>
      </div>
      <table className="cal-table">
        <tbody>
          {criteriaOf(sc).map((c) => (
            <tr key={c.id}><td className="left">{c.name}</td><td><Rating value={sub.ratings[c.id]?.value} /></td>
              <td className="left muted">{sub.ratings[c.id]?.comment}{sub.ratings[c.id]?.evidence && <span className="mono"> @{sub.ratings[c.id].evidence}</span>}</td></tr>
          ))}
        </tbody>
      </table>
      {sub.overallComment && <p className="muted">“{sub.overallComment}”</p>}
      {sub.history?.length > 0 && <p className="muted">Reopened {sub.history.length}× by a QA Lead. Earlier versions are kept.</p>}
    </section>
  );
}

/* ---------- reveal / comparison ---------- */

function Comparison({ v }) {
  const c = v.comparison;
  const [showComments, setShowComments] = useState(false);
  if (!c) return null;
  const revs = v.submissions;
  return (
    <section className="cal-panel">
      <div className="cal-panel-head"><h3>Results: reviewer verdicts compared</h3><span className="muted">Baseline {v.baseline}%</span></div>
      {v.revealException && <p className="cal-note">⚠ Revealed early by exception: “{v.revealException.reason}”. Not submitted: {v.revealException.missing.join(', ') || 'none'}.</p>}
      <div className="cal-stats small">
        <div className="cal-stat"><span>Reviewers</span><b>{revs.length}/{v.participants.filter((p) => p.role === 'QA Reviewer').length}</b></div>
        <div className="cal-stat"><span>Agreement</span><b>{c.agreementPct ?? '–'}{c.agreementPct !== null && <small>%</small>}</b></div>
        <div className="cal-stat"><span>Overall score spread</span><b>{c.overallSpread ?? '–'}{c.overallSpread !== null && <small> pts</small>}</b></div>
        <div className="cal-stat"><span>Over baseline</span><b className={c.flaggedCount ? 'orange' : ''}>{c.flaggedCount}</b></div>
        {c.finalOverall !== null && <div className="cal-stat"><span>Agreed score</span><b className="blue">{c.finalOverall}<small>%</small></b></div>}
      </div>
      <div className="scroll-x">
        <table className="cal-table">
          <thead><tr><th className="left">Criterion</th>{revs.map((r) => <th key={r.reviewerId}>{r.reviewerName.split(' ')[0]}</th>)}<th>Agreement</th><th>Variance</th><th>Agreed</th></tr></thead>
          <tbody>
            {c.criteria.map((row) => {
              const ag = row.finalAgreement || row.agreement;
              return (
                <tr key={row.id} className={row.flagged ? 'flagged' : ''}>
                  <td className="left"><small className="muted">{row.categoryName}</small><br />{row.name}</td>
                  {row.values.map((x) => <td key={x.reviewerId}><Rating value={x.value} /></td>)}
                  <td title={row.finalAgreement ? 'Matches with the agreed rating' : 'Share giving the most common rating'}>{ag.matching}/{ag.total} <small className="muted">({ag.pct}%)</small></td>
                  <td>{row.variancePct}%{row.flagged && <span className="cal-flag" title="Above baseline">▲</span>}</td>
                  <td><Rating value={row.final} /></td>
                </tr>
              );
            })}
            <tr className="total"><td className="left"><b>Overall score</b></td>{c.reviewers.map((r) => <td key={r.reviewerId}><b>{r.overall ?? '–'}%</b>{r.diffFromFinal !== null && <small className="muted"><br />±{r.diffFromFinal}</small>}</td>)}
              <td /><td>{c.overallSpread ?? '–'}</td><td><b>{c.finalOverall ?? '–'}{c.finalOverall !== null && '%'}</b></td></tr>
          </tbody>
        </table>
      </div>
      <p className="cal-method">
        {v.scorecard.type === 'categorical'
          ? 'Agreement = reviewers giving the most common rating (or the agreed rating, once recorded) ÷ reviewers. Variance = 100% − agreement. N/A counts as its own rating.'
          : 'Variance = (highest − lowest) ÷ max points, or the largest distance from the agreed score once recorded. A mix of N/A and points counts as 100%.'}
        {' '}The majority is shown for reference only; it never replaces the recorded decision.
      </p>
      <button className="link" onClick={() => setShowComments(!showComments)}>{showComments ? 'Hide' : 'Show'} reviewer comments</button>
      {showComments && (
        <div className="cal-comments">
          {revs.map((r) => (
            <div key={r.reviewerId}>
              <PersonChip id={r.reviewerId} small /> <small className="muted">submitted {fmtDate(r.submittedAt)}{r.reopened ? ` · reopened ${r.reopened}×` : ''}</small>
              <ul>
                {Object.entries(r.ratings).filter(([, x]) => x.comment || x.evidence).map(([cid, x]) => (
                  <li key={cid}><b>{criteriaOf(v.scorecard).find((c) => c.id === cid)?.name}:</b> {x.comment} {x.evidence && <span className="mono">@{x.evidence}</span>}</li>
                ))}
                {r.overallComment && <li><i>{r.overallComment}</i></li>}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ---------- discussion ---------- */

function Discussion({ v, viewer, reload }) {
  const [form, setForm] = useState({ body: '', kind: 'note', criterionId: '', timestamp: '', private: false });
  const [error, setError] = useState(null);
  const open = ACTIVE.includes(v.status);
  const crit = criteriaOf(v.scorecard);
  const qaSide = !v.roles.agent || v.roles.manager;
  const add = async () => {
    setError(null);
    try { await api.addNote(viewer, v.id, form); setForm({ ...form, body: '', timestamp: '' }); reload(); } catch (e) { setError(e); }
  };
  if (!open && !v.notes.length) return null;
  return (
    <section className="cal-panel">
      <div className="cal-panel-head"><h3>Discussion and evidence</h3><span className="muted">{v.notes.length} notes</span></div>
      {v.notes.length ? (
        <ul className="cal-notes">
          {v.notes.map((n) => (
            <li key={n.id} className={`kind-${n.kind}`}>
              <div className="cal-note-meta">
                <PersonChip id={n.authorId} name={n.authorName} small />
                <span className={`cal-kind kind-${n.kind}`}>{NOTE_KINDS[n.kind]}</span>
                {n.criterionId && <span className="muted">{crit.find((c) => c.id === n.criterionId)?.name}</span>}
                {n.timestamp && <span className="mono">@{n.timestamp}</span>}
                {n.private && <span className="cal-lock" title="Hidden from the agent">🔒 QA only</span>}
                <small className="muted">{fmtDate(n.at)}</small>
              </div>
              <p>{n.body}</p>
            </li>
          ))}
        </ul>
      ) : <p className="muted">No notes yet. Share observations, evidence timestamps and disputed items here.</p>}
      {open && (
        <div className="cal-note-form">
          <textarea placeholder="Share an observation, evidence or a disputed point…" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} aria-label="New note" />
          <div className="cal-inline">
            <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} aria-label="Note type">
              {Object.entries(NOTE_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <select value={form.criterionId} onChange={(e) => setForm({ ...form, criterionId: e.target.value })} aria-label="Scorecard item">
              <option value="">Any item</option>
              {crit.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input className="ts" placeholder="mm:ss" value={form.timestamp} onChange={(e) => setForm({ ...form, timestamp: e.target.value })} aria-label="Timestamp" />
            {v.format === 'agent' && qaSide && <label className="check"><input type="checkbox" checked={form.private} onChange={(e) => setForm({ ...form, private: e.target.checked })} /> QA only (hide from agent)</label>}
            <button className="cal-btn" onClick={add} disabled={!form.body.trim()}>Add</button>
          </div>
          <ErrorBox error={error} />
        </div>
      )}
    </section>
  );
}

/* ---------- decision ---------- */

function DecisionEditor({ v, viewer, reload, setDialog }) {
  const sc = v.scorecard;
  const d = v.decision || {};
  const [ratings, setRatings] = useState(d.ratings || {});
  const [txt, setTxt] = useState({
    rationale: d.rationale || '', learningPoints: d.learningPoints || '', rubricClarifications: d.rubricClarifications || '', internalNotes: d.internalNotes || '',
    coachingPoints: d.coachingPoints || '', agreedExpectations: d.agreedExpectations || '',
  });
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);
  const cmp = v.comparison;
  const set = (cid, k, val) => setRatings({ ...ratings, [cid]: { ...ratings[cid], [k]: val } });
  const save = async () => {
    setError(null);
    setMsg(null);
    try { await api.saveDecision(viewer, v.id, { ratings, ...txt }); setMsg('Decision saved.'); reload(); } catch (e) { setError(e); throw e; }
  };
  const finalizeDialog = () => setDialog({
    title: 'Finalize the calibration?',
    body: 'The final decision is stored separately from the original reviewer verdicts and the session is closed.',
    confirmLabel: 'Finalize',
    initial: { consensus: v.status === 'awaiting_final_decision' && v.canManage ? 'lead_decision' : 'consensus', leadReason: '', shareWith: v.format === 'agent' ? ['participants', 'agent'] : ['participants'] },
    render: (vals, setVals) => (
      <div className="cal-dialog-fields">
        <label className="check"><input type="radio" checked={vals.consensus === 'consensus'} onChange={() => setVals({ ...vals, consensus: 'consensus' })} /> The group reached consensus</label>
        <label className={`check ${v.canManage ? '' : 'disabled'}`}><input type="radio" disabled={!v.canManage} checked={vals.consensus === 'lead_decision'} onChange={() => setVals({ ...vals, consensus: 'lead_decision' })} /> No consensus: QA Lead makes the final call{!v.canManage && ' (QA Lead only)'}</label>
        {vals.consensus === 'lead_decision' && (
          <label className="cal-field">Why the QA Lead made this decision<textarea value={vals.leadReason} onChange={(e) => setVals({ ...vals, leadReason: e.target.value })} /></label>
        )}
        <b>Share the outcome with</b>
        {Object.entries(SHARE_TARGETS).filter(([k]) => k !== 'agent' || v.format === 'agent').map(([k, l]) => (
          <label key={k} className="check"><input type="checkbox" checked={vals.shareWith.includes(k)} onChange={(e) => setVals({ ...vals, shareWith: e.target.checked ? [...vals.shareWith, k] : vals.shareWith.filter((x) => x !== k) })} /> {l}</label>
        ))}
      </div>
    ),
    onConfirm: async ({ values }) => { await save(); await api.finalize(viewer, v.id, values); reload(); },
  });

  return (
    <section className="cal-panel decision">
      <div className="cal-panel-head"><h3>{v.format === 'agent' ? 'Agreed outcome and coaching' : 'Final agreed decision'}</h3>
        {d.updatedAt && <span className="muted">Last saved {fmtDate(d.updatedAt)}</span>}</div>
      {v.escalation && <p className="cal-note">Sent to the QA Lead: “{v.escalation.reason}”</p>}
      <p className="muted">Record the team’s agreed rating for each item. Flagged and disputed items need a resolution note.</p>
      {sc.categories.map((cat) => (
        <div key={cat.id} className="cal-cat">
          <h4>{cat.name} {cat.criteria.some((c) => ratings[c.id]?.value) && <span className="muted">→ {categoryVerdict(sc, ratings, cat.id)}</span>}</h4>
          {cat.criteria.map((c) => {
            const row = cmp?.criteria.find((x) => x.id === c.id);
            const needsNote = row?.flagged || ratings[c.id]?.disputed;
            return (
              <div key={c.id} className={`cal-crit ${row?.flagged ? 'flagged' : ''}`}>
                <div className="cal-crit-name"><b>{c.name}</b>
                  {row && <small className="muted">Most common: {row.agreement.modal} ({row.agreement.matching}/{row.agreement.total}){row.flagged && <span className="cal-flag"> ▲ above baseline</span>}</small>}
                </div>
                <RatingPicker scorecard={sc} value={ratings[c.id]?.value} onChange={(val) => set(c.id, 'value', val)} label={`Agreed rating: ${c.name}`} />
                <div className="cal-crit-extra">
                  <input placeholder={needsNote ? 'Resolution note (required)' : 'Resolution note'} className={needsNote && !ratings[c.id]?.resolution ? 'need' : ''}
                    value={ratings[c.id]?.resolution || ''} onChange={(e) => set(c.id, 'resolution', e.target.value)} aria-label={`${c.name} resolution`} />
                  <label className="check"><input type="checkbox" checked={!!ratings[c.id]?.disputed} onChange={(e) => set(c.id, 'disputed', e.target.checked)} /> Disputed</label>
                </div>
              </div>
            );
          })}
        </div>
      ))}
      <div className="cal-grid-2">
        <label className="cal-field wide">Rationale for the decision<textarea value={txt.rationale} onChange={(e) => setTxt({ ...txt, rationale: e.target.value })} /></label>
        {v.format === 'agent' && <>
          <label className="cal-field">Coaching points (shared with the agent)<textarea value={txt.coachingPoints} onChange={(e) => setTxt({ ...txt, coachingPoints: e.target.value })} /></label>
          <label className="cal-field">Agreed expectations<textarea value={txt.agreedExpectations} onChange={(e) => setTxt({ ...txt, agreedExpectations: e.target.value })} /></label>
        </>}
        <label className="cal-field">Learning points<textarea value={txt.learningPoints} onChange={(e) => setTxt({ ...txt, learningPoints: e.target.value })} /></label>
        <label className="cal-field">Rubric clarifications / documentation updates<textarea value={txt.rubricClarifications} onChange={(e) => setTxt({ ...txt, rubricClarifications: e.target.value })} /></label>
        <label className="cal-field wide">Internal QA notes (never shown to the agent)<textarea value={txt.internalNotes} onChange={(e) => setTxt({ ...txt, internalNotes: e.target.value })} /></label>
      </div>
      <ErrorBox error={error} />
      {msg && <p className="ok">{msg}</p>}
      <div className="cal-form-actions">
        {v.status !== 'awaiting_final_decision' && (
          <button className="cal-btn ghost" onClick={() => setDialog({
            title: 'Send to the QA Lead?', body: 'Use this when the group cannot reach consensus. A QA Lead will make the final call.',
            reason: { label: 'Where did the group disagree?', min: 5 }, confirmLabel: 'Send to QA Lead',
            onConfirm: async ({ reason }) => { await save(); await api.escalate(viewer, v.id, reason); reload(); },
          })}>Consensus stalled</button>
        )}
        {v.status === 'awaiting_final_decision' && <button className="cal-btn ghost" onClick={async () => { await api.resumeDiscussion(viewer, v.id); reload(); }}>Back to discussion</button>}
        <button className="cal-btn ghost" onClick={() => save().catch(() => {})}>Save decision</button>
        <button className="cal-btn" onClick={finalizeDialog}>Finalize…</button>
      </div>
    </section>
  );
}

function DecisionView({ v }) {
  const d = v.decision;
  if (!d) return null;
  const sc = v.scorecard;
  const qa = !!d.consensus || d.internalNotes !== undefined;
  return (
    <section className="cal-panel decision">
      <div className="cal-panel-head"><h3>{v.status === 'completed' ? 'Final calibration outcome' : 'Decision in progress'}</h3>
        {d.finalizedAt && <span className="muted">Finalized {fmtDate(d.finalizedAt)}{v.decisionByName && ` by ${v.decisionByName}`}</span>}</div>
      {d.consensus === 'lead_decision' && <p className="cal-note">QA Lead decision (no consensus): “{d.leadReason}”</p>}
      {sc.type === 'categorical' && (
        <div className="cal-stats small">
          {sc.categories.map((cat) => <div key={cat.id} className="cal-stat"><span>{cat.name}</span><b><Rating value={categoryVerdict(sc, d.ratings, cat.id)} /></b></div>)}
          <div className="cal-stat"><span>Overall</span><b>{overallPercent(sc, d.ratings) ?? '–'}<small>%</small></b></div>
        </div>
      )}
      <table className="cal-table">
        <tbody>
          {criteriaOf(sc).map((c) => (
            <tr key={c.id}><td className="left">{c.name}</td><td><Rating value={d.ratings?.[c.id]?.value} /></td>
              <td className="left muted">{d.ratings?.[c.id]?.disputed && <span className="cal-kind kind-dispute">Disputed</span>} {d.ratings?.[c.id]?.resolution}</td></tr>
          ))}
        </tbody>
      </table>
      <dl className="cal-dl">
        {[['Rationale', d.rationale], ['Coaching points', d.coachingPoints], ['Agreed expectations', d.agreedExpectations], ['Learning points', d.learningPoints],
          ['Rubric clarifications', d.rubricClarifications], ['Internal QA notes', d.internalNotes]].filter(([, x]) => x).map(([k, x]) => <div key={k}><dt>{k}</dt><dd>{x}</dd></div>)}
        {qa && d.shareWith && <div><dt>Shared with</dt><dd>{d.shareWith.map((t) => SHARE_TARGETS[t]).join(', ') || 'Nobody'}</dd></div>}
      </dl>
    </section>
  );
}

// What the agent sees: their original QA evaluation next to the calibration outcome.
function AgentOutcome({ v }) {
  const o = v.call?.originalEvaluation;
  const d = v.decision;
  if (!o) return null;
  const sc = v.scorecard;
  return (
    <section className="cal-panel">
      <div className="cal-panel-head"><h3>Original QA evaluation vs. calibration outcome</h3></div>
      <table className="cal-table">
        <thead><tr><th className="left" /><th>Original evaluation</th><th>After calibration</th></tr></thead>
        <tbody>
          <tr><td className="left">Soft Skills</td><td><Rating value={o.soft} /></td><td>{d ? <Rating value={categoryVerdict(sc, d.ratings, 'soft')} /> : <span className="muted">Pending</span>}</td></tr>
          <tr><td className="left">Technical Skills</td><td><Rating value={o.tech} /></td><td>{d ? <Rating value={categoryVerdict(sc, d.ratings, 'tech')} /> : <span className="muted">Pending</span>}</td></tr>
          <tr><td className="left">Note</td><td className="left muted">{o.note}</td><td className="left muted">{d?.rationale || ''}</td></tr>
        </tbody>
      </table>
      {!d && v.roles.agent && <p className="muted">The outcome appears here once the facilitator finalizes the session and shares it with you.</p>}
    </section>
  );
}

/* ---------- action items ---------- */

function Actions({ v, viewer, reload }) {
  const [form, setForm] = useState({ body: '', ownerId: '', dueDate: '', kind: v.format === 'agent' ? 'coaching' : 'followup' });
  const [error, setError] = useState(null);
  const canAdd = v.canRun && !['draft', 'cancelled'].includes(v.status);
  if (!canAdd && !v.actions.length) return null;
  const owners = [...qaStaff(), ...v.participants.filter((p) => p.role === 'Agent')];
  const today = new Date().toISOString().slice(0, 10);
  const add = async () => {
    setError(null);
    try { await api.addAction(viewer, v.id, form); setForm({ ...form, body: '', dueDate: '' }); reload(); } catch (e) { setError(e); }
  };
  return (
    <section className="cal-panel">
      <div className="cal-panel-head"><h3>Action items and follow-ups</h3><span className="muted">{v.actions.filter((a) => a.status === 'open').length} open</span></div>
      {v.actions.length ? (
        <ul className="cal-actions">
          {v.actions.map((a) => (
            <li key={a.id} className={a.status}>
              <input type="checkbox" checked={a.status === 'done'} disabled={!a.canToggle} aria-label={`Mark ${a.body} done`}
                onChange={async (e) => { try { await api.setActionDone(viewer, a.id, e.target.checked); reload(); } catch (err) { setError(err); } }} />
              <div><span>{a.body}</span>
                <small className="muted"> {ACTION_KINDS[a.kind]} · {a.ownerName}{a.dueDate && <> · due <span className={a.status === 'open' && a.dueDate < today ? 'orange' : ''}>{a.dueDate}</span></>}</small></div>
            </li>
          ))}
        </ul>
      ) : <p className="muted">No action items yet.</p>}
      {canAdd && (
        <div className="cal-inline wrap">
          <input placeholder="New action, coaching point or rubric update" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} aria-label="Action" className="grow" />
          <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} aria-label="Action type">
            {Object.entries(ACTION_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <select value={form.ownerId} onChange={(e) => setForm({ ...form, ownerId: e.target.value })} aria-label="Owner">
            <option value="">Owner</option>{owners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} aria-label="Follow-up date" />
          <button className="cal-btn" disabled={!form.body.trim() || !form.ownerId} onClick={add}>Add</button>
        </div>
      )}
      <ErrorBox error={error} />
    </section>
  );
}

/* ---------- side panel ---------- */

function CallPanel({ v }) {
  const [showT, setShowT] = useState(false);
  const c = v.call;
  if (!c) return <section className="cal-side"><h4>Call</h4><p className="muted">No call selected yet.</p></section>;
  return (
    <section className="cal-side">
      <h4>Call</h4>
      <dl className="cal-kv">
        <dt>Connection ID</dt><dd className="mono">{c.connectionId}</dd>
        <dt>Agent</dt><dd>{c.agentName}</dd>
        <dt>Date</dt><dd>{c.date} · {c.duration}</dd>
        <dt>Queue</dt><dd>{c.queue}</dd>
        <dt>Customer</dt><dd>{c.customer}</dd>
      </dl>
      {c.recordingUrl ? <audio controls src={c.recordingUrl} className="cal-audio" /> : (
        <p className="cal-note small">No recording to play. {CALL_LIBRARY.connected ? 'The Call Library has no audio for this call.' : 'This is a sample record; real calls play through the Call Library player once it is connected.'}</p>
      )}
      <button className="link" onClick={() => setShowT(!showT)}>{showT ? 'Hide' : 'Show'} transcript</button>
      {showT && <ul className="cal-transcript">{c.transcript.map((l) => <li key={l.t}><span className="mono">{l.t}</span> <b>{l.who}:</b> {l.text}</li>)}</ul>}
      {c.originalEvaluation && v.format !== 'agent' && (
        <p className="muted small">Original evaluation: Soft <Rating value={c.originalEvaluation.soft} /> Tech <Rating value={c.originalEvaluation.tech} /></p>
      )}
    </section>
  );
}

function MeetingPanel({ v, viewer, reload }) {
  const [edit, setEdit] = useState(false);
  const [link, setLink] = useState(v.meetingLink || '');
  const [error, setError] = useState(null);
  if (v.format === 'blind' && !v.meetingLink && !v.canRun) return null;
  return (
    <section className="cal-side">
      <h4>Meeting</h4>
      {!edit && (v.meetingLink ? <a href={v.meetingLink} target="_blank" rel="noreferrer noopener">Join meeting ↗</a> : <p className="muted">No meeting link yet.</p>)}
      {!edit && v.canRun && !['completed', 'cancelled'].includes(v.status) && <button className="link" onClick={() => setEdit(true)}>{v.meetingLink ? 'Change link' : 'Add Google Meet link'}</button>}
      {edit && (
        <div className="cal-inline wrap">
          <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://meet.google.com/…" aria-label="Meeting link" className="grow" />
          <button className="cal-btn" onClick={async () => { setError(null); try { await api.updateMeetingLink(viewer, v.id, link); setEdit(false); reload(); } catch (e) { setError(e); } }}>Save</button>
        </div>
      )}
      <ErrorBox error={error} />
      <p className="muted small">Team Reports does not host calls; use your usual meeting tool.</p>
    </section>
  );
}

const SUB_LABEL = { not_started: 'Not started', draft: 'In progress', submitted: 'Submitted', closed: 'Not submitted' };

function Participants({ v, viewer, reload }) {
  const canMark = v.canRun && ACTIVE.includes(v.status);
  const mark = async (p, k, val) => { await api.setAttendance(viewer, v.id, p.id, { ...(p.attendance || {}), [k]: val }); reload(); };
  return (
    <section className="cal-side">
      <h4>Participants</h4>
      <ul className="cal-plist">
        {v.participants.map((p) => (
          <li key={`${p.role}-${p.id}`}>
            <div><PersonChip id={p.id} name={p.name} small /> <small className="muted">{p.role}</small></div>
            <div className="cal-plist-right">
              {p.submission && <span className={`cal-sub s-${p.submission.status}`}>{SUB_LABEL[p.submission.status]}</span>}
              {canMark ? (
                <>
                  <label className="check" title="Attended"><input type="checkbox" checked={!!p.attendance?.attended} onChange={(e) => mark(p, 'attended', e.target.checked)} /> Att.</label>
                  <label className="check" title="Contributed"><input type="checkbox" checked={!!p.attendance?.contributed} onChange={(e) => mark(p, 'contributed', e.target.checked)} /> Contr.</label>
                </>
              ) : p.attendance && <small className="muted">{p.attendance.attended ? 'Attended' : 'Absent'}{p.attendance.contributed ? ', contributed' : ''}</small>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function RubricPanel({ v }) {
  const [open, setOpen] = useState(false);
  const sc = v.scorecard;
  return (
    <section className="cal-side">
      <h4>Rubric <button className="link" onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Show'}</button></h4>
      <p className="muted small">{sc.name}. Ratings: {ratingOptions(sc).length > 5 ? `0–${sc.max} points or N/A` : ratingOptions(sc).join(' / ')}.</p>
      {open && <>
        <p className="cal-note small">{sc.naRule}</p>
        {sc.categories.map((cat) => (
          <div key={cat.id}><b className="small">{cat.name}</b>
            <ul className="cal-rubric">{cat.criteria.map((c) => <li key={c.id}><b>{c.name}</b>: {c.guide}</li>)}</ul>
          </div>
        ))}
      </>}
    </section>
  );
}

function AuditPanel({ v }) {
  const [open, setOpen] = useState(false);
  if (!v.audit) return null;
  return (
    <section className="cal-side">
      <h4>Audit trail <button className="link" onClick={() => setOpen(!open)}>{open ? 'Hide' : `Show (${v.audit.length})`}</button></h4>
      {open && <ul className="cal-audit">{v.audit.map((a) => <li key={a.id}><small className="muted">{fmtDate(a.at)}</small> <b>{a.actorName}</b> {a.action.replace(/_/g, ' ')}{a.detail && <>: {a.detail}</>}</li>)}</ul>}
    </section>
  );
}

/* ---------- next action bar ---------- */

function NextAction({ v, viewer, reload, setDialog, go }) {
  const waiting = v.participants.filter((p) => p.submission && p.submission.status !== 'submitted');
  const run = (fn) => async () => { await fn(); reload(); };
  const buttons = [];
  let text = v.nextStep;
  if (v.status === 'draft' && v.canManage) {
    buttons.push(<button key="e" className="cal-btn" onClick={() => go(`cal:edit:${v.id}`)}>Edit and publish</button>);
  }
  if (v.status === 'scheduled') {
    if (v.canRun) buttons.push(<button key="s" className="cal-btn" onClick={() => setDialog({
      title: 'Start the session?', confirmLabel: 'Start',
      body: v.needsSubmissions ? 'Reviewers can then submit their independent scorecards.' : 'Opens the shared scorecard and discussion.',
      onConfirm: run(() => api.start(viewer, v.id)),
    })}>Start session</button>);
    if (v.canManage) buttons.push(<button key="e" className="cal-btn ghost" onClick={() => go(`cal:edit:${v.id}`)}>Edit</button>);
  }
  if (v.status === 'awaiting_submissions' && v.canRun) {
    text = `Waiting for ${waiting.length} reviewer${waiting.length === 1 ? '' : 's'}: ${waiting.map((p) => p.name).join(', ')}. Results stay hidden until everyone submits.`;
    if (v.canManage) buttons.push(<button key="x" className="cal-btn ghost" onClick={() => setDialog({
      title: 'Reveal before everyone submits?', danger: true, confirmLabel: 'Reveal early',
      body: `Not submitted: ${waiting.map((p) => p.name).join(', ')}. Their scorecards will be closed and the exception recorded in the audit trail.`,
      reason: { label: 'Reason for the exception', min: 10 },
      onConfirm: async ({ reason }) => { await api.reveal(viewer, v.id, { exceptionReason: reason }); reload(); },
    })}>Reveal early (exception)…</button>);
  }
  if (v.status === 'ready_to_reveal' && v.canRun) {
    text = 'All reviewers have submitted.';
    buttons.push(<button key="r" className="cal-btn" onClick={() => setDialog({
      title: 'Reveal results to the group?', confirmLabel: 'Reveal results', body: 'Everyone in the session will see each reviewer’s verdicts and comments. This cannot be undone.',
      onConfirm: run(() => api.reveal(viewer, v.id)),
    })}>Reveal results</button>);
  }
  if (v.status === 'completed' && v.canManage) {
    if (v.nextId) buttons.push(<button key="n" className="cal-btn ghost" onClick={() => go(`cal:session:${v.nextId}`)}>Open next calibration →</button>);
    else buttons.push(<button key="n" className="cal-btn ghost" onClick={() => setDialog({
      title: 'Schedule the next calibration', confirmLabel: 'Create draft', initial: { date: '' },
      body: 'Creates a draft with the same format, reviewers and scorecard. Pick a new call before publishing.',
      render: (vals, setVals) => <label className="cal-field">Date and time (leave empty for one month later)<input type="datetime-local" value={vals.date} onChange={(e) => setVals({ date: e.target.value })} /></label>,
      onConfirm: async ({ values }) => { const id = await api.scheduleNext(viewer, v.id, { scheduledAt: values.date ? new Date(values.date).toISOString() : undefined }); go(`cal:session:${id}`); },
    })}>Schedule next calibration</button>);
  }
  if (v.canManage && !['completed', 'cancelled'].includes(v.status)) {
    buttons.push(<button key="c" className="cal-btn ghost danger-text" onClick={() => setDialog({
      title: 'Cancel this calibration?', danger: true, confirmLabel: 'Cancel session', reason: { label: 'Reason', min: 3 },
      onConfirm: async ({ reason }) => { await api.cancel(viewer, v.id, reason); reload(); },
    })}>Cancel session</button>);
  }
  return (
    <div className={`cal-next-bar ${v.needsMe ? 'me' : ''}`}>
      <div><small className="muted">Next step</small><b>{text}</b></div>
      <div className="cal-inline">{buttons}</div>
    </div>
  );
}

/* ---------- page ---------- */

export function SessionPage({ id, viewer, go }) {
  const { data: v, loading, error, reload } = useLoad(() => api.getSession(viewer, id), [id, viewer]);
  const [dialog, setDialog] = useState(null);
  if (loading && !v) return <Loading />;
  if (error) return (
    <div>
      <button className="link" onClick={() => go('cal:assigned')}>← Back</button>
      <Empty title={error.code === 'not_found' ? 'Calibration not found' : 'Something went wrong'}>
        {error.code === 'not_found' ? 'It does not exist, or you are not assigned to it.' : error.message}
      </Empty>
    </div>
  );
  const mine = v.mySubmission;
  const showForm = v.roles.reviewer && v.needsSubmissions && v.status === 'awaiting_submissions' && (!mine || mine.status === 'draft');
  const editing = v.canRun && ACTIVE.includes(v.status);
  return (
    <div className="cal-session">
      <button className="link" onClick={() => go(v.status === 'completed' || v.status === 'cancelled' ? 'cal:completed' : 'cal:assigned')}>← Back</button>
      <header className="cal-head">
        <div className="cal-card-top"><FormatBadge format={v.format} /><StatusBadge status={v.status} />{v.preReview && v.format !== 'blind' && <span className="cal-badge plain">With blind pre-review</span>}</div>
        <h1>{v.title}</h1>
        <div className="cal-card-meta">
          <span>{fmtDate(v.scheduledAt)}</span>
          <span>Facilitator: {v.facilitatorName || '–'}</span>
          {v.connectionId && <span className="mono">{v.connectionId}</span>}
          <span>Variance baseline: {v.baseline}%</span>
        </div>
        {v.goal && <p className="cal-goal"><b>Goal:</b> {v.goal}</p>}
        {v.instructions && <p className="muted"><b>Instructions:</b> {v.instructions}</p>}
      </header>
      <Steps v={v} />
      <NextAction v={v} viewer={viewer} reload={reload} setDialog={setDialog} go={go} />
      {v.status === 'cancelled' && <p className="cal-note">This calibration was cancelled. See the audit trail for the reason.</p>}

      <div className="cal-cols">
        <div className="cal-main">
          {showForm && <ScorecardForm key={mine?.updatedAt || 'new'} v={v} viewer={viewer} reload={reload} setDialog={setDialog} />}
          {mine && mine.status !== 'draft' && <LockedSubmission v={v} />}
          {v.needsSubmissions && !v.revealed && !['draft', 'scheduled', 'cancelled'].includes(v.status) && !v.roles.agent && (
            <section className="cal-panel blind-wall"><b>🔒 Verdicts are hidden</b>
              <p className="muted">{v.status === 'ready_to_reveal' ? 'Everyone has submitted. Results appear when the facilitator reveals them.' : 'No one, including the facilitator and QA Leads, can see other reviewers’ verdicts until the reveal.'}</p></section>
          )}
          {v.status === 'scheduled' && <section className="cal-panel"><b>Prepare for the session</b><p className="muted">Review the call details and the rubric. {v.needsSubmissions ? 'Scorecards open when the facilitator starts the session.' : 'The group scores together during the meeting.'}</p></section>}
          {v.roles.agent && !v.canManage && <AgentOutcome v={v} />}
          <Comparison v={v} />
          {!v.needsSubmissions && ACTIVE.includes(v.status) && !editing && (
            <section className="cal-panel"><b>{v.format === 'team' ? 'Team Session in progress' : 'Agent Session in progress'}</b>
              <p className="muted">Listen to the call together. Add observations and evidence below; the facilitator records the agreed verdict.</p></section>
          )}
          <Discussion v={v} viewer={viewer} reload={reload} />
          {editing ? <DecisionEditor key={v.decision?.updatedAt || 'new'} v={v} viewer={viewer} reload={reload} setDialog={setDialog} /> : <DecisionView v={v} />}
          {v.format === 'agent' && v.canManage && <AgentOutcome v={v} />}
          <Actions v={v} viewer={viewer} reload={reload} />
        </div>
        <aside className="cal-aside">
          <CallPanel v={v} />
          <MeetingPanel v={v} viewer={viewer} reload={reload} />
          <Participants v={v} viewer={viewer} reload={reload} />
          <RubricPanel v={v} />
          <AuditPanel v={v} />
        </aside>
      </div>
      {dialog && <Dialog dialog={dialog} onClose={() => setDialog(null)} />}
    </div>
  );
}
