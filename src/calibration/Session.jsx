import { useState } from 'react';
import { store } from './store.js';
import { FORMATS, FACILITATORS, PARTICIPANTS, VERDICTS, agreement, person, isAdmin } from './model.js';
import { go, fmtDate, fmtStamp, Header, Metric, Panel, Tag, StatusTag, VerdictTag, Notice, ErrorNote, Field, VerdictPicker, CallPlayer, Modal } from './ui.jsx';

const BackButton = ({ label }) => <button className="secondary" onClick={() => go('')}>← {label}</button>;
const People = ({ ids }) => <div className="tr-pillrow">{ids.map((id) => <Tag key={id}>{person(id).name}</Tag>)}</div>;
const MeetLink = ({ href }) => (href ? <a className="tr-link" href={href} target="_blank" rel="noreferrer noopener">Open calibration meeting</a> : <span className="tr-muted">Not added</span>);

/* ---------- shared outcome (what participants see once completed) ---------- */

function SharedOutcome({ outcome, title = 'Shared calibration outcome' }) {
  if (!outcome) return null;
  return (
    <Panel title={title} tag={<Tag tone="green">Completed</Tag>}>
      {(outcome.soft || outcome.tech) && (
        <div className="tr-grid2 tight">
          <div className="tr-formcard"><div className="tr-muted tiny">Final Soft Skills</div><h3><VerdictTag value={outcome.soft} /></h3></div>
          <div className="tr-formcard"><div className="tr-muted tiny">Final Technical Skills</div><h3><VerdictTag value={outcome.tech} /></h3></div>
        </div>
      )}
      <Field label="Shared summary"><p>{outcome.summary || 'No summary recorded.'}</p></Field>
      <Field label="Key learning points"><p>{outcome.takeaways || 'No learning points recorded.'}</p></Field>
      <Field label="Follow-up"><p>{outcome.actions || 'No follow-up actions recorded.'}</p></Field>
    </Panel>
  );
}

/* ---------- admin: outcome form ---------- */

function OutcomeForm({ s, userId, refresh, blind }) {
  const [f, setF] = useState({ ...s.final });
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = () => { setError(null); try { store.saveOutcome(userId, s.id, f); refresh(); } catch (e) { setError(e); } };
  const done = s.status.key === 'completed';
  const opt = (label) => (
    <><option value="">{label}</option>{VERDICTS.map((v) => <option key={v}>{v}</option>)}</>
  );
  return (
    <>
      <div className="tr-grid2 tight">
        <Field label={`Final Soft Skills verdict${blind ? ' *' : ' (optional)'}`}><select value={f.soft} onChange={set('soft')}>{opt(blind ? 'Choose outcome' : 'Not applicable / not decided')}</select></Field>
        <Field label={`Final Technical Skills verdict${blind ? ' *' : ' (optional)'}`}><select value={f.tech} onChange={set('tech')}>{opt(blind ? 'Choose outcome' : 'Not applicable / not decided')}</select></Field>
      </div>
      <Field label={blind ? 'Shared outcome summary *' : 'Discussion summary *'}><textarea rows={3} value={f.summary} onChange={set('summary')} placeholder="What did the group agree on?" /></Field>
      <Field label={blind ? 'Calibration takeaways' : 'Key learning points'}><textarea rows={3} value={f.takeaways} onChange={set('takeaways')} placeholder="Agreed clarifications and repeatable learning points" /></Field>
      <Field label="Follow-up action (owner + due date)"><textarea rows={2} value={f.actions} onChange={set('actions')} placeholder="e.g. QA Lead — share the updated example by 3 Nov." /></Field>
      <ErrorNote error={error} />
      <div className="tr-bottomactions"><button onClick={save}>{done ? 'Update outcome' : 'Save outcome & complete session'}</button></div>
    </>
  );
}

/* ---------- admin: edit setup ---------- */

function EditSetup({ s, userId, onClose, refresh }) {
  const submitted = (s.progress || []).filter((p) => p.submittedAt).map((p) => p.userId);
  const [f, setF] = useState({ facilitator: s.facilitator, meetLink: s.meetLink, participants: s.participants });
  const [error, setError] = useState(null);
  const save = () => { setError(null); try { store.editSession(userId, s.id, f); refresh(); onClose(); } catch (e) { setError(e); } };
  return (
    <Modal eyebrow="Admin / Edit" title={`Edit session setup · ${s.id}`} onClose={onClose}>
      <Field label="Facilitator"><select value={f.facilitator} onChange={(e) => setF({ ...f, facilitator: e.target.value })}>{FACILITATORS.map((x) => <option key={x}>{x}</option>)}</select></Field>
      <Field label="Google Meet link (optional)"><input type="url" value={f.meetLink} onChange={(e) => setF({ ...f, meetLink: e.target.value })} placeholder="https://meet.google.com/…" /></Field>
      <Field label="Assigned participants">
        {PARTICIPANTS.map((p) => {
          const locked = submitted.includes(p.id);
          return (
            <label key={p.id} className="tr-checkline"><input type="checkbox" disabled={locked} checked={f.participants.includes(p.id)}
              onChange={(e) => setF({ ...f, participants: e.target.checked ? [...f.participants, p.id] : f.participants.filter((x) => x !== p.id) })} />
              <span>{p.name}{locked && <span className="tr-muted"> (already submitted; locked)</span>}</span></label>
          );
        })}
      </Field>
      {s.format === 'blind' && <Notice tone="warn">Submitted reviewers cannot be removed from a blind session, preserving the original response record.</Notice>}
      <ErrorNote error={error} />
      <div className="tr-bottomactions"><button className="secondary" onClick={onClose}>Cancel</button><button onClick={save}>Save changes</button></div>
    </Modal>
  );
}

function Configuration({ s, onEdit }) {
  return (
    <Panel title="Session configuration" tag={<Tag tone="green">Admin only</Tag>}>
      <Field label="Calibration type"><div>{FORMATS[s.format].name}</div></Field>
      <Field label="Connection ID"><div className="tr-strong">{s.connectionId}</div></Field>
      <Field label="Facilitator"><div>{s.facilitator}</div></Field>
      <Field label="Meeting link"><div><MeetLink href={s.meetLink} /></div></Field>
      <Field label="Assigned participants"><People ids={s.participants} /></Field>
      <Field label="Internal QA preparation"><div><Tag tone="green">✓ Connection confirmed</Tag> <Tag tone="green">✓ Recording reviewed</Tag> <Tag tone="green">✓ Context checked</Tag></div></Field>
      {s.status.key !== 'completed' && <button className="secondary small" onClick={onEdit}>Edit setup</button>}
    </Panel>
  );
}

/* ---------- admin: blind session ---------- */

function AdminBlind({ s, userId, refresh }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState(null);
  const pending = s.participants.length - s.submitted;
  const all = pending === 0;
  return (
    <>
      <Header eyebrow="Call Calibration / Admin" title={`Connection ID: ${s.connectionId}`} desc={`${s.id} · ${FORMATS[s.format].name} · ${fmtDate(s.date)} at ${s.time}`}><BackButton label="All sessions" /></Header>
      <div className="tr-metrics">
        <Metric title="Assigned" label="Participants" value={s.participants.length} />
        <Metric title="Submitted" label="Locked responses" value={s.submitted} blue />
        <Metric title="Pending" label="Awaiting submission" value={pending} />
        <Metric title="Status" label="Workflow" value={<span className="tr-metric-status">{s.status.label}</span>} />
      </div>
      <div className="tr-grid2">
        <div><CallPlayer connectionId={s.connectionId} /><Configuration s={s} onEdit={() => setEditing(true)} /></div>
        <div>
          <Panel title="Submission status" tag={<Tag tone={all ? 'green' : 'amber'}>{all ? 'All submitted' : 'Waiting'}</Tag>}>
            <p className="tr-muted tiny">Only submission progress is visible before all required reviewers submit.</p>
            <div className="tr-tablewrap">
              <table className="compact">
                <thead><tr><th>Participant</th><th>Status</th></tr></thead>
                <tbody>{s.progress.map((p) => (
                  <tr key={p.userId}><td><div className="tr-strong">{person(p.userId).name}</div></td>
                    <td>{p.submittedAt ? <><Tag tone="green">Submitted</Tag><div className="tiny tr-muted">{fmtStamp(p.submittedAt)}</div></> : <Tag tone="amber">Pending</Tag>}</td></tr>
                ))}</tbody>
              </table>
            </div>
            {all
              ? <Notice tone="good">All assigned reviewers have submitted. Admin may now compare individual responses.</Notice>
              : <Notice tone="warn">{pending} participant(s) still need to submit. Admin comparison is locked.</Notice>}
            <ErrorNote error={error} />
            {all && !s.comparisonOpen && <button onClick={() => { setError(null); try { store.openComparison(userId, s.id); refresh(); } catch (e) { setError(e); } }}>View submissions &amp; compare</button>}
          </Panel>
          {!s.comparisonOpen && (
            <Panel title="Blind-session safeguards">
              <p className="tr-muted tiny">✓ Independent evaluations lock on submission.<br />✓ Comparison unlocks after all assignments are submitted.<br />
                ✓ Only Admin can view reviewer-level verdicts and comments.<br />✓ Participants never see peer responses.</p>
            </Panel>
          )}
        </div>
      </div>
      {s.comparisonOpen && <Compare s={s} userId={userId} refresh={refresh} />}
      {editing && <EditSetup s={s} userId={userId} onClose={() => setEditing(false)} refresh={refresh} />}
    </>
  );
}

function Compare({ s, userId, refresh }) {
  const soft = agreement(s.submissions, 'soft');
  const tech = agreement(s.submissions, 'tech');
  return (
    <Panel title="Individual submissions" tag={<Tag tone="green">Admin-only view</Tag>}>
      <div className="tr-tablewrap">
        <table>
          <thead><tr><th>Participant</th><th>Soft skills</th><th>Technical skills</th><th>Evidence</th><th>Comments / rationale</th><th>Submitted at</th></tr></thead>
          <tbody>{s.submissions.map((x) => (
            <tr key={x.userId}>
              <td><b>{person(x.userId).name}</b><div className="tiny tr-muted">{person(x.userId).role}</div></td>
              <td className={soft?.majority && x.soft !== soft.majority ? 'tr-differs' : ''}><VerdictTag value={x.soft} /></td>
              <td className={tech?.majority && x.tech !== tech.majority ? 'tr-differs' : ''}><VerdictTag value={x.tech} /></td>
              <td>{x.evidence || '—'}</td><td className="tr-wide">{x.comments || '—'}</td><td className="tiny tr-muted">{fmtStamp(x.submittedAt)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div className="tr-grid2 tight" style={{ marginTop: 18 }}>
        {[['Soft Skills agreement', soft], ['Technical Skills agreement', tech]].map(([t, a]) => (
          <div key={t} className="tr-formcard"><h3>{t}</h3><div className="tr-big">{a ? a.label : '—'}</div>
            {a && <div className="tiny tr-muted">{a.majority ? `${a.count} chose ${a.majority}` : `Split ${a.count}`}</div>}</div>
        ))}
      </div>
      <Notice>Agreement is a discussion aid, not an automatic final verdict. Highlighted cells differ from the majority. The Admin records the final group outcome below.</Notice>
      <div className="tr-rule" />
      <h2>{s.status.key === 'completed' ? 'Saved final outcome' : 'Final agreed outcome'}</h2>
      <OutcomeForm s={s} userId={userId} refresh={refresh} blind />
    </Panel>
  );
}

/* ---------- admin: team / agent session ---------- */

function AdminGroup({ s, userId, refresh }) {
  const [editing, setEditing] = useState(false);
  const agent = s.format === 'agent';
  const done = s.status.key === 'completed';
  return (
    <>
      <Header eyebrow="Call Calibration / Admin" title={`Connection ID: ${s.connectionId}`} desc={`${s.id} · ${FORMATS[s.format].name} · ${fmtDate(s.date)} at ${s.time}`}><BackButton label="All sessions" /></Header>
      <div className="tr-metrics">
        <Metric title="Participants" label="Assigned" value={s.participants.length} />
        <Metric title="Format" label="Group session" value={agent ? 'Agent' : 'Team'} blue />
        <Metric title="Status" label="Workflow" value={<span className="tr-metric-status">{s.status.label}</span>} />
        <Metric title="Completed" label="Outcome saved" value={done ? 'Yes' : 'No'} />
      </div>
      <div className="tr-grid2">
        <div><CallPlayer connectionId={s.connectionId} /><Configuration s={s} onEdit={() => setEditing(true)} /></div>
        <Panel title={done ? 'Saved session outcome' : 'Record session outcome'} tag={<Tag tone={done ? 'green' : 'blue'}>{s.status.label}</Tag>}>
          <p className="tr-muted tiny">{agent ? 'Capture the shared learning and coaching-focused follow-up.' : 'Record the decision reached by the group. This session does not use blind submissions.'}</p>
          <OutcomeForm s={s} userId={userId} refresh={refresh} />
        </Panel>
      </div>
      {editing && <EditSetup s={s} userId={userId} onClose={() => setEditing(false)} refresh={refresh} />}
    </>
  );
}

/* ---------- participant: blind session ---------- */

function ParticipantBlind({ s, userId, refresh }) {
  const [draft, setDraft] = useState({ soft: '', tech: '', evidence: '', comments: '' });
  const [error, setError] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const sub = s.mine;
  const submit = () => { setError(null); try { store.submit(userId, s.id, draft); setConfirming(false); refresh(); } catch (e) { setError(e); setConfirming(false); } };
  return (
    <>
      <Header eyebrow="Call Calibration / My assignment" title={`Connection ID: ${s.connectionId}`} desc={`${s.id} · Blind session · ${fmtDate(s.date)} at ${s.time}`}><BackButton label="My assigned sessions" /></Header>
      <Notice>Complete your evaluation independently before the group discussion. Your submitted verdict locks and other reviewers’ responses remain hidden.</Notice>
      <div className="tr-grid2">
        <div>
          <CallPlayer connectionId={s.connectionId} />
          <Panel title="Your independent evaluation" tag={sub ? <Tag tone="green">Submitted &amp; locked</Tag> : <Tag tone="amber">Not submitted</Tag>}>
            {sub ? (
              <>
                <div className="tr-grid2 tight">
                  <div className="tr-formcard"><div className="tr-muted tiny">Soft Skills</div><h3><VerdictTag value={sub.soft} /></h3></div>
                  <div className="tr-formcard"><div className="tr-muted tiny">Technical Skills</div><h3><VerdictTag value={sub.tech} /></h3></div>
                </div>
                <Field label="Your comments / rationale"><div className="tr-formcard locked">{sub.comments || 'No comments added.'}</div></Field>
                <Field label="Evidence timestamp"><div className="tr-formcard locked">{sub.evidence || 'Not provided'}</div></Field>
                <p className="tiny tr-muted">Submitted {fmtStamp(sub.submittedAt)}. Locked — it cannot be changed.</p>
              </>
            ) : s.completed ? <p className="tr-muted">This session is completed; submissions are closed.</p> : (
              <>
                <div className="tr-formcard"><h3>Soft Skills</h3><p className="tr-muted tiny">Evaluate the interaction independently.</p>
                  <VerdictPicker value={draft.soft} onChange={(v) => setDraft({ ...draft, soft: v })} label="Soft Skills verdict" /></div>
                <div className="tr-formcard"><h3>Technical Skills</h3><p className="tr-muted tiny">Evaluate the applicable technical requirements.</p>
                  <VerdictPicker value={draft.tech} onChange={(v) => setDraft({ ...draft, tech: v })} label="Technical Skills verdict" /></div>
                <Field label="Evidence timestamp (optional)"><input value={draft.evidence} maxLength={20} placeholder="e.g. 01:24" onChange={(e) => setDraft({ ...draft, evidence: e.target.value })} /></Field>
                <Field label="Comments / rationale (optional)"><textarea rows={4} value={draft.comments} placeholder="Add a concise reason for your verdict." onChange={(e) => setDraft({ ...draft, comments: e.target.value })} /></Field>
                <Notice tone="warn">Submit locks your verdict. It cannot be changed after submission.</Notice>
                <ErrorNote error={error} />
                {confirming ? (
                  <div className="tr-confirm"><span>Submit and lock this verdict?</span><button className="secondary" onClick={() => setConfirming(false)}>Cancel</button><button onClick={submit}>Yes, submit &amp; lock</button></div>
                ) : <button disabled={!draft.soft || !draft.tech} onClick={() => setConfirming(true)}>Submit &amp; lock my verdict</button>}
              </>
            )}
          </Panel>
        </div>
        <div>
          <Panel title="Assignment details" tag={<Tag tone="blue">Assigned to you</Tag>}>
            <Field label="Connection ID"><div className="tr-strong">{s.connectionId}</div></Field>
            <Field label="Session date & time"><div>{fmtDate(s.date)} · {s.time}</div></Field>
            <Field label="Facilitator"><div>{s.facilitator}</div></Field>
            <Field label="Your submission status"><div>{sub ? <Tag tone="green">Submitted and locked</Tag> : <Tag tone="amber">Awaiting your submission</Tag>}</div></Field>
            <div className="tr-rule" />
            <h3>Blind-session rules</h3>
            <p className="tr-muted tiny">• Evaluate before any group discussion.<br />• Do not share verdicts in chat before the facilitator opens discussion.<br />• You can view your own saved verdict only.</p>
            {s.meetLink && <p><MeetLink href={s.meetLink} /></p>}
          </Panel>
          <SharedOutcome outcome={s.outcome} />
        </div>
      </div>
    </>
  );
}

/* ---------- participant: team / agent session ---------- */

const AGENDA = {
  agent: ['Introduce the interaction and the scenario.', 'Review the call together.', 'QA explains the evaluation reasoning.', 'CAMs share context and questions.', 'Agree on learning points and follow-ups.'],
  team: ['Play the recording together.', 'Discuss what happened and which requirement applies.', 'Agree on the interpretation and next steps.', 'Record the outcome.'],
};

function ParticipantGroup({ s }) {
  const agent = s.format === 'agent';
  return (
    <>
      <Header eyebrow="Call Calibration / My assignment" title={`Connection ID: ${s.connectionId}`} desc={`${s.id} · ${FORMATS[s.format].name} · ${fmtDate(s.date)} at ${s.time}`}><BackButton label="My assigned sessions" /></Header>
      <Notice>{agent ? 'This session focuses on quality awareness and a shared understanding between QA, CX Leads and CAMs.' : 'This session focuses on reviewing the same interaction together and agreeing on how the standard applies.'} There are no independent blind submissions for this format.</Notice>
      <div className="tr-grid2">
        <div>
          <CallPlayer connectionId={s.connectionId} />
          <Panel title="Session agenda" tag={<Tag tone="blue">{FORMATS[s.format].name}</Tag>}>
            <ol className="tr-agenda">{AGENDA[s.format].map((a) => <li key={a}>{a}</li>)}</ol>
            {s.meetLink ? <MeetLink href={s.meetLink} /> : <p className="tr-muted tiny">Meeting link has not been added yet.</p>}
          </Panel>
        </div>
        <div>
          <Panel title="Session details">
            <Field label="Connection ID"><div className="tr-strong">{s.connectionId}</div></Field>
            <Field label="Facilitator"><div>{s.facilitator}</div></Field>
            <Field label="Scheduled for"><div>{fmtDate(s.date)} · {s.time}</div></Field>
            <Field label="Participants"><People ids={s.participants} /></Field>
          </Panel>
          <SharedOutcome outcome={s.outcome} title="Shared outcome" />
        </div>
      </div>
    </>
  );
}

/* ---------- page ---------- */

export function SessionPage({ id, userId, refresh }) {
  let s;
  try { s = store.get(userId, id); } catch (e) {
    const restricted = /not assigned/.test(e.message);
    return (
      <>
        <Header eyebrow={restricted ? 'Access restricted' : 'Call Calibration'} title={restricted ? 'This session is not assigned to you' : 'Session not found'}
          desc={restricted ? 'Only assigned Connection IDs can be opened.' : 'This session may have been reset.'} />
        <button onClick={() => go('')}>Back to Call Calibration</button>
      </>
    );
  }
  if (isAdmin(userId)) return s.format === 'blind' ? <AdminBlind s={s} userId={userId} refresh={refresh} /> : <AdminGroup s={s} userId={userId} refresh={refresh} />;
  return s.format === 'blind' ? <ParticipantBlind s={s} userId={userId} refresh={refresh} /> : <ParticipantGroup s={s} />;
}
