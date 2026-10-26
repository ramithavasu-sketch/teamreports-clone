// Call Calibration service. This is the server-side boundary: every rule
// (who can see what, blind review, locked submissions, status changes,
// audit trail) is enforced here, and the pages only ever receive the
// filtered views this file returns. The same rules are written for the
// database in supabase/migrations/ so they can be enforced by Postgres when
// Team Reports gets a real backend.

import { getCall } from './callLibrary.js';
import { getPerson, isManager, agentPersonId } from './people.js';
import { getScorecard, criteriaOf, isValidRating } from './scorecards.js';
import { compareSession } from './metrics.js';

export const FORMATS = { blind: 'Blind Session', team: 'Team Session', agent: 'Agent Session' };

export const STATUS_LABEL = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  awaiting_submissions: 'Awaiting Submissions',
  ready_to_reveal: 'Ready to Reveal',
  discussion: 'Discussion in Progress',
  awaiting_final_decision: 'Awaiting Final Decision',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const CADENCES = { monthly: 'Monthly', biweekly: 'Every 2 weeks', weekly: 'Weekly' };
export const ACTION_KINDS = { coaching: 'Coaching', rubric: 'Rubric clarification', followup: 'Follow-up' };
export const NOTE_KINDS = { note: 'Note', evidence: 'Evidence', dispute: 'Disputed item' };
export const SHARE_TARGETS = { participants: 'Session participants', agent: 'The agent', team: 'Wider QA team' };

export class CalibrationError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const fail = (code, message) => { throw new CalibrationError(code, message); };
const check = (cond, code, message) => { if (!cond) fail(code, message); };
const clone = (x) => (x === undefined ? x : JSON.parse(JSON.stringify(x)));
const text = (v, max = 4000) => String(v ?? '').trim().slice(0, max);

const TERMINAL = ['completed', 'cancelled'];
const ACTIVE = ['discussion', 'in_progress', 'awaiting_final_decision'];

// Independent scorecards are needed for Blind Sessions, and for Team/Agent
// Sessions only when the admin turned on the pre-review step.
export const needsSubmissions = (s) => s.format === 'blind' || !!s.preReview;

const EDGES = {
  review: ['draft>scheduled', 'scheduled>awaiting_submissions', 'awaiting_submissions>ready_to_reveal', 'ready_to_reveal>awaiting_submissions',
    'ready_to_reveal>discussion', 'awaiting_submissions>discussion', 'discussion>awaiting_final_decision', 'awaiting_final_decision>discussion',
    'discussion>completed', 'awaiting_final_decision>completed'],
  live: ['draft>scheduled', 'scheduled>in_progress', 'in_progress>awaiting_final_decision', 'awaiting_final_decision>in_progress',
    'in_progress>completed', 'awaiting_final_decision>completed'],
};

export function flowFor(s) {
  return needsSubmissions(s)
    ? ['draft', 'scheduled', 'awaiting_submissions', 'ready_to_reveal', 'discussion', 'awaiting_final_decision', 'completed']
    : ['draft', 'scheduled', 'in_progress', 'awaiting_final_decision', 'completed'];
}

export function canTransition(s, to) {
  if (to === 'cancelled') return !TERMINAL.includes(s.status);
  return EDGES[needsSubmissions(s) ? 'review' : 'live'].includes(`${s.status}>${to}`);
}

const emptyDb = () => ({ version: 1, seq: 0, sessions: {}, submissions: {}, decisions: {}, actions: {}, notes: {}, audit: [] });

const CADENCE_DAYS = { monthly: 0, biweekly: 14, weekly: 7 };
function addCadence(iso, cadence) {
  const d = new Date(iso);
  if (cadence === 'monthly') d.setMonth(d.getMonth() + 1);
  else d.setDate(d.getDate() + CADENCE_DAYS[cadence]);
  return d.toISOString();
}

export function createService({ storage, now = () => new Date().toISOString() }) {
  let db = storage.load() || emptyDb();
  const save = () => storage.save(db);
  const id = (prefix) => `${prefix}-${++db.seq}`;

  /* ---------- lookups and permissions ---------- */

  const actor = (actorId) => getPerson(actorId) || fail('unauthenticated', 'Please sign in.');
  const rolesIn = (p, s) => ({
    manager: isManager(p),
    facilitator: s.facilitatorId === p.id,
    reviewer: s.reviewerIds.includes(p.id),
    agent: !!s.agentId && s.agentId === p.id,
  });
  const canView = (p, s) => {
    const r = rolesIn(p, s);
    return r.manager || (s.status !== 'draft' && (r.facilitator || r.reviewer || r.agent));
  };
  // Hidden sessions look exactly like missing ones, so a guessed id leaks nothing.
  function sessionFor(p, sessionId) {
    const s = db.sessions[sessionId];
    if (!s || !canView(p, s)) fail('not_found', 'Calibration not found.');
    return s;
  }
  const isRunner = (p, s) => isManager(p) || s.facilitatorId === p.id;
  const subsOf = (sessionId) => Object.values(db.submissions).filter((x) => x.sessionId === sessionId);
  const submittedOf = (sessionId) => subsOf(sessionId).filter((x) => x.status === 'submitted');
  const revealed = (s) => !!s.revealedAt;

  function log(sessionId, actorId, action, detail = '') {
    db.audit.push({ id: id('log'), at: now(), sessionId, actorId, action, detail });
  }

  function move(s, to, p, detail) {
    check(canTransition(s, to), 'bad_transition', `A ${FORMATS[s.format]} cannot go from ${STATUS_LABEL[s.status]} to ${STATUS_LABEL[to]}.`);
    const from = s.status;
    s.status = to;
    s.updatedAt = now();
    log(s.id, p.id, 'status', `${STATUS_LABEL[from]} → ${STATUS_LABEL[to]}${detail ? ` (${detail})` : ''}`);
  }

  /* ---------- create / edit ---------- */

  function normalise(input, existing) {
    const s = { ...existing };
    if ('title' in input) s.title = text(input.title, 120);
    if ('format' in input) { check(FORMATS[input.format], 'invalid', 'Pick a calibration format.'); s.format = input.format; }
    if ('connectionId' in input) {
      const cid = text(input.connectionId, 80);
      check(!cid || getCall(cid), 'invalid', 'That Connection ID is not in the Call Library.');
      s.connectionId = cid;
    }
    if ('scheduledAt' in input) {
      check(!input.scheduledAt || !Number.isNaN(Date.parse(input.scheduledAt)), 'invalid', 'Enter a valid date and time.');
      s.scheduledAt = input.scheduledAt ? new Date(input.scheduledAt).toISOString() : '';
    }
    if ('facilitatorId' in input) s.facilitatorId = input.facilitatorId || '';
    if ('reviewerIds' in input) s.reviewerIds = [...new Set(input.reviewerIds || [])];
    if ('goal' in input) s.goal = text(input.goal, 500);
    if ('scorecardId' in input) { check(getScorecard(input.scorecardId), 'invalid', 'Pick a scorecard.'); s.scorecardId = input.scorecardId; }
    if ('baseline' in input) {
      const b = Number(input.baseline);
      check(Number.isFinite(b) && b >= 0 && b <= 100, 'invalid', 'Variance baseline must be between 0 and 100%.');
      s.baseline = b;
    }
    if ('instructions' in input) s.instructions = text(input.instructions, 2000);
    if ('meetingLink' in input) {
      const link = text(input.meetingLink, 300);
      check(!link || /^https:\/\/\S+$/.test(link), 'invalid', 'Meeting link must start with https://');
      s.meetingLink = link;
    }
    if ('preReview' in input) s.preReview = !!input.preReview;
    if ('recurring' in input) {
      const r = input.recurring || {};
      check(!r.enabled || CADENCES[r.cadence], 'invalid', 'Pick how often the calibration repeats.');
      s.recurring = { enabled: !!r.enabled, cadence: r.cadence || 'monthly', rotateFacilitator: !!r.rotateFacilitator };
    }
    if (s.format === 'blind') s.preReview = true;
    // The agent is always the agent on the selected call, so a session can
    // never expose one agent's call to another agent.
    const call = s.connectionId ? getCall(s.connectionId) : null;
    s.agentId = s.format === 'agent' && call ? agentPersonId(call.agentId) : null;
    return s;
  }

  function validateComplete(s) {
    check(s.title, 'invalid', 'Add a calibration title.');
    check(s.connectionId && getCall(s.connectionId), 'invalid', 'Select a call from the Call Library.');
    check(s.scheduledAt, 'invalid', 'Add the calibration date and time.');
    const fac = getPerson(s.facilitatorId);
    check(fac && fac.role !== 'agent', 'invalid', 'Pick a facilitator from the QA team.');
    check(s.reviewerIds.length >= (s.format === 'blind' ? 2 : 1), 'invalid', s.format === 'blind' ? 'A Blind Session needs at least 2 reviewers.' : 'Add at least one QA reviewer.');
    check(s.reviewerIds.every((r) => getPerson(r) && getPerson(r).role !== 'agent'), 'invalid', 'Reviewers must be QA team members.');
    check(!needsSubmissions(s) || !s.reviewerIds.includes(s.facilitatorId), 'invalid', 'The facilitator cannot also be a reviewer when scorecards are blind.');
    check(s.format !== 'agent' || s.agentId, 'invalid', 'An Agent Session needs the call’s agent.');
    check(getScorecard(s.scorecardId), 'invalid', 'Pick a scorecard.');
  }

  function saveDraft(actorId, input, sessionId) {
    const p = actor(actorId);
    check(isManager(p), 'forbidden', 'Only QA admins and QA Leads can create or edit calibrations.');
    let s;
    if (sessionId) {
      const existing = sessionFor(p, sessionId);
      check(['draft', 'scheduled'].includes(existing.status), 'locked', 'Only Draft or Scheduled calibrations can be edited.');
      s = normalise(input, existing);
      if (s.status === 'scheduled') validateComplete(s);
      log(s.id, p.id, 'edited');
    } else {
      s = normalise(input, {
        id: id('cal'), title: '', format: 'blind', connectionId: '', scheduledAt: '', facilitatorId: '', reviewerIds: [], agentId: null,
        goal: '', scorecardId: 'tr-soft-tech', baseline: 5, instructions: '', meetingLink: '', preReview: false,
        recurring: { enabled: false, cadence: 'monthly', rotateFacilitator: false },
        status: 'draft', createdBy: p.id, createdAt: now(), attendance: {},
      });
      log(s.id, p.id, 'created', FORMATS[s.format]);
    }
    s.updatedAt = now();
    db.sessions[s.id] = s;
    save();
    return s.id;
  }

  function publish(actorId, sessionId) {
    const p = actor(actorId);
    const s = sessionFor(p, sessionId);
    check(isManager(p), 'forbidden', 'Only QA admins and QA Leads can publish.');
    validateComplete(s);
    move(s, 'scheduled', p, 'published to participants');
    s.publishedAt = now();
    save();
  }

  function start(actorId, sessionId) {
    const p = actor(actorId);
    const s = sessionFor(p, sessionId);
    check(isRunner(p, s), 'forbidden', 'Only the facilitator or a QA Lead can start this session.');
    move(s, needsSubmissions(s) ? 'awaiting_submissions' : 'in_progress', p);
    save();
  }

  function updateMeetingLink(actorId, sessionId, link) {
    const p = actor(actorId);
    const s = sessionFor(p, sessionId);
    check(isRunner(p, s), 'forbidden', 'Only the facilitator or a QA Lead can change the meeting link.');
    check(!TERMINAL.includes(s.status), 'locked', 'This session is closed.');
    Object.assign(s, normalise({ meetingLink: link }, s));
    log(s.id, p.id, 'meeting_link', s.meetingLink ? 'updated' : 'removed');
    save();
  }

  /* ---------- independent scorecards ---------- */

  function cleanRatings(sc, ratings) {
    const out = {};
    const ids = new Set(criteriaOf(sc).map((c) => c.id));
    for (const [cid, r] of Object.entries(ratings || {})) {
      check(ids.has(cid), 'invalid', 'Unknown scorecard item.');
      const value = r?.value === undefined || r?.value === '' ? '' : String(r.value);
      check(!value || isValidRating(sc, value), 'invalid', `“${value}” is not a rating on this scorecard.`);
      out[cid] = { value, comment: text(r.comment, 2000), evidence: text(r.evidence, 300) };
    }
    return out;
  }

  function saveSubmission(actorId, sessionId, { ratings, overallComment } = {}) {
    const p = actor(actorId);
    const s = sessionFor(p, sessionId);
    check(s.reviewerIds.includes(p.id), 'forbidden', 'Only assigned reviewers submit scorecards.');
    check(needsSubmissions(s), 'invalid', 'This session does not use individual scorecards.');
    check(s.status === 'awaiting_submissions', 'locked', 'Scorecards are not open for this session.');
    let sub = subsOf(s.id).find((x) => x.reviewerId === p.id);
    check(!sub || sub.status === 'draft', 'locked', 'Your scorecard is submitted and locked.');
    const sc = getScorecard(s.scorecardId);
    if (!sub) {
      sub = { id: id('sub'), sessionId: s.id, reviewerId: p.id, status: 'draft', ratings: {}, overallComment: '', history: [] };
      db.submissions[sub.id] = sub;
    }
    sub.ratings = { ...sub.ratings, ...cleanRatings(sc, ratings) };
    if (overallComment !== undefined) sub.overallComment = text(overallComment, 4000);
    sub.updatedAt = now();
    save();
    return sub.id;
  }

  function submit(actorId, sessionId, payload) {
    saveSubmission(actorId, sessionId, payload);
    const p = actor(actorId);
    const s = db.sessions[sessionId];
    const sub = subsOf(s.id).find((x) => x.reviewerId === p.id);
    const missing = criteriaOf(getScorecard(s.scorecardId)).filter((c) => !sub.ratings[c.id]?.value);
    check(!missing.length, 'invalid', `Rate every item before submitting (${missing.length} left).`);
    sub.status = 'submitted';
    sub.submittedAt = now();
    log(s.id, p.id, 'submitted', 'scorecard locked');
    if (s.reviewerIds.every((r) => submittedOf(s.id).some((x) => x.reviewerId === r))) move(s, 'ready_to_reveal', p, 'all reviewers submitted');
    save();
  }

  function reopenSubmission(actorId, sessionId, reviewerId, reason) {
    const p = actor(actorId);
    const s = sessionFor(p, sessionId);
    check(isManager(p), 'forbidden', 'Only QA admins and QA Leads can reopen a submission.');
    check(['awaiting_submissions', 'ready_to_reveal'].includes(s.status), 'locked', 'Submissions can only be reopened before the reveal.');
    check(text(reason).length >= 10, 'invalid', 'Give a reason (at least 10 characters). It is kept in the audit trail.');
    const sub = submittedOf(s.id).find((x) => x.reviewerId === reviewerId);
    check(sub, 'invalid', 'That reviewer has not submitted.');
    sub.history.push({ ratings: clone(sub.ratings), overallComment: sub.overallComment, submittedAt: sub.submittedAt, reopenedAt: now(), reopenedBy: p.id, reason: text(reason) });
    sub.status = 'draft';
    delete sub.submittedAt;
    log(s.id, p.id, 'reopened', `${getPerson(reviewerId)?.name}: ${text(reason)}`);
    if (s.status === 'ready_to_reveal') move(s, 'awaiting_submissions', p, 'submission reopened');
    save();
  }

  function reveal(actorId, sessionId, { exceptionReason } = {}) {
    const p = actor(actorId);
    const s = sessionFor(p, sessionId);
    check(isRunner(p, s), 'forbidden', 'Only the facilitator or a QA Lead can reveal results.');
    check(needsSubmissions(s), 'invalid', 'This session has nothing to reveal.');
    check(submittedOf(s.id).length > 0, 'not_ready', 'Nobody has submitted yet.');
    if (s.status === 'awaiting_submissions') {
      check(isManager(p), 'not_ready', 'All reviewers must submit before the reveal. A QA Lead can approve an exception.');
      check(text(exceptionReason).length >= 10, 'invalid', 'Give a reason for revealing early (at least 10 characters).');
      const waiting = s.reviewerIds.filter((r) => !submittedOf(s.id).some((x) => x.reviewerId === r)).map((r) => getPerson(r)?.name);
      s.revealException = { by: p.id, at: now(), reason: text(exceptionReason), missing: waiting };
      log(s.id, p.id, 'reveal_exception', `${text(exceptionReason)} — not submitted: ${waiting.join(', ')}`);
    }
    // Late or draft scorecards are closed off at the reveal so nobody can score after seeing others.
    for (const d of subsOf(s.id).filter((x) => x.status === 'draft')) d.status = 'closed';
    s.revealedAt = now();
    move(s, 'discussion', p, 'results revealed');
    save();
  }

  /* ---------- discussion, attendance, decision ---------- */

  function addNote(actorId, sessionId, { body, criterionId, timestamp, kind = 'note', private: isPrivate } = {}) {
    const p = actor(actorId);
    const s = sessionFor(p, sessionId);
    const r = rolesIn(p, s);
    check(r.manager || r.facilitator || r.reviewer || r.agent, 'forbidden', 'Only participants can add notes.');
    check(ACTIVE.includes(s.status), 'locked', needsSubmissions(s) && !revealed(s) ? 'Discussion opens after the reveal.' : 'Discussion is not open.');
    check(text(body), 'invalid', 'Write a note first.');
    check(NOTE_KINDS[kind], 'invalid', 'Unknown note type.');
    check(!timestamp || /^\d{1,2}:\d{2}(:\d{2})?$/.test(timestamp), 'invalid', 'Timestamps look like 03:15.');
    check(!criterionId || criteriaOf(getScorecard(s.scorecardId)).some((c) => c.id === criterionId), 'invalid', 'Unknown scorecard item.');
    const n = { id: id('note'), sessionId: s.id, authorId: p.id, at: now(), body: text(body), criterionId: criterionId || '', timestamp: timestamp || '', kind,
      private: s.format === 'agent' && !r.agent && !!isPrivate };
    db.notes[n.id] = n;
    if (kind === 'dispute') log(s.id, p.id, 'dispute', text(body, 120));
    save();
    return n.id;
  }

  function setAttendance(actorId, sessionId, personId, value) {
    const p = actor(actorId);
    const s = sessionFor(p, sessionId);
    check(isRunner(p, s), 'forbidden', 'Only the facilitator or a QA Lead can track attendance.');
    check(!TERMINAL.includes(s.status) && s.status !== 'draft', 'locked', 'Attendance can be changed while the session is open.');
    check([s.facilitatorId, ...s.reviewerIds, s.agentId].includes(personId), 'invalid', 'That person is not in this session.');
    s.attendance = { ...s.attendance, [personId]: { attended: !!value.attended, contributed: !!value.contributed } };
    save();
  }

  function saveDecision(actorId, sessionId, patch) {
    const p = actor(actorId);
    const s = sessionFor(p, sessionId);
    check(isRunner(p, s), 'forbidden', 'Only the facilitator or a QA Lead can record the decision.');
    check(ACTIVE.includes(s.status), 'locked', 'The decision can be recorded once discussion starts.');
    const sc = getScorecard(s.scorecardId);
    const d = db.decisions[s.id] || { sessionId: s.id, ratings: {} };
    if (patch.ratings) {
      const ids = new Set(criteriaOf(sc).map((c) => c.id));
      for (const [cid, r] of Object.entries(patch.ratings)) {
        check(ids.has(cid), 'invalid', 'Unknown scorecard item.');
        check(!r.value || isValidRating(sc, r.value), 'invalid', `“${r.value}” is not a rating on this scorecard.`);
        d.ratings[cid] = { value: r.value ? String(r.value) : '', resolution: text(r.resolution, 2000), disputed: !!r.disputed };
      }
    }
    for (const k of ['rationale', 'learningPoints', 'rubricClarifications', 'internalNotes', 'coachingPoints', 'agreedExpectations']) {
      if (k in patch) d[k] = text(patch[k], 4000);
    }
    d.updatedBy = p.id;
    d.updatedAt = now();
    db.decisions[s.id] = d;
    log(s.id, p.id, 'decision_saved');
    save();
  }

  function escalate(actorId, sessionId, reason) {
    const p = actor(actorId);
    const s = sessionFor(p, sessionId);
    check(isRunner(p, s), 'forbidden', 'Only the facilitator or a QA Lead can do this.');
    check(text(reason), 'invalid', 'Say why the group could not agree.');
    s.escalation = { by: p.id, at: now(), reason: text(reason) };
    move(s, 'awaiting_final_decision', p, 'sent to QA Lead');
    save();
  }

  function resumeDiscussion(actorId, sessionId) {
    const p = actor(actorId);
    const s = sessionFor(p, sessionId);
    check(isRunner(p, s), 'forbidden', 'Only the facilitator or a QA Lead can do this.');
    move(s, needsSubmissions(s) ? 'discussion' : 'in_progress', p);
    save();
  }

  function finalize(actorId, sessionId, { consensus = 'consensus', leadReason = '', shareWith = [] } = {}) {
    const p = actor(actorId);
    const s = sessionFor(p, sessionId);
    check(isRunner(p, s), 'forbidden', 'Only the facilitator or a QA Lead can finalize.');
    check(canTransition(s, 'completed'), 'bad_transition', `A session that is ${STATUS_LABEL[s.status]} cannot be finalized.`);
    check(['consensus', 'lead_decision'].includes(consensus), 'invalid', 'Say how the decision was reached.');
    if (consensus === 'lead_decision') {
      check(isManager(p), 'forbidden', 'Only a QA Lead or admin can make the final call without consensus.');
      check(text(leadReason).length >= 10, 'invalid', 'Record why the QA Lead made the final call (at least 10 characters).');
    }
    const d = db.decisions[s.id];
    const sc = getScorecard(s.scorecardId);
    const missing = criteriaOf(sc).filter((c) => !d?.ratings?.[c.id]?.value);
    check(!missing.length, 'invalid', `Record a final rating for every item (${missing.length} left).`);
    const cmp = compareSession(sc, revealed(s) ? submittedOf(s.id) : [], d.ratings, s.baseline);
    const open = criteriaOf(sc).filter((c) => (d.ratings[c.id].disputed || cmp.criteria.find((x) => x.id === c.id).flagged) && !d.ratings[c.id].resolution);
    check(!open.length, 'invalid', `Add a resolution note for every flagged or disputed item (${open.map((c) => c.name).join(', ')}).`);
    check(text(d.rationale), 'invalid', 'Add the rationale for the final decision.');
    const share = [...new Set(shareWith)].filter((t) => SHARE_TARGETS[t] && (t !== 'agent' || s.format === 'agent'));
    Object.assign(d, { consensus, leadReason: consensus === 'lead_decision' ? text(leadReason) : '', shareWith: share, finalizedBy: p.id, finalizedAt: now() });
    move(s, 'completed', p, consensus === 'lead_decision' ? 'QA Lead decision' : 'consensus');
    log(s.id, p.id, 'finalized', `shared with: ${share.map((t) => SHARE_TARGETS[t]).join(', ') || 'nobody'}`);
    if (s.recurring?.enabled) createNext(p, s, {});
    save();
  }

  function cancel(actorId, sessionId, reason) {
    const p = actor(actorId);
    const s = sessionFor(p, sessionId);
    check(isManager(p), 'forbidden', 'Only QA admins and QA Leads can cancel.');
    check(text(reason), 'invalid', 'Give a reason for cancelling.');
    move(s, 'cancelled', p, text(reason));
    save();
  }

  /* ---------- action items and cadence ---------- */

  function addAction(actorId, sessionId, { body, ownerId, dueDate, kind = 'followup' }) {
    const p = actor(actorId);
    const s = sessionFor(p, sessionId);
    check(isRunner(p, s), 'forbidden', 'Only the facilitator or a QA Lead can add action items.');
    check(!['draft', 'cancelled'].includes(s.status), 'locked', 'Action items can be added once the session is under way.');
    check(text(body), 'invalid', 'Describe the action.');
    check(ACTION_KINDS[kind], 'invalid', 'Pick an action type.');
    const owner = getPerson(ownerId);
    check(owner && (owner.role !== 'agent' || owner.id === s.agentId), 'invalid', 'Pick an owner from the QA team or this session’s agent.');
    check(!dueDate || !Number.isNaN(Date.parse(dueDate)), 'invalid', 'Enter a valid follow-up date.');
    const a = { id: id('act'), sessionId: s.id, body: text(body, 1000), ownerId, dueDate: dueDate || '', kind, status: 'open', createdBy: p.id, createdAt: now() };
    db.actions[a.id] = a;
    log(s.id, p.id, 'action_added', `${ACTION_KINDS[kind]} for ${owner.name}`);
    save();
    return a.id;
  }

  function setActionDone(actorId, actionId, done) {
    const p = actor(actorId);
    const a = db.actions[actionId] || fail('not_found', 'Action not found.');
    const s = sessionFor(p, a.sessionId);
    check(isRunner(p, s) || a.ownerId === p.id, 'forbidden', 'Only the owner, facilitator or a QA Lead can update this action.');
    a.status = done ? 'done' : 'open';
    a.completedAt = done ? now() : null;
    log(s.id, p.id, done ? 'action_done' : 'action_reopened', a.body.slice(0, 80));
    save();
  }

  function createNext(p, s, { scheduledAt, facilitatorId }) {
    let fac = facilitatorId || s.facilitatorId;
    if (!facilitatorId && s.recurring?.rotateFacilitator && s.reviewerIds.length) {
      // Rotate: the first reviewer facilitates next time; the facilitator joins the reviewers.
      fac = s.reviewerIds[0];
    }
    const reviewers = fac === s.facilitatorId ? s.reviewerIds : [...s.reviewerIds.filter((r) => r !== fac), s.facilitatorId];
    const next = {
      ...clone(s), id: id('cal'), title: s.title.replace(/ \(next\)$/, '') + ' (next)', connectionId: '', agentId: null,
      scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : addCadence(s.scheduledAt || now(), s.recurring?.cadence || 'monthly'),
      facilitatorId: fac, reviewerIds: reviewers, status: 'draft', createdBy: p.id, createdAt: now(), updatedAt: now(), attendance: {},
      previousId: s.id,
    };
    for (const k of ['publishedAt', 'revealedAt', 'revealException', 'escalation', 'nextId']) delete next[k];
    db.sessions[next.id] = next;
    s.nextId = next.id;
    log(s.id, p.id, 'next_scheduled', `${next.id} on ${next.scheduledAt.slice(0, 10)}`);
    log(next.id, p.id, 'created', `follow-on from ${s.title}`);
    return next.id;
  }

  function scheduleNext(actorId, sessionId, opts = {}) {
    const p = actor(actorId);
    const s = sessionFor(p, sessionId);
    check(isManager(p), 'forbidden', 'Only QA admins and QA Leads can schedule the next calibration.');
    check(!s.nextId || !db.sessions[s.nextId], 'invalid', 'The next calibration is already scheduled.');
    const nid = createNext(p, s, opts);
    save();
    return nid;
  }

  /* ---------- views (filtered per viewer) ---------- */

  function nextStep(p, s) {
    const r = rolesIn(p, s);
    const mine = subsOf(s.id).find((x) => x.reviewerId === p.id);
    const runner = r.manager || r.facilitator;
    switch (s.status) {
      case 'draft': return 'Finish setup and publish';
      case 'scheduled': return runner ? 'Start the session when ready' : 'Prepare: review the call and rubric';
      case 'awaiting_submissions':
        if (r.reviewer) return mine?.status === 'submitted' ? 'Submitted — waiting for others' : 'Complete your scorecard';
        return runner ? 'Waiting for reviewers to submit' : 'Waiting for reviewers';
      case 'ready_to_reveal': return runner ? 'Reveal the results' : 'Waiting for the reveal';
      case 'discussion': case 'in_progress': return runner ? 'Guide discussion and record the decision' : 'Join the discussion';
      case 'awaiting_final_decision': return r.manager ? 'Make the final decision' : 'Waiting for the QA Lead';
      case 'completed': return 'View outcome';
      default: return '';
    }
  }

  function card(p, s) {
    const r = rolesIn(p, s);
    const call = getCall(s.connectionId);
    const qaView = !r.agent || r.manager;
    return {
      id: s.id, title: s.title || 'Untitled calibration', format: s.format, status: s.status, scheduledAt: s.scheduledAt,
      connectionId: s.connectionId, agentName: call && (qaView || r.agent) ? call.agentName : '',
      facilitatorName: getPerson(s.facilitatorId)?.name || '',
      myRoles: Object.keys(r).filter((k) => r[k]),
      nextStep: nextStep(p, s),
      needsMe: needsAction(p, s),
      submissions: qaView && needsSubmissions(s) ? { done: submittedOf(s.id).length, required: s.reviewerIds.length } : null,
    };
  }

  function needsAction(p, s) {
    const r = rolesIn(p, s);
    if (s.status === 'awaiting_submissions' && r.reviewer) return subsOf(s.id).find((x) => x.reviewerId === p.id)?.status !== 'submitted';
    if (s.status === 'ready_to_reveal' || ACTIVE.includes(s.status)) return r.facilitator || (r.manager && s.status === 'awaiting_final_decision');
    if (s.status === 'scheduled') return r.facilitator;
    if (s.status === 'draft') return r.manager && s.createdBy === p.id;
    return false;
  }

  function listSessions(actorId) {
    const p = actor(actorId);
    return Object.values(db.sessions)
      .filter((s) => canView(p, s))
      .map((s) => card(p, s))
      .sort((a, b) => (a.scheduledAt || '9').localeCompare(b.scheduledAt || '9'));
  }

  function getSession(actorId, sessionId) {
    const p = actor(actorId);
    const s = sessionFor(p, sessionId);
    const r = rolesIn(p, s);
    const qa = r.manager || r.facilitator || r.reviewer; // QA-side viewer
    const sc = getScorecard(s.scorecardId);
    const call = getCall(s.connectionId);
    const subs = subsOf(s.id);
    const submitted = submittedOf(s.id);
    const decision = db.decisions[s.id];
    const showOthers = qa && revealed(s);
    const decisionVisible = decision && (r.manager || r.facilitator || (r.reviewer && (ACTIVE.includes(s.status) || s.status === 'completed'))
      || (r.agent && s.status === 'completed' && decision.shareWith?.includes('agent')));
    const name = (pid) => getPerson(pid)?.name || 'Unknown';

    const view = {
      ...card(p, s),
      roles: r,
      canManage: r.manager,
      canRun: r.manager || r.facilitator,
      needsSubmissions: needsSubmissions(s),
      revealed: revealed(s),
      flow: flowFor(s),
      goal: s.goal,
      instructions: qa ? s.instructions : '',
      meetingLink: s.meetingLink,
      baseline: s.baseline,
      preReview: !!s.preReview,
      recurring: r.manager ? s.recurring : null,
      scorecard: sc,
      call: call && {
        connectionId: call.connectionId, agentName: call.agentName, date: call.date, duration: call.duration, queue: call.queue,
        customer: call.customer, recordingUrl: call.recordingUrl, transcript: call.transcript,
        // Hidden from reviewers until the reveal so it cannot bias an independent score.
        originalEvaluation: (s.format === 'agent' || r.manager) && !(r.reviewer && needsSubmissions(s) && !revealed(s)) ? call.originalEvaluation : null,
      },
      participants: [
        { id: s.facilitatorId, name: name(s.facilitatorId), role: 'Facilitator' },
        ...s.reviewerIds.map((rid) => ({ id: rid, name: name(rid), role: 'QA Reviewer' })),
        ...(s.agentId ? [{ id: s.agentId, name: name(s.agentId), role: 'Agent' }] : []),
      ].filter((x) => x.id).map((x) => ({
        ...x,
        // Everyone on the QA side may see who has submitted; nobody sees verdicts before the reveal.
        submission: qa && s.reviewerIds.includes(x.id) && needsSubmissions(s)
          ? (() => { const sub = subs.find((y) => y.reviewerId === x.id); return { status: sub?.status || 'not_started', submittedAt: sub?.submittedAt || null }; })()
          : null,
        attendance: s.attendance?.[x.id] || null,
      })),
      mySubmission: r.reviewer ? clone(subs.find((x) => x.reviewerId === p.id) || null) : null,
      submissions: showOthers ? submitted.map((x) => ({ reviewerId: x.reviewerId, reviewerName: name(x.reviewerId), ratings: clone(x.ratings), overallComment: x.overallComment, submittedAt: x.submittedAt, reopened: x.history.length })) : null,
      comparison: showOthers ? compareSession(sc, submitted, decision?.ratings, s.baseline) : null,
      revealException: qa ? s.revealException || null : null,
      escalation: qa ? s.escalation || null : null,
      notes: ACTIVE.includes(s.status) || s.status === 'completed'
        ? Object.values(db.notes).filter((n) => n.sessionId === s.id && (!n.private || qa)).map((n) => ({ ...n, authorName: name(n.authorId) }))
        : [],
      decision: decisionVisible ? (qa ? clone(decision) : {
        // The agent sees the agreed outcome and their coaching, not internal QA notes.
        ratings: clone(decision.ratings), rationale: decision.rationale, coachingPoints: decision.coachingPoints,
        agreedExpectations: decision.agreedExpectations, finalizedAt: decision.finalizedAt,
      }) : null,
      decisionByName: decision?.finalizedBy ? name(decision.finalizedBy) : null,
      actions: Object.values(db.actions).filter((a) => a.sessionId === s.id && (qa || a.ownerId === p.id || (s.status === 'completed' && a.kind !== 'rubric')))
        .map((a) => ({ ...a, ownerName: name(a.ownerId), canToggle: r.manager || r.facilitator || a.ownerId === p.id })),
      audit: r.manager || r.facilitator ? db.audit.filter((x) => x.sessionId === s.id).map((x) => ({ ...x, actorName: name(x.actorId) })).reverse() : null,
      raw: r.manager && ['draft', 'scheduled'].includes(s.status) ? clone(s) : null,
      nextId: r.manager ? s.nextId || null : null,
    };
    return view;
  }

  // Reports cover sessions the viewer runs or reviews; agents get no reports.
  function getReport(actorId, filters = {}) {
    const p = actor(actorId);
    check(p.role !== 'agent', 'forbidden', 'Reports are for the QA team.');
    const inRange = (s) => (!filters.from || (s.scheduledAt || '') >= filters.from) && (!filters.to || (s.scheduledAt || '').slice(0, 10) <= filters.to);
    const sessions = Object.values(db.sessions).filter((s) => {
      const r = rolesIn(p, s);
      return (r.manager || ((r.facilitator || r.reviewer) && s.status !== 'draft'))
        && inRange(s)
        && (!filters.format || s.format === filters.format)
        && (!filters.status || s.status === filters.status)
        && (!filters.facilitatorId || s.facilitatorId === filters.facilitatorId)
        && (!filters.agent || (getCall(s.connectionId)?.agentName || '').toLowerCase().includes(filters.agent.toLowerCase()))
        && (!filters.connectionId || s.connectionId.toLowerCase().includes(filters.connectionId.toLowerCase()));
    });

    const rows = sessions.map((s) => {
      const sc = getScorecard(s.scorecardId);
      const d = db.decisions[s.id];
      const cmp = revealed(s) ? compareSession(sc, submittedOf(s.id), d?.ratings, s.baseline) : (d ? compareSession(sc, [], d.ratings, s.baseline) : null);
      const unresolved = cmp && s.status !== 'completed'
        ? cmp.criteria.filter((c) => (c.flagged || d?.ratings?.[c.id]?.disputed) && !(d?.ratings?.[c.id]?.value && d.ratings[c.id].resolution)).map((c) => c.name)
        : [];
      return {
        id: s.id, title: s.title || 'Untitled', format: s.format, status: s.status, scheduledAt: s.scheduledAt,
        connectionId: s.connectionId, agentName: getCall(s.connectionId)?.agentName || '', facilitatorName: getPerson(s.facilitatorId)?.name || '',
        reviewers: s.reviewerIds.length,
        submitted: needsSubmissions(s) ? submittedOf(s.id).length : null,
        completionRate: needsSubmissions(s) && s.reviewerIds.length ? Math.round((submittedOf(s.id).length / s.reviewerIds.length) * 100) : null,
        revealed: revealed(s),
        agreementPct: revealed(s) ? cmp?.agreementPct ?? null : null,
        finalOverall: d?.finalizedAt ? cmp?.finalOverall ?? null : null,
        overallSpread: revealed(s) ? cmp?.overallSpread ?? null : null,
        flagged: revealed(s) ? cmp.criteria.filter((c) => c.flagged).map((c) => ({ id: c.id, name: c.name, categoryName: c.categoryName, variancePct: c.variancePct, agreement: c.finalAgreement || c.agreement })) : [],
        reviewerScores: revealed(s) ? cmp.reviewers.map((x) => ({ ...x, name: getPerson(x.reviewerId)?.name })) : [],
        baseline: s.baseline,
        unresolved,
        consensus: d?.finalizedAt ? d.consensus : null,
      };
    }).sort((a, b) => (b.scheduledAt || '').localeCompare(a.scheduledAt || ''));

    const live = rows.filter((x) => x.status !== 'cancelled');
    const withAgreement = live.filter((x) => x.agreementPct !== null);
    const avg = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
    const months = {};
    for (const x of withAgreement) {
      const m = (x.scheduledAt || '').slice(0, 7);
      (months[m] ||= []).push(x);
    }
    const recurring = {};
    for (const x of live) for (const f of x.flagged) {
      recurring[f.id] ||= { name: f.name, categoryName: f.categoryName, count: 0 };
      recurring[f.id].count += 1;
    }
    const ids = new Set(sessions.map((s) => s.id));
    const today = now().slice(0, 10);
    return {
      rows,
      summary: {
        total: live.length,
        upcoming: live.filter((x) => ['draft', 'scheduled'].includes(x.status) && (x.scheduledAt || '9') >= today).length,
        active: live.filter((x) => !['draft', 'scheduled', 'completed'].includes(x.status)).length,
        completed: live.filter((x) => x.status === 'completed').length,
        byFormat: Object.fromEntries(Object.keys(FORMATS).map((f) => [f, live.filter((x) => x.format === f).length])),
        completionRate: avg(live.filter((x) => x.completionRate !== null && x.status !== 'draft' && x.status !== 'scheduled').map((x) => x.completionRate)),
        avgAgreement: avg(withAgreement.map((x) => x.agreementPct)),
        overBaseline: live.filter((x) => x.flagged.length).length,
        unresolved: live.reduce((a, x) => a + x.unresolved.length, 0),
        leadDecisions: live.filter((x) => x.consensus === 'lead_decision').length,
      },
      trend: Object.keys(months).sort().map((m) => ({ month: m, sessions: months[m].length, avgAgreement: avg(months[m].map((x) => x.agreementPct)), overBaseline: months[m].filter((x) => x.flagged.length).length })),
      recurringDisagreements: Object.values(recurring).sort((a, b) => b.count - a.count),
      actions: Object.values(db.actions).filter((a) => ids.has(a.sessionId) && (isManager(p) || db.sessions[a.sessionId].facilitatorId === p.id || a.ownerId === p.id || db.sessions[a.sessionId].reviewerIds.includes(p.id)))
        .map((a) => ({ ...a, ownerName: getPerson(a.ownerId)?.name, sessionTitle: db.sessions[a.sessionId].title, overdue: a.status === 'open' && a.dueDate && a.dueDate < today }))
        .sort((a, b) => (a.status === b.status ? (a.dueDate || '9').localeCompare(b.dueDate || '9') : a.status === 'open' ? -1 : 1)),
    };
  }

  function reset(seed) {
    db = emptyDb();
    if (seed) seed(api);
    save();
  }

  const api = {
    saveDraft, publish, start, updateMeetingLink, saveSubmission, submit, reopenSubmission, reveal, addNote, setAttendance, saveDecision,
    escalate, resumeDiscussion, finalize, cancel, addAction, setActionDone, scheduleNext, listSessions, getSession, getReport, reset,
    isEmpty: () => !Object.keys(db.sessions).length,
  };
  return api;
}

export function memoryStorage() {
  let data = null;
  return { load: () => clone(data), save: (d) => { data = clone(d); } };
}

export function browserStorage(key) {
  let fallback = null;
  return {
    load: () => {
      try { return JSON.parse(localStorage.getItem(key)) || null; } catch { return clone(fallback); }
    },
    save: (d) => {
      fallback = clone(d);
      try { localStorage.setItem(key, JSON.stringify(d)); } catch { /* private mode: keep in memory */ }
    },
  };
}
