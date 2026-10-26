import { useState } from 'react';
import { api } from './store.js';
import { FORMATS } from './service.js';
import { useLoad, FormatBadge, StatusBadge, fmtDate, Loading, ErrorBox, Empty } from './ui.jsx';

const ROLE_WORD = { manager: 'QA Lead', facilitator: 'Facilitator', reviewer: 'Reviewer', agent: 'Agent' };

export function SessionCard({ s, open }) {
  return (
    <button className={`cal-card ${s.needsMe ? 'needs-me' : ''}`} onClick={() => open(s.id)}>
      <div className="cal-card-top"><FormatBadge format={s.format} /><StatusBadge status={s.status} /></div>
      <h4>{s.title}</h4>
      <div className="cal-card-meta">
        <span>{fmtDate(s.scheduledAt)}</span>
        {s.connectionId && <span className="mono">{s.connectionId}</span>}
        {s.agentName && <span>Agent: {s.agentName}</span>}
        {s.facilitatorName && <span>Facilitator: {s.facilitatorName}</span>}
      </div>
      {s.submissions && !['draft', 'scheduled'].includes(s.status) && (
        <div className="cal-progress" title={`${s.submissions.done} of ${s.submissions.required} submitted`}>
          <span style={{ width: `${(s.submissions.done / Math.max(1, s.submissions.required)) * 100}%` }} />
          <small>{s.submissions.done}/{s.submissions.required} submitted</small>
        </div>
      )}
      <div className="cal-card-foot">
        <span className="muted">{s.myRoles.filter((r) => r !== 'manager' || s.myRoles.length === 1).map((r) => ROLE_WORD[r]).join(' · ')}</span>
        <span className={s.needsMe ? 'cal-next me' : 'cal-next'}>{s.nextStep} →</span>
      </div>
    </button>
  );
}

const BUCKETS = {
  assigned: {
    title: 'My Assigned Calibrations',
    filter: (s) => !['completed', 'cancelled'].includes(s.status) && s.myRoles.some((r) => r !== 'manager'),
    empty: ['Nothing assigned to you', 'When a QA Lead publishes a calibration with you in it, it shows up here.'],
  },
  upcoming: {
    title: 'Upcoming and Active Sessions',
    filter: (s) => !['completed', 'cancelled'].includes(s.status),
    empty: ['No upcoming sessions', 'Scheduled and in-progress calibrations you can see will appear here.'],
  },
  completed: {
    title: 'Completed Sessions',
    filter: (s) => ['completed', 'cancelled'].includes(s.status),
    empty: ['No completed sessions yet', 'Finished and cancelled calibrations are kept here as history.'],
  },
};

export function ListPage({ bucket, viewer, open, canCreate, go }) {
  const { data, loading, error, reload } = useLoad(() => api.listSessions(viewer), [viewer]);
  const [format, setFormat] = useState('');
  const [q, setQ] = useState('');
  const b = BUCKETS[bucket];
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  let rows = data.filter(b.filter)
    .filter((s) => !format || s.format === format)
    .filter((s) => !q || `${s.title} ${s.connectionId} ${s.agentName} ${s.facilitatorName}`.toLowerCase().includes(q.toLowerCase()));
  if (bucket === 'completed') rows = [...rows].reverse();
  const needsMe = data.filter((s) => s.needsMe);
  return (
    <div>
      {bucket === 'assigned' && (
        <div className="cal-stats">
          <div className="cal-stat"><span>Needs your action</span><b className={needsMe.length ? 'orange' : ''}>{needsMe.length}</b></div>
          <div className="cal-stat"><span>Active</span><b>{data.filter((s) => !['draft', 'scheduled', 'completed', 'cancelled'].includes(s.status)).length}</b></div>
          <div className="cal-stat"><span>Scheduled</span><b>{data.filter((s) => s.status === 'scheduled').length}</b></div>
          <div className="cal-stat"><span>Completed</span><b>{data.filter((s) => s.status === 'completed').length}</b></div>
        </div>
      )}
      <div className="cal-toolbar">
        <h2>{b.title}</h2>
        <div className="cal-filters">
          <input placeholder="⌕ Search title, Connection ID, agent" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search sessions" />
          <select value={format} onChange={(e) => setFormat(e.target.value)} aria-label="Filter by format">
            <option value="">All formats</option>
            {Object.entries(FORMATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          {canCreate && <button className="cal-btn" onClick={() => go('cal:create')}>+ Create calibration</button>}
        </div>
      </div>
      {rows.length ? (
        <div className="cal-grid">{rows.map((s) => <SessionCard key={s.id} s={s} open={open} />)}</div>
      ) : (
        <Empty title={q || format ? 'No sessions match your filters' : b.empty[0]}>{q || format ? 'Try clearing the search or format filter.' : b.empty[1]}</Empty>
      )}
    </div>
  );
}
