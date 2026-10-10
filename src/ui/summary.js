// The trip header: editable title, dates, and what it all adds up to.

import { formatRange } from '../domain/dates.js';
import { formatMoney } from '../domain/money.js';
import { CURRENCIES, tripIssues, tripRange, tripTotals } from '../domain/trip.js';
import { Icon } from './icons.js';
import { html, useEffect, useLayoutEffect, useRef, useState } from './lib.js';
import { blurIn, countTo } from './motion.js';

// A number that counts up to its value, and from there to each new value.
function CountUp({ value, format = String, formatKey = '' }) {
  const element = useRef(null);
  const shown = useRef(0);
  useLayoutEffect(() => {
    countTo(element.current, shown.current, value, format);
    shown.current = value;
  }, [value, formatKey]);
  // Text is written by countTo, so Preact never owns (and never fights over) the digits.
  return html`<span ref=${element} aria-hidden="true"></span><span class="visually-hidden">${format(value)}</span>`;
}

function TitleInput({ value, onCommit }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  const commit = (event) => {
    const name = event.target.value.trim();
    if (name && name !== value) onCommit(name);
    else setDraft(value);
  };

  return html`
    <input class="title-input" aria-label="Trip name" value=${draft} spellcheck=${false}
      onInput=${(event) => setDraft(event.target.value)} onBlur=${commit}
      onKeyDown=${(event) => {
        if (event.key === 'Escape') event.target.value = value;
        if (event.key === 'Escape' || event.key === 'Enter') event.target.blur();
      }} />
  `;
}

export function Summary({ trip, dispatch, actions }) {
  const totals = tripTotals(trip);
  const range = tripRange(trip);
  const issues = tripIssues(trip);
  const money = (amount) => formatMoney(amount, trip.currency);
  const dates = useRef(null);
  useLayoutEffect(() => blurIn(dates.current), []);
  const currencies = CURRENCIES.includes(trip.currency) ? CURRENCIES : [trip.currency, ...CURRENCIES];

  return html`
    <header class="summary">
      <div class="summary-title">
        <${TitleInput} value=${trip.name} onCommit=${(name) => dispatch({ type: 'trip/update', patch: { name } })} />
        <p class="summary-dates" ref=${dates}>${range ? formatRange(range.start, range.end) : 'No dates yet'}</p>
      </div>
      <dl class="stats">
        <div class="stat">
          <dt>Days</dt>
          <dd><${CountUp} value=${totals.days} /></dd>
        </div>
        <div class="stat">
          <dt>Stays</dt>
          <dd><${CountUp} value=${totals.cities} /></dd>
        </div>
        <div class="stat total">
          <dt>
            Total
            <select class="currency" aria-label="Currency" value=${trip.currency}
              onInput=${(event) => dispatch({ type: 'trip/update', patch: { currency: event.target.value } })}>
              ${currencies.map((code) => html`<option value=${code}>${code}</option>`)}
            </select>
          </dt>
          <dd><${CountUp} value=${totals.total} format=${money} formatKey=${trip.currency} /></dd>
          <dd class="breakdown">
            Stays ${money(totals.stays)} · Travel ${money(totals.travel)} · Activities ${money(totals.activities)}
          </dd>
        </div>
      </dl>
    </header>
    ${issues.length > 0 &&
    html`
      <details class="issues">
        <summary>
          <${Icon} name="alert" size=${16} />
          ${issues.length === 1 ? '1 item needs attention' : `${issues.length} items need attention`}
        </summary>
        <ul>
          ${issues.map(
            (issue) => html`
              <li>
                <button type="button" class="link"
                  onClick=${() =>
                    issue.activityId
                      ? actions.editActivity(issue.segmentId, issue.activityId)
                      : actions.editSegment(issue.segmentId)}>
                  ${issue.message}
                </button>
              </li>
            `,
          )}
        </ul>
      </details>
    `}
  `;
}
