// One editing sheet for everything: stays, travel legs and activities.

import { formatDay, formatTime } from '../domain/dates.js';
import { checkPlacement, checkSegment, TRANSIT_METHODS } from '../domain/trip.js';
import { Field, Segmented, Sheet } from './controls.js';
import { Icon } from './icons.js';
import { html, useState } from './lib.js';

const hasErrors = (errors) => Object.keys(errors).length > 0;

function useDraft(initial) {
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState({});
  const update = (change) => {
    setErrors({});
    setDraft(change);
  };
  const bind = (key) => ({
    value: draft[key] ?? '',
    onInput: (event) => update((current) => ({ ...current, [key]: event.target.value })),
  });
  return { draft, setDraft: update, errors, setErrors, bind };
}

function PriceField({ label, currency, bind }) {
  return html`
    <${Field} label=${`${label} (${currency})`}>
      <input class="input" type="number" inputmode="decimal" min="0" step="any" placeholder="0"
        value=${bind.value || ''} onInput=${bind.onInput} />
    <//>
  `;
}

const NotesField = ({ bind }) => html`
  <${Field} label="Notes" wide=${true}>
    <textarea class="input" rows="2" placeholder="Booking codes, addresses, reminders" ...${bind}></textarea>
  <//>
`;

const DeleteButton = ({ label, onClick }) => html`
  <button type="button" class="btn destructive block" onClick=${onClick}>${label}</button>
`;

function SegmentEditor({ editor, trip, dispatch, onClose, onNavigate, offerUndo }) {
  const existing = editor.segmentId ? trip.segments.find((segment) => segment.id === editor.segmentId) : null;
  const { draft, setDraft, errors, setErrors, bind } = useDraft(() =>
    existing
      ? { ...existing }
      : { type: 'city', name: '', startTime: '', endTime: '', method: 'flight', ...editor.defaults, endDate: editor.defaults?.startDate ?? '' },
  );
  if (editor.segmentId && !existing) return null;

  const isCity = draft.type === 'city';
  const words = isCity
    ? { title: 'Stay', name: 'City or place', hint: 'e.g. Lisbon', start: 'Arrive', end: 'Leave', price: 'Accommodation' }
    : { title: 'Travel', name: 'Route', hint: 'e.g. Tokyo to Kyoto', start: 'Depart', end: 'Arrive', price: 'Fare' };

  // Keep the end on or after the start while the dates are being picked.
  const setStartDate = (event) => {
    const startDate = event.target.value;
    setDraft((current) => ({
      ...current,
      startDate,
      endDate: !current.endDate || current.endDate < startDate ? startDate : current.endDate,
    }));
  };

  const submit = (event) => {
    event.preventDefault();
    const found = checkSegment(draft);
    setErrors(found);
    if (hasErrors(found)) return;
    dispatch(existing ? { type: 'segment/update', id: existing.id, patch: draft } : { type: 'segment/add', segment: draft });
    onClose();
  };

  const remove = () => {
    dispatch({ type: 'segment/remove', id: existing.id });
    onClose();
    offerUndo(`Deleted ${existing.name}`);
  };

  return html`
    <${Sheet} title=${`${existing ? 'Edit' : 'New'} ${words.title}`} submitLabel=${existing ? 'Done' : 'Add'}
      onSubmit=${submit} onClose=${onClose}>
      ${!existing &&
      html`
        <${Segmented} label="Kind" value=${draft.type}
          options=${[{ value: 'city', label: 'Stay' }, { value: 'transit', label: 'Travel' }]}
          onChange=${(type) => setDraft((current) => ({ ...current, type }))} />
      `}
      <div class="form-grid">
        <${Field} label=${words.name} error=${errors.name} wide=${true}>
          <input class="input" placeholder=${words.hint} autofocus=${!existing} autocomplete="off" ...${bind('name')} />
        <//>
        ${!isCity &&
        html`
          <${Field} label="By">
            <select class="input" ...${bind('method')}>
              ${TRANSIT_METHODS.map((method) => html`<option value=${method.id}>${method.label}</option>`)}
            </select>
          <//>
          <${Field} label="Number">
            <input class="input" placeholder="e.g. EK317" autocomplete="off" ...${bind('reference')} />
          <//>
        `}
        <${Field} label=${words.start} error=${errors.start} wide=${true}>
          <span class="pair">
            <input class="input" type="date" value=${draft.startDate ?? ''} onInput=${setStartDate} />
            <input class="input" type="time" aria-label=${`${words.start} time`} ...${bind('startTime')} />
          </span>
        <//>
        <${Field} label=${words.end} error=${errors.end} wide=${true}>
          <span class="pair">
            <input class="input" type="date" min=${draft.startDate} ...${bind('endDate')} />
            <input class="input" type="time" aria-label=${`${words.end} time`} ...${bind('endTime')} />
          </span>
        <//>
        <${PriceField} label=${words.price} currency=${trip.currency} bind=${bind('price')} />
        <${NotesField} bind=${bind('notes')} />
      </div>

      ${existing &&
      isCity &&
      html`
        <div class="group">
          <h3 class="group-title">Activities</h3>
          <ul class="group-list">
            ${existing.activities.map(
              (activity) => html`
                <li key=${activity.id}>
                  <button type="button" class="group-row"
                    onClick=${() => onNavigate({ kind: 'activity', segmentId: existing.id, activityId: activity.id })}>
                    <span>${activity.name}</span>
                    <small>${[formatDay(activity.date), formatTime(activity.time)].filter(Boolean).join(' · ')}</small>
                  </button>
                </li>
              `,
            )}
            <li>
              <button type="button" class="group-row accent"
                onClick=${() => onNavigate({ kind: 'activity', segmentId: existing.id, defaults: { date: existing.startDate } })}>
                <span><${Icon} name="plus" size=${14} /> Add Activity</span>
              </button>
            </li>
          </ul>
        </div>
      `}
      ${existing && html`<${DeleteButton} label=${`Delete ${words.title}`} onClick=${remove} />`}
    <//>
  `;
}

function ActivityEditor({ editor, trip, dispatch, onClose, offerUndo }) {
  const stays = trip.segments.filter((segment) => segment.type === 'city');
  const existing = editor.activityId
    ? stays.find((stay) => stay.id === editor.segmentId)?.activities.find((activity) => activity.id === editor.activityId)
    : null;
  const { draft, setDraft, errors, setErrors, bind } = useDraft(() => ({
    name: '',
    time: '',
    ...editor.defaults,
    ...existing,
    segmentId: editor.segmentId,
  }));
  const stay = stays.find((segment) => segment.id === draft.segmentId);
  if (!stay || (editor.activityId && !existing)) return null;

  const submit = (event) => {
    event.preventDefault();
    const found = {};
    if (!draft.name?.trim()) found.name = 'Give this activity a name.';
    if (!draft.date) found.date = 'Choose a date.';
    else {
      const problem = checkPlacement(stay, draft.date, draft.time);
      if (problem) found.date = problem;
    }
    setErrors(found);
    if (hasErrors(found)) return;
    const { segmentId, ...activity } = draft;
    dispatch({ type: 'activity/save', segmentId, activity, fromSegmentId: editor.segmentId });
    onClose();
  };

  const remove = () => {
    dispatch({ type: 'activity/remove', segmentId: editor.segmentId, activityId: existing.id });
    onClose();
    offerUndo(`Deleted “${existing.name}”`);
  };

  // Moving to another stay pulls the date inside that stay.
  const setStay = (event) => {
    const next = stays.find((segment) => segment.id === event.target.value);
    setDraft((current) => ({
      ...current,
      segmentId: next.id,
      date: current.date >= next.startDate && current.date <= next.endDate ? current.date : next.startDate,
    }));
  };

  return html`
    <${Sheet} title=${existing ? 'Edit Activity' : 'New Activity'} submitLabel=${existing ? 'Done' : 'Add'}
      onSubmit=${submit} onClose=${onClose}>
      <div class="form-grid">
        <${Field} label="Activity" error=${errors.name} wide=${true}>
          <input class="input" placeholder="e.g. Museum visit" autofocus=${!existing} autocomplete="off" ...${bind('name')} />
        <//>
        ${stays.length > 1 &&
        html`
          <${Field} label="During" wide=${true}>
            <select class="input" value=${draft.segmentId} onInput=${setStay}>
              ${stays.map((segment) => html`<option value=${segment.id}>${segment.name}</option>`)}
            </select>
          <//>
        `}
        <${Field} label="When" error=${errors.date} wide=${true}>
          <span class="pair">
            <input class="input" type="date" min=${stay.startDate} max=${stay.endDate} ...${bind('date')} />
            <input class="input" type="time" aria-label="Time" ...${bind('time')} />
          </span>
        <//>
        <${PriceField} label="Cost" currency=${trip.currency} bind=${bind('price')} />
        <${NotesField} bind=${bind('notes')} />
      </div>
      ${existing && html`<${DeleteButton} label="Delete Activity" onClick=${remove} />`}
    <//>
  `;
}

export function Editor(props) {
  return props.editor.kind === 'segment' ? html`<${SegmentEditor} ...${props} />` : html`<${ActivityEditor} ...${props} />`;
}
