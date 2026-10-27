// Browser-only storage for the prototype. A real build keeps these rules on
// the Team Reports server with signed-in users and a shared database.

import { createStore, browserStorage } from './model.js';
import { seedDemo } from './seed.js';

let clock = null;
export const store = createStore({ storage: browserStorage('tr-calibration-v4'), now: () => clock || new Date().toISOString() });
const seed = (s) => seedDemo(s, (t) => { clock = t; });
if (store.isEmpty()) store.reset(seed);

export const resetDemo = () => store.reset(seed);
