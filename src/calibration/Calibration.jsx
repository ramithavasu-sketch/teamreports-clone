import { useState } from 'react';
import './calibration.css';
import { resetDemo } from './store.js';
import { PEOPLE, ROLE_LABEL, getPerson, isManager } from './people.js';
import { CALL_LIBRARY } from './callLibrary.js';
import { ListPage } from './ListPages.jsx';
import { CreatePage } from './CreatePage.jsx';
import { SessionPage } from './SessionPage.jsx';
import { ReportsPage } from './ReportsPage.jsx';
import { Dialog } from './ui.jsx';

// Sidebar entries for the Call Calibration section, filtered by role.
export function calibrationNav(viewerId) {
  const p = getPerson(viewerId);
  return [
    ['cal:assigned', 'My Assigned Calibrations', true],
    ['cal:create', 'Create Calibration', isManager(p)],
    ['cal:upcoming', 'Upcoming Sessions', true],
    ['cal:completed', 'Completed Sessions', true],
    ['cal:reports', 'Calibration Results and Reports', p?.role !== 'agent'],
  ].filter(([, , show]) => show).map(([key, label]) => ({ key, label }));
}

export function Calibration({ route, go, viewer, setViewer }) {
  const [, view, id] = route.split(':');
  const [dialog, setDialog] = useState(null);
  const [nonce, setNonce] = useState(0);
  const me = getPerson(viewer);
  const nav = calibrationNav(viewer);
  const allowed = nav.some((n) => n.key === `cal:${view}`) || ['session', 'edit'].includes(view);
  const open = (sid) => go(`cal:session:${sid}`);
  let page;
  if (!allowed || (view === 'edit' && !isManager(me))) page = <p className="cal-error">You do not have access to this page.</p>;
  else if (view === 'create') page = <CreatePage viewer={viewer} go={go} />;
  else if (view === 'edit') page = <CreatePage viewer={viewer} editId={id} go={go} />;
  else if (view === 'session') page = <SessionPage id={id} viewer={viewer} go={go} />;
  else if (view === 'reports') page = <ReportsPage viewer={viewer} open={open} />;
  else page = <ListPage bucket={view} viewer={viewer} open={open} go={go} canCreate={isManager(me)} />;

  return (
    <div className="page cal">
      <div className="cal-demo-bar">
        <span>Sample data · {CALL_LIBRARY.connected ? 'Call Library connected' : 'No Call Library connected'} · saved in this browser only</span>
        <label>Demo sign-in, viewing as
          <select value={viewer} onChange={(e) => setViewer(e.target.value)}>
            <optgroup label="QA team">{PEOPLE.filter((p) => p.role !== 'agent').map((p) => <option key={p.id} value={p.id}>{p.name} ({ROLE_LABEL[p.role]})</option>)}</optgroup>
            <optgroup label="Agents">{PEOPLE.filter((p) => p.role === 'agent').map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>
          </select>
        </label>
        {isManager(me) && <button className="link" onClick={() => setDialog({
          title: 'Reset the sample data?', danger: true, confirmLabel: 'Reset',
          body: 'All calibrations in this browser are replaced with the original sample set.',
          onConfirm: async () => { resetDemo(); setNonce((n) => n + 1); go('cal:assigned'); },
        })}>Reset sample data</button>}
      </div>
      <nav className="cal-tabs" aria-label="Call Calibration">
        {nav.map((n) => <button key={n.key} className={route === n.key ? 'active' : ''} onClick={() => go(n.key)}>{n.label}</button>)}
      </nav>
      <div key={`${viewer}-${nonce}`}>{page}</div>
      {dialog && <Dialog dialog={dialog} onClose={() => setDialog(null)} />}
    </div>
  );
}
