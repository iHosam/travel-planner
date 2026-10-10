// iCalendar (RFC 5545) export. Stays become all-day events; travel and timed activities
// use floating local times, so they show at the same clock time wherever the calendar is opened.

import { addDays } from '../domain/dates.js';
import { formatMoney } from '../domain/money.js';
import { TRANSIT_METHODS } from '../domain/trip.js';

const escapeText = (value) =>
  String(value).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1');

// Lines are limited to 75 octets; continuation lines start with a space.
export function foldLine(line) {
  const encoder = new TextEncoder();
  const parts = [];
  let current = '';
  let size = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    if (size + bytes > (parts.length ? 74 : 75)) {
      parts.push(current);
      current = '';
      size = 0;
    }
    current += char;
    size += bytes;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

const compactDate = (date) => date.replace(/-/g, '');
const compactTime = (time) => `${time.replace(':', '')}00`;

function plusOneHour(date, time) {
  const [h, m] = time.split(':').map(Number);
  const hour = h + 1;
  return hour < 24
    ? { date, time: `${String(hour).padStart(2, '0')}:${String(m).padStart(2, '0')}` }
    : { date: addDays(date, 1), time: `00:${String(m).padStart(2, '0')}` };
}

const allDay = (start, end) => [
  `DTSTART;VALUE=DATE:${compactDate(start)}`,
  `DTEND;VALUE=DATE:${compactDate(addDays(end, 1))}`,
];

const timed = (start, end) => [
  `DTSTART:${compactDate(start.date)}T${compactTime(start.time)}`,
  `DTEND:${compactDate(end.date)}T${compactTime(end.time)}`,
];

export function tripToICS(trip, now = new Date()) {
  const stamp = `${now.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//WanderPlan//Itinerary//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];

  const addEvent = (id, when, summary, details, location) => {
    const description = details.filter(Boolean).join('\n');
    lines.push('BEGIN:VEVENT', `UID:${id}@wanderplan`, `DTSTAMP:${stamp}`, ...when, `SUMMARY:${escapeText(summary)}`);
    if (description) lines.push(`DESCRIPTION:${escapeText(description)}`);
    if (location) lines.push(`LOCATION:${escapeText(location)}`);
    lines.push('END:VEVENT');
  };
  const cost = (amount) => (amount > 0 ? formatMoney(amount, trip.currency) : '');

  for (const segment of trip.segments) {
    if (segment.type === 'transit') {
      const start = { date: segment.startDate, time: segment.startTime };
      const end = segment.endTime ? { date: segment.endDate, time: segment.endTime } : null;
      const method = TRANSIT_METHODS.find((m) => m.id === segment.method)?.label ?? 'Travel';
      addEvent(
        segment.id,
        start.time ? timed(start, end ?? plusOneHour(start.date, start.time)) : allDay(segment.startDate, segment.endDate),
        segment.reference ? `${segment.name} (${segment.reference})` : segment.name,
        [method, cost(segment.price), segment.notes],
      );
      continue;
    }
    addEvent(segment.id, allDay(segment.startDate, segment.endDate), `Stay in ${segment.name}`, [cost(segment.price), segment.notes], segment.name);
    for (const activity of segment.activities) {
      const start = { date: activity.date, time: activity.time };
      addEvent(
        activity.id,
        start.time ? timed(start, plusOneHour(start.date, start.time)) : allDay(activity.date, activity.date),
        activity.name,
        [cost(activity.price), activity.notes],
        segment.name,
      );
    }
  }

  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n');
}
