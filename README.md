# QA Team Reports (look-alike)

A Vite + React look-alike of the internal QA Team Reports app. **All data is sample data.** There is no backend, no real sign-in and no company data.

```bash
npm install
npm run dev        # http://localhost:5173/teamreports-clone/
npm test           # Call Calibration rule tests (Node test runner)
npm run build
```

## CallGuard AI (prototype)

Sidebar page **CallGuard AI**, also on its own link: https://ramithavasu-sketch.github.io/teamreports-clone/callguard/. `public/callguard/index.html` is a self-contained React prototype (fictional calls, simulated AI screening, human QA review) that compiles in the browser and loads React, Tailwind and Babel from public CDNs, so it needs an internet connection. It keeps its data in the viewer's browser and does not read or write Team Reports data.

**Upload Call** (stereo recordings): the CX agent is taken from the right channel and the caller from the left (switchable in Rules & Settings). Each channel's speech is found by signal level and transcribed on the device with Whisper base.en (transformers.js, model downloaded once from Hugging Face), giving a full transcript labelled by speaker. If the agent channel has no speech, or the agent never speaks after the caller's first turn, the call is flagged **High Risk** (`No Interaction`). Sources are embedded as JSON in the page; the new code is in `src/services/stereoTranscriber.ts` and `src/components/upload/UploadCallModal.tsx`. Synthetic test calls: `public/callguard/samples/`.

## CX QA Calibration (prototype)

Own link: https://ramithavasu-sketch.github.io/teamreports-clone/call-calibration/ (also shown inside Team Reports under **Call Calibration**). Modelled on the CX QA Calibration prototype layout: Dashboard, QA Calibration sessions, Reports and Guidelines.

Three formats:

- **Blind Session** – the flow below: independent evaluations, lock, reveal, discussion.
- **Team Session** – reviewers score the call together in a meeting (meeting link, attendance). The facilitator starts the session, logs discussion points and records the agreed verdict. Optional **blind pre-review** adds the independent evaluation and reveal steps first.
- **Agent Session** – like a Team Session, plus the agent's name and the original QA verdict on the call, "QA only" discussion points, coaching points and agreed expectations. **Agent's view** previews what the agent sees: their original verdict vs the outcome (once completed), coaching, shared points and their own actions — never reviewer evaluations or QA-only notes.

Agreement reports only use sessions with independent evaluations. How a Blind Session works:

1. **Session details** – name, Connection ID, date/time, facilitator, reviewers A/B/C. Blind evaluation, lock after submission and reveal-after-all-submit are always on.
2. **Reviewer evaluation** – each reviewer gives Soft Skills and Technical Skills an overall verdict (Good Job / Not Yet) and adds observations (QA parameter, evidence timestamp like `00:42` or `01:15–01:30`, Met / Not Met, evidence). Submitting locks it. A "switch reviewer" control simulates each reviewer; it is not real sign-in.
3. **Reveal & discussion** – unlocked only when every reviewer has submitted. Shows original verdicts (cells that differ from the majority are highlighted), observations grouped by parameter, a discussion log (agreed / unresolved / clarification needed) and the final agreed interpretation, stored separately from the originals.
4. **Summary & actions** – areas of agreement and disagreement, unresolved questions, follow-up actions with owner, due date and status. Mark the session completed; actions stay editable.

Reports use original submitted verdicts only: a section counts as agreed only when every reviewer gave the same verdict; parameter agreement compares Met / Not Met where 2+ reviewers observed the same parameter; sessions with missing submissions are excluded.

Code: `src/calibration/` (`model.js` holds every rule and metric, `seed.js` the sample sessions, pages in `App.jsx` and `SessionPage.jsx`). Tests: `npm test`. Data is sample data in browser storage only; a real deployment needs a backend, real sign-in and the Call Library.
