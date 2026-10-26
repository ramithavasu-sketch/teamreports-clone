// All data here is made-up sample data for the look-alike.

export const WEEKS = [
  { label: '10 Oct - 16 Oct', month: 'Oct', week: 2 },
  { label: '17 Oct - 23 Oct', month: 'Oct', week: 3 },
  { label: '24 Oct - 30 Oct', month: 'Oct', week: 4 },
];

const FIRST = ['Avery', 'Jordan', 'Riley', 'Morgan', 'Casey', 'Taylor', 'Quinn', 'Harper', 'Rowan', 'Skyler',
  'Emerson', 'Finley', 'Hayden', 'Jamie', 'Kendall', 'Logan', 'Parker', 'Reese', 'Sawyer', 'Drew',
  'Blake', 'Cameron', 'Dakota', 'Elliot', 'Frankie', 'Gray', 'Indigo', 'Jules', 'Kai', 'Lane'];
const LAST = ['Adams', 'Brooks', 'Carter', 'Diaz', 'Ellis', 'Foster', 'Grant', 'Hayes', 'Irving', 'James',
  'Kim', 'Lopez', 'Mason', 'Nolan', 'Ortiz', 'Patel', 'Reed', 'Shaw', 'Turner', 'Vance',
  'Walsh', 'Young', 'Bishop', 'Cruz', 'Dunn', 'Ford', 'Hale', 'Lane', 'Moss', 'Price'];

// Small deterministic random so numbers stay the same on every reload.
let seed = 7;
const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
const int = (a, b) => Math.floor(a + rand() * (b - a + 1));

export const AGENTS = FIRST.map((f, i) => ({
  id: 110000 + i * 37,
  name: `${f} ${LAST[i]}`,
  email: `${f}.${LAST[i]}@example.com`.toLowerCase(),
  hue: (i * 47) % 360,
}));

export const LEADS = AGENTS.slice(0, 18).map((a) => {
  const total = int(5, 100);
  const evaluated = rand() < 0.25 ? 0 : int(1, Math.min(42, total));
  const soft = evaluated ? int(Math.ceil(evaluated * 0.8), evaluated) : 0;
  const tech = evaluated ? int(Math.ceil(evaluated * 0.7), evaluated) : 0;
  return { name: a.name, total, evaluated, soft, tech, possible: evaluated * 2 };
});

export const AUDIT = AGENTS.slice(3, 16).map((a) => ({ ...a, soft: 0, tech: 0, of: [0, 2, 5][int(0, 2)] }));

export const DASHBOARD = {
  boxScore: { ready: 98, acw: 0 },
  qa: { total: 60, good: 0, notYet: 0 },
  learning: { lastWk: 275, avg4: 173, avg12: 180 },
  attendance: 0,
  hours: { h: 38, m: 20 },
  calls: [17, 17, 18, 18, 19].map((d, i) => ({ n: i + 1, date: `2026-10-${d}`, evaluator: 'Ramitha Vasu' })),
};

const TYPES = ['Absence', 'Absence', 'Absence', 'Late Arrival', 'Early Logout'];
const REASONS = ['Sick', 'Personal', 'Sick', 'IT Issue', 'Others'];
const DEPTS = ['Client Experience', 'Sales', 'Recruiting', 'Client Services', 'On Training Employee'];

export const ATTENDANCE = Array.from({ length: 12 }, (_, i) => {
  const emp = AGENTS[int(0, 29)];
  const hrs = int(1, 8);
  const type = TYPES[int(0, 4)];
  return {
    by: AGENTS[int(0, 29)].name,
    type,
    system: type === 'Absence' && rand() < 0.3 ? 'LC Absence' : type,
    emp: emp.name,
    empId: emp.id,
    lead: LEADS[int(0, 17)].name,
    dept: DEPTS[int(0, 4)],
    date: '2026-10-26',
    callIn: `2026-10-26 07:${String(59 - i * 4).padStart(2, '0')}:${String(int(0, 59)).padStart(2, '0')}`,
    shift: `0${int(6, 8)}:00:00 - ${String(8 + hrs).padStart(2, '0')}:00:00`,
    reason: REASONS[int(0, 4)],
    comment: 'Sample comment.',
    point: type === 'Absence' ? hrs : 0,
    duration: `0${type === 'Absence' ? hrs : 0}:${type === 'Absence' ? '00' : '15'}:00`,
  };
});

const hms = (s) => [s / 3600, (s % 3600) / 60, s % 60].map((v) => String(Math.floor(v)).padStart(2, '0')).join(':');

export const BOX_COLUMNS = ['Active Response', 'AfterCallWorks', 'Available', 'Break', 'Connected', 'ConnectedOnHold',
  'Offline', 'Project', 'Staffed Time', 'Ready', 'ACW', 'Talk', 'AUX', 'Occupancy', 'Total Calls', 'IB Calls',
  'OB Calls', 'Missed Calls', 'Ring Time Grade', 'JSR', 'JSG'];

export const BOX_SCORES = AGENTS.slice(0, 20).map((a) => {
  const calls = int(0, 25);
  const ib = int(0, calls);
  return {
    email: a.email,
    values: [
      hms(int(0, 240)), hms(int(0, 60)), hms(int(3600, 26000)), hms(int(1200, 4000)), hms(int(0, 7000)),
      hms(int(0, 600)), hms(int(0, 5000)), hms(int(0, 5400)), hms(int(15000, 32400)),
      `${(78 + rand() * 22).toFixed(2)}%`, `${(rand() * 25).toFixed(2)}%`, `${(rand() * 30).toFixed(2)}%`,
      `${(rand() * 21).toFixed(2)}%`, `${(rand() * 40).toFixed(2)}%`, calls, ib, calls - ib, int(0, 1),
      'A', calls ? '100.00%' : '0%', calls ? 'A' : 'NA',
    ],
  };
});
