// Who can use Call Calibration. Team Reports has no real sign-in in this
// look-alike, so the people below are sample users and the "Viewing as"
// switch stands in for the sign-in. Roles:
//   admin    - QA admin: everything
//   qa_lead  - QA Lead: create and manage sessions, make the final call
//   qa       - QA reviewer: sessions assigned to them; can be a facilitator
//   agent    - agent: only Agent Sessions about their own calls

import { AGENTS } from '../data.js';

const STAFF = [
  { id: 'u-ramitha', name: 'Ramitha Vasu', role: 'admin', hue: 20 },
  { id: 'u-tessa', name: 'Tessa Moreau', role: 'qa_lead', hue: 280 },
  { id: 'u-nadia', name: 'Nadia Flores', role: 'qa', hue: 160 },
  { id: 'u-owen', name: 'Owen Mercer', role: 'qa', hue: 200 },
  { id: 'u-priya', name: 'Priya Natarajan', role: 'qa', hue: 330 },
  { id: 'u-leo', name: 'Leo Brandt', role: 'qa', hue: 100 },
  { id: 'u-sam', name: 'Sam Okafor', role: 'qa', hue: 40 },
];

export const agentPersonId = (agentId) => `agent-${agentId}`;

export const PEOPLE = [
  ...STAFF,
  ...AGENTS.map((a) => ({ id: agentPersonId(a.id), name: a.name, role: 'agent', hue: a.hue })),
];

export const ROLE_LABEL = { admin: 'QA Admin', qa_lead: 'QA Lead', qa: 'QA Reviewer', agent: 'Agent' };

export function getPerson(id) {
  return PEOPLE.find((p) => p.id === id) || null;
}

export const isManager = (person) => person?.role === 'admin' || person?.role === 'qa_lead';
export const qaStaff = () => PEOPLE.filter((p) => p.role !== 'agent');
