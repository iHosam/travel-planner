import assert from 'node:assert/strict';
import { test } from 'node:test';

import { addDays, diffDays, eachDay, isISODate, isTime } from '../src/domain/dates.js';
import { sampleTrip } from '../src/domain/sample.js';
import {
  addSegment,
  approveShifts,
  buildAgenda,
  checkPlacement,
  checkSegment,
  createTrip,
  dismissShifts,
  duplicateTrip,
  moveActivity,
  pendingApprovals,
  removeSegment,
  resizeStay,
  saveActivity,
  suggestStart,
  tripIssues,
  tripRange,
  tripTotals,
  updateSegment,
} from '../src/domain/trip.js';

const trip = createTrip(sampleTrip);
const [tokyo, , kyoto] = trip.segments;

test('dates: arithmetic is stable across month ends and DST changes', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-03-29', 1), '2026-03-30');
  assert.equal(diffDays('2026-10-15', '2026-10-29'), 14);
  assert.deepEqual(eachDay('2026-02-27', '2026-03-01'), ['2026-02-27', '2026-02-28', '2026-03-01']);
});

test('dates: validation rejects impossible values', () => {
  assert.ok(isISODate('2026-10-15'));
  assert.ok(!isISODate('2026-02-31'));
  assert.ok(!isISODate('15/10/2026'));
  assert.ok(isTime('08:30'));
  assert.ok(!isTime('24:00'));
});

test('createTrip normalises loose input', () => {
  const loose = createTrip({
    currency: 'eur',
    segments: [
      { type: 'transit', name: ' B ', startDate: '2026-05-02', flightNumber: 'BA 304', price: '120.456', method: 'rocket' },
      { name: 'A', startDate: '2026-05-01', endDate: 'nonsense', activities: [{ name: 'Walk', price: -5 }] },
    ],
  });
  assert.equal(loose.name, 'Untitled Trip');
  assert.equal(loose.currency, 'EUR');
  assert.deepEqual(loose.segments.map((s) => s.name), ['A', 'B']);
  const [stay, leg] = loose.segments;
  assert.equal(stay.endDate, '2026-05-01');
  assert.equal(stay.activities[0].date, '2026-05-01');
  assert.equal(stay.activities[0].price, 0);
  assert.equal(leg.reference, 'BA 304');
  assert.equal(leg.method, 'flight');
  assert.equal(leg.price, 120.46);
});

test('totals and range for the sample trip', () => {
  assert.deepEqual(tripRange(trip), { start: '2026-10-15', end: '2026-10-29' });
  const totals = tripTotals(trip);
  assert.equal(totals.days, 15);
  assert.equal(totals.cities, 3);
  assert.equal(totals.travel, 960);
  assert.equal(totals.activities, 472);
  assert.equal(totals.total, 1432);
  assert.deepEqual(tripIssues(trip), []);
});

test('checkPlacement enforces stay dates and arrival/departure times', () => {
  assert.equal(checkPlacement(tokyo, '2026-10-16', '09:00'), null);
  assert.match(checkPlacement(tokyo, '2026-10-21', ''), /outside your stay in Tokyo/);
  assert.match(checkPlacement(tokyo, '2026-10-15', '09:00'), /before you arrive/);
  assert.match(checkPlacement(tokyo, '2026-10-20', '12:00'), /after you leave/);
  assert.match(checkPlacement(trip.segments[1], '2026-10-20', ''), /belong to a stay/);
});

test('checkSegment reports missing names and reversed dates', () => {
  assert.deepEqual(checkSegment({ type: 'city', name: 'Rome', startDate: '2026-05-01', endDate: '2026-05-03' }), {});
  const errors = checkSegment({ type: 'city', name: ' ', startDate: '2026-05-03', endDate: '2026-05-01' });
  assert.ok(errors.name);
  assert.equal(errors.end, 'This ends before it starts.');
  assert.ok(checkSegment({ name: 'x', startDate: '2026-05-01', startTime: '10:00', endDate: '2026-05-01', endTime: '09:00' }).end);
});

test('edits are immutable and keep everything sorted', () => {
  const added = addSegment(trip, { name: 'Seoul', startDate: '2026-10-10', endDate: '2026-10-15' });
  assert.equal(added.segments[0].name, 'Seoul');
  assert.equal(trip.segments.length, 6);

  const withActivity = saveActivity(trip, tokyo.id, { name: 'Early ramen', date: '2026-10-16', time: '07:00' });
  const names = withActivity.segments[0].activities.map((a) => a.name);
  assert.equal(names.indexOf('Early ramen'), 1);
  assert.equal(tokyo.activities.length, 5);

  assert.equal(removeSegment(trip, tokyo.id).segments.length, 5);
  assert.equal(saveActivity(trip, trip.segments[1].id, { name: 'Nope' }), trip);
});

test('moveActivity moves between days and between stays', () => {
  const activity = tokyo.activities[1];
  const sameStay = moveActivity(trip, tokyo.id, activity.id, tokyo.id, '2026-10-19');
  assert.equal(sameStay.segments[0].activities.find((a) => a.id === activity.id).date, '2026-10-19');
  assert.equal(sameStay.segments[0].activities.length, 5);

  const otherStay = moveActivity(trip, tokyo.id, activity.id, kyoto.id, '2026-10-21');
  assert.equal(otherStay.segments[0].activities.length, 4);
  assert.equal(otherStay.segments[2].activities.length, 5);
});

test('shortening a stay surfaces stranded activities as issues', () => {
  const shorter = updateSegment(trip, tokyo.id, { endDate: '2026-10-17' });
  const issues = tripIssues(shorter);
  assert.equal(issues.length, 3);
  assert.ok(issues.every((issue) => issue.segmentId === tokyo.id && issue.activityId));
});

test('buildAgenda lists each day with its stays and items in time order', () => {
  const agenda = buildAgenda(trip);
  assert.equal(agenda.length, 15);
  const transfer = agenda.find((day) => day.date === '2026-10-20');
  assert.deepEqual(transfer.stays.map((s) => s.name), ['Tokyo', 'Kyoto']);
  assert.deepEqual(transfer.items.map((item) => item.kind), ['depart', 'activity']);
});

test('suggestStart continues from the end of the trip', () => {
  assert.deepEqual(suggestStart(trip), { startDate: '2026-10-29', startTime: '22:30' });
  assert.equal(suggestStart(createTrip()).startTime, '');
});

test('duplicateTrip copies content under fresh ids', () => {
  const copy = duplicateTrip(trip);
  assert.equal(copy.name, 'Japan in Autumn copy');
  assert.notEqual(copy.id, trip.id);
  assert.notEqual(copy.segments[0].id, tokyo.id);
  assert.notEqual(copy.segments[0].activities[0].id, tokyo.activities[0].id);
  assert.equal(tripTotals(copy).total, tripTotals(trip).total);
});

test('resizeStay moves only the dragged edge and flags what depends on it', () => {
  const longer = resizeStay(trip, kyoto.id, 'end', '2026-10-26');
  const [, , kyotoAfter, bus, osaka, flight] = longer.segments;
  assert.equal(kyotoAfter.endDate, '2026-10-26');
  assert.equal(kyotoAfter.startDate, '2026-10-20');
  assert.equal(bus.startDate, '2026-10-24', 'the bus has not moved yet');
  assert.deepEqual(longer.segments.map((s) => s.pendingShift ?? 0), [0, 0, 0, 2, 2, 2]);

  const pending = pendingApprovals(longer);
  assert.deepEqual(pending.map((p) => [p.segment.name, p.days, p.startDate]), [
    ['Kyoto to Osaka', 2, '2026-10-26'],
    ['Osaka', 2, '2026-10-26'],
    ['Osaka to Riyadh', 2, '2026-10-31'],
  ]);
  assert.equal(tripRange(longer).end, '2026-10-31', 'the timeline makes room for proposals');
  assert.equal(flight.id, trip.segments[5].id);
  assert.equal(osaka.activities[0].date, '2026-10-24');
});

test('resizeStay at the start flags earlier bookings, and rejects impossible drags', () => {
  const earlier = resizeStay(trip, kyoto.id, 'start', '2026-10-19');
  assert.deepEqual(pendingApprovals(earlier).map((p) => [p.segment.name, p.days]), [['Tokyo', -1], ['Tokyo to Kyoto', -1]]);
  assert.equal(resizeStay(trip, kyoto.id, 'end', '2026-10-19'), trip);
  assert.equal(resizeStay(trip, kyoto.id, 'end', kyoto.endDate), trip);
  assert.equal(resizeStay(trip, trip.segments[1].id, 'end', '2026-10-22'), trip);
});

test('approvals can be granted one at a time, and declined ones leave a visible conflict', () => {
  const longer = resizeStay(trip, kyoto.id, 'end', '2026-10-26');
  const [, , , bus, osaka, flight] = longer.segments;

  const partly = approveShifts(longer, [osaka.id]);
  const moved = partly.segments.find((s) => s.id === osaka.id);
  assert.equal(moved.startDate, '2026-10-26');
  assert.equal(moved.endDate, '2026-10-31');
  assert.equal(moved.activities[0].date, '2026-10-26', 'activities travel with their stay');
  assert.equal(pendingApprovals(partly).length, 2);
  assert.deepEqual(tripIssues(partly), []);

  const all = approveShifts(longer, [bus.id, osaka.id, flight.id]);
  assert.equal(pendingApprovals(all).length, 0);
  assert.equal(tripTotals(all).days, 17);

  const kept = dismissShifts(longer, [bus.id, osaka.id, flight.id]);
  assert.equal(pendingApprovals(kept).length, 0);
  assert.equal(kept.segments.find((s) => s.id === flight.id).startDate, '2026-10-29');
  assert.match(tripIssues(kept)[0].message, /Osaka starts .* before you leave Kyoto/);
});

test('repeated drags accumulate, cancel out, and manual edits settle a proposal', () => {
  const twice = resizeStay(resizeStay(trip, kyoto.id, 'end', '2026-10-25'), kyoto.id, 'end', '2026-10-27');
  assert.deepEqual(twice.segments.map((s) => s.pendingShift ?? 0), [0, 0, 0, 3, 3, 3]);

  const back = resizeStay(resizeStay(trip, tokyo.id, 'start', '2026-10-14'), tokyo.id, 'start', '2026-10-15');
  assert.deepEqual(back, trip);

  const longer = resizeStay(trip, kyoto.id, 'end', '2026-10-26');
  const bus = longer.segments[3];
  const rebooked = updateSegment(longer, bus.id, { startDate: '2026-10-26', endDate: '2026-10-26' });
  assert.equal(rebooked.segments.find((s) => s.id === bus.id).pendingShift, undefined);
  const renamed = updateSegment(longer, bus.id, { name: 'Night bus' });
  assert.equal(renamed.segments.find((s) => s.id === bus.id).pendingShift, 2);
});
