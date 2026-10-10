// The agenda: the same trip read top to bottom, one card per day. Best on a phone.

import { formatDay, formatTime, todayISO } from '../domain/dates.js';
import { formatMoney } from '../domain/money.js';
import { buildAgenda, TRANSIT_METHODS } from '../domain/trip.js';
import { cx } from './controls.js';
import { Icon, segmentIcon } from './icons.js';
import { html, useLayoutEffect, useMemo, useRef } from './lib.js';
import { playLayout, revealOnScroll } from './motion.js';
import { segmentColors } from './timeline.js';

const methodLabel = (segment) => TRANSIT_METHODS.find((method) => method.id === segment.method)?.label ?? 'Travel';

function describeItem(item) {
  const { segment, activity } = item;
  if (item.kind === 'activity') {
    return { title: activity.name, detail: activity.notes, price: activity.price, icon: null };
  }
  if (item.kind === 'arrive') {
    return { title: `Arrive: ${segment.name}`, detail: segment.reference, price: 0, icon: segmentIcon(segment) };
  }
  const arrives = segment.endDate === segment.startDate && segment.endTime ? `arrives ${formatTime(segment.endTime)}` : '';
  return {
    title: segment.name,
    detail: [methodLabel(segment), segment.reference, arrives].filter(Boolean).join(' · '),
    price: segment.price,
    icon: segmentIcon(segment),
  };
}

export function Agenda({ trip, actions }) {
  const days = useMemo(() => buildAgenda(trip), [trip]);
  const list = useRef(null);
  useLayoutEffect(() => revealOnScroll([...list.current.querySelectorAll('.day')]), []);
  useLayoutEffect(() => playLayout(list.current), [trip]);
  const colors = useMemo(() => segmentColors(trip), [trip]);
  const today = todayISO();

  const renderItem = (item) => {
    const { title, detail, price, icon } = describeItem(item);
    const open = () =>
      item.kind === 'activity'
        ? actions.editActivity(item.segment.id, item.activity.id)
        : actions.editSegment(item.segment.id);
    return html`
      <li key=${`${item.kind}:${item.activity?.id ?? item.segment.id}`}>
        <button type="button" class="agenda-item" data-flip-id=${item.activity?.id ?? `${item.kind}:${item.segment.id}`}
          style=${`--c:${colors.get(item.segment.id)}`} onClick=${open}>
          <span class="agenda-time">${formatTime(item.time) || 'Any time'}</span>
          <span class=${cx('agenda-marker', icon && 'badge')}>${icon && html`<${Icon} name=${icon} size=${14} />`}</span>
          <span class="agenda-text">
            <strong>${title}</strong>
            ${detail && html`<small>${detail}</small>`}
          </span>
          ${price > 0 && html`<span class="agenda-price">${formatMoney(price, trip.currency)}</span>`}
        </button>
      </li>
    `;
  };

  return html`
    <section class="agenda" aria-label="Day by day" ref=${list}>
      ${days.map(({ date, stays, items }) => {
        const host = stays[stays.length - 1];
        return html`
          <article key=${date} class=${cx('card', 'day', 'spotlight', date === today && 'today')}>
            <header class="day-head">
              <span class="day-num">${formatDay(date, 'day')}</span>
              <span class="day-meta">
                <strong>${formatDay(date, 'weekdayLong')}</strong>
                <small>${formatDay(date, 'long')}</small>
              </span>
              <span class="day-stays">
                ${stays.map(
                  (stay) => html`
                    <button key=${stay.id} type="button" class="pill" style=${`--c:${colors.get(stay.id)}`}
                      title=${`Edit ${stay.name}`} onClick=${() => actions.editSegment(stay.id)}>
                      ${stay.name}
                    </button>
                  `,
                )}
              </span>
              ${host &&
              html`
                <button type="button" class="icon-btn" aria-label=${`Add activity on ${formatDay(date, 'long')}`}
                  title="Add activity" onClick=${() => actions.newActivity(host.id, date)}>
                  <${Icon} name="plus" />
                </button>
              `}
            </header>
            ${items.length
              ? html`<ul class="day-items">${items.map(renderItem)}</ul>`
              : html`<p class="day-empty">${host ? 'Nothing planned' : 'No stay on this day'}</p>`}
          </article>
        `;
      })}
      <button type="button" class="btn tinted block" onClick=${() => actions.newSegment()}>
        <${Icon} name="plus" size=${16} /> Add destination or travel
      </button>
    </section>
  `;
}
