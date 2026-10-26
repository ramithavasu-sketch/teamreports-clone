// Sample calibrations for the look-alike. Everything is created through the
// service, so the sample data goes through the same rules as real use.

import { listCalls } from './callLibrary.js';
import { criteriaOf, getScorecard } from './scorecards.js';

const G = 'Good';
const N = 'Not Yet';
const A = 'N/A';

const rate = (scorecardId, values, comment = '') => {
  const ids = criteriaOf(getScorecard(scorecardId)).map((c) => c.id);
  return Object.fromEntries(ids.map((id, i) => [id, { value: String(values[i]), comment: i === 0 ? comment : '', evidence: '' }]));
};

export function seedDemo(api, at) {
  const calls = listCalls();
  const ADMIN = 'u-ramitha';
  const LEAD = 'u-tessa';
  const softTech = 'tr-soft-tech';

  function blind(date, title, callIdx, facilitatorId, reviewers, extra = {}) {
    at(`${date}T04:00:00.000Z`);
    const id = api.saveDraft(LEAD, {
      title, format: 'blind', connectionId: calls[callIdx].connectionId, scheduledAt: `${date}T09:30:00.000Z`, facilitatorId,
      reviewerIds: Object.keys(reviewers), goal: 'Check how consistently we score troubleshooting and documentation.', scorecardId: softTech,
      baseline: 5, instructions: 'Listen to the full call before scoring. Use N/A only when the behaviour could not happen.', ...extra,
    });
    api.publish(LEAD, id);
    at(`${date}T09:30:00.000Z`);
    api.start(facilitatorId, id);
    return id;
  }

  /* July: completed blind session */
  const julVotes = { 'u-nadia': [G, G, G, N, G, N], 'u-owen': [G, G, G, G, G, N], 'u-priya': [G, N, G, N, G, N] };
  const jul = blind('2026-07-23', 'July blind calibration', 1, LEAD, julVotes);
  for (const [r, v] of Object.entries(julVotes)) api.submit(r, jul, { ratings: rate(softTech, v) });
  api.reveal(LEAD, jul);
  api.saveDecision(LEAD, jul, {
    ratings: rate(softTech, [G, G, G, N, G, N]),
    rationale: 'Agent reached the right fix but skipped the account check, so troubleshooting is Not Yet.',
    learningPoints: 'Score troubleshooting on the steps taken, not only the outcome.',
  });
  api.saveDecision(LEAD, jul, { ratings: { 'soft-empathy': { value: G, resolution: 'Agent acknowledged the issue twice; interruption at 00:38 was minor.' }, 'tech-diagnose': { value: N, resolution: 'Outcome was right but the required account check was skipped.' } } });
  api.finalize(LEAD, jul, { consensus: 'consensus', shareWith: ['participants', 'team'] });

  /* August: completed blind session with more spread */
  const augVotes = { 'u-nadia': [G, G, N, N, G, N], 'u-owen': [G, G, G, N, G, G], 'u-priya': [G, N, N, N, N, N], 'u-leo': [G, G, A, N, G, N] };
  const aug2 = blind('2026-08-20', 'August blind calibration', 4, LEAD, augVotes, { goal: 'Closing behaviour and documentation.' });
  for (const [r, v] of Object.entries(augVotes)) api.submit(r, aug2, { ratings: rate(softTech, v, 'See closing at 04:05.') });
  api.reveal(LEAD, aug2);
  api.addNote('u-priya', aug2, { body: 'Closing question was asked, but the agent did not confirm the fix worked.', criterionId: 'soft-close', timestamp: '04:05', kind: 'evidence' });
  api.saveDecision(LEAD, aug2, {
    ratings: Object.fromEntries(Object.entries(rate(softTech, [G, G, N, N, G, N])).map(([k, v]) => [k, { ...v, resolution: 'Agreed in discussion.' }])),
    rationale: 'Closing needs an explicit confirmation that the fix worked; asking "anything else?" is not enough.',
    rubricClarifications: 'Ownership and closing: confirmation of resolution is required for Good.',
    learningPoints: 'N/A is not for missed behaviour.',
  });
  api.finalize(LEAD, aug2, { consensus: 'consensus', shareWith: ['participants', 'team'] });
  api.addAction(LEAD, aug2, { body: 'Add the closing-confirmation rule to the rubric guide.', ownerId: LEAD, dueDate: '2026-09-05', kind: 'rubric' });

  /* September: team session with independent pre-review, points rubric, QA Lead decision */
  at('2026-09-15T04:00:00.000Z');
  const sep = api.saveDraft(LEAD, {
    title: 'September team calibration: hold etiquette', format: 'team', preReview: true, connectionId: calls[7].connectionId,
    scheduledAt: '2026-09-18T09:30:00.000Z', facilitatorId: 'u-owen', reviewerIds: ['u-nadia', 'u-priya', 'u-sam'],
    goal: 'Agree how hold etiquette affects the points rubric.', scorecardId: 'points-10', baseline: 5,
  });
  api.publish(LEAD, sep);
  at('2026-09-18T09:30:00.000Z');
  api.start('u-owen', sep);
  api.submit('u-nadia', sep, { ratings: rate('points-10', [9, 8, 7, 6, 8, 5]) });
  api.submit('u-priya', sep, { ratings: rate('points-10', [9, 6, 7, 8, 8, 5]) });
  api.submit('u-sam', sep, { ratings: rate('points-10', [10, 8, 'N/A', 6, 9, 4]) });
  api.reveal('u-owen', sep);
  api.addNote('u-sam', sep, { body: 'I read the hold as part of closing, so I marked closing N/A.', criterionId: 'soft-close', kind: 'dispute' });
  api.saveDecision('u-owen', sep, {
    ratings: Object.fromEntries(Object.entries(rate('points-10', [9, 8, 7, 6, 8, 5])).map(([k, v]) => [k, { ...v, resolution: k === 'soft-close' ? 'Closing applies: the hold happened mid-call.' : 'Agreed.' }])),
    rationale: 'Hold etiquette is scored under empathy, not closing.',
  });
  api.escalate('u-owen', sep, 'Group split on whether a long hold lowers empathy or only process.');
  at('2026-09-19T05:00:00.000Z');
  api.finalize(LEAD, sep, { consensus: 'lead_decision', leadReason: 'Rubric says hold handling is part of empathy; applied as written.', shareWith: ['participants', 'team'] });
  const sepAction = api.addAction(LEAD, sep, { body: 'Clarify hold handling under Empathy in the rubric guide.', ownerId: LEAD, dueDate: '2026-10-01', kind: 'rubric' });
  at('2026-09-30T05:00:00.000Z');
  api.setActionDone(LEAD, sepAction, true);

  /* October: completed agent session with coaching */
  const agentCall = calls[2];
  at('2026-10-06T04:00:00.000Z');
  const agentDone = api.saveDraft(LEAD, {
    title: `Agent session: ${agentCall.agentName.split(' ')[0]} calendar sync call`, format: 'agent', connectionId: agentCall.connectionId,
    scheduledAt: '2026-10-08T10:00:00.000Z', facilitatorId: 'u-nadia', reviewerIds: ['u-owen', 'u-priya'],
    goal: 'Walk through the original evaluation with the agent and agree expectations for documentation.', scorecardId: softTech,
  });
  api.publish(LEAD, agentDone);
  at('2026-10-08T10:00:00.000Z');
  api.start('u-nadia', agentDone);
  const agentId = api.getSession(LEAD, agentDone).participants.find((p) => p.role === 'Agent').id;
  api.setAttendance('u-nadia', agentDone, agentId, { attended: true, contributed: true });
  api.setAttendance('u-nadia', agentDone, 'u-owen', { attended: true, contributed: true });
  api.setAttendance('u-nadia', agentDone, 'u-priya', { attended: true, contributed: false });
  api.addNote(agentId, agentDone, { body: 'The account page was loading slowly, so I wrote the notes after the call.', criterionId: 'tech-notes', kind: 'note' });
  api.addNote('u-owen', agentDone, { body: 'Original evaluator marked notes Not Yet; worth checking our template is clear.', private: true });
  api.saveDecision('u-nadia', agentDone, {
    ratings: rate(softTech, [G, G, G, G, G, N]),
    rationale: 'Troubleshooting was correct. Notes were missing the root cause, so documentation stays Not Yet.',
    coachingPoints: 'Write the root cause in the notes before closing the ticket.',
    agreedExpectations: 'Notes include root cause, fix, and confirmation from the customer.',
    internalNotes: 'Template wording is unclear; raised separately.',
  });
  api.finalize('u-nadia', agentDone, { consensus: 'consensus', shareWith: ['participants', 'agent'] });
  api.addAction('u-nadia', agentDone, { body: 'Use the notes template with a root-cause line for the next 2 weeks.', ownerId: agentId, dueDate: '2026-10-22', kind: 'coaching' });
  api.addAction('u-nadia', agentDone, { body: 'Follow-up check on 5 tickets.', ownerId: 'u-nadia', dueDate: '2026-10-29', kind: 'followup' });

  /* October: blind session waiting on reviewers (Ramitha has to score) */
  at('2026-10-20T04:00:00.000Z');
  const octBlind = api.saveDraft(LEAD, {
    title: 'October blind calibration', format: 'blind', connectionId: calls[9].connectionId, scheduledAt: '2026-10-22T09:30:00.000Z',
    facilitatorId: LEAD, reviewerIds: [ADMIN, 'u-nadia', 'u-owen', 'u-priya', 'u-leo'], goal: 'Monthly blind check on the full scorecard.',
    scorecardId: softTech, baseline: 5, instructions: 'Score independently. Do not discuss the call until the reveal.',
    recurring: { enabled: true, cadence: 'monthly', rotateFacilitator: false },
  });
  api.publish(LEAD, octBlind);
  at('2026-10-22T09:30:00.000Z');
  api.start(LEAD, octBlind);
  api.submit('u-nadia', octBlind, { ratings: rate(softTech, [G, G, G, N, G, G]) });
  api.submit('u-owen', octBlind, { ratings: rate(softTech, [G, G, N, N, G, G]) });
  api.submit('u-leo', octBlind, { ratings: rate(softTech, [G, G, G, N, G, N]) });
  api.saveSubmission('u-priya', octBlind, { ratings: { 'soft-open': { value: G } } });

  /* October: blind session ready to reveal (Ramitha facilitates) */
  at('2026-10-23T04:00:00.000Z');
  const ready = api.saveDraft(LEAD, {
    title: 'Billing queue blind check', format: 'blind', connectionId: calls[11].connectionId, scheduledAt: '2026-10-24T11:00:00.000Z',
    facilitatorId: ADMIN, reviewerIds: ['u-owen', 'u-sam'], goal: 'Refund-policy calls: are we scoring process the same way?', scorecardId: softTech,
  });
  api.publish(LEAD, ready);
  at('2026-10-24T11:00:00.000Z');
  api.start(ADMIN, ready);
  api.submit('u-owen', ready, { ratings: rate(softTech, [G, G, G, G, N, G], 'Refund steps out of order at 01:52.') });
  api.submit('u-sam', ready, { ratings: rate(softTech, [G, G, G, G, G, G], 'Process looked fine to me.') });

  /* Today: agent session in progress, Ramitha facilitating */
  const liveCall = calls[5];
  at('2026-10-25T04:00:00.000Z');
  const liveAgent = api.saveDraft(LEAD, {
    title: `Agent session: ${liveCall.agentName.split(' ')[0]} payments call`, format: 'agent', connectionId: liveCall.connectionId,
    scheduledAt: '2026-10-27T10:30:00.000Z', facilitatorId: ADMIN, reviewerIds: ['u-owen', 'u-leo'],
    goal: 'Hear the agent’s context on the hold and agree coaching.', scorecardId: softTech,
  });
  api.publish(LEAD, liveAgent);
  at('2026-10-27T10:30:00.000Z');
  api.start(ADMIN, liveAgent);

  /* Upcoming team session and a draft */
  at('2026-10-26T04:00:00.000Z');
  const team = api.saveDraft(LEAD, {
    title: 'Team session: escalation criteria', format: 'team', connectionId: calls[12].connectionId, scheduledAt: '2026-11-05T09:30:00.000Z',
    facilitatorId: 'u-priya', reviewerIds: [ADMIN, 'u-leo', 'u-sam'], goal: 'Agree when an escalation is the correct process.', scorecardId: softTech,
    instructions: 'Bring one example of an escalation you were unsure about.',
  });
  api.publish(LEAD, team);
  api.saveDraft(ADMIN, { title: 'November blind calibration', format: 'blind', scheduledAt: '2026-11-19T09:30:00.000Z', facilitatorId: LEAD, scorecardId: softTech });
  at(null);
}
