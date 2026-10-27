import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, memoryStorage, analyse, emptyEvaluation } from '../src/calibration/model.js';
import { seedDemo } from '../src/calibration/seed.js';

const SESSION = { name: 'Test', connectionId: 'CONN-1-1', date: '2026-11-01', time: '10:00', facilitator: 'Self', reviewers: ['A', 'B', 'C'] };
const ev = (soft, tech, softObs = [], techObs = []) => ({
  sections: { soft: { verdict: soft, observations: softObs }, tech: { verdict: tech, observations: techObs } }, notes: '',
});
const o = (parameter, finding, timestamp = '01:00') => ({ parameter, finding, timestamp, evidence: 'x' });
const rejects = (fn, re) => assert.throws(fn, re);

function setup(data = SESSION) {
  const storage = memoryStorage();
  const store = createStore({ storage, now: () => '2026-10-27T10:00:00.000Z' });
  const id = store.saveSession(data, null, { publish: true });
  return { store, id, storage };
}

describe('session setup', () => {
  test('publishing validates required fields and needs two reviewers', () => {
    const { store } = setup();
    rejects(() => store.saveSession({ ...SESSION, connectionId: '' }, null, { publish: true }), /Connection ID is required/);
    rejects(() => store.saveSession({ ...SESSION, reviewers: ['A'] }, null, { publish: true }), /at least two reviewers/);
    const draft = store.saveSession({ name: 'Draft only' });
    assert.equal(store.get(draft).status, 'draft');
    store.saveSession({ ...SESSION }, draft, { publish: true });
    assert.equal(store.get(draft).status, 'scheduled');
    rejects(() => store.saveSession({ ...SESSION }, draft), /Only draft/);
  });
});

describe('blind evaluation', () => {
  test('progress shows status only, and evaluations stay hidden until reveal', () => {
    const { store, id } = setup();
    store.submitEvaluation(id, 'A', ev('Good Job', 'Not Yet'));
    assert.equal(store.get(id).status, 'in_review');
    assert.deepEqual(store.progress(id).map((p) => p.status), ['submitted', 'not_started', 'not_started']);
    assert.equal(JSON.stringify(store.progress(id)).includes('Good Job'), false);
    rejects(() => store.revealedEvaluations(id), /hidden until/);
    assert.equal(store.myEvaluation(id, 'B').status, 'not_started', 'B cannot see A');
  });

  test('submitting locks the evaluation', () => {
    const { store, id } = setup();
    store.submitEvaluation(id, 'A', ev('Good Job', 'Good Job'));
    rejects(() => store.saveEvaluation(id, 'A', ev('Not Yet', 'Not Yet')), /locked/);
    rejects(() => store.submitEvaluation(id, 'A', ev('Not Yet', 'Not Yet')), /locked/);
    assert.equal(store.myEvaluation(id, 'A').sections.soft.verdict, 'Good Job');
  });

  test('submission needs both verdicts and complete observations with valid timestamps', () => {
    const { store, id } = setup();
    rejects(() => store.submitEvaluation(id, 'A', ev('Good Job', '')), /Technical Skills/);
    rejects(() => store.submitEvaluation(id, 'A', ev('Good Job', 'Good Job', [{ parameter: 'Tone', finding: 'Met', timestamp: '01:00', evidence: '' }])), /Complete every/);
    rejects(() => store.submitEvaluation(id, 'A', ev('Good Job', 'Good Job', [o('Tone', 'Met', '1 min')])), /timestamps/);
    rejects(() => store.submitEvaluation(id, 'A', ev('Good Job', 'Good Job', [o('Verification', 'Met')])), /not a Soft Skills parameter/);
    store.submitEvaluation(id, 'A', ev('Good Job', 'Good Job', [o('Tone', 'Met', '01:15–01:30')]));
  });

  test('reveal only after every reviewer submits', () => {
    const { store, id } = setup();
    store.submitEvaluation(id, 'A', ev('Good Job', 'Good Job'));
    store.submitEvaluation(id, 'B', ev('Good Job', 'Good Job'));
    rejects(() => store.reveal(id), /every required reviewer/);
    store.submitEvaluation(id, 'C', ev('Not Yet', 'Good Job'));
    assert.equal(store.get(id).status, 'ready_to_reveal');
    store.reveal(id);
    assert.equal(store.get(id).status, 'in_discussion');
    assert.equal(store.revealedEvaluations(id).length, 3);
    rejects(() => store.saveEvaluation(id, 'A', ev('Not Yet', 'Not Yet')), /closed|locked/);
  });
});

describe('discussion, final interpretation and actions', () => {
  function revealedSession() {
    const s = setup();
    for (const r of ['A', 'B', 'C']) s.store.submitEvaluation(s.id, r, ev('Good Job', r === 'C' ? 'Not Yet' : 'Good Job'));
    s.store.reveal(s.id);
    return s;
  }

  test('final interpretation is stored separately and never changes originals', () => {
    const { store, id } = revealedSession();
    store.addDiscussionPoint(id, { section: 'tech', parameter: 'Documentation', title: 'Notes', agreed: 'Agreed Not Met' });
    rejects(() => store.addDiscussionPoint(id, { section: 'tech', parameter: 'Tone', title: 'x', agreed: 'y' }), /QA parameter/);
    rejects(() => store.complete(id), /Record the agreed/);
    store.saveFinal(id, { soft: 'Good Job', tech: 'Not Yet', summary: '' });
    rejects(() => store.complete(id), /summary/);
    store.saveFinal(id, { soft: 'Good Job', tech: 'Not Yet', summary: 'Agreed.' });
    store.complete(id);
    assert.equal(store.revealedEvaluations(id).find((e) => e.reviewer === 'A').evaluation.sections.tech.verdict, 'Good Job');
    assert.equal(store.finalInterpretation(id).tech, 'Not Yet');
    rejects(() => store.addDiscussionPoint(id, { section: 'tech', parameter: 'Documentation', title: 'late', agreed: 'x' }), /read-only/);
    rejects(() => store.saveFinal(id, { soft: 'Not Yet', tech: 'Not Yet', summary: 'x' }), /completed/);
  });

  test('actions need description, owner and due date, and stay editable after completion', () => {
    const { store, id } = revealedSession();
    rejects(() => store.addAction(id, { description: 'x', owner: 'Self' }), /Due date/);
    const a = store.addAction(id, { description: 'Coach agent', owner: 'Self', dueDate: '2026-11-10' });
    store.saveFinal(id, { soft: 'Good Job', tech: 'Good Job', summary: 'ok' });
    store.complete(id);
    store.setActionStatus(a, 'in_progress');
    assert.equal(store.allActions()[0].status, 'in_progress');
  });

  test('data survives a reload', () => {
    const { storage, id } = setup();
    const again = createStore({ storage });
    assert.equal(again.get(id).name, 'Test');
  });
});

describe('agreement metrics', () => {
  test('section agreement, majority and parameter tags', () => {
    const subs = [
      { reviewer: 'A', evaluation: ev('Good Job', 'Not Yet', [o('Empathy', 'Met'), o('Tone', 'Met')], [o('Documentation', 'Not Met')]) },
      { reviewer: 'B', evaluation: ev('Not Yet', 'Not Yet', [o('Empathy', 'Not Met')], [o('Documentation', 'Not Met')]) },
      { reviewer: 'C', evaluation: ev('Good Job', 'Not Yet', [o('Empathy', 'Met')], []) },
    ];
    const a = analyse(subs);
    const soft = a.sections[0];
    assert.equal(soft.majority, 'Good Job');
    assert.equal(soft.unanimous, false);
    assert.equal(a.sections[1].unanimous, true);
    assert.equal(soft.params.find((p) => p.parameter === 'Empathy').tag, 'Findings differ');
    assert.equal(soft.params.find((p) => p.parameter === 'Tone').tag, 'Single reviewer');
    assert.equal(a.sections[1].params.find((p) => p.parameter === 'Documentation').tag, 'Findings agree');
  });

  test('reports use original verdicts and exclude sessions with missing submissions', () => {
    let clock = null;
    const store = createStore({ storage: memoryStorage(), now: () => clock || '2026-10-27T12:00:00Z' });
    seedDemo(store, (t) => { clock = t; });
    const r = store.report();
    assert.equal(r.total, 7);
    assert.equal(r.completed, 3);
    assert.equal(r.agreement.excluded, 1, 'Plan Upgrade has 1 of 3 submissions');
    assert.deepEqual([r.submission.submitted, r.submission.required], [13, 15]);
    assert.deepEqual([r.agreement.unanimous, r.agreement.total], [4, 8]);
    assert.equal(r.rows.find((x) => x.connectionId === 'CONN-72950-1028').sectionResult.soft, 'Incomplete');
    assert.ok(r.disagreements.length > 0);
    assert.equal(r.openActions.length, 2);
  });

  test('empty evaluation has both sections', () => {
    assert.deepEqual(Object.keys(emptyEvaluation().sections), ['soft', 'tech']);
  });
});
