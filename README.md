# QA Team Reports (look-alike)

A Vite + React look-alike of the internal QA Team Reports app. **All data is sample data.** There is no backend, no real sign-in and no company data.

```bash
npm install
npm run dev        # http://localhost:5173/teamreports-clone/
npm run build
```

## CallGuard AI (prototype)

Sidebar page **CallGuard AI**, also on its own link: https://ramithavasu-sketch.github.io/teamreports-clone/callguard/. `public/callguard/index.html` is a self-contained React prototype (fictional calls, simulated AI screening, human QA review) that compiles in the browser and loads React, Tailwind and Babel from public CDNs, so it needs an internet connection. It keeps its data in the viewer's browser and does not read or write Team Reports data.

**Upload Call** (stereo recordings): the CX agent is taken from the right channel and the caller from the left (switchable in Rules & Settings). Each channel's speech is found by signal level and transcribed on the device with Whisper base.en (transformers.js, model downloaded once from Hugging Face), giving a full transcript labelled by speaker. If the agent channel has no speech, or the agent never speaks after the caller's first turn, the call is flagged **High Risk** (`No Interaction`). Sources are embedded as JSON in the page; the new code is in `src/services/stereoTranscriber.ts` and `src/components/upload/UploadCallModal.tsx`. Synthetic test calls: `public/callguard/samples/`.
