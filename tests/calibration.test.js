import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, memoryStorage, agreement } from '../src/calibration/model.js';
import { seedDemo } from '../src/calibration/seed.js';

const A = 'admin';
const CHECKS = { connectionConfirmed: true, recordingReviewed: true, contextChecked: true };
const NEW = { connectionId: 'CN-10482', format: 'blind', date: '2026-11-01', time: '10:00', facilitator: 'QA Lead – Maya', participants: ['avery', 'blake', 'casey'], internalReview: CHECKS };
const rejects = (fn, re) => assert.throws(fn, re);

function setup(data = NEW) {
  const storage = memoryStorage();
  const store = createStore({ storage, now: () => '2026-10-27T10:00:00.000Z' });
  return { store, storage, id: store.createSession(A, data) };
}

describe('creating sessions', () => {
  test('only Admin creates, and only after the internal QA checklist', () => {
    const { store } = setup();
    rejects(() => store.createSession('avery', NEW), /Only Admin/);
    rejects(() => store.createSession(A, { ...NEW, internalReview: { ...CHECKS, contextChecked: false } }), /internal QA preparation/);
    rejects(() => store.createSession(A, { ...NEW, connectionId: 'CN-FAKE' }), /Call Library/);
    rejects(() => store.createSession(A, { ...NEW, participants: [] }), /at least one participant/);
    rejects(() => store.createSession(A, { ...NEW, meetLink: 'meet.google.com/x' }), /https/);
  });

  test('editing keeps participants who already submitted', () => {
    const { store, id } = setup();
    store.submit('avery', id, { soft: 'Good', tech: 'Good' });
    store.editSession(A, id, { facilitator: 'QA Lead – Ravi', meetLink: '', participants: ['blake'] });
    assert.deepEqual(store.get(A, id).participants, ['blake', 'avery']);
  });
});

describe('blind session access', () => {
  test('participants see only assigned sessions and only their own response', () => {
    const { store, id } = setup();
    assert.equal(store.list('isla').length, 0);
    rejects(() => store.get('isla', id), /not assigned/);
    rejects(() => store.submit('isla', id, { soft: 'Good', tech: 'Good' }), /not assigned/);
    store.submit('avery', id, { soft: 'Good', tech: 'Not Yet', comments: 'SECRET avery comment' });
    const blake = store.get('blake', id);
    assert.equal(blake.mine, null);
    assert.equal(JSON.stringify(blake).includes('SECRET'), false);
    assert.equal(store.get('avery', id).mine.tech, 'Not Yet');
  });

  test('submission locks and needs both verdicts', () => {
    const { store, id } = setup();
    rejects(() => store.submit('avery', id, { soft: 'Good' }), /both verdicts/);
    rejects(() => store.submit('avery', id, { soft: 'Good', tech: 'Good', evidence: 'soon' }), /timestamps/);
    store.submit('avery', id, { soft: 'Good', tech: 'Good', evidence: '01:24' });
    rejects(() => store.submit('avery', id, { soft: 'Not Yet', tech: 'Not Yet' }), /already been submitted/);
    rejects(() => store.submit(A, id, { soft: 'Good', tech: 'Good' }), /Admin does not submit/);
  });

  test('Admin sees progress but not verdicts until everyone has submitted and the comparison is opened', () => {
    const { store, id } = setup();
    store.submit('avery', id, { soft: 'Good', tech: 'Good', comments: 'SECRET' });
    const before = store.get(A, id);
    assert.equal(before.submissions, null);
    assert.equal(JSON.stringify(before).includes('SECRET'), false);
    assert.equal(before.progress.filter((p) => p.submittedAt).length, 1);
    rejects(() => store.openComparison(A, id), /every assigned participant/);
    rejects(() => store.saveOutcome(A, id, { soft: 'Good', tech: 'Good', summary: 'x' }), /Open the individual submissions/);
    store.submit('blake', id, { soft: 'Good', tech: 'Not Yet' });
    store.submit('casey', id, { soft: 'Not Yet', tech: 'Not Yet' });
    assert.equal(store.get(A, id).status.key, 'ready');
    rejects(() => store.openComparison('avery', id), /Only Admin/);
    store.openComparison(A, id);
    assert.equal(store.get(A, id).submissions.length, 3);
    assert.ok(store.audit(A).some((a) => a.action === 'Admin opened individual submissions'));
  });

  test('outcome is shared with participants only once completed; peers stay hidden', () => {
    const { store, id } = setup();
    for (const p of ['avery', 'blake', 'casey']) store.submit(p, id, { soft: 'Good', tech: 'Good', comments: `SECRET-${p}` });
    store.openComparison(A, id);
    rejects(() => store.saveOutcome(A, id, { soft: 'Good', summary: 'x' }), /final Soft Skills and Technical Skills/);
    assert.equal(store.get('blake', id).outcome, null);
    store.saveOutcome(A, id, { soft: 'Good', tech: 'Good', summary: 'Agreed', takeaways: 'T', actions: 'A' });
    const v = store.get('blake', id);
    assert.equal(v.outcome.summary, 'Agreed');
    assert.equal(JSON.stringify(v).includes('SECRET-avery'), false);
    rejects(() => store.submit('blake', id, { soft: 'Good', tech: 'Good' }), /completed/);
    rejects(() => store.audit('blake'), /Only Admin/);
  });
});

describe('team and agent sessions', () => {
  test('group sessions have no blind submissions; Admin records the outcome', () => {
    const { store, id } = setup({ ...NEW, format: 'team' });
    rejects(() => store.submit('avery', id, { soft: 'Good', tech: 'Good' }), /Only Blind sessions/);
    rejects(() => store.openComparison(A, id), /Only Blind sessions/);
    rejects(() => store.saveOutcome(A, id, { summary: '' }), /summary/);
    store.saveOutcome(A, id, { summary: 'Agreed together.' });
    assert.equal(store.get('avery', id).outcome.summary, 'Agreed together.');
  });
});

describe('metrics and sample data', () => {
  test('agreement is a majority share, with ties shown as no majority', () => {
    assert.equal(agreement([{ soft: 'Good' }, { soft: 'Good' }, { soft: 'Not Yet' }], 'soft').label, '67%');
    assert.equal(agreement([{ soft: 'Good' }, { soft: 'Not Yet' }], 'soft').label, 'No majority');
    assert.equal(agreement([], 'soft'), null);
  });

  test('sample sessions load through the rules and survive a reload', () => {
    let clock = null;
    const storage = memoryStorage();
    const store = createStore({ storage, now: () => clock || '2026-10-27T12:00:00Z' });
    seedDemo(store, (t) => { clock = t; });
    assert.equal(store.list(A).length, 5);
    assert.deepEqual(store.list('avery').map((s) => s.connectionId).sort(), ['CN-10371', 'CN-10482']);
    assert.equal(createStore({ storage }).list(A).length, 5);
  });
});
