// Team Reports · Call Calibration: data model and access rules.
//
// Two roles: Admin, and participants (CAM / CX / Lead). The Admin prepares a
// call internally, schedules a Blind, Team or Agent session and assigns
// participants. In a Blind session each participant submits Soft / Technical
// verdicts on their own and the response locks. Participants only ever see
// their own response; the Admin can open the individual verdicts once every
// assigned participant has submitted, then records the final outcome.
// Every function takes the acting user, so these checks are the access rules.

export const ADMIN = 'admin';
export const PEOPLE = {
  admin: { id: 'admin', name: 'Admin User', role: 'Admin', initials: 'AD' },
  ...Object.fromEntries([
    ['avery', 'Avery Morgan'], ['blake', 'Blake Fernandes'], ['casey', 'Casey Thomas'], ['devi', 'Devi Krishnan'], ['elena', 'Elena Rossi'],
    ['farhan', 'Farhan Ali'], ['grace', 'Grace Lin'], ['hari', 'Hari Prakash'], ['isla', 'Isla Novak'],
  ].map(([id, name]) => [id, { id, name, role: 'CAM / CX / Lead', initials: name.split(' ').map((p) => p[0]).join('') }])),
};
export const PARTICIPANTS = Object.values(PEOPLE).filter((p) => p.id !== ADMIN);
export const FACILITATORS = ['QA Lead – Maya', 'QA Lead – Ravi', 'QA Analyst – Jo', 'QA Analyst – Sam'];

// Sample Call Library. A real build loads these by Connection ID from Call Library.
export const CALL_LIBRARY = [
  { id: 'CN-10482', line: 'Reception line', date: '2026-10-21', duration: '04:18' },
  { id: 'CN-10496', line: 'Legal intake line', date: '2026-10-22', duration: '03:42' },
  { id: 'CN-10371', line: 'Support line', date: '2026-10-20', duration: '06:07' },
  { id: 'CN-10511', line: 'Sales line', date: '2026-10-23', duration: '02:56' },
  { id: 'CN-10288', line: 'Reception line', date: '2026-10-14', duration: '05:12' },
];

export const FORMATS = {
  blind: { name: 'Blind session', help: 'Each participant submits independently; verdicts lock. Admin compares once everyone has submitted.' },
  team: { name: 'Team session', help: 'Participants review the same call together in a meeting and agree how the standard applies.' },
  agent: { name: 'Agent session', help: 'QA, CX Leads and CAMs review the call together to build shared quality awareness and coaching.' },
};
export const VERDICTS = ['Good', 'Not Yet'];
export const INTERNAL_CHECKS = [
  ['connectionConfirmed', 'Connection ID and recording confirmed', 'The recording matches the selected interaction.'],
  ['recordingReviewed', 'Recording reviewed internally', 'The sample is ready for the external session.'],
  ['contextChecked', 'Task context checked', 'Relevant notes and configuration have been reviewed.'],
];
const TIMESTAMP = /^\d{1,2}:\d{2}(\s*[–-]\s*\d{1,2}:\d{2})?$/;

export class RuleError extends Error {}
const fail = (m) => { throw new RuleError(m); };
const check = (ok, m) => { if (!ok) fail(m); };
const clone = (x) => (x === undefined ? x : JSON.parse(JSON.stringify(x)));
const txt = (v, max = 2000) => String(v ?? '').trim().slice(0, max);

export const person = (id) => PEOPLE[id] || { id, name: id, role: 'Participant', initials: '?' };
export const callFor = (id) => CALL_LIBRARY.find((c) => c.id === id) || null;
export const isAdmin = (userId) => userId === ADMIN;

// Status shown in tables, derived from progress.
export function statusOf(s) {
  if (s.status === 'completed') return { key: 'completed', label: 'Completed', tone: 'green' };
  if (s.format === 'blind') {
    const done = s.submissions.length;
    if (done === s.participants.length) return { key: 'ready', label: 'Ready to discuss', tone: 'amber' };
    if (done > 0) return { key: 'in_review', label: 'Blind review in progress', tone: 'blue' };
    return { key: 'awaiting', label: 'Awaiting reviews', tone: '' };
  }
  return { key: 'scheduled', label: 'Scheduled', tone: '' };
}

// Majority share for a verdict, as a discussion aid (never the final outcome).
export function agreement(subs, key) {
  const vals = subs.map((x) => x[key]).filter(Boolean);
  if (!vals.length) return null;
  const good = vals.filter((v) => v === 'Good').length;
  const notYet = vals.length - good;
  if (good === notYet) return { label: 'No majority', pct: 50, majority: null, count: `${good}/${vals.length}` };
  const majority = good > notYet ? 'Good' : 'Not Yet';
  const n = Math.max(good, notYet);
  return { label: `${Math.round((n / vals.length) * 100)}%`, pct: Math.round((n / vals.length) * 100), majority, count: `${n}/${vals.length}` };
}

const emptyDb = () => ({ version: 4, seq: 0, sessions: [], audit: [] });

export function createStore({ storage, now = () => new Date().toISOString() }) {
  let db = storage.load();
  if (!db || db.version !== 4) db = emptyDb(); // older sample data is replaced
  const save = () => storage.save(db);
  const actor = (id) => PEOPLE[id] || fail('Choose a demo account to continue.');
  const requireAdmin = (id) => { actor(id); check(isAdmin(id), 'Only Admin can do this.'); };
  const find = (id) => db.sessions.find((s) => s.id === id) || fail('Session not found.');
  const log = (userId, sessionId, action) => db.audit.push({ at: now(), actor: person(userId).name, session: sessionId, action });
  const allSubmitted = (s) => s.submissions.length === s.participants.length;

  /* ---------- views ---------- */

  function list(userId) {
    actor(userId);
    const ss = isAdmin(userId) ? db.sessions : db.sessions.filter((s) => s.participants.includes(userId));
    return ss.map((s) => (isAdmin(userId) ? adminView(s) : participantView(s, userId)));
  }

  // Admin sees progress always, but reviewer-level verdicts only after the comparison is opened.
  function adminView(s) {
    const open = !!s.comparisonOpenedAt && allSubmitted(s);
    return {
      ...clone({ ...s, submissions: undefined }),
      status: statusOf(s), submitted: s.submissions.length,
      progress: s.participants.map((p) => ({ userId: p, submittedAt: s.submissions.find((x) => x.userId === p)?.submittedAt || null })),
      submissions: open ? clone(s.submissions) : null,
      comparisonOpen: open,
    };
  }

  // A participant sees their own response only, and the shared outcome once completed.
  function participantView(s, userId) {
    return {
      id: s.id, connectionId: s.connectionId, format: s.format, date: s.date, time: s.time, facilitator: s.facilitator, meetLink: s.meetLink,
      participants: clone(s.participants), status: statusOf(s), completed: s.status === 'completed',
      mine: clone(s.submissions.find((x) => x.userId === userId) || null),
      outcome: s.status === 'completed' ? clone(s.final) : null,
    };
  }

  function get(userId, id) {
    actor(userId);
    const s = find(id);
    if (isAdmin(userId)) return adminView(s);
    check(s.participants.includes(userId), 'This session is not assigned to you.');
    return participantView(s, userId);
  }

  /* ---------- admin: create and edit ---------- */

  function createSession(userId, input) {
    requireAdmin(userId);
    check(callFor(input.connectionId), 'Choose a Connection ID from the Call Library.');
    check(FORMATS[input.format], 'Choose a calibration format.');
    check(input.date && !Number.isNaN(Date.parse(input.date)), 'Date is required.');
    check(/^\d{2}:\d{2}$/.test(input.time || ''), 'Time is required.');
    check(FACILITATORS.includes(input.facilitator), 'Choose a facilitator.');
    const meetLink = txt(input.meetLink, 300);
    check(!meetLink || /^https:\/\/\S+$/.test(meetLink), 'Meeting link must start with https://');
    const participants = [...new Set(input.participants || [])].filter((p) => PARTICIPANTS.some((x) => x.id === p));
    check(participants.length >= 1, 'Assign at least one participant.');
    check(INTERNAL_CHECKS.every(([k]) => input.internalReview?.[k]), 'Complete the internal QA preparation checklist before scheduling.');
    const n = Math.max(0, ...db.sessions.map((s) => Number(s.id.split('-')[1]) || 0)) + 1;
    const s = {
      id: `CAL-${String(n).padStart(3, '0')}`, connectionId: input.connectionId, format: input.format, date: input.date, time: input.time,
      facilitator: input.facilitator, participants, meetLink, status: 'scheduled', submissions: [], comparisonOpenedAt: null,
      final: { soft: '', tech: '', summary: '', takeaways: '', actions: '' }, internalReview: { connectionConfirmed: true, recordingReviewed: true, contextChecked: true },
      createdAt: now(),
    };
    db.sessions.unshift(s);
    log(userId, s.id, 'Internal check passed; calibration session created');
    save();
    return s.id;
  }

  // Participants who already submitted cannot be removed: their original response stays on record.
  function editSession(userId, id, { facilitator, meetLink, participants }) {
    requireAdmin(userId);
    const s = find(id);
    check(s.status !== 'completed', 'Completed sessions cannot be edited.');
    check(FACILITATORS.includes(facilitator), 'Choose a facilitator.');
    const link = txt(meetLink, 300);
    check(!link || /^https:\/\/\S+$/.test(link), 'Meeting link must start with https://');
    const picked = (participants || []).filter((p) => PARTICIPANTS.some((x) => x.id === p));
    const next = [...new Set([...picked, ...s.submissions.map((x) => x.userId)])];
    check(next.length >= 1, 'Assign at least one participant.');
    Object.assign(s, { facilitator, meetLink: link, participants: next });
    log(userId, s.id, 'Session setup updated');
    save();
  }

  /* ---------- participant: blind submission ---------- */

  function submit(userId, id, { soft, tech, evidence, comments }) {
    actor(userId);
    const s = find(id);
    check(!isAdmin(userId), 'Admin does not submit a verdict.');
    check(s.participants.includes(userId), 'This session is not assigned to you.');
    check(s.format === 'blind', 'Only Blind sessions use independent submissions.');
    check(s.status !== 'completed', 'This session is completed.');
    check(!s.submissions.some((x) => x.userId === userId), 'Your verdict has already been submitted and locked.');
    check(VERDICTS.includes(soft) && VERDICTS.includes(tech), 'Choose both verdicts before submitting.');
    const ev = txt(evidence, 20);
    check(!ev || TIMESTAMP.test(ev), 'Evidence timestamps look like 01:24 or 01:15–01:30.');
    s.submissions.push({ userId, soft, tech, evidence: ev, comments: txt(comments), submittedAt: now() });
    s.status = 'in_progress';
    log(userId, s.id, 'Blind submission locked');
    save();
  }

  /* ---------- admin: compare and record outcome ---------- */

  function openComparison(userId, id) {
    requireAdmin(userId);
    const s = find(id);
    check(s.format === 'blind', 'Only Blind sessions have individual submissions.');
    check(allSubmitted(s), 'Comparison unlocks after every assigned participant has submitted.');
    if (!s.comparisonOpenedAt) {
      s.comparisonOpenedAt = now();
      log(userId, s.id, 'Admin opened individual submissions');
      save();
    }
  }

  function saveOutcome(userId, id, input) {
    requireAdmin(userId);
    const s = find(id);
    const final = {
      soft: input.soft || '', tech: input.tech || '', summary: txt(input.summary, 4000), takeaways: txt(input.takeaways, 4000), actions: txt(input.actions, 2000),
    };
    for (const v of [final.soft, final.tech]) check(!v || VERDICTS.includes(v), 'Unknown verdict.');
    if (s.format === 'blind') {
      check(allSubmitted(s) && s.comparisonOpenedAt, 'Open the individual submissions before recording the outcome.');
      check(final.soft && final.tech, 'Select the final Soft Skills and Technical Skills outcomes.');
    }
    check(final.summary, 'Add a summary of what the group agreed.');
    const updating = s.status === 'completed';
    s.final = final;
    s.status = 'completed';
    s.completedAt = s.completedAt || now();
    log(userId, s.id, updating ? 'Outcome updated' : `${FORMATS[s.format].name} outcome saved`);
    save();
  }

  function audit(userId) {
    requireAdmin(userId);
    return clone(db.audit).reverse();
  }

  function reset(seed) {
    db = emptyDb();
    if (seed) seed(api);
    save();
  }

  const api = { list, get, createSession, editSession, submit, openComparison, saveOutcome, audit, reset, isEmpty: () => !db.sessions.length };
  return api;
}

export function memoryStorage() {
  let data = null;
  return { load: () => clone(data), save: (d) => { data = clone(d); } };
}

export function browserStorage(key) {
  let fallback = null;
  return {
    load: () => { try { return JSON.parse(localStorage.getItem(key)) || null; } catch { return clone(fallback); } },
    save: (d) => { fallback = clone(d); try { localStorage.setItem(key, JSON.stringify(d)); } catch { /* keep in memory */ } },
  };
}
