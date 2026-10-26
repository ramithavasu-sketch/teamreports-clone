// Small shared pieces for the Call Calibration pages.

import { useCallback, useEffect, useState } from 'react';
import { FORMATS, STATUS_LABEL } from './service.js';
import { getPerson } from './people.js';

export function useLoad(fn, deps) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true }));
    fn().then((data) => live && setState({ loading: false, data, error: null }))
      .catch((error) => live && setState({ loading: false, data: null, error }));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { ...state, reload };
}

export function FormatBadge({ format }) {
  return <span className={`cal-badge fmt-${format}`}>{FORMATS[format]}</span>;
}

export function StatusBadge({ status }) {
  return <span className={`cal-status st-${status}`}>{STATUS_LABEL[status]}</span>;
}

export function PersonChip({ id, name, small }) {
  const p = getPerson(id);
  const n = name || p?.name || 'Unknown';
  const hue = p?.hue ?? 220;
  const initials = n.split(' ').map((x) => x[0]).join('').slice(0, 2);
  return (
    <span className="cal-person">
      <span className="avatar" style={{ width: small ? 20 : 24, height: small ? 20 : 24, fontSize: small ? 9 : 10, background: `hsl(${hue} 55% 88%)`, color: `hsl(${hue} 45% 30%)` }}>{initials}</span>
      {n}
    </span>
  );
}

export const fmtDate = (iso, withTime = true) => {
  if (!iso) return 'No date';
  const d = new Date(iso);
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}) });
};

export function Loading({ label = 'Loading…' }) {
  return <div className="cal-loading"><span className="cal-spinner" />{label}</div>;
}

export function ErrorBox({ error, onRetry }) {
  if (!error) return null;
  return (
    <div className="cal-error" role="alert">
      {error.message || String(error)}
      {onRetry && <button className="link" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function Empty({ title, children }) {
  return <div className="cal-empty"><b>{title}</b>{children && <p className="muted">{children}</p>}</div>;
}

// Confirmation dialog. `reason` asks for a typed reason that is kept in the audit trail.
export function Dialog({ dialog, onClose }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [values, setValues] = useState(dialog.initial || {});
  const minReason = dialog.reason?.min ?? 0;
  const ok = async () => {
    setBusy(true);
    setError(null);
    try {
      await dialog.onConfirm({ reason, values });
      onClose();
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };
  return (
    <div className="cal-modal-bg" onClick={onClose}>
      <div className="cal-modal" role="dialog" aria-modal="true" aria-label={dialog.title} onClick={(e) => e.stopPropagation()}>
        <h3>{dialog.title}</h3>
        {dialog.body && <p className="muted">{dialog.body}</p>}
        {dialog.render && dialog.render(values, setValues)}
        {dialog.reason && (
          <label className="cal-field">{dialog.reason.label}
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={dialog.reason.placeholder || ''} />
            {minReason > 0 && <small className="muted">At least {minReason} characters. Saved in the audit trail.</small>}
          </label>
        )}
        <ErrorBox error={error} />
        <div className="cal-modal-actions">
          <button className="cal-btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className={`cal-btn ${dialog.danger ? 'danger' : ''}`} onClick={ok} disabled={busy || reason.trim().length < minReason}>
            {busy ? 'Working…' : dialog.confirmLabel || 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
