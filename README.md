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

## Call Calibration (prototype)

Own link: https://ramithavasu-sketch.github.io/teamreports-clone/call-calibration/ (also shown inside Team Reports under **Call Calibration**). Built after the "Team Reports call calibration prototype v3" design.

- **Demo login** with two roles: Admin, and participants (CAM / CX / Lead), plus a "Viewing as" switcher. Sample people only; not real sign-in.
- **Admin** prepares the call internally (Connection ID and recording confirmed, recording reviewed, task context checked — required before scheduling), creates a Blind, Team or Agent session, assigns participants, tracks submissions, edits setup (participants who already submitted stay locked in) and sees an audit trail.
- **Blind session**: each participant submits Soft / Technical Skills (Good / Not Yet) with an optional evidence timestamp and comment; the response locks. Participants only ever see their own response. The Admin can open the individual verdicts only after everyone has submitted, sees agreement (majority share, a discussion aid only) and records the final outcome, takeaways and follow-up.
- **Team / Agent session**: group sessions with an agenda and meeting link; the Admin records the outcome. Participants see the shared outcome once completed.
- The call player is a placeholder; a real build loads the recording from Call Library by Connection ID.

Code: `src/calibration/` (`model.js` holds every access rule, `seed.js` the sample sessions, pages in `App.jsx` and `Session.jsx`). Tests: `npm test`. Data is sample data in browser storage only.
