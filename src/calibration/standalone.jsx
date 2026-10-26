// Standalone Call Calibration page (call-calibration/index.html), so the
// module has its own link that Team Reports can point to. Uses the same
// code and the same browser data as the in-app section.

import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import { Calibration } from './Calibration.jsx';
import { getPerson } from './people.js';

const routeFromHash = () => {
  const h = decodeURIComponent(window.location.hash.slice(1));
  return h.startsWith('cal:') ? h : 'cal:assigned';
};

function storedViewer() {
  try { return getPerson(localStorage.getItem('tr-viewer')) ? localStorage.getItem('tr-viewer') : 'u-ramitha'; } catch { return 'u-ramitha'; }
}

function StandaloneCalibration() {
  const [route, setRoute] = useState(routeFromHash);
  const [viewer, setViewerState] = useState(storedViewer);
  const go = (r) => {
    setRoute(r);
    window.history.pushState(null, '', `#${r}`);
    window.scrollTo(0, 0);
  };
  const setViewer = (v) => {
    setViewerState(v);
    try { localStorage.setItem('tr-viewer', v); } catch { /* ignore */ }
    go('cal:assigned');
  };
  useEffect(() => {
    const sync = () => setRoute(routeFromHash());
    window.addEventListener('popstate', sync);
    window.addEventListener('hashchange', sync);
    return () => { window.removeEventListener('popstate', sync); window.removeEventListener('hashchange', sync); };
  }, []);
  const me = getPerson(viewer);
  return (
    <main className="cal-standalone">
      <header className="cal-topbar">
        <b>Call Calibration</b>
        <span className="cal-person">
          <span className="avatar" style={{ width: 26, height: 26, background: `hsl(${me.hue} 55% 88%)`, color: `hsl(${me.hue} 45% 30%)` }}>
            {me.name.split(' ').map((x) => x[0]).join('').slice(0, 2)}
          </span>
          {me.name}
        </span>
      </header>
      <Calibration route={route} go={go} viewer={viewer} setViewer={setViewer} />
    </main>
  );
}

createRoot(document.getElementById('root')).render(<StrictMode><StandaloneCalibration /></StrictMode>);
