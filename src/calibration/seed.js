// Sample calibration sessions. Built through the store so they obey the same rules.

const obs = (parameter, timestamp, finding, evidence) => ({ parameter, timestamp, finding, evidence });
const ev = (soft, softObs, tech, techObs, notes = '') => ({
  sections: { soft: { verdict: soft, observations: softObs }, tech: { verdict: tech, observations: techObs } },
  notes,
});

export function seedDemo(store, at) {
  const make = (when, data, publish = true) => {
    at(when);
    return store.saveSession({ reviewers: ['A', 'B', 'C'], facilitator: 'Self', ...data }, null, { publish });
  };
  const submit = (when, id, r, e) => { at(when); store.submitEvaluation(id, r, e); };

  /* 1. Completed: Billing dispute (soft split, tech agreed) */
  const s1 = make('2026-09-10T09:00:00Z', { name: 'CX QA Calibration – Billing Dispute', connectionId: 'CONN-48213-0914', date: '2026-09-14', time: '10:00' });
  submit('2026-09-13T15:12:00Z', s1, 'A', ev('Good Job', [obs('Tone', '00:42', 'Met', 'Stayed calm and friendly while the customer was upset.'), obs('Empathy', '01:15–01:30', 'Met', 'Acknowledged the confusing charge before investigating.')],
    'Not Yet', [obs('Required Answer Phrase', '04:10', 'Not Met', 'Refund timeline phrase not used.'), obs('Verification', '00:20', 'Met', 'Full verification before opening the account.')], 'Good rapport; the technical miss is the refund phrase.'));
  submit('2026-09-13T16:40:00Z', s1, 'B', ev('Not Yet', [obs('Empathy', '01:15–01:30', 'Not Met', 'Empathy statement sounded scripted, no ownership.'), obs('Accountability', '02:05', 'Not Met', 'Blamed the billing system for the error.')],
    'Not Yet', [obs('Required Answer Phrase', '04:10', 'Not Met', 'Refund timeline phrase missing.'), obs('Documentation', '05:30', 'Met', 'Notes include the invoice number and amount.')]));
  submit('2026-09-14T08:05:00Z', s1, 'C', ev('Good Job', [obs('Empathy', '01:20', 'Met', 'Empathy fitted the situation.'), obs('Call Control', '03:00–03:20', 'Met', 'Brought the call back to the resolution steps.')],
    'Not Yet', [obs('Required Answer Phrase', '04:12', 'Not Met', 'Phrase skipped before closing.'), obs('Hold Procedure', '02:40', 'Not Met', 'Hold without asking permission.')], 'Hold miss could be a coaching point.'));
  at('2026-09-14T10:05:00Z'); store.reveal(s1);
  at('2026-09-14T10:20:00Z');
  store.addDiscussionPoint(s1, { section: 'soft', parameter: 'Empathy', title: 'Empathy statement at 01:15–01:30', evidence: '“I can see why this charge is confusing — let me check it now.”',
    agreed: 'An acknowledgement followed straight away by an action meets the Empathy standard. Agreed as Met.', clarification: 'Add examples of scripted vs genuine empathy to the guideline.' });
  at('2026-09-14T10:32:00Z');
  store.addDiscussionPoint(s1, { section: 'soft', parameter: 'Accountability', title: 'Blaming the billing system at 02:05', evidence: '“That is just how the billing system works.”',
    agreed: 'Deflection means Accountability is Not Met, but one instance alone does not make Soft Skills Not Yet.', unresolved: 'Reviewer B still thinks one deflection should fail Soft Skills.', clarification: 'Decide whether a single deflection is a critical error.' });
  at('2026-09-14T10:45:00Z');
  store.saveFinal(s1, { soft: 'Good Job', tech: 'Not Yet', summary: 'Soft Skills: Good Job — genuine empathy, one accountability slip. Technical Skills: Not Yet — required refund timeline phrase missed.' });
  store.addAction(s1, { description: 'Update the Empathy guideline with scripted vs genuine examples', owner: 'Priya Nair (QA Lead)', dueDate: '2026-09-30' });
  const a2 = store.addAction(s1, { description: 'Clarify whether one deflection is a critical error', owner: 'Self', dueDate: '2026-10-31' });
  const a3 = store.addAction(s1, { description: 'Coach the agent on the refund timeline phrase', owner: 'Marcus Hale (Team Lead)', dueDate: '2026-09-21' });
  at('2026-09-14T11:00:00Z'); store.complete(s1);
  store.setActionStatus(a3, 'completed');
  store.setActionStatus(a2, 'in_progress');
  store.setActionStatus(store.allActions().find((a) => a.sessionId === s1 && a.owner.startsWith('Priya')).id, 'completed');

  /* 2. Completed: Refund request (soft agreed, tech split) */
  const s2 = make('2026-09-24T09:00:00Z', { name: 'CX QA Calibration – Refund Request', connectionId: 'CONN-51077-0928', date: '2026-09-28', time: '14:00', facilitator: 'Priya Nair (QA Lead)' });
  submit('2026-09-27T12:00:00Z', s2, 'A', ev('Good Job', [obs('Professionalism', '00:05', 'Met', 'Branded greeting and clear close.')], 'Good Job', [obs('Documentation', '06:10', 'Met', 'Refund reason code added.'), obs('Query Resolution', '05:00', 'Met', 'Refund processed in one contact.')]));
  submit('2026-09-27T14:30:00Z', s2, 'B', ev('Good Job', [obs('Active Listening', '00:50', 'Met', 'Repeated the order number back correctly.')], 'Not Yet', [obs('Documentation', '06:10', 'Not Met', 'Wrong refund reason code selected.')]));
  submit('2026-09-28T06:45:00Z', s2, 'C', ev('Good Job', [obs('Tone', '01:30', 'Met', 'Warm tone throughout.')], 'Good Job', [obs('Query Resolution', '05:02', 'Met', 'Correct refund path.')]));
  at('2026-09-28T14:10:00Z'); store.reveal(s2);
  at('2026-09-28T14:25:00Z');
  store.addDiscussionPoint(s2, { section: 'tech', parameter: 'Documentation', title: 'Refund reason code at 06:10', evidence: 'Code “Changed mind” used for a damaged item.',
    agreed: 'The code was wrong, but the refund itself was correct; Documentation Not Met does not change the overall Technical verdict here.', clarification: 'Add a reason-code threshold to the Documentation guideline.' });
  store.saveFinal(s2, { soft: 'Good Job', tech: 'Good Job', summary: 'Both sections Good Job. Documentation code error is a coaching point, not a fail.' });
  store.addAction(s2, { description: 'Add refund reason-code threshold to the Documentation guideline', owner: 'Priya Nair (QA Lead)', dueDate: '2026-10-15' });
  at('2026-09-28T14:40:00Z'); store.complete(s2);

  /* 3. Completed: Password reset escalation (both agreed) */
  const s3 = make('2026-10-01T09:00:00Z', { name: 'CX QA Calibration – Password Reset Escalation', connectionId: 'CONN-60342-1005', date: '2026-10-05', time: '11:00' });
  submit('2026-10-04T10:00:00Z', s3, 'A', ev('Good Job', [obs('Call Control', '02:10', 'Met', 'Set clear next steps.')], 'Not Yet', [obs('Verification', '00:30', 'Not Met', 'Reset link sent before full verification.'), obs('Follow-up', '07:00', 'Met', 'Promised a call-back time.')]));
  submit('2026-10-04T12:00:00Z', s3, 'B', ev('Good Job', [obs('Call Control', '02:12', 'Met', 'Agenda set early.')], 'Not Yet', [obs('Verification', '00:31', 'Not Met', 'Verification incomplete.'), obs('Follow-up', '07:02', 'Met', 'Call-back committed.')]));
  submit('2026-10-05T04:00:00Z', s3, 'C', ev('Good Job', [obs('Tone', '00:15', 'Met', 'Friendly opening.')], 'Not Yet', [obs('Verification', '00:30', 'Not Met', 'Skipped the security question.'), obs('Follow-up', '07:05', 'Not Met', 'No time given for the call-back.')]));
  at('2026-10-05T11:10:00Z'); store.reveal(s3);
  at('2026-10-05T11:30:00Z');
  store.addDiscussionPoint(s3, { section: 'tech', parameter: 'Follow-up', title: 'Call-back commitment at 07:00', evidence: '“Someone will call you back.”', agreed: 'A follow-up needs a time frame to be Met. Agreed as Not Met.' });
  store.saveFinal(s3, { soft: 'Good Job', tech: 'Not Yet', summary: 'Verification miss drives Technical Skills to Not Yet. Follow-up needs a time frame.' });
  at('2026-10-05T11:45:00Z'); store.complete(s3);

  /* 4. Ready to reveal */
  const s4 = make('2026-10-22T09:00:00Z', { name: 'CX QA Calibration – Service Outage Callback', connectionId: 'CONN-70418-1027', date: '2026-10-27', time: '09:30' });
  submit('2026-10-26T14:00:00Z', s4, 'A', ev('Good Job', [obs('Empathy', '00:50', 'Met', 'Apologised and acknowledged the impact of the outage.')], 'Not Yet', [obs('Follow-up', '05:40', 'Not Met', 'No update time promised.')]));
  submit('2026-10-26T16:20:00Z', s4, 'B', ev('Not Yet', [obs('Tone', '02:30', 'Not Met', 'Sounded rushed while explaining the outage.')], 'Good Job', [obs('Follow-up', '05:40', 'Met', 'Said updates would be sent by SMS.')]));
  submit('2026-10-27T07:55:00Z', s4, 'C', ev('Good Job', [obs('Tone', '02:30', 'Met', 'Pace was fine given the call volume.')], 'Not Yet', [obs('Documentation', '06:00', 'Not Met', 'Outage reference missing from notes.')]));

  /* 5. In review (1 of 3) */
  const s5 = make('2026-10-23T09:00:00Z', { name: 'CX QA Calibration – Plan Upgrade', connectionId: 'CONN-72950-1028', date: '2026-10-28', time: '15:00' });
  submit('2026-10-26T11:00:00Z', s5, 'B', ev('Good Job', [obs('Professionalism', '00:04', 'Met', 'Clear greeting.')], 'Good Job', [obs('Query Resolution', '04:20', 'Met', 'Upgrade applied correctly.')]));

  /* 6–7. Scheduled */
  make('2026-10-24T09:00:00Z', { name: 'CX QA Calibration – Delivery Delay Complaint', connectionId: 'CONN-75521-1103', date: '2026-11-03', time: '11:30', facilitator: 'Priya Nair (QA Lead)' });
  make('2026-10-25T09:00:00Z', { name: 'CX QA Calibration – Account Closure Retention', connectionId: 'CONN-78004-1110', date: '2026-11-10', time: '15:00' });
  at(null);
}
