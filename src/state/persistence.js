// Autosave to localStorage. Everything read back is re-normalised, so a hand-edited or
// older save can never put the app into a broken state.

import { createTrip } from '../domain/trip.js';

export const STORAGE_KEY = 'wanderplan:v3';
const VERSION = 1;

const defaultStorage = () => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

export function serialize(state) {
  return JSON.stringify({ version: VERSION, ...state.data, prefs: state.prefs });
}

export function loadState(storage = defaultStorage()) {
  try {
    const raw = JSON.parse(storage.getItem(STORAGE_KEY));
    if (raw?.version !== VERSION || !Array.isArray(raw.trips)) return null;
    const trips = raw.trips.map(createTrip);
    const activeTripId = trips.some((trip) => trip.id === raw.activeTripId) ? raw.activeTripId : (trips[0]?.id ?? null);
    return { data: { trips, activeTripId }, prefs: raw.prefs ?? {} };
  } catch {
    return null;
  }
}

export function persist(store, storage = defaultStorage(), delay = 200) {
  if (!storage) return;
  let timer;
  const flush = () => {
    clearTimeout(timer);
    try {
      storage.setItem(STORAGE_KEY, serialize(store.getState()));
    } catch {
      // Storage full or blocked: the app keeps working for this session.
    }
  };
  store.subscribe(() => {
    clearTimeout(timer);
    timer = setTimeout(flush, delay);
  });
  globalThis.addEventListener?.('pagehide', flush);
}
