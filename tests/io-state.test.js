import assert from 'node:assert/strict';
import { test } from 'node:test';

import { sampleTrip } from '../src/domain/sample.js';
import { createTrip } from '../src/domain/trip.js';
import { parseCSV, segmentsFromCSV, tripToCSV } from '../src/io/csv.js';
import { foldLine, tripToICS } from '../src/io/ics.js';
import { loadState, persist, serialize, STORAGE_KEY } from '../src/state/persistence.js';
import { activeTrip, createInitialState, reducer } from '../src/state/reducer.js';
import { createStore } from '../src/state/store.js';

const trip = createTrip(sampleTrip);

test('csv: quoted commas, quotes and line breaks survive parsing', () => {
  assert.deepEqual(parseCSV('﻿a,"b, ""c""",d\r\n"multi\nline",2,3\n\n'), [
    ['a', 'b, "c"', 'd'],
    ['multi\nline', '2', '3'],
  ]);
});

test('csv: a trip round-trips without loss', () => {
  const tricky = createTrip({
    ...trip,
    segments: [
      ...trip.segments,
      { name: 'Nara, "deer city"', startDate: '2026-11-01', endDate: '2026-11-02', notes: 'Line one\nLine two' },
    ],
  });
  const restored = createTrip({ ...tricky, segments: segmentsFromCSV(tripToCSV(tricky)) });
  assert.deepEqual(restored, tricky);
});

test('csv: reads WanderPlan v2 files (12 columns, no Notes)', () => {
  const legacy = [
    'RowLevel,SegmentID,ActivityID,SegmentType,Name,StartDate,StartTime,EndDate,EndTime,Method,FlightNumber,Price',
    'Segment,1,,city,Tokyo,2026-10-15,14:00,2026-10-20,08:00,,,0',
    'Activity,1,t1,,Shibuya,2026-10-16,10:00,,,,,15',
    'Segment,2,,transit,Tokyo to Kyoto,2026-10-20,09:00,2026-10-20,11:15,train,Nozomi 215,95',
  ].join('\n');
  const imported = createTrip({ segments: segmentsFromCSV(legacy) });
  assert.equal(imported.segments.length, 2);
  assert.equal(imported.segments[0].activities[0].price, 15);
  assert.equal(imported.segments[1].reference, 'Nozomi 215');
  assert.throws(() => segmentsFromCSV('hello,world'), /No itinerary/);
});

test('ics: stays are all-day with an exclusive end, text is escaped, lines are folded', () => {
  const ics = tripToICS(
    createTrip({
      segments: [
        {
          name: 'Kyoto; Japan', startDate: '2026-10-20', endDate: '2026-10-24',
          activities: [
            { name: 'Tea, sweets & a very long walk through the old streets of Gion at night', date: '2026-10-21', time: '23:30' },
            { name: 'Free day', date: '2026-10-22' },
          ],
        },
      ],
    }),
    new Date('2026-01-01T00:00:00Z'),
  );
  const lines = ics.split('\r\n');
  assert.ok(lines.includes('DTSTART;VALUE=DATE:20261020'));
  assert.ok(lines.includes('DTEND;VALUE=DATE:20261025'));
  assert.ok(lines.includes('SUMMARY:Stay in Kyoto\\; Japan'));
  assert.ok(lines.includes('DTSTART:20261021T233000'));
  assert.ok(lines.includes('DTEND:20261022T003000'));
  assert.ok(lines.includes('DTSTAMP:20260101T000000Z'));
  assert.ok(lines.every((line) => new TextEncoder().encode(line).length <= 75));
  assert.equal(lines.filter((line) => line === 'BEGIN:VEVENT').length, 3);
});

test('ics: folding counts bytes, not characters', () => {
  const folded = foldLine(`SUMMARY:${'é'.repeat(60)}`).split('\r\n');
  assert.ok(folded.length > 1);
  assert.ok(folded.every((line) => new TextEncoder().encode(line).length <= 75));
  assert.equal(folded.map((line, i) => (i ? line.slice(1) : line)).join(''), `SUMMARY:${'é'.repeat(60)}`);
});

test('store: undo and redo cover data changes but not preferences', () => {
  const store = createStore(reducer, createInitialState(null));
  const original = activeTrip(store.getState());
  assert.equal(store.canUndo(), false);

  store.dispatch({ type: 'prefs/set', prefs: { theme: 'dark' } });
  assert.equal(store.canUndo(), false);

  store.dispatch({ type: 'segment/remove', id: original.segments[0].id });
  assert.equal(activeTrip(store.getState()).segments.length, 5);

  store.dispatch({ type: 'undo' });
  assert.equal(activeTrip(store.getState()).segments.length, 6);
  assert.equal(store.getState().prefs.theme, 'dark');

  store.dispatch({ type: 'redo' });
  assert.equal(activeTrip(store.getState()).segments.length, 5);
  assert.equal(store.canRedo(), false);
});

test('store: trips can be added, switched, renamed and removed', () => {
  const store = createStore(reducer, createInitialState(null));
  const first = activeTrip(store.getState());
  const second = createTrip({ name: 'Weekend' });

  store.dispatch({ type: 'trip/add', trip: second });
  assert.equal(activeTrip(store.getState()).id, second.id);

  store.dispatch({ type: 'trip/update', patch: { name: 'Long weekend', currency: 'EUR' } });
  assert.equal(activeTrip(store.getState()).name, 'Long weekend');

  store.dispatch({ type: 'trip/select', id: first.id, history: false });
  store.dispatch({ type: 'trip/remove', id: first.id });
  assert.equal(activeTrip(store.getState()).id, second.id);

  store.dispatch({ type: 'trip/remove', id: second.id });
  assert.equal(activeTrip(store.getState()), null);
});

test('persistence: state round-trips and corrupt saves are ignored', async () => {
  const memory = new Map();
  const storage = { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) };

  assert.equal(loadState(storage), null);
  const state = createInitialState(null, { view: 'agenda' });
  storage.setItem(STORAGE_KEY, serialize(state));
  assert.deepEqual(createInitialState(loadState(storage)), state);

  storage.setItem(STORAGE_KEY, '{not json');
  assert.equal(loadState(storage), null);
  storage.setItem(STORAGE_KEY, JSON.stringify({ version: 99, trips: [] }));
  assert.equal(loadState(storage), null);

  const store = createStore(reducer, state);
  persist(store, storage, 0);
  store.dispatch({ type: 'trip/update', patch: { name: 'Saved' } });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(loadState(storage).data.trips[0].name, 'Saved');
});
