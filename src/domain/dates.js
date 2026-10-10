// Calendar dates are plain 'YYYY-MM-DD' strings and times are 'HH:MM'.
// All arithmetic runs in UTC so daylight-saving changes can never shift a day.

const DAY_MS = 86_400_000;

export const toUTC = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

export const fromUTC = (ms) => new Date(ms).toISOString().slice(0, 10);

export const isISODate = (value) =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && fromUTC(toUTC(value)) === value;

export const isTime = (value) => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

export const addDays = (iso, count) => fromUTC(toUTC(iso) + count * DAY_MS);

export const diffDays = (from, to) => Math.round((toUTC(to) - toUTC(from)) / DAY_MS);

export function eachDay(start, end) {
  const days = [];
  for (let day = start; day <= end; day = addDays(day, 1)) days.push(day);
  return days;
}

export function todayISO(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export const isWeekend = (iso) => [0, 6].includes(new Date(toUTC(iso)).getUTCDay());

const formatter = (options) => new Intl.DateTimeFormat(undefined, { ...options, timeZone: 'UTC' });

const DAY_STYLES = {
  short: formatter({ month: 'short', day: 'numeric' }),
  medium: formatter({ weekday: 'short', month: 'short', day: 'numeric' }),
  long: formatter({ month: 'long', day: 'numeric' }),
  weekday: formatter({ weekday: 'short' }),
  weekdayLong: formatter({ weekday: 'long' }),
  day: formatter({ day: 'numeric' }),
  month: formatter({ month: 'short' }),
};
const RANGE = formatter({ month: 'short', day: 'numeric', year: 'numeric' });
const TIME = formatter({ hour: 'numeric', minute: '2-digit' });

export const formatDay = (iso, style = 'short') => (isISODate(iso) ? DAY_STYLES[style].format(toUTC(iso)) : '');

export const formatRange = (start, end) =>
  start === end ? RANGE.format(toUTC(start)) : RANGE.formatRange(toUTC(start), toUTC(end));

export function formatTime(time) {
  if (!isTime(time)) return '';
  const [h, m] = time.split(':').map(Number);
  return TIME.format(Date.UTC(2000, 0, 1, h, m));
}
