import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createService, memoryStorage } from '../src/calibration/service.js';
import { compareCriterion, compareSession } from '../src/calibration/metrics.js';
import { getScorecard, criteriaOf } from '../src/calibration/scorecards.js';
import { listCalls, getCall } from '../src/calibration/callLibrary.js';
import { seedDemo } from '../src/calibration/seed.js';
import { agentPersonId } from '../src/calibration/people.js';

const ADMIN = 'u-ramitha';
const LEAD = 'u-tessa';
const FAC = 'u-nadia';
const R1 = 'u-owen';
const R2 = 'u-priya';
const R3 = 'u-leo';
const OUTSIDER = 'u-sam';
const SC = getScorecard('tr-soft-tech');
const IDS = criteriaOf(SC).map((c) => c.id);
const all = (v) => Object.fromEntries(IDS.map((id) => [id, { value: v, comment: `${v} because…` }]));
const call = listCalls()[0];

function setup(extra = {}) {
  const storage = memoryStorage();
  const api = createService({ storage, now: () => '2026-10-27T10:00:00.000Z' });
  const id = api.saveDraft(LEAD, {
    title: 'Test', format: 'blind', connectionId: call.connectionId, scheduledAt: '2026-10-28T09:00', facilitatorId: FAC,
    reviewerIds: [R1, R2, R3], scorecardId: SC.id, ...extra,
  });
  return { api, id, storage };
}
const rejects = (fn, code) => assert.throws(fn, (e) => e.code === code);

describe('blind session', () => {
  function started() {
    const s = setup();
    s.api.publish(LEAD, s.id);
    s.api.start(FAC, s.id);
    return s;
  }

  test('participants see only sessions assigned to them; drafts stay hidden', () => {
    const { api, id } = setup();
    assert.equal(api.listSessions(R1).length, 0, 'draft is hidden from reviewers');
    api.publish(LEAD, id);
    assert.equal(api.listSessions(R1).length, 1);
    assert.equal(api.listSessions(OUTSIDER).length, 0);
    rejects(() => api.getSession(OUTSIDER, id), 'not_found');
    rejects(() => api.getSession(agentPersonId(call.agentId), id), 'not_found');
  });

  test('submissions are private before the reveal, even to the facilitator and admins', () => {
    const { api, id } = started();
    api.submit(R1, id, { ratings: all('Good') });
    for (const viewer of [FAC, R2, ADMIN, LEAD]) {
      const v = api.getSession(viewer, id);
      assert.equal(v.submissions, null);
      assert.equal(v.comparison, null);
      assert.equal(JSON.stringify(v).includes('Good because'), false, `${viewer} must not see R1's comments`);
    }
    const fac = api.getSession(FAC, id);
    assert.equal(fac.participants.find((p) => p.id === R1).submission.status, 'submitted');
    assert.equal(fac.participants.find((p) => p.id === R2).submission.status, 'not_started');
    assert.equal(api.getSession(R1, id).mySubmission.ratings['soft-open'].value, 'Good');
  });

  test('reveal is blocked until everyone submits; facilitator cannot override', () => {
    const { api, id } = started();
    api.submit(R1, id, { ratings: all('Good') });
    rejects(() => api.reveal(FAC, id), 'not_ready');
    rejects(() => api.reveal(FAC, id, { exceptionReason: 'Running out of time today' }), 'not_ready');
    rejects(() => api.reveal(R1, id), 'forbidden');
    api.submit(R2, id, { ratings: all('Good') });
    api.submit(R3, id, { ratings: all('Not Yet') });
    assert.equal(api.getSession(FAC, id).status, 'ready_to_reveal');
    api.reveal(FAC, id);
    const v = api.getSession(R2, id);
    assert.equal(v.status, 'discussion');
    assert.equal(v.submissions.length, 3);
  });

  test('QA Lead can reveal early only with a reason, and it is audited', () => {
    const { api, id } = started();
    api.submit(R1, id, { ratings: all('Good') });
    api.saveSubmission(R2, id, { ratings: { 'soft-open': { value: 'Good' } } });
    rejects(() => api.reveal(LEAD, id), 'invalid');
    api.reveal(LEAD, id, { exceptionReason: 'Reviewer on leave for two weeks' });
    const v = api.getSession(LEAD, id);
    assert.deepEqual(v.revealException.missing, ['Priya Natarajan', 'Leo Brandt']);
    assert.ok(v.audit.some((a) => a.action === 'reveal_exception'));
    rejects(() => api.saveSubmission(R2, id, { ratings: all('Good') }), 'locked');
  });

  test('original submissions cannot be changed; reopening needs a reason and keeps history', () => {
    const { api, id } = started();
    api.submit(R1, id, { ratings: all('Good') });
    rejects(() => api.saveSubmission(R1, id, { ratings: all('Not Yet') }), 'locked');
    rejects(() => api.submit(R1, id, { ratings: all('Not Yet') }), 'locked');
    rejects(() => api.reopenSubmission(FAC, id, R1, 'wrong call scored'), 'forbidden');
    rejects(() => api.reopenSubmission(LEAD, id, R1, 'short'), 'invalid');
    api.reopenSubmission(LEAD, id, R1, 'Scored the wrong call by mistake');
    api.submit(R1, id, { ratings: all('Not Yet') });
    const mine = api.getSession(R1, id).mySubmission;
    assert.equal(mine.history.length, 1);
    assert.equal(mine.history[0].ratings['soft-open'].value, 'Good');
    assert.ok(api.getSession(LEAD, id).audit.some((a) => a.action === 'reopened'));
  });

  test('incomplete scorecards cannot be submitted', () => {
    const { api, id } = started();
    rejects(() => api.submit(R1, id, { ratings: { 'soft-open': { value: 'Good' } } }), 'invalid');
    rejects(() => api.submit(R1, id, { ratings: { 'soft-open': { value: 'Great' } } }), 'invalid');
  });

  test('final decision is stored apart from the original verdicts and flagged items need a resolution', () => {
    const { api, id, storage } = started();
    api.submit(R1, id, { ratings: all('Good') });
    api.submit(R2, id, { ratings: all('Good') });
    api.submit(R3, id, { ratings: { ...all('Good'), 'tech-notes': { value: 'Not Yet' } } });
    api.reveal(FAC, id);
    api.saveDecision(FAC, id, { ratings: { ...all('Good'), 'tech-notes': { value: 'Not Yet' } }, rationale: 'Notes missing root cause.' });
    rejects(() => api.finalize(FAC, id, {}), 'invalid');
    api.saveDecision(FAC, id, { ratings: { 'tech-notes': { value: 'Not Yet', resolution: 'Root cause missing.' } } });
    api.finalize(FAC, id, { shareWith: ['participants', 'agent'] });
    const db = storage.load();
    assert.equal(db.decisions[id].ratings['tech-notes'].value, 'Not Yet');
    assert.equal(Object.values(db.submissions).find((s) => s.reviewerId === R1).ratings['tech-notes'].value, 'Good');
    assert.deepEqual(db.decisions[id].shareWith, ['participants'], 'blind sessions cannot share with an agent');
    assert.equal(api.getSession(R1, id).status, 'completed');
  });

  test('facilitator cannot be a blind reviewer; blind needs 2+ reviewers', () => {
    const { api, id } = setup({ reviewerIds: [FAC, R1] });
    rejects(() => api.publish(LEAD, id), 'invalid');
    api.saveDraft(LEAD, { reviewerIds: [R1] }, id);
    rejects(() => api.publish(LEAD, id), 'invalid');
  });
});

describe('team session', () => {
  function live() {
    const s = setup({ format: 'team', meetingLink: 'https://meet.google.com/xyz-abcd-efg' });
    s.api.publish(LEAD, s.id);
    s.api.start(FAC, s.id);
    return s;
  }

  test('runs without blind submissions and the facilitator records the agreed verdicts', () => {
    const { api, id } = live();
    const v = api.getSession(R1, id);
    assert.equal(v.status, 'in_progress');
    assert.equal(v.needsSubmissions, false);
    rejects(() => api.submit(R1, id, { ratings: all('Good') }), 'invalid');
    api.addNote(R1, id, { body: 'Hold at 01:52 was not explained.', timestamp: '01:52', criterionId: 'soft-empathy', kind: 'evidence' });
    api.addNote(R2, id, { body: 'Is a 2 minute hold Not Yet?', kind: 'dispute', criterionId: 'soft-empathy' });
    rejects(() => api.saveDecision(R1, id, { rationale: 'x' }), 'forbidden');
    api.setAttendance(FAC, id, R1, { attended: true, contributed: true });
    api.saveDecision(FAC, id, { ratings: { ...all('Good'), 'soft-empathy': { value: 'Not Yet', disputed: true } }, rationale: 'Unexplained hold.', rubricClarifications: 'Explain holds over 1 minute.' });
    rejects(() => api.finalize(FAC, id, {}), 'invalid');
    api.saveDecision(FAC, id, { ratings: { 'soft-empathy': { value: 'Not Yet', disputed: true, resolution: 'Holds over 1 minute must be explained.' } } });
    api.finalize(FAC, id, { shareWith: ['participants', 'team'] });
    const done = api.getSession(R2, id);
    assert.equal(done.status, 'completed');
    assert.equal(done.decision.ratings['soft-empathy'].value, 'Not Yet');
    assert.equal(done.notes.length, 2);
    assert.equal(done.participants.find((p) => p.id === R1).attendance.attended, true);
    assert.equal(done.meetingLink, 'https://meet.google.com/xyz-abcd-efg');
  });

  test('consensus stalls: only a QA Lead makes the final call, with a reason', () => {
    const { api, id } = live();
    api.saveDecision(FAC, id, { ratings: all('Good'), rationale: 'Agreed.' });
    api.escalate(FAC, id, 'Split 2-2 on empathy.');
    rejects(() => api.finalize(FAC, id, { consensus: 'lead_decision', leadReason: 'Because I said so' }), 'forbidden');
    rejects(() => api.finalize(LEAD, id, { consensus: 'lead_decision', leadReason: '' }), 'invalid');
    api.finalize(LEAD, id, { consensus: 'lead_decision', leadReason: 'Applied the rubric as written.' });
    assert.equal(api.getSession(LEAD, id).decision.consensus, 'lead_decision');
  });

  test('optional pre-review step makes a team session blind first', () => {
    const { api, id } = setup({ format: 'team', preReview: true });
    api.publish(LEAD, id);
    api.start(FAC, id);
    assert.equal(api.getSession(FAC, id).status, 'awaiting_submissions');
  });

  test('backend rejects invalid status changes', () => {
    const { api, id } = live();
    rejects(() => api.reveal(FAC, id), 'invalid');
    rejects(() => api.start(FAC, id), 'bad_transition');
    api.cancel(LEAD, id, 'Duplicate');
    rejects(() => api.finalize(LEAD, id, {}), 'bad_transition');
    rejects(() => api.addNote(R1, id, { body: 'late' }), 'locked');
  });
});

describe('agent session', () => {
  const AGENT = agentPersonId(call.agentId);
  const OTHER_AGENT = agentPersonId(listCalls()[1].agentId);
  function live(extra) {
    const s = setup({ format: 'agent', reviewerIds: [R1, R2], ...extra });
    s.api.publish(LEAD, s.id);
    s.api.start(FAC, s.id);
    return s;
  }

  test('the agent is always the agent on the call and gets access to it', () => {
    const { api, id } = live();
    const v = api.getSession(AGENT, id);
    assert.equal(v.format, 'agent');
    assert.ok(v.participants.some((p) => p.id === AGENT && p.role === 'Agent'));
    assert.equal(v.call.connectionId, call.connectionId);
    assert.ok(v.call.originalEvaluation, 'agent sees their original evaluation');
    rejects(() => api.getSession(OTHER_AGENT, id), 'not_found');
    assert.equal(api.listSessions(OTHER_AGENT).length, 0);
  });

  test('the agent cannot see private reviewer notes, internal notes, instructions or reviewer scorecards', () => {
    const { api, id } = live({ preReview: true, instructions: 'Internal prep only' });
    api.submit(R1, id, { ratings: all('Good') });
    api.submit(R2, id, { ratings: all('Not Yet') });
    api.reveal(FAC, id);
    api.addNote(R1, id, { body: 'PRIVATE: agent was abrupt', private: true });
    api.addNote(AGENT, id, { body: 'The system was slow that day.', private: true });
    api.saveDecision(FAC, id, { ratings: Object.fromEntries(IDS.map((c) => [c, { value: 'Good', resolution: 'ok' }])), rationale: 'Fine overall.', internalNotes: 'SECRET internal', coachingPoints: 'Explain holds.' });
    const before = api.getSession(AGENT, id);
    const json = JSON.stringify(before);
    for (const secret of ['PRIVATE', 'SECRET', 'Internal prep', 'Good because', 'Not Yet because']) assert.equal(json.includes(secret), false, secret);
    assert.equal(before.decision, null, 'decision hidden until finalized and shared');
    assert.equal(before.notes.find((n) => n.authorId === AGENT).private, false, 'agents cannot post private notes');
    assert.equal(before.participants.every((p) => p.submission === null), true);
    api.finalize(FAC, id, { shareWith: ['participants', 'agent'] });
    const after = api.getSession(AGENT, id);
    assert.equal(after.decision.coachingPoints, 'Explain holds.');
    assert.equal(after.decision.internalNotes, undefined);
    assert.equal(JSON.stringify(after).includes('SECRET'), false);
    rejects(() => api.getReport(AGENT), 'forbidden');
  });

  test('coaching actions and follow-ups are recorded with owners and due dates', () => {
    const { api, id } = live();
    rejects(() => api.addAction(FAC, id, { body: 'x', ownerId: OTHER_AGENT }), 'invalid');
    const a = api.addAction(FAC, id, { body: 'Use the notes template', ownerId: AGENT, dueDate: '2026-11-10', kind: 'coaching' });
    api.addAction(FAC, id, { body: 'Update rubric wording', ownerId: LEAD, kind: 'rubric' });
    rejects(() => api.setActionDone(R1, a, true), 'forbidden');
    api.setActionDone(AGENT, a, true);
    const agentView = api.getSession(AGENT, id);
    assert.equal(agentView.actions.length, 1, 'agent sees only their own action before completion');
    assert.equal(agentView.actions[0].status, 'done');
    assert.equal(agentView.actions[0].dueDate, '2026-11-10');
    assert.equal(api.getSession(FAC, id).actions.length, 2);
  });
});

describe('general', () => {
  test('only real Call Library records can be selected', () => {
    const { api, id } = setup();
    rejects(() => api.saveDraft(LEAD, { connectionId: 'CNX-MADE-UP' }, id), 'invalid');
    assert.ok(getCall(call.connectionId));
  });

  test('only QA admins and leads can create', () => {
    const storage = memoryStorage();
    const api = createService({ storage });
    rejects(() => api.saveDraft(R1, { title: 'x' }), 'forbidden');
    rejects(() => api.saveDraft('nobody', { title: 'x' }), 'unauthenticated');
  });

  test('data persists across a reload (new service on the same storage)', () => {
    const { id, storage, api } = setup();
    api.publish(LEAD, id);
    const again = createService({ storage });
    assert.equal(again.getSession(R1, id).status, 'scheduled');
  });

  test('recurring sessions are only created when enabled', () => {
    const run = (recurring) => {
      const { api, id } = setup({ format: 'team', recurring });
      api.publish(LEAD, id);
      api.start(FAC, id);
      api.saveDecision(FAC, id, { ratings: all('Good'), rationale: 'ok' });
      api.finalize(FAC, id, {});
      return api.listSessions(LEAD);
    };
    assert.equal(run({ enabled: false }).length, 1);
    const withNext = run({ enabled: true, cadence: 'monthly', rotateFacilitator: true });
    assert.equal(withNext.length, 2);
    const next = withNext.find((s) => s.status === 'draft');
    assert.equal(next.facilitatorName, 'Owen Mercer', 'facilitator rotated to first reviewer');
    assert.equal(next.scheduledAt.slice(0, 10), '2026-11-28');
  });

  test('the sample seed runs through the service without errors', () => {
    let clock = null;
    const api = createService({ storage: memoryStorage(), now: () => clock || '2026-10-27T12:00:00.000Z' });
    seedDemo(api, (iso) => { clock = iso; });
    const report = api.getReport(LEAD);
    assert.ok(report.rows.length >= 8);
    assert.ok(report.summary.avgAgreement > 0);
    assert.equal(api.listSessions(ADMIN).filter((s) => s.needsMe).length >= 3, true);
  });
});

describe('variance and agreement', () => {
  const v = (...xs) => xs.map((value, i) => ({ reviewerId: `r${i}`, value }));

  test('3 of 4 matching verdicts = 3/4 (75%) agreement, 25% variance', () => {
    const c = compareCriterion(SC, v('Good', 'Good', 'Good', 'Not Yet'), null, 5);
    assert.deepEqual([c.agreement.matching, c.agreement.total, c.agreement.pct], [3, 4, 75]);
    assert.equal(c.variancePct, 25);
    assert.equal(c.flagged, true);
  });

  test('agreement is measured against the final decision once recorded, not the majority', () => {
    const c = compareCriterion(SC, v('Good', 'Good', 'Good', 'Not Yet'), 'Not Yet', 5);
    assert.equal(c.agreement.modal, 'Good');
    assert.deepEqual([c.finalAgreement.matching, c.finalAgreement.pct], [1, 25]);
    assert.equal(c.variancePct, 75);
  });

  test('N/A versus a rating counts as disagreement', () => {
    const c = compareCriterion(SC, v('Good', 'N/A'), null, 5);
    assert.equal(c.agreement.pct, 50);
    assert.equal(c.flagged, true);
  });

  test('numeric scorecards use spread over max points, then distance from the final', () => {
    const P = getScorecard('points-10');
    const before = compareCriterion(P, v('8', '9', '10'), null, 5);
    assert.equal(before.variancePct, 20);
    const after = compareCriterion(P, v('8', '9', '10'), '9', 5);
    assert.equal(after.variancePct, 10);
    assert.equal(compareCriterion(P, v('9', '9'), '9', 5).flagged, false);
    assert.equal(compareCriterion(P, v('9', 'N/A'), null, 5).variancePct, 100);
  });

  test('overall scores and spread', () => {
    const subs = [{ reviewerId: 'a', ratings: all('Good') }, { reviewerId: 'b', ratings: { ...all('Good'), 'tech-notes': { value: 'Not Yet' }, 'soft-open': { value: 'N/A' } } }];
    const cmp = compareSession(SC, subs, all('Good'), 5);
    assert.equal(cmp.reviewers[0].overall, 100);
    assert.equal(cmp.reviewers[1].overall, 80);
    assert.equal(cmp.overallSpread, 20);
    assert.equal(cmp.reviewers[1].diffFromFinal, 20);
    assert.equal(cmp.flaggedCount, 2);
  });
});
