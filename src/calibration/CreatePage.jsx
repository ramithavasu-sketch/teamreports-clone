import { useEffect, useState } from 'react';
import { api } from './store.js';
import { FORMATS, CADENCES } from './service.js';
import { listCalls, getCall, CALL_LIBRARY } from './callLibrary.js';
import { qaStaff, ROLE_LABEL } from './people.js';
import { SCORECARDS } from './scorecards.js';
import { ErrorBox, Loading, Dialog, PersonChip } from './ui.jsx';

const FORMAT_HELP = {
  blind: 'Reviewers score on their own first. Nobody sees other verdicts until the facilitator reveals them.',
  team: 'Reviewers listen and score together in a meeting. The facilitator records the agreed verdict.',
  agent: 'The agent joins to give context. Ends with coaching points and follow-up actions.',
};

const toLocal = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

const BLANK = {
  title: '', format: 'blind', connectionId: '', scheduledAt: '', facilitatorId: '', reviewerIds: [], goal: '', scorecardId: 'tr-soft-tech',
  baseline: 5, instructions: '', meetingLink: '', preReview: false, recurring: { enabled: false, cadence: 'monthly', rotateFacilitator: false },
};

export function CreatePage({ viewer, editId, go }) {
  const [form, setForm] = useState(editId ? null : BLANK);
  const [status, setStatus] = useState('draft');
  const [callQ, setCallQ] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState(null);

  useEffect(() => {
    if (!editId) return;
    api.getSession(viewer, editId).then((v) => {
      if (!v.raw) throw new Error('This calibration can no longer be edited.');
      setStatus(v.raw.status);
      setForm({ ...BLANK, ...v.raw, scheduledAt: toLocal(v.raw.scheduledAt) });
    }).catch(setError);
  }, [editId, viewer]);

  if (!form) return error ? <ErrorBox error={error} /> : <Loading />;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const call = getCall(form.connectionId);
  const staff = qaStaff();
  const blindish = form.format === 'blind' || form.preReview;
  const toggleReviewer = (id) => setForm({ ...form, reviewerIds: form.reviewerIds.includes(id) ? form.reviewerIds.filter((r) => r !== id) : [...form.reviewerIds, id] });
  const payload = () => ({ ...form, scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : '' });

  const save = async (publish) => {
    setBusy(true);
    setError(null);
    try {
      const id = await api.saveDraft(viewer, payload(), editId);
      if (publish) await api.publish(viewer, id);
      go(`cal:session:${id}`);
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  return (
    <div className="cal-form">
      <div className="cal-toolbar"><h2>{editId ? 'Edit calibration' : 'Create Calibration'}</h2></div>

      <fieldset>
        <legend>Format</legend>
        <div className="cal-formats">
          {Object.entries(FORMATS).map(([k, v]) => (
            <label key={k} className={`cal-format-opt ${form.format === k ? 'on' : ''} ${status !== 'draft' ? 'disabled' : ''}`}>
              <input type="radio" name="format" checked={form.format === k} disabled={status !== 'draft'} onChange={() => setForm({ ...form, format: k, preReview: k === 'blind' ? true : form.format === 'blind' ? false : form.preReview })} />
              <b className={`fmt-text-${k}`}>{v}</b><span>{FORMAT_HELP[k]}</span>
            </label>
          ))}
        </div>
        {form.format !== 'blind' && (
          <label className="check"><input type="checkbox" checked={form.preReview} onChange={set('preReview')} />
            Ask reviewers to score independently before the meeting (blind pre-review)</label>
        )}
      </fieldset>

      <fieldset>
        <legend>Call from the Call Library</legend>
        {!CALL_LIBRARY.connected && <p className="cal-note">⚠ {CALL_LIBRARY.note}</p>}
        <input className="cal-input" placeholder="⌕ Search Connection ID, agent or queue" value={callQ} onChange={(e) => setCallQ(e.target.value)} aria-label="Search Call Library" />
        <div className="cal-call-list" role="listbox" aria-label="Call Library">
          {listCalls(callQ).map((c) => (
            <label key={c.connectionId} className={form.connectionId === c.connectionId ? 'on' : ''}>
              <input type="radio" name="call" checked={form.connectionId === c.connectionId} onChange={() => setForm({ ...form, connectionId: c.connectionId })} />
              <span className="mono">{c.connectionId}</span><span>{c.agentName}</span><span className="muted">{c.queue} · {c.date} · {c.duration}</span>
            </label>
          ))}
        </div>
        {call && form.format === 'agent' && <p className="muted">Agent for this session: <PersonChip name={call.agentName} small /> (always the agent on the selected call)</p>}
      </fieldset>

      <fieldset className="cal-grid-2">
        <legend>Details</legend>
        <label className="cal-field">Calibration title<input value={form.title} onChange={set('title')} maxLength={120} placeholder="e.g. November blind calibration" /></label>
        <label className="cal-field">Date and time<input type="datetime-local" value={form.scheduledAt} onChange={set('scheduledAt')} /></label>
        <label className="cal-field">Facilitator
          <select value={form.facilitatorId} onChange={set('facilitatorId')}>
            <option value="">Select facilitator</option>
            {staff.map((p) => <option key={p.id} value={p.id}>{p.name} ({ROLE_LABEL[p.role]})</option>)}
          </select>
        </label>
        <label className="cal-field">Scorecard / rubric
          <select value={form.scorecardId} onChange={set('scorecardId')} disabled={status !== 'draft'}>
            {SCORECARDS.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="cal-field">Variance baseline (%)<input type="number" min="0" max="100" step="0.5" value={form.baseline} onChange={set('baseline')} />
          <small className="muted">Items that differ by more than this are flagged for discussion. An operational goal, not proof of quality.</small></label>
        <label className="cal-field">Meeting link (optional)<input value={form.meetingLink} onChange={set('meetingLink')} placeholder="https://meet.google.com/…" /></label>
        <label className="cal-field wide">Goal or topic<input value={form.goal} onChange={set('goal')} maxLength={500} placeholder="What should the group align on?" /></label>
        <label className="cal-field wide">Instructions or preparation notes (QA only)<textarea value={form.instructions} onChange={set('instructions')} /></label>
      </fieldset>

      <fieldset>
        <legend>QA reviewers {blindish && <small className="muted">(the facilitator cannot also be a blind reviewer)</small>}</legend>
        <div className="cal-people-pick">
          {staff.map((p) => {
            const disabled = blindish && p.id === form.facilitatorId;
            return (
              <label key={p.id} className={`${form.reviewerIds.includes(p.id) ? 'on' : ''} ${disabled ? 'disabled' : ''}`}>
                <input type="checkbox" checked={form.reviewerIds.includes(p.id)} disabled={disabled} onChange={() => toggleReviewer(p.id)} />
                <PersonChip id={p.id} small /><small className="muted">{ROLE_LABEL[p.role]}</small>
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend>Cadence</legend>
        <p className="muted">Recommended: monthly. Run more often when variance is high, standards change, or the team is growing. Nothing repeats unless you turn it on.</p>
        <label className="check"><input type="checkbox" checked={form.recurring.enabled} onChange={(e) => setForm({ ...form, recurring: { ...form.recurring, enabled: e.target.checked } })} />
          When this session is finalized, create the next one as a draft</label>
        {form.recurring.enabled && (
          <div className="cal-inline">
            <select value={form.recurring.cadence} onChange={(e) => setForm({ ...form, recurring: { ...form.recurring, cadence: e.target.value } })} aria-label="Cadence">
              {Object.entries(CADENCES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <label className="check"><input type="checkbox" checked={form.recurring.rotateFacilitator} onChange={(e) => setForm({ ...form, recurring: { ...form.recurring, rotateFacilitator: e.target.checked } })} /> Rotate the facilitator</label>
          </div>
        )}
      </fieldset>

      <ErrorBox error={error} />
      <div className="cal-form-actions">
        <button className="cal-btn ghost" onClick={() => go(editId ? `cal:session:${editId}` : 'cal:assigned')} disabled={busy}>Cancel</button>
        {status === 'draft' && <button className="cal-btn ghost" onClick={() => save(false)} disabled={busy}>Save draft</button>}
        <button className="cal-btn" disabled={busy} onClick={() => (status === 'draft'
          ? setDialog({ title: 'Publish this calibration?', body: 'It will appear in each participant’s Team Reports right away.', confirmLabel: 'Publish', onConfirm: () => save(true) })
          : save(false))}>
          {status === 'draft' ? 'Publish' : 'Save changes'}
        </button>
      </div>
      {dialog && <Dialog dialog={dialog} onClose={() => setDialog(null)} />}
    </div>
  );
}
