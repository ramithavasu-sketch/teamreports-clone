// Browser-only storage for the prototype. Not production storage: a real
// deployment would put the same rules behind the Team Reports backend.

import { createStore, browserStorage } from './model.js';
import { seedDemo } from './seed.js';

let clock = null;
export const store = createStore({ storage: browserStorage('cx-calibration-v2'), now: () => clock || new Date().toISOString() });
const seed = (s) => seedDemo(s, (t) => { clock = t; });
if (store.isEmpty()) store.reset(seed);

export const resetDemo = () => store.reset(seed);
