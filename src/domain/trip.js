// The trip model: pure functions only. Nothing here touches the DOM or storage.
//
//   Trip     { id, name, currency, segments[] }
//   Segment  { id, type: 'city' | 'transit', name, startDate, startTime, endDate, endTime,
//              price, notes, activities[], method?, reference?, pendingShift?, lat?, lng?, place? }
//
// `lat`/`lng` place a stay on the globe. On a travel leg they mark its far end (where the flight
// home lands), which matters only when no stay follows it.
//
// `pendingShift` is a number of days a booking would have to move to follow a change made
// elsewhere in the trip. It is only a proposal until the traveller approves it.
//   Activity { id, name, date, time, price, notes }

import { addDays, diffDays, eachDay, formatDay, formatTime, isISODate, isTime, todayISO } from './dates.js';
import { isCoordinate } from './geo.js';

// Add a row here to support a new way of getting around.
export const TRANSIT_METHODS = [
  { id: 'flight', label: 'Flight' },
  { id: 'train', label: 'Train' },
  { id: 'bus', label: 'Bus' },
  { id: 'car', label: 'Car' },
  { id: 'ferry', label: 'Ferry' },
];

export const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'SAR', 'AED', 'EGP', 'CAD', 'AUD', 'CHF', 'CNY', 'INR', 'TRY'];

export const uid = () =>
  globalThis.crypto?.randomUUID?.().replace(/-/g, '').slice(0, 12) ?? Math.random().toString(36).slice(2, 14);

const text = (value) => (value == null ? '' : String(value).trim());

const money = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : 0;
};

const when = (date, time) => `${date}T${time || '00:00'}`;

const sortActivities = (activities) =>
  [...activities].sort((a, b) => when(a.date, a.time).localeCompare(when(b.date, b.time)));

const sortSegments = (segments) =>
  [...segments].sort(
    (a, b) =>
      when(a.startDate, a.startTime).localeCompare(when(b.startDate, b.startTime)) ||
      when(a.endDate, a.endTime).localeCompare(when(b.endDate, b.endTime)),
  );

// --- Constructors: accept anything, return a well-formed record ---

export function createActivity(input = {}, fallbackDate = todayISO()) {
  return {
    id: text(input.id) || uid(),
    name: text(input.name) || 'Untitled',
    date: isISODate(input.date) ? input.date : fallbackDate,
    time: isTime(input.time) ? input.time : '',
    price: money(input.price),
    notes: text(input.notes),
  };
}

export function createSegment(input = {}) {
  const type = input.type === 'transit' ? 'transit' : 'city';
  const startDate = isISODate(input.startDate) ? input.startDate : todayISO();
  const segment = {
    id: text(input.id) || uid(),
    type,
    name: text(input.name) || (type === 'city' ? 'Untitled stay' : 'Untitled leg'),
    startDate,
    startTime: isTime(input.startTime) ? input.startTime : '',
    endDate: isISODate(input.endDate) ? input.endDate : startDate,
    endTime: isTime(input.endTime) ? input.endTime : '',
    price: money(input.price),
    notes: text(input.notes),
    activities: [],
  };
  const pendingShift = Math.trunc(Number(input.pendingShift)) || 0;
  if (pendingShift) segment.pendingShift = pendingShift;
  const hasPosition = ![input.lat, input.lng].some((value) => value == null || value === '');
  if (hasPosition && isCoordinate(Number(input.lat), Number(input.lng))) {
    segment.lat = Math.round(Number(input.lat) * 1e4) / 1e4;
    segment.lng = Math.round(Number(input.lng) * 1e4) / 1e4;
    if (text(input.place)) segment.place = text(input.place);
  }
  if (type === 'transit') {
    segment.method = TRANSIT_METHODS.some((m) => m.id === input.method) ? input.method : 'flight';
    segment.reference = text(input.reference ?? input.flightNumber);
  } else {
    segment.activities = sortActivities((input.activities ?? []).map((a) => createActivity(a, startDate)));
  }
  return segment;
}

export function createTrip(input = {}) {
  const currency = text(input.currency).toUpperCase();
  return {
    id: text(input.id) || uid(),
    name: text(input.name) || 'Untitled Trip',
    currency: /^[A-Z]{3}$/.test(currency) ? currency : 'USD',
    segments: sortSegments((input.segments ?? []).map(createSegment)),
  };
}

export function duplicateTrip(trip) {
  return createTrip({
    ...trip,
    id: uid(),
    name: `${trip.name} copy`,
    segments: trip.segments.map((segment) => ({
      ...segment,
      id: uid(),
      activities: segment.activities.map((activity) => ({ ...activity, id: uid() })),
    })),
  });
}

// --- Edits: every function returns a new trip ---

const mapSegment = (trip, id, change) => ({
  ...trip,
  segments: sortSegments(trip.segments.map((segment) => (segment.id === id ? change(segment) : segment))),
});

export const addSegment = (trip, input) => ({
  ...trip,
  segments: sortSegments([...trip.segments, createSegment(input)]),
});

// Editing a booking's dates by hand settles any pending proposal for it,
// and renaming a place forgets where the old name was on the globe.
export const updateSegment = (trip, id, patch) =>
  mapSegment(trip, id, (segment) => {
    const next = { ...segment, ...patch, id: segment.id, type: segment.type };
    if (next.startDate !== segment.startDate || next.endDate !== segment.endDate) next.pendingShift = 0;
    if (text(next.name) !== segment.name && next.lat === segment.lat && next.lng === segment.lng) next.lat = null;
    return createSegment(next);
  });

export const removeSegment = (trip, id) => ({
  ...trip,
  segments: trip.segments.filter((segment) => segment.id !== id),
});

export const removeActivity = (trip, segmentId, activityId) =>
  mapSegment(trip, segmentId, (segment) => ({
    ...segment,
    activities: segment.activities.filter((activity) => activity.id !== activityId),
  }));

// Creates or replaces an activity. Pass `fromSegmentId` to move it between stays.
export function saveActivity(trip, segmentId, input, fromSegmentId = segmentId) {
  const target = trip.segments.find((segment) => segment.id === segmentId);
  if (!target || target.type !== 'city') return trip;
  const activity = createActivity(input, target.startDate);
  const base = fromSegmentId === segmentId ? trip : removeActivity(trip, fromSegmentId, activity.id);
  return mapSegment(base, segmentId, (segment) => ({
    ...segment,
    activities: sortActivities([...segment.activities.filter((a) => a.id !== activity.id), activity]),
  }));
}

export function moveActivity(trip, fromSegmentId, activityId, toSegmentId, date) {
  const activity = trip.segments
    .find((segment) => segment.id === fromSegmentId)
    ?.activities.find((a) => a.id === activityId);
  return activity ? saveActivity(trip, toSegmentId, { ...activity, date }, fromSegmentId) : trip;
}

// --- Changing a stay's length, and the bookings that depend on it ---

// Moves one edge of a stay. Nothing else moves: every booking on the far side of that edge is
// flagged with a proposed shift, to be approved or kept one by one.
export function resizeStay(trip, id, edge, date) {
  const index = trip.segments.findIndex((segment) => segment.id === id);
  const stay = trip.segments[index];
  if (!stay || stay.type !== 'city' || !isISODate(date)) return trip;
  const atEnd = edge === 'end';
  const delta = diffDays(atEnd ? stay.endDate : stay.startDate, date);
  if (!delta || (atEnd ? date < stay.startDate : date > stay.endDate)) return trip;

  // A booking already flagged is judged by where it is proposed to go, so drags add up.
  const depends = (segment, at) => {
    const proposed = proposedDates(segment);
    return atEnd ? at > index && proposed.startDate >= stay.endDate : at < index && proposed.endDate <= stay.startDate;
  };

  return {
    ...trip,
    segments: sortSegments(
      trip.segments.map((segment, at) => {
        if (at === index) return { ...stay, [atEnd ? 'endDate' : 'startDate']: date };
        if (!depends(segment, at)) return segment;
        return createSegment({ ...segment, pendingShift: (segment.pendingShift ?? 0) + delta });
      }),
    ),
  };
}

const proposedDates = (segment) => ({
  startDate: addDays(segment.startDate, segment.pendingShift ?? 0),
  endDate: addDays(segment.endDate, segment.pendingShift ?? 0),
});

export const pendingApprovals = (trip) =>
  trip.segments
    .filter((segment) => segment.pendingShift)
    .map((segment) => ({ segment, days: segment.pendingShift, ...proposedDates(segment) }));

const settle = (trip, ids, change) => ({
  ...trip,
  segments: sortSegments(trip.segments.map((s) => (s.pendingShift && ids.includes(s.id) ? change(s) : s))),
});

// Approving moves the booking, and everything planned inside it, by the proposed days.
export const approveShifts = (trip, ids) =>
  settle(trip, ids, (segment) =>
    createSegment({
      ...segment,
      ...proposedDates(segment),
      pendingShift: 0,
      activities: segment.activities.map((a) => ({ ...a, date: addDays(a.date, segment.pendingShift) })),
    }),
  );

// Declining keeps the booking exactly where it is.
export const dismissShifts = (trip, ids) => settle(trip, ids, (segment) => createSegment({ ...segment, pendingShift: 0 }));

// --- Rules: return a human sentence when something is wrong, otherwise null ---

export function checkPlacement(segment, date, time = '') {
  if (!segment || segment.type !== 'city') return 'Activities belong to a stay, not a travel leg.';
  if (date < segment.startDate || date > segment.endDate) {
    return `${formatDay(date)} is outside your stay in ${segment.name} (${formatDay(segment.startDate)} – ${formatDay(segment.endDate)}).`;
  }
  if (time && date === segment.startDate && segment.startTime && time < segment.startTime) {
    return `${formatTime(time)} is before you arrive in ${segment.name} at ${formatTime(segment.startTime)}.`;
  }
  if (time && date === segment.endDate && segment.endTime && time > segment.endTime) {
    return `${formatTime(time)} is after you leave ${segment.name} at ${formatTime(segment.endTime)}.`;
  }
  return null;
}

const endsBeforeStart = (segment) =>
  segment.endDate < segment.startDate ||
  (segment.endDate === segment.startDate &&
    isTime(segment.startTime) &&
    isTime(segment.endTime) &&
    segment.endTime < segment.startTime);

export function checkSegment(draft) {
  const errors = {};
  if (!text(draft.name)) {
    errors.name = draft.type === 'transit' ? 'Name this leg, like “Tokyo to Kyoto”.' : 'Enter a city or place.';
  }
  if (!isISODate(draft.startDate)) errors.start = 'Choose a date.';
  if (!isISODate(draft.endDate)) errors.end = 'Choose a date.';
  else if (!errors.start && endsBeforeStart(draft)) errors.end = 'This ends before it starts.';
  return errors;
}

export function tripIssues(trip) {
  const issues = [];
  const stays = trip.segments.filter((segment) => segment.type === 'city');
  stays.forEach((stay, index) => {
    const next = stays[index + 1];
    // A stay still awaiting approval is already flagged; do not report it twice.
    if (next && !next.pendingShift && next.startDate < stay.endDate) {
      issues.push({
        segmentId: next.id,
        message: `${next.name} starts ${formatDay(next.startDate)}, before you leave ${stay.name} on ${formatDay(stay.endDate)}.`,
      });
    }
  });
  for (const segment of trip.segments) {
    if (endsBeforeStart(segment)) {
      issues.push({ segmentId: segment.id, message: `${segment.name} ends before it starts.` });
    }
    for (const activity of segment.activities) {
      const problem = checkPlacement(segment, activity.date, activity.time);
      if (problem) {
        issues.push({ segmentId: segment.id, activityId: activity.id, message: `${activity.name}: ${problem}` });
      }
    }
  }
  return issues;
}

// --- Views of a trip ---

export function tripRange(trip) {
  const dates = trip.segments.flatMap((segment) => [
    segment.startDate,
    segment.endDate,
    ...Object.values(proposedDates(segment)),
    ...segment.activities.map((activity) => activity.date),
  ]);
  if (!dates.length) return null;
  dates.sort();
  return { start: dates[0], end: dates[dates.length - 1] };
}

export function tripDays(trip, padding = 0) {
  const range = tripRange(trip);
  return range ? eachDay(addDays(range.start, -padding), addDays(range.end, padding)) : [];
}

export function tripTotals(trip) {
  const totals = { stays: 0, travel: 0, activities: 0, cities: 0, days: 0 };
  for (const segment of trip.segments) {
    if (segment.type === 'city') {
      totals.cities += 1;
      totals.stays += segment.price;
      for (const activity of segment.activities) totals.activities += activity.price;
    } else {
      totals.travel += segment.price;
    }
  }
  const range = tripRange(trip);
  totals.days = range ? diffDays(range.start, range.end) + 1 : 0;
  totals.total = totals.stays + totals.travel + totals.activities;
  return totals;
}

// One entry per day: the stays covering it and everything happening, in time order.
export function buildAgenda(trip) {
  return tripDays(trip).map((date) => {
    const stays = [];
    const items = [];
    for (const segment of trip.segments) {
      if (segment.type === 'city') {
        if (date >= segment.startDate && date <= segment.endDate) stays.push(segment);
        for (const activity of segment.activities) {
          if (activity.date === date) items.push({ kind: 'activity', time: activity.time, segment, activity });
        }
      } else if (segment.startDate === date) {
        items.push({ kind: 'depart', time: segment.startTime, segment });
      } else if (segment.endDate === date) {
        items.push({ kind: 'arrive', time: segment.endTime, segment });
      }
    }
    items.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    return { date, stays, items };
  });
}

// Where the next segment most naturally begins: when the last one ends.
export function suggestStart(trip) {
  const last = [...(trip?.segments ?? [])].sort((a, b) =>
    when(b.endDate, b.endTime || '23:59').localeCompare(when(a.endDate, a.endTime || '23:59')),
  )[0];
  return last ? { startDate: last.endDate, startTime: last.endTime } : { startDate: todayISO(), startTime: '' };
}
