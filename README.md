# QA Team Reports (look-alike)

A Vite + React look-alike of the internal QA Team Reports app. **All data is sample data.** There is no backend, no real sign-in and no company data.

```bash
npm install
npm run dev        # http://localhost:5173/teamreports-clone/
npm test           # Call Calibration rule tests (Node test runner)
npm run build
```

## CallGuard AI (prototype)

Sidebar page **CallGuard AI**, also on its own link: https://ramithavasu-sketch.github.io/teamreports-clone/callguard/. A self-contained QCP early-screening prototype in `public/callguard/index.html` (fictional calls, simulated audio findings clearly labelled, real rule checks on transcripts, human QA review controls). Review decisions are saved only in the viewer's browser. It does not read or write Team Reports data.

## CX QA Calibration (prototype)

Own link: https://ramithavasu-sketch.github.io/teamreports-clone/call-calibration/ (also shown inside Team Reports under **Call Calibration**). Modelled on the CX QA Calibration prototype layout: Dashboard, QA Calibration sessions, Reports and Guidelines.

How a session works:

1. **Session details** – name, Connection ID, date/time, facilitator, reviewers A/B/C. Blind evaluation, lock after submission and reveal-after-all-submit are always on.
2. **Reviewer evaluation** – each reviewer gives Soft Skills and Technical Skills an overall verdict (Good Job / Not Yet) and adds observations (QA parameter, evidence timestamp like `00:42` or `01:15–01:30`, Met / Not Met, evidence). Submitting locks it. A "switch reviewer" control simulates each reviewer; it is not real sign-in.
3. **Reveal & discussion** – unlocked only when every reviewer has submitted. Shows original verdicts (cells that differ from the majority are highlighted), observations grouped by parameter, a discussion log (agreed / unresolved / clarification needed) and the final agreed interpretation, stored separately from the originals.
4. **Summary & actions** – areas of agreement and disagreement, unresolved questions, follow-up actions with owner, due date and status. Mark the session completed; actions stay editable.

Reports use original submitted verdicts only: a section counts as agreed only when every reviewer gave the same verdict; parameter agreement compares Met / Not Met where 2+ reviewers observed the same parameter; sessions with missing submissions are excluded.

Code: `src/calibration/` (`model.js` holds every rule and metric, `seed.js` the sample sessions, pages in `App.jsx` and `SessionPage.jsx`). Tests: `npm test`. Data is sample data in browser storage only; a real deployment needs a backend, real sign-in and the Call Library.
