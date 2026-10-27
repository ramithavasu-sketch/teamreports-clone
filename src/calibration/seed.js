// Sample sessions, created through the store so they follow the same rules.

const CHECKS = { connectionConfirmed: true, recordingReviewed: true, contextChecked: true };

export function seedDemo(store, at) {
  const A = 'admin';
  const make = (when, data) => { at(when); return store.createSession(A, { internalReview: CHECKS, ...data }); };
  const submit = (when, id, user, v) => { at(when); store.submit(user, id, v); };

  /* Completed blind session */
  const done = make('2026-10-12T09:00:00Z', { connectionId: 'CN-10288', format: 'blind', date: '2026-10-15', time: '10:30', facilitator: 'QA Lead – Ravi', participants: ['casey', 'devi', 'elena'] });
  submit('2026-10-14T10:05:00Z', done, 'casey', { soft: 'Good', tech: 'Not Yet', evidence: '02:10', comments: 'Verification was skipped before the account change.' });
  submit('2026-10-14T11:40:00Z', done, 'devi', { soft: 'Good', tech: 'Not Yet', evidence: '02:12', comments: 'Same — security question missing.' });
  submit('2026-10-15T04:15:00Z', done, 'elena', { soft: 'Not Yet', tech: 'Not Yet', evidence: '00:55', comments: 'Greeting felt rushed and the verification step was missed.' });
  at('2026-10-15T05:00:00Z'); store.openComparison(A, done);
  at('2026-10-15T05:40:00Z');
  store.saveOutcome(A, done, { soft: 'Good', tech: 'Not Yet', summary: 'Verification must happen before any account change; a quick greeting alone does not make Soft Skills Not Yet.',
    takeaways: 'Check the security question is asked before any change. Pace of greeting is a coaching point, not a fail.', actions: 'QA Lead – Ravi — add a verification example to the guide by 22 Oct.' });

  /* Agent session, completed */
  const agent = make('2026-10-19T09:00:00Z', { connectionId: 'CN-10371', format: 'agent', date: '2026-10-22', time: '11:00', facilitator: 'QA Analyst – Jo', participants: ['hari', 'isla', 'avery'] });
  at('2026-10-22T06:20:00Z');
  store.saveOutcome(A, agent, { soft: 'Good', tech: 'Good', summary: 'The interaction met the agreed standard. The group aligned on the expected acknowledgement and next steps.',
    takeaways: 'Use a specific acknowledgement before moving to the next scripted question. Keep the conversation coaching-focused.', actions: 'QA Analyst – Jo — share the example in the next coaching huddle.' });

  /* Blind session ready to discuss (everyone submitted) */
  const ready = make('2026-10-24T09:00:00Z', { connectionId: 'CN-10511', format: 'blind', date: '2026-10-28', time: '15:00', facilitator: 'QA Lead – Maya', participants: ['blake', 'farhan', 'grace'] });
  submit('2026-10-26T09:00:00Z', ready, 'blake', { soft: 'Good', tech: 'Good', evidence: '01:05', comments: 'Clear pricing explanation.' });
  submit('2026-10-26T12:30:00Z', ready, 'farhan', { soft: 'Good', tech: 'Not Yet', evidence: '02:40', comments: 'Did not confirm the plan details back to the caller.' });
  submit('2026-10-27T03:10:00Z', ready, 'grace', { soft: 'Good', tech: 'Good', evidence: '', comments: '' });

  /* Blind session in progress: 2 of 4 submitted */
  const live = make('2026-10-27T03:00:00Z', { connectionId: 'CN-10482', format: 'blind', date: '2026-10-29', time: '10:00', facilitator: 'QA Lead – Maya', participants: ['avery', 'blake', 'casey', 'devi'],
    meetLink: 'https://meet.google.com/' });
  submit('2026-10-27T03:50:00Z', live, 'avery', { soft: 'Good', tech: 'Good', evidence: '00:42', comments: 'Clear opening and followed the required verification flow.' });
  submit('2026-10-27T03:54:00Z', live, 'blake', { soft: 'Good', tech: 'Not Yet', evidence: '01:18', comments: 'The greeting was clear. One technical verification step needs discussion.' });

  /* Team session, scheduled */
  make('2026-10-27T04:00:00Z', { connectionId: 'CN-10496', format: 'team', date: '2026-10-30', time: '14:00', facilitator: 'QA Lead – Ravi', participants: ['casey', 'devi', 'elena', 'farhan'],
    meetLink: 'https://meet.google.com/' });
  at(null);
}
