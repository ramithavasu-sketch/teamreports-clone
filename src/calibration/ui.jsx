// Shared UI pieces for the CX QA Calibration pages.

import { useState } from 'react';
import { STATUS, ACTION_STATUS } from './model.js';

const ICONS = {
  logo: 'M9 3h6v3H9zM6 5h3M15 5h3v16H6V5h3M9 13l2 2 4-4',
  dashboard: 'M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z',
  calibration: 'M9 3h6v3H9zM6 5h3M15 5h3v16H6V5h3M9 13l2 2 4-4',
  reports: 'M4 20h16M7 16V9M12 16V5M17 16v-4',
  guidelines: 'M4 5c3-1.5 5.5-1.5 8 0v15c-2.5-1.5-5-1.5-8 0zM20 5c-3-1.5-5.5-1.5-8 0v15c2.5-1.5 5-1.5 8 0z',
  back: 'M15 6l-6 6 6 6',
  plus: 'M12 5v14M5 12h14',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  eyeOff: 'M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 3.9M6.6 6.6C3.8 8.4 2 12 2 12s4 7 10 7a9.6 9.6 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2',
  check: 'M5 12l5 5 9-10',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  list: 'M9 6h11M9 12h11M9 18h11M4 6h1M4 12h1M4 18h1',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v5M16 3v5',
  done: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8 12l3 3 5-6',
  clipboard: 'M9 3h6v3H9zM6 5h3M15 5h3v16H6V5h3M9 11h6M9 15h4',
  flask: 'M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3M7 15h10',
  reset: 'M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
  external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
};

export function Icon({ name, size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

export function StatusBadge({ status }) {
  return <span className={`cx-badge st-${status}`}>{STATUS[status]}</span>;
}

export function ActionBadge({ status }) {
  return <span className={`cx-badge act-${status}`}>{ACTION_STATUS[status]}</span>;
}

export function Verdict({ value, highlight }) {
  if (!value) return <span className="cx-muted">—</span>;
  return <span className={`cx-verdict ${value === 'Good Job' ? 'good' : 'notyet'} ${highlight ? 'diff' : ''}`}>{value}</span>;
}

export function Finding({ value }) {
  return <span className={`cx-finding ${value === 'Met' ? 'met' : 'notmet'}`}>{value}</span>;
}

export function Locked() {
  return <span className="cx-locked"><Icon name="lock" size={12} /> Submitted · Locked</span>;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const fmtDate = (d) => {
  if (!d) return '—';
  const [y, m, day] = d.slice(0, 10).split('-').map(Number);
  return `${day} ${MONTHS[m - 1]} ${y}`;
};
export const fmtTime = (t) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};
export const fmtStamp = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${fmtTime(`${d.getHours()}:${d.getMinutes()}`)}`;
};

export function PageHead({ eyebrow, title, sub, children }) {
  return (
    <div className="cx-pagehead">
      <div>
        {eyebrow && <div className="cx-eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {sub && <p className="cx-sub">{sub}</p>}
      </div>
      {children && <div className="cx-pagehead-actions">{children}</div>}
    </div>
  );
}

export function Card({ title, sub, right, children, className = '' }) {
  return (
    <section className={`cx-card ${className}`}>
      {(title || right) && (
        <div className="cx-card-head">
          <div>{title && <h2>{title}</h2>}{sub && <p className="cx-muted">{sub}</p>}</div>
          {right}
        </div>
      )}
      <div className="cx-card-body">{children}</div>
    </section>
  );
}

export function Stat({ label, value, sub, icon, tone = 'blue' }) {
  return (
    <div className="cx-stat">
      <div className="cx-stat-top"><span>{label}</span>{icon && <span className={`cx-stat-icon ${tone}`}><Icon name={icon} /></span>}</div>
      <b>{value}</b>
      {sub && <small>{sub}</small>}
    </div>
  );
}

export function ErrorNote({ error }) {
  if (!error) return null;
  return <div className="cx-error" role="alert">{error.message || String(error)}</div>;
}

export function Empty({ title, children }) {
  return <div className="cx-empty"><b>{title}</b>{children && <p className="cx-muted">{children}</p>}</div>;
}

// Confirmation dialog: { title, body, confirm, onConfirm }
export function Confirm({ dialog, onClose }) {
  const [error, setError] = useState(null);
  return (
    <div className="cx-modal-bg" onClick={onClose}>
      <div className="cx-modal" role="dialog" aria-modal="true" aria-label={dialog.title} onClick={(e) => e.stopPropagation()}>
        <h3>{dialog.title}</h3>
        {dialog.body && <p className="cx-muted">{dialog.body}</p>}
        <ErrorNote error={error} />
        <div className="cx-modal-actions">
          <button className="cx-btn ghost" onClick={onClose}>Cancel</button>
          <button className="cx-btn" onClick={() => { try { dialog.onConfirm(); onClose(); } catch (e) { setError(e); } }}>{dialog.confirm || 'Confirm'}</button>
        </div>
      </div>
    </div>
  );
}

export function Toggle({ options, value, onChange, disabled, className = '', label }) {
  return (
    <div className={`cx-toggle ${className}`} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o} type="button" role="radio" aria-checked={value === o} disabled={disabled}
          className={`${value === o ? 'on' : ''} v-${o.replace(/\W/g, '').toLowerCase()}`} onClick={() => onChange(o)}>
          <span className="dot" />{o}
        </button>
      ))}
    </div>
  );
}
