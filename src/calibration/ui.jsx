// Shared pieces for the Call Calibration pages.

import { useEffect, useRef, useState } from 'react';
import { callFor } from './model.js';

export const go = (path) => { window.location.hash = `#/${path}`; window.scrollTo(0, 0); };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const fmtDate = (d) => {
  if (!d) return '—';
  const [y, m, day] = d.slice(0, 10).split('-').map(Number);
  return `${day} ${MONTHS[m - 1]} ${y}`;
};
export const fmtStamp = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  const h = d.getHours();
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${((h + 11) % 12) + 1}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

export function Header({ eyebrow, title, desc, children }) {
  return (
    <div className="tr-head">
      <div><div className="tr-eyebrow">{eyebrow}</div><h1>{title}</h1>{desc && <p>{desc}</p>}</div>
      {children && <div className="tr-head-actions">{children}</div>}
    </div>
  );
}

export function Metric({ title, label, value, blue }) {
  return <div className="tr-metric"><h3>{title}</h3><div className="key">{label}</div><div className={`val ${blue ? 'blue' : ''}`}>{value}</div></div>;
}

export function Panel({ title, tag, children, className = '' }) {
  return (
    <section className={`tr-panel ${className}`}>
      {(title || tag) && <div className="tr-panel-head"><h2>{title}</h2>{tag}</div>}
      {children}
    </section>
  );
}

export const Tag = ({ tone = '', children }) => <span className={`tr-tag ${tone}`}>{children}</span>;
export const StatusTag = ({ status }) => <Tag tone={status.tone}>{status.label}</Tag>;
export function VerdictTag({ value }) {
  if (!value) return <Tag>—</Tag>;
  return <Tag tone={value === 'Good' ? 'green' : 'red'}>{value === 'Good' ? '✓ Good' : '✕ Not Yet'}</Tag>;
}

export function Notice({ tone = '', children }) {
  return <div className={`tr-notice ${tone}`}>{children}</div>;
}

export function ErrorNote({ error }) {
  return error ? <div className="tr-notice bad" role="alert">{error.message || String(error)}</div> : null;
}

// The label wraps a single input/select/textarea so screen readers announce
// it; anything else (read-only values, checkbox lists) is a labelled group.
export function Field({ label, children }) {
  if (!['input', 'select', 'textarea'].includes(children?.type)) return <div className="tr-field" role="group" aria-label={label}><span className="tr-field-label">{label}</span>{children}</div>;
  return <label className="tr-field"><span className="tr-field-label">{label}</span>{children}</label>;
}

export function VerdictPicker({ value, onChange, label }) {
  return (
    <div className="tr-radio-row" role="radiogroup" aria-label={label}>
      {['Good', 'Not Yet'].map((v) => (
        <button key={v} type="button" role="radio" aria-checked={value === v}
          className={`tr-verdict ${value === v ? `selected ${v === 'Good' ? 'good' : 'notyet'}` : ''}`} onClick={() => onChange(v)}>
          {v === 'Good' ? '✓ Good' : '✕ Not Yet'}
        </button>
      ))}
    </div>
  );
}

// Placeholder player: a real build loads the recording from Call Library by Connection ID.
export function CallPlayer({ connectionId }) {
  const c = callFor(connectionId) || { line: 'Unknown call', date: '', duration: '00:00' };
  const [mm, ss] = c.duration.split(':').map(Number);
  const total = mm * 60 + ss;
  const [pos, setPos] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timer = useRef(null);
  useEffect(() => {
    if (!playing) return undefined;
    timer.current = setInterval(() => setPos((p) => {
      if (p + 1 >= total) { setPlaying(false); return total; }
      return p + 1;
    }), 1000);
    return () => clearInterval(timer.current);
  }, [playing, total]);
  const t = (n) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
  return (
    <Panel title="Call recording" tag={<Tag>Connection ID: {connectionId}</Tag>}>
      <p className="tr-muted tiny">{c.line} · {fmtDate(c.date)} · {c.duration} · Prototype player</p>
      <div className="tr-playbar">
        <button className="tr-play" onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause sample recording' : 'Play sample recording'}>{playing ? 'Ⅱ' : '▶'}</button>
        <div className="tr-track-wrap">
          <div className="tr-track"><div style={{ width: `${(pos / total) * 100}%` }} /></div>
          <div className="tr-times"><span>{t(pos)}</span><span>{c.duration}</span></div>
        </div>
        <button className="secondary small" onClick={() => setPos(Math.min(total, pos + 10))}>+10s</button>
      </div>
      <Notice tone="warn">The player is a placeholder. In Team Reports it should load the real recording from Call Library using the Connection ID.</Notice>
    </Panel>
  );
}

export function Modal({ title, eyebrow, onClose, children }) {
  return (
    <div className="tr-modal-back" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section className="tr-modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="tr-modal-head"><div><div className="tr-eyebrow">{eyebrow}</div><h2>{title}</h2></div><button className="secondary small" onClick={onClose}>Close</button></div>
        {children}
      </section>
    </div>
  );
}
