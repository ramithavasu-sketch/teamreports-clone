// CX QA Calibration: data model and rules.
//
// One calibration per customer call (Connection ID), in one of three formats:
//   Blind Session - each reviewer evaluates independently, submits and locks;
//                   the facilitator reveals only once everyone has submitted.
//   Team Session  - reviewers score the call together in a meeting.
//   Agent Session - the agent joins to give context; ends with coaching.
// Team and Agent Sessions can add the blind pre-review step before the meeting.
// Discussion points and the final agreed interpretation are stored separately,
// so original verdicts are never changed. All pages go through this file.

import { AGENTS } from '../data.js';

export const FORMATS = {
  blind: { name: 'Blind Session', short: 'Blind', help: 'Reviewers evaluate on their own first. Nobody sees other verdicts until the facilitator reveals them.' },
  team: { name: 'Team Session', short: 'Team', help: 'Reviewers listen and score the call together in a meeting. The facilitator records the agreed verdict.' },
  agent: { name: 'Agent Session', short: 'Agent', help: 'The agent joins to give context. Ends with coaching points, agreed expectations and follow-up actions.' },
};
export const AGENT_NAMES = AGENTS.slice(0, 12).map((a) => a.name);
export const needsEvaluations = (s) => s.format === 'blind' || !!s.preReview;
const discussionStarted = (s) => !!(s.revealedAt || s.startedAt);

// Rules shown on the create form and session details, by format.
export function rulesFor(s) {
  const blind = needsEvaluations(s);
  return [
    ['Format', FORMATS[s.format].name],
    ['Independent evaluation', blind ? (s.format === 'blind' ? 'Always on — blind' : 'Blind pre-review before the meeting') : 'Off — reviewers score together in the meeting'],
    ...(blind ? [['Lock original responses after submission', 'Enabled'], ['Reveal evaluations', 'Only after all required reviewers submit']] : []),
    ...(s.format === 'agent' ? [['Agent visibility', 'Agent sees the outcome, coaching and shared notes — never reviewer evaluations or QA-only notes']] : []),
    ['Evaluation sections', 'Soft Skills and Technical Skills'],
  ];
}

export const SECTIONS = [
  { id: 'soft', name: 'Soft Skills', params: ['Tone', 'Active Listening', 'Empathy', 'Professionalism', 'Accountability', 'Call Control'] },
  { id: 'tech', name: 'Technical Skills', params: ['Query Resolution', 'Required Answer Phrase', 'Verification', 'Hold Procedure', 'Documentation', 'Follow-up'] },
];
export const VERDICTS = ['Good Job', 'Not Yet'];
export const FINDINGS = ['Met', 'Not Met'];
export const REVIEWERS = ['A', 'B', 'C'];
export const FACILITATORS = ['Self', 'Priya Nair (QA Lead)', 'Marcus Hale (Team Lead)'];
export const OWNERS = ['Self', 'Priya Nair (QA Lead)', 'Marcus Hale (Team Lead)', 'Reviewer A', 'Reviewer B', 'Reviewer C'];
export const ownersFor = (s) => (s.agentName ? [...OWNERS, `Agent: ${s.agentName}`] : OWNERS);

export const STATUS = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  in_review: 'In Review',
  ready_to_reveal: 'Ready to Reveal',
  in_discussion: 'In Discussion',
  completed: 'Completed',
};
export const ACTION_STATUS = { open: 'Open', in_progress: 'In Progress', completed: 'Completed' };
export const ACTIVE = ['scheduled', 'in_review', 'ready_to_reveal', 'in_discussion'];

// 00:42 or 01:15–01:30 (en dash or hyphen)
export const TIMESTAMP = /^\d{1,2}:\d{2}(\s*[–-]\s*\d{1,2}:\d{2})?$/;

export class RuleError extends Error {}
const fail = (msg) => { throw new RuleError(msg); };
const check = (ok, msg) => { if (!ok) fail(msg); };
const clone = (x) => (x === undefined ? x : JSON.parse(JSON.stringify(x)));
const txt = (v, max = 2000) => String(v ?? '').trim().slice(0, max);
export const sectionName = (id) => SECTIONS.find((s) => s.id === id)?.name || id;

export const emptyEvaluation = () => ({
  sections: Object.fromEntries(SECTIONS.map((s) => [s.id, { verdict: '', observations: [] }])),
  notes: '',
});

/* ---------- analysis helpers (pure) ---------- */

function majority(values) {
  const counts = {};
  for (const v of values) counts[v] = (counts[v] || 0) + 1;
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (!sorted.length || (sorted[1] && sorted[1][1] === sorted[0][1])) return { value: null, counts };
  return { value: sorted[0][0], counts };
}

// A reviewer's finding for a parameter. If they logged it more than once with
// different findings, Not Met wins (the stricter reading).
function findingFor(evaluation, sectionId, param) {
  const obs = evaluation.sections[sectionId].observations.filter((o) => o.parameter === param);
  if (!obs.length) return null;
  return obs.some((o) => o.finding === 'Not Met') ? 'Not Met' : 'Met';
}

// Compare the locked evaluations of one session. `subs` = [{ reviewer, evaluation }].
export function analyse(subs) {
  const sections = SECTIONS.map((s) => {
    const verdicts = subs.map((x) => ({ reviewer: x.reviewer, verdict: x.evaluation.sections[s.id].verdict }));
    const maj = majority(verdicts.map((v) => v.verdict));
    const unanimous = verdicts.length > 0 && verdicts.every((v) => v.verdict === verdicts[0].verdict);
    const params = s.params.map((p) => {
      const entries = subs.flatMap((x) => x.evaluation.sections[s.id].observations.filter((o) => o.parameter === p).map((o) => ({ ...o, reviewer: x.reviewer })));
      const findings = subs.map((x) => ({ reviewer: x.reviewer, finding: findingFor(x.evaluation, s.id, p) })).filter((f) => f.finding);
      const compared = findings.length >= 2;
      const agree = compared && findings.every((f) => f.finding === findings[0].finding);
      return { parameter: p, entries, findings, compared, agree, tag: !findings.length ? null : !compared ? 'Single reviewer' : agree ? 'Findings agree' : 'Findings differ' };
    }).filter((p) => p.entries.length);
    return { id: s.id, name: s.name, verdicts, majority: maj.value, counts: maj.counts, unanimous, params };
  });
  return { sections };
}

/* ---------- store ---------- */

const emptyDb = () => ({ version: 3, seq: 0, sessions: {}, evaluations: {}, discussion: {}, finals: {}, actions: {} });

export function createStore({ storage, now = () => new Date().toISOString() }) {
  let db = storage.load();
  if (!db || db.version !== 3) db = emptyDb(); // older sample data is replaced
  const save = () => storage.save(db);
  const nextId = (p) => `${p}-${++db.seq}`;

  const session = (id) => db.sessions[id] || fail('Calibration session not found.');
  const evalKey = (sid, r) => `${sid}:${r}`;
  const evals = (sid) => session(sid).reviewers.map((r) => ({ reviewer: r, ...(db.evaluations[evalKey(sid, r)] || { status: 'not_started' }) }));
  const allSubmitted = (sid) => evals(sid).every((e) => e.status === 'submitted');
  const revealed = (sid) => !!session(sid).revealedAt;

  function view(s) {
    const e = evals(s.id);
    const submitted = e.filter((x) => x.status === 'submitted').length;
    const actions = Object.values(db.actions).filter((a) => a.sessionId === s.id);
    const evaluated = needsEvaluations(s);
    return { ...clone(s), statusLabel: STATUS[s.status], needsEvaluations: evaluated, discussionStarted: discussionStarted(s),
      submitted: evaluated ? submitted : 0, required: evaluated ? s.reviewers.length : 0, actions: clone(actions) };
  }

  /* sessions */

  function validateSession(s) {
    check(FORMATS[s.format], 'Choose a calibration format.');
    check(s.name, 'Session name is required.');
    check(s.connectionId, 'Connection ID is required.');
    check(/^[A-Za-z0-9-]{4,40}$/.test(s.connectionId), 'Connection ID can only contain letters, numbers and hyphens.');
    check(s.date && !Number.isNaN(Date.parse(s.date)), 'Date is required.');
    check(/^\d{2}:\d{2}$/.test(s.time || ''), 'Time is required.');
    check(s.facilitator, 'Facilitator is required.');
    check(s.reviewers.length >= (needsEvaluations(s) ? 2 : 1), needsEvaluations(s) ? 'Select at least two reviewers.' : 'Select at least one reviewer.');
    check(!s.meetingLink || /^https:\/\/\S+$/.test(s.meetingLink), 'Meeting link must start with https://');
    if (s.format === 'agent') {
      check(AGENT_NAMES.includes(s.agentName), 'Choose the agent on this call.');
      check(VERDICTS.includes(s.original.soft) && VERDICTS.includes(s.original.tech), 'Add the original QA verdicts for this call.');
    }
  }

  function saveSession(input, id, { publish = false } = {}) {
    const base = id ? session(id) : { id: nextId('ses'), status: 'draft', createdAt: now(), attendance: {} };
    check(base.status === 'draft', 'Only draft sessions can be edited.');
    const format = FORMATS[input.format] ? input.format : 'blind';
    const s = {
      ...base,
      format, preReview: format === 'blind' ? true : !!input.preReview,
      name: txt(input.name, 160), connectionId: txt(input.connectionId, 40).toUpperCase(), date: txt(input.date, 10), time: txt(input.time, 5),
      facilitator: txt(input.facilitator, 80), reviewers: REVIEWERS.filter((r) => (input.reviewers || []).includes(r)),
      meetingLink: format === 'blind' ? '' : txt(input.meetingLink, 300),
      agentName: format === 'agent' ? txt(input.agentName, 80) : '',
      original: format === 'agent' ? { soft: input.original?.soft || '', tech: input.original?.tech || '' } : null,
    };
    if (publish) {
      validateSession(s);
      s.status = 'scheduled';
      s.publishedAt = now();
    } else {
      check(s.name || s.connectionId, 'Add at least a session name or Connection ID to save a draft.');
    }
    db.sessions[s.id] = s;
    save();
    return s.id;
  }

  function list() {
    return Object.values(db.sessions).map(view).sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  }

  function get(id) {
    return view(session(id));
  }

  // Status only: who has submitted, never what.
  function progress(id) {
    return evals(id).map((e) => ({ reviewer: e.reviewer, status: e.status, submittedAt: e.submittedAt || null }));
  }

  /* reviewer evaluation (blind) */

  function myEvaluation(id, reviewer) {
    const s = session(id);
    check(s.reviewers.includes(reviewer), 'This reviewer is not assigned to the session.');
    const e = db.evaluations[evalKey(id, reviewer)];
    return e ? clone(e) : { status: 'not_started', ...emptyEvaluation() };
  }

  function cleanEvaluation(input) {
    const out = emptyEvaluation();
    for (const sec of SECTIONS) {
      const src = input?.sections?.[sec.id] || {};
      check(!src.verdict || VERDICTS.includes(src.verdict), 'Unknown verdict.');
      out.sections[sec.id].verdict = src.verdict || '';
      out.sections[sec.id].observations = (src.observations || []).map((o) => {
        check(!o.parameter || sec.params.includes(o.parameter), `${o.parameter} is not a ${sec.name} parameter.`);
        check(!o.finding || FINDINGS.includes(o.finding), 'Unknown parameter finding.');
        return { id: o.id || nextId('obs'), parameter: o.parameter || '', timestamp: txt(o.timestamp, 20), finding: o.finding || '', evidence: txt(o.evidence) };
      });
    }
    out.notes = txt(input?.notes);
    return out;
  }

  function saveEvaluation(id, reviewer, input) {
    const s = session(id);
    check(needsEvaluations(s), 'This session is scored together in the meeting, without independent evaluations.');
    check(s.reviewers.includes(reviewer), 'This reviewer is not assigned to the session.');
    check(['scheduled', 'in_review'].includes(s.status), 'Evaluations are closed for this session.');
    const key = evalKey(id, reviewer);
    check(db.evaluations[key]?.status !== 'submitted', 'This evaluation is submitted and locked.');
    db.evaluations[key] = { status: 'draft', ...cleanEvaluation(input), savedAt: now() };
    if (s.status === 'scheduled') s.status = 'in_review';
    save();
  }

  function submitEvaluation(id, reviewer, input) {
    saveEvaluation(id, reviewer, input);
    const key = evalKey(id, reviewer);
    const e = db.evaluations[key];
    for (const sec of SECTIONS) {
      check(e.sections[sec.id].verdict, `Choose an overall verdict for ${sec.name}.`);
      for (const o of e.sections[sec.id].observations) {
        check(o.parameter && o.finding && o.evidence, `Complete every ${sec.name} observation (parameter, finding and evidence).`);
        check(TIMESTAMP.test(o.timestamp), `Evidence timestamps look like 00:42 or 01:15–01:30 (${sec.name}).`);
      }
    }
    e.status = 'submitted';
    e.submittedAt = now();
    const s = session(id);
    if (allSubmitted(id)) s.status = 'ready_to_reveal';
    save();
  }

  /* reveal, discussion, final interpretation */

  // Team / Agent Sessions without pre-review go straight into the meeting.
  function startSession(id) {
    const s = session(id);
    check(!needsEvaluations(s), 'This session starts with independent evaluations and a reveal.');
    check(s.status === 'scheduled', 'Only a scheduled session can be started.');
    s.startedAt = now();
    s.status = 'in_discussion';
    save();
  }

  function setAttendance(id, person, attended) {
    const s = session(id);
    check(s.format !== 'blind', 'Attendance is tracked for Team and Agent Sessions.');
    check(s.status === 'in_discussion', 'Attendance can be recorded while the session is in discussion.');
    const people = [`Facilitator: ${s.facilitator}`, ...s.reviewers.map((r) => `Reviewer ${r}`), ...(s.agentName ? [`Agent: ${s.agentName}`] : [])];
    check(people.includes(person), 'That person is not in this session.');
    s.attendance = { ...s.attendance, [person]: !!attended };
    save();
  }

  function participants(id) {
    const s = session(id);
    return [`Facilitator: ${s.facilitator}`, ...s.reviewers.map((r) => `Reviewer ${r}`), ...(s.agentName ? [`Agent: ${s.agentName}`] : [])]
      .map((p) => ({ name: p, attended: !!s.attendance?.[p] }));
  }

  function reveal(id) {
    const s = session(id);
    check(needsEvaluations(s), 'This session has no independent evaluations to reveal.');
    check(!revealed(id), 'Evaluations are already revealed.');
    check(allSubmitted(id), 'Evaluations can be revealed only after every required reviewer has submitted.');
    s.revealedAt = now();
    s.status = 'in_discussion';
    save();
  }

  // Original submissions: only after the reveal.
  function revealedEvaluations(id) {
    check(revealed(id), 'Evaluations stay hidden until the facilitator reveals them.');
    return evals(id).map((e) => ({ reviewer: e.reviewer, submittedAt: e.submittedAt, evaluation: { sections: clone(e.sections), notes: e.notes } }));
  }

  function discussion(id) {
    return Object.values(db.discussion).filter((d) => d.sessionId === id).sort((a, b) => a.at.localeCompare(b.at)).map(clone);
  }

  function addDiscussionPoint(id, p) {
    const s = session(id);
    check(discussionStarted(s), needsEvaluations(s) ? 'Discussion opens after the reveal.' : 'Start the session to open the discussion.');
    check(s.status !== 'completed', 'The session is completed; the discussion log is read-only.');
    check(SECTIONS.some((x) => x.id === p.section), 'Choose a section.');
    check(SECTIONS.find((x) => x.id === p.section).params.includes(p.parameter), 'Choose a QA parameter.');
    check(txt(p.title), 'Give the discussion point a title.');
    check(txt(p.agreed) || txt(p.unresolved), 'Record what was agreed or what is still unresolved.');
    const d = { id: nextId('dis'), sessionId: id, section: p.section, parameter: p.parameter, title: txt(p.title, 200), evidence: txt(p.evidence),
      agreed: txt(p.agreed), unresolved: txt(p.unresolved), clarification: txt(p.clarification), at: now(),
      // QA-only points are hidden from the agent's view.
      private: s.format === 'agent' && !!p.private };
    db.discussion[d.id] = d;
    save();
    return d.id;
  }

  function finalInterpretation(id) {
    return clone(db.finals[id] || null);
  }

  function saveFinal(id, { soft, tech, summary, coachingPoints, agreedExpectations }) {
    const s = session(id);
    check(discussionStarted(s), needsEvaluations(s) ? 'The final interpretation is recorded after the reveal.' : 'Start the session first.');
    check(s.status !== 'completed', 'The session is completed.');
    for (const v of [soft, tech]) check(!v || VERDICTS.includes(v), 'Unknown verdict.');
    db.finals[id] = { soft: soft || '', tech: tech || '', summary: txt(summary, 4000), savedAt: now(),
      ...(s.format === 'agent' ? { coachingPoints: txt(coachingPoints, 4000), agreedExpectations: txt(agreedExpectations, 4000) } : {}) };
    save();
  }

  function complete(id) {
    const s = session(id);
    check(s.status === 'in_discussion', 'Only a session in discussion can be completed.');
    const f = db.finals[id];
    check(f && f.soft && f.tech, 'Record the agreed Soft Skills and Technical Skills verdicts first.');
    check(f.summary, 'Add a summary of the agreed interpretation first.');
    check(s.format !== 'agent' || f.coachingPoints, 'Add the coaching points for the agent first.');
    s.status = 'completed';
    s.completedAt = now();
    save();
  }

  /* follow-up actions (editable even after completion) */

  function addAction(id, { description, owner, dueDate }) {
    const s = session(id);
    check(discussionStarted(s), 'Follow-up actions are added once the discussion has started.');
    check(txt(description), 'Action description is required.');
    check(txt(owner), 'Assigned owner is required.');
    check(dueDate && !Number.isNaN(Date.parse(dueDate)), 'Due date is required.');
    const a = { id: nextId('act'), sessionId: id, description: txt(description, 300), owner: txt(owner, 80), dueDate, status: 'open', createdAt: now() };
    db.actions[a.id] = a;
    save();
    return a.id;
  }

  function setActionStatus(actionId, status) {
    const a = db.actions[actionId] || fail('Action not found.');
    check(ACTION_STATUS[status], 'Unknown status.');
    a.status = status;
    save();
  }

  // What the agent may see: their call, the original QA verdict, the outcome once
  // completed, non-private discussion points and their own actions. Never
  // reviewer evaluations or QA-only notes.
  function agentView(id) {
    const s = session(id);
    check(s.format === 'agent', 'Only Agent Sessions have an agent view.');
    const f = db.finals[id];
    const me = `Agent: ${s.agentName}`;
    return {
      session: { id: s.id, name: s.name, connectionId: s.connectionId, date: s.date, time: s.time, facilitator: s.facilitator, meetingLink: s.meetingLink,
        status: s.status, agentName: s.agentName, reviewers: s.reviewers },
      original: clone(s.original),
      outcome: s.status === 'completed' && f ? { soft: f.soft, tech: f.tech, summary: f.summary, coachingPoints: f.coachingPoints, agreedExpectations: f.agreedExpectations } : null,
      discussion: discussion(id).filter((d) => !d.private).map(({ id: did, section, parameter, title, agreed, at }) => ({ id: did, section, parameter, title, agreed, at })),
      actions: Object.values(db.actions).filter((a) => a.sessionId === id && a.owner === me).map(clone),
    };
  }

  function allActions() {
    return Object.values(db.actions).map((a) => ({ ...clone(a), session: clone(db.sessions[a.sessionId]) }))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }

  /* reports: always from original submitted verdicts */

  function report() {
    const sessions = list().filter((s) => s.status !== 'draft');
    const counted = sessions.filter((s) => s.needsEvaluations && ['in_review', 'ready_to_reveal', 'in_discussion', 'completed'].includes(s.status));
    const live = sessions.filter((s) => !s.needsEvaluations && ['in_discussion', 'completed'].includes(s.status));
    const required = counted.reduce((a, s) => a + s.required, 0);
    const submitted = counted.reduce((a, s) => a + s.submitted, 0);
    const full = counted.filter((s) => s.submitted === s.required);
    const excluded = counted.length - full.length;
    const sec = Object.fromEntries(SECTIONS.map((s) => [s.id, { agreed: 0, total: 0 }]));
    let paramCompared = 0;
    let paramAgreed = 0;
    const byParam = {};
    const rows = counted.map((s) => {
      if (s.submitted !== s.required) return { ...s, sectionResult: { soft: 'Incomplete', tech: 'Incomplete' }, paramPct: null };
      const subs = evals(s.id).map((e) => ({ reviewer: e.reviewer, evaluation: e }));
      const a = analyse(subs);
      let c = 0;
      let g = 0;
      const sectionResult = {};
      for (const x of a.sections) {
        sec[x.id].total += 1;
        if (x.unanimous) sec[x.id].agreed += 1;
        sectionResult[x.id] = x.unanimous ? 'Agreed' : 'Split';
        for (const p of x.params.filter((pp) => pp.compared)) {
          c += 1;
          if (p.agree) g += 1;
          const k = `${x.id}:${p.parameter}`;
          byParam[k] ||= { parameter: p.parameter, section: x.name, compared: 0, disagreed: 0 };
          byParam[k].compared += 1;
          if (!p.agree) byParam[k].disagreed += 1;
        }
      }
      paramCompared += c;
      paramAgreed += g;
      return { ...s, sectionResult, paramPct: c ? Math.round((g / c) * 100) : null };
    });
    const unanimous = Object.values(sec).reduce((a, x) => a + x.agreed, 0);
    const totalSections = Object.values(sec).reduce((a, x) => a + x.total, 0);
    const actions = allActions();
    return {
      total: sessions.length,
      completed: sessions.filter((s) => s.status === 'completed').length,
      submission: { submitted, required, pct: required ? Math.round((submitted / required) * 100) : null, sessions: counted.length },
      agreement: { unanimous, total: totalSections, pct: totalSections ? Math.round((unanimous / totalSections) * 100) : null, excluded },
      sections: SECTIONS.map((s) => ({ ...s, ...sec[s.id], pct: sec[s.id].total ? Math.round((sec[s.id].agreed / sec[s.id].total) * 100) : null })),
      params: { compared: paramCompared, agreed: paramAgreed, pct: paramCompared ? Math.round((paramAgreed / paramCompared) * 100) : null },
      disagreements: Object.values(byParam).filter((p) => p.disagreed).sort((a, b) => b.disagreed - a.disagreed || b.compared - a.compared),
      byFormat: Object.keys(FORMATS).map((f) => ({ format: f, total: sessions.filter((s) => s.format === f).length, completed: sessions.filter((s) => s.format === f && s.status === 'completed').length })),
      rows: [...rows, ...live.map((s) => ({ ...s, sectionResult: null, paramPct: null }))].sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`)),
      openActions: actions.filter((a) => a.status !== 'completed'),
    };
  }

  function reset(seed) {
    db = emptyDb();
    if (seed) seed(api);
    save();
  }

  const api = {
    list, get, saveSession, progress, myEvaluation, saveEvaluation, submitEvaluation, startSession, setAttendance, participants, reveal,
    revealedEvaluations, discussion, addDiscussionPoint, finalInterpretation, saveFinal, complete, addAction, setActionStatus, agentView,
    allActions, report, reset,
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
    load: () => { try { return JSON.parse(localStorage.getItem(key)) || null; } catch { return clone(fallback); } },
    save: (d) => { fallback = clone(d); try { localStorage.setItem(key, JSON.stringify(d)); } catch { /* keep in memory */ } },
  };
}
