import assert from 'node:assert/strict';
import { test } from 'node:test';

import { angleBetween, arcPoints, boundingCap, buildRoute, nearestNeighbour, slerp, splitRouteName, toLatLng, toVector } from '../src/domain/geo.js';
import { sampleTrip } from '../src/domain/sample.js';
import { createTrip, removeSegment, updateSegment } from '../src/domain/trip.js';
import { decodeLandMask, isLand } from '../src/ui/land-mask.js';

const close = (actual, expected, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
const trip = createTrip(sampleTrip);
const tokyo = toVector(35.6762, 139.6503);
const riyadh = toVector(24.7136, 46.6753);

test('vectors: latitude and longitude convert both ways', () => {
  assert.deepEqual(toVector(0, 0), [0, 0, 1]);
  close(toVector(90, 0)[1], 1);
  const back = toLatLng(tokyo);
  close(back.lat, 35.6762);
  close(back.lng, 139.6503);
});

test('great circles: Tokyo to Riyadh is about 8,700 km and every point stays on the sphere', () => {
  close(angleBetween(tokyo, riyadh) * 6371, 8700, 120);
  for (const t of [0, 0.25, 0.5, 1]) close(Math.hypot(...slerp(tokyo, riyadh, t)), 1);
  assert.deepEqual(slerp(tokyo, tokyo, 0.5), tokyo);
  close(Math.hypot(...slerp([0, 0, 1], [0, 0, -1], 0.5)), 1, 1e-3);
});

test('arcs start and end on the surface and rise in the middle', () => {
  const arc = arcPoints(tokyo, riyadh, 0.2, 10);
  assert.equal(arc.length, 11);
  close(Math.hypot(...arc[0]), 1);
  close(Math.hypot(...arc[10]), 1);
  close(Math.hypot(...arc[5]), 1.2);
});

test('boundingCap finds the centre and reach of a set of places', () => {
  const cap = boundingCap([toVector(0, -10), toVector(0, 10)]);
  close(cap.lat, 0);
  close(cap.lng, 0);
  close(cap.radius, (10 * Math.PI) / 180);
  assert.equal(boundingCap([]), null);

  // A cluster at one end must not drag the centre away from the lone far place.
  const japanAndRiyadh = boundingCap([tokyo, toVector(35.01, 135.77), toVector(34.69, 135.5), riyadh]);
  close(japanAndRiyadh.radius, angleBetween(tokyo, riyadh) / 2, 1e-6);
  close(nearestNeighbour(toVector(0, 0), [toVector(0, 10), toVector(0, 3)]), (3 * Math.PI) / 180);
  assert.equal(nearestNeighbour(tokyo, []), null);
});

test('splitRouteName reads both ends of a leg', () => {
  assert.deepEqual(splitRouteName('Osaka to Riyadh'), ['Osaka', 'Riyadh']);
  assert.deepEqual(splitRouteName('Paris → Lyon'), ['Paris', 'Lyon']);
  assert.deepEqual(splitRouteName('Toronto - Montreal'), ['Toronto', 'Montreal']);
  assert.equal(splitRouteName('Night bus'), null);
  assert.deepEqual(splitRouteName('Saint-Tropez to Nice'), ['Saint-Tropez', 'Nice']);
});

test('buildRoute: stays become stops, travel becomes legs, and the flight home adds its destination', () => {
  const { stops, legs } = buildRoute(trip);
  assert.deepEqual(stops.map((s) => [s.name, s.kind, s.located]), [
    ['Tokyo', 'stay', true],
    ['Kyoto', 'stay', true],
    ['Osaka', 'stay', true],
    ['Riyadh', 'end', true],
  ]);
  assert.deepEqual(legs.map((l) => l.method), ['train', 'bus', 'flight']);
  assert.equal(legs[2].to, stops[3].id);
  assert.equal(stops[3].segmentId, trip.segments[5].id);
});

test('buildRoute copes with missing travel and unnamed last legs', () => {
  const noTrain = removeSegment(trip, trip.segments[1].id);
  const route = buildRoute(noTrain);
  assert.equal(route.legs[0].method, null);
  assert.equal(route.legs[0].from, route.stops[0].id);

  const vague = updateSegment(trip, trip.segments[5].id, { name: 'Flight home' });
  assert.equal(buildRoute(vague).stops.length, 3);
  assert.deepEqual(buildRoute(createTrip()), { stops: [], legs: [] });
});

test('coordinates are validated, and renaming a place forgets its old location', () => {
  const loose = createTrip({ segments: [{ name: 'A', lat: '91', lng: '0' }, { name: 'B', lat: '', lng: '' }, { name: 'C', lat: '10.123456', lng: 20 }] });
  assert.deepEqual(loose.segments.map((s) => [s.lat, s.lng]), [[undefined, undefined], [undefined, undefined], [10.1235, 20]]);

  const [tokyoStay] = trip.segments;
  const renamed = updateSegment(trip, tokyoStay.id, { ...tokyoStay, name: 'Yokohama' });
  assert.equal(renamed.segments[0].lat, undefined);
  const noted = updateSegment(trip, tokyoStay.id, { ...tokyoStay, notes: 'Hotel booked' });
  assert.equal(noted.segments[0].lat, 35.6762);
  const moved = updateSegment(trip, tokyoStay.id, { name: 'Yokohama', lat: 35.4437, lng: 139.638, place: 'Yokohama, Japan' });
  assert.equal(moved.segments[0].place, 'Yokohama, Japan');
});

test('land mask knows continents from oceans', () => {
  const mask = decodeLandMask();
  const land = { Tokyo: [35.68, 139.65], Riyadh: [24.71, 46.68], Paris: [48.85, 2.35], Denver: [39.74, -104.99], Nairobi: [-1.29, 36.82], Alice: [-23.7, 133.88] };
  const sea = { Pacific: [0, -150], Atlantic: [30, -40], Indian: [-30, 80], Arctic: [88, 0] };
  for (const [name, [lat, lng]] of Object.entries(land)) assert.ok(isLand(mask, lat, lng), `${name} should be land`);
  for (const [name, [lat, lng]] of Object.entries(sea)) assert.ok(!isLand(mask, lat, lng), `${name} should be sea`);
});
