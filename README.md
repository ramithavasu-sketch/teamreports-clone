# QA Team Reports (look-alike)

A Vite + React look-alike of the internal QA Team Reports app. **All data is sample data.** There is no backend, no real sign-in and no company data.

```bash
npm install
npm run dev        # http://localhost:5173/teamreports-clone/
npm test           # Call Calibration rule tests (Node test runner)
npm run test:db    # Call Calibration database tests (needs a local Postgres)
npm run build
```

## Call Calibration module

A new sidebar section, **Call Calibration**, with: My Assigned Calibrations, Create Calibration, Upcoming Sessions, Completed Sessions, and Calibration Results and Reports. It supports three formats: **Blind Session**, **Team Session** and **Agent Session**.

### What exists in this app (inspection, 27 Oct 2026)

| Area | Finding |
| --- | --- |
| Frontend | React 19 + Vite, one `App.jsx` with page components, state-based navigation, CSS in `index.css`. |
| Backend / database | **None.** Every page uses made-up data from `src/data.js`. |
| Authentication | **None.** The sidebar shows a fixed user. |
| Call Library | **None.** No API, recordings or Connection IDs. |
| QA scorecard | Soft Skills and Technical Skills, rated Good / Not Yet (Dashboard and Performance pages). |

The module therefore ships with the following pieces. Each one is labelled honestly in the UI and can be swapped out:

| Piece | Now | For production |
| --- | --- | --- |
| Rules (`src/calibration/service.js`) | Runs in the browser and acts as the API: the pages only receive filtered views. | Same rules are in `supabase/migrations/…_call_calibration.sql` (RLS, triggers, functions). Point the pages at those functions. |
| Storage (`store.js`) | Browser local storage, seeded with sample sessions. **Not production storage.** | Postgres tables in the migration. |
| Sign-in (`people.js`) | Sample users plus a "Demo sign-in, viewing as" switch. | Map `calibration_people` to the real Team Reports users (`auth_user_id`) and remove the switch. |
| Call Library (`callLibrary.js`) | 14 sample calls; IDs start with `SAMPLE-`; no audio. The banner says "No Call Library connected". | Replace `listCalls` and `getCall` with the real API and set `CALL_LIBRARY.connected = true`. Playback uses `recordingUrl` when present. |
| Scorecard (`scorecards.js`) | Team Reports Soft/Technical Skills (Good / Not Yet / N/A) plus a 0–10 points rubric. | Load from the real QA rubric configuration. |

### Roles

| Role | Can |
| --- | --- |
| QA Admin, QA Lead | Create, edit, publish and cancel; see every session; reveal early (with a reason); reopen a submission (with a reason); make the final call when consensus stalls; reports; schedule the next session. |
| Facilitator (any QA member, per session) | Start their session, see who has submitted (not what), reveal once everyone has submitted, run the discussion, record and finalize the decision, track attendance, add action items. No admin rights elsewhere. |
| QA Reviewer | Their assigned sessions only; their own scorecard; other verdicts only after the reveal. |
| Agent | Only Agent Sessions about their own calls. Sees the meeting, rubric, non-private notes, their own actions, their original evaluation, and the outcome if it was shared with them. Never sees reviewer scorecards, private QA notes, internal notes, instructions or the audit trail. |

Drafts are visible to managers only. Sessions a user is not part of come back as "not found", whether they are opened from the list, a direct URL or an API call.

### Status flows (enforced in `service.js` and by a database trigger)

- **Blind**, or Team/Agent with the blind pre-review switched on: Draft → Scheduled → Awaiting Submissions → Ready to Reveal → Discussion in Progress → (Awaiting Final Decision) → Completed.
- **Team / Agent without pre-review:** Draft → Scheduled → In Progress → (Awaiting Final Decision) → Completed.
- Any open session can be Cancelled. Awaiting Final Decision means consensus stalled and a QA Lead decides, with the reason recorded.

### Blind rules

- Nobody, including the facilitator and admins, can read another reviewer's verdict or comments before the reveal. The facilitator sees submission status only.
- Reveal is blocked until every reviewer submits. The exception is a QA Lead/Admin early reveal, which needs a reason and is written to the audit trail. Unsubmitted drafts are closed at the reveal.
- Submitted scorecards are locked. Reopening is QA Lead/Admin only, before the reveal, needs a reason, and keeps the original version.
- The final decision is stored separately (`decisions` / `calibration_decisions`) and never overwrites reviewer verdicts.

### Variance and agreement (`metrics.js`)

Per criterion, compared with the session baseline (default 5%):

- **Good / Not Yet (categorical):** agreement = reviewers giving the most common rating ÷ reviewers. Once a final rating is recorded, it is measured against the final rating instead. Variance = 100% − agreement. Example: 3 of 4 say Good → 3/4 (75%), variance 25%, flagged. N/A counts as its own rating, so N/A versus Not Yet is a disagreement.
- **Points (numeric):** variance = (highest − lowest) ÷ max points. Once a final score is recorded, it is the largest |reviewer − final| ÷ max points. A mix of N/A and points counts as 100%.
- **Overall score per reviewer:** Good ÷ (Good + Not Yet), or points ÷ possible points, ignoring N/A. The spread is highest minus lowest.
- The majority rating is shown for reference only. The facilitator or QA Lead must record every final rating, and a flagged or disputed item needs a resolution note before finalizing.
- The baseline is shown as an operational goal, not as proof of quality or fairness.

### Files

- `src/calibration/` — `service.js` (rules/API), `metrics.js`, `scorecards.js`, `callLibrary.js`, `people.js`, `store.js`, `seed.js`; pages in `Calibration.jsx`, `ListPages.jsx`, `CreatePage.jsx`, `SessionPage.jsx`, `ReportsPage.jsx`, `ui.jsx`; styles in `calibration.css`.
- `src/App.jsx` — sidebar entry, sub-items filtered by role, hash URLs (`#cal:session:<id>`).
- `supabase/migrations/20261027000001_call_calibration.sql` — tables, RLS, triggers, functions.
- `tests/calibration.test.js` (25 tests) and `supabase/tests/calibration_test.sql`.

### Still needed before real use

1. A backend for Team Reports (for example Supabase): apply the migration and replace `store.js` with calls to the `cal_*` functions.
2. Real sign-in: map Team Reports users to `calibration_people` with their roles.
3. Call Library API access: list/search calls, recording URLs, and the agent behind each call (`agent_ref`).
4. The real QA rubric definitions, if they differ from Soft/Technical Skills.
5. Notifications, if participants should be emailed when a session is published. Currently a published session only appears in their list.
