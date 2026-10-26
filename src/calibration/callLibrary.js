// Call Library adapter.
//
// The look-alike has no Call Library API, so this adapter serves a small
// SAMPLE library. Every Connection ID starts with "SAMPLE-" so nobody mistakes
// it for a real call, and there is no recording to play. To connect the real
// Call Library, replace listCalls/getCall with calls to its API and set
// CALL_LIBRARY.connected to true. Nothing else in the module needs to change.

import { AGENTS } from '../data.js';

export const CALL_LIBRARY = {
  connected: false,
  label: 'Sample Call Library',
  note: 'No Call Library API is connected to this copy of Team Reports. These are sample records with no recordings.',
};

const SCRIPT = [
  ['00:04', 'Agent', 'Thanks for calling support, this is {first}. How can I help today?'],
  ['00:11', 'Customer', 'Hi, my bookings stopped syncing with my calendar since yesterday.'],
  ['00:38', 'Agent', 'Sorry about that. Let me check the connection on your account.'],
  ['01:52', 'Agent', 'I can see the calendar link expired. I will walk you through reconnecting it.'],
  ['03:40', 'Customer', 'Okay, it shows connected now.'],
  ['04:05', 'Agent', 'Great. Is there anything else I can help with?'],
];

const QUEUES = ['Billing', 'Calendar sync', 'Account access', 'Payments', 'Integrations', 'Mobile app'];

const ORIGINALS = [
  { soft: 'Good', tech: 'Not Yet', note: 'Correct fix, but notes were missing the root cause.' },
  { soft: 'Not Yet', tech: 'Good', note: 'Did not confirm the issue was resolved before closing.' },
  { soft: 'Good', tech: 'Good', note: 'Clean call.' },
];

const CALLS = Array.from({ length: 14 }, (_, i) => {
  const agent = AGENTS[(i * 5 + 2) % AGENTS.length];
  const first = agent.name.split(' ')[0];
  return {
    connectionId: `SAMPLE-CNX-${String(4101 + i * 17)}`,
    agentId: agent.id,
    agentName: agent.name,
    date: `2026-10-${String(1 + i * 2).padStart(2, '0')}`,
    duration: `${4 + (i % 5)}m ${10 + i * 3}s`,
    queue: QUEUES[i % QUEUES.length],
    customer: 'Customer (masked)',
    recordingUrl: null,
    transcript: SCRIPT.map(([t, who, text]) => ({ t, who, text: text.replace('{first}', first) })),
    originalEvaluation: { evaluator: 'Original QA evaluator', ...ORIGINALS[i % ORIGINALS.length] },
  };
});

export function listCalls(query = '') {
  const q = query.trim().toLowerCase();
  return CALLS.filter((c) => !q || c.connectionId.toLowerCase().includes(q) || c.agentName.toLowerCase().includes(q) || c.queue.toLowerCase().includes(q));
}

export function getCall(connectionId) {
  return CALLS.find((c) => c.connectionId === connectionId) || null;
}
