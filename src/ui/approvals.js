// The approval popup. Changing a stay never silently moves a booking: each one that would have
// to follow is listed here, to approve or keep, one at a time or all together.

import { formatDay } from '../domain/dates.js';
import { pendingApprovals } from '../domain/trip.js';
import { Icon, segmentIcon } from './icons.js';
import { html } from './lib.js';
import { segmentColors, signedDays } from './timeline.js';

export function Approvals({ trip, open, onToggle, dispatch }) {
  const pending = pendingApprovals(trip);
  if (!pending.length) return null;

  const count = pending.length === 1 ? '1 change' : `${pending.length} changes`;
  if (!open) {
    return html`
      <button type="button" class="approvals-pill" onClick=${() => onToggle(true)}>
        <${Icon} name="alert" size=${16} /> ${count} awaiting approval
      </button>
    `;
  }

  const colors = segmentColors(trip);
  const ids = pending.map((item) => item.segment.id);
  const bookings = pending.filter((item) => item.segment.type === 'transit').length;

  return html`
    <aside class="approvals" role="dialog" aria-label="Changes awaiting approval">
      <header class="approvals-head">
        <strong>${count} awaiting approval</strong>
        <button type="button" class="icon-btn" aria-label="Decide later" title="Decide later" onClick=${() => onToggle(false)}>
          <${Icon} name="close" size=${16} />
        </button>
      </header>
      <p class="approvals-note">
        ${bookings > 0
          ? 'Your change affects travel that may already be booked. Nothing moves until you approve it.'
          : 'Your change affects what comes next. Nothing moves until you approve it.'}
      </p>
      <ul class="approvals-list">
        ${pending.map(
          ({ segment, days, startDate }) => html`
            <li key=${segment.id} class="approval" style=${`--c:${colors.get(segment.id)}`}>
              <span class="badge"><${Icon} name=${segmentIcon(segment)} size=${16} /></span>
              <span class="approval-text">
                <strong>${segment.name}</strong>
                <small>${formatDay(segment.startDate)} → ${formatDay(startDate)} · ${signedDays(days)}</small>
                ${segment.type === 'transit' &&
                html`<small class="rebook">Needs rebooking${segment.reference ? ` · ${segment.reference}` : ''}</small>`}
              </span>
              <button type="button" class="btn plain" title="Leave this where it is"
                onClick=${() => dispatch({ type: 'shift/dismiss', ids: [segment.id] })}>
                Keep
              </button>
              <button type="button" class="btn tinted" onClick=${() => dispatch({ type: 'shift/approve', ids: [segment.id] })}>
                Approve
              </button>
            </li>
          `,
        )}
      </ul>
      <footer class="approvals-foot">
        <button type="button" class="btn plain" onClick=${() => dispatch({ type: 'shift/dismiss', ids })}>Keep All</button>
        <button type="button" class="btn primary" onClick=${() => dispatch({ type: 'shift/approve', ids })}>Approve All</button>
      </footer>
    </aside>
  `;
}
