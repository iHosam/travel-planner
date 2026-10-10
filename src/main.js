import { loadState, persist } from './state/persistence.js';
import { createInitialState, reducer } from './state/reducer.js';
import { createStore } from './state/store.js';
import { App } from './ui/app.js';
import { startSmoothScroll, startSpotlight } from './ui/motion.js';
import { html, render } from './ui/lib.js';

// Phones open on the agenda; wider screens open on the timeline.
const isPhone = matchMedia('(max-width: 700px)').matches;
const firstRunPrefs = isPhone ? { view: 'agenda', zoom: 116 } : {};

const store = createStore(reducer, createInitialState(loadState(), firstRunPrefs));
persist(store);

render(html`<${App} store=${store} />`, document.getElementById('app'));
startSmoothScroll();
startSpotlight();
