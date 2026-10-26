// Wires the calibration service to storage for the browser.
//
// IMPORTANT: this look-alike has no backend, so data is kept in this
// browser's local storage. That is fine for a demo but NOT for production:
// in production the service rules run on the server (see
// supabase/migrations/) and the pages call that API instead.

import { createService, browserStorage } from './service.js';
import { seedDemo } from './seed.js';

const KEY = 'tr-call-calibration-v1';
let fixedClock = null;
const now = () => fixedClock || new Date().toISOString();

const service = createService({ storage: browserStorage(KEY), now });
const seed = (api) => seedDemo(api, (iso) => { fixedClock = iso; });
if (service.isEmpty()) service.reset(seed);

export const resetDemo = () => service.reset(seed);

// Every page goes through this async API, the same shape a network API would have.
export const api = new Proxy(service, {
  get: (target, name) => (...args) => new Promise((resolve, reject) => {
    setTimeout(() => {
      try { resolve(target[name](...args)); } catch (e) { reject(e); }
    }, 120);
  }),
});
