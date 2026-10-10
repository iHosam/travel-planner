import { Menu, Segmented } from './controls.js';
import { Icon } from './icons.js';
import { html } from './lib.js';

const VIEWS = [
  { value: 'timeline', label: 'Timeline' },
  { value: 'agenda', label: 'Agenda' },
  { value: 'globe', label: 'Globe' },
];

const THEMES = [
  { value: 'auto', label: 'Automatic' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export function Toolbar({ state, trip, store, dispatch, actions }) {
  const { prefs, data } = state;
  const setPrefs = (patch) => dispatch({ type: 'prefs/set', prefs: patch });
  const hasPlan = Boolean(trip?.segments.length);

  const tripItems = [
    ...data.trips.map((item) => ({
      label: item.name,
      checked: item.id === trip?.id,
      onSelect: () => dispatch({ type: 'trip/select', id: item.id, history: false }),
    })),
    data.trips.length > 0 && '-',
    { label: 'New Trip', onSelect: actions.newTrip },
    trip && { label: 'Duplicate Trip', onSelect: actions.duplicateTrip },
    trip && { label: 'Delete Trip', danger: true, onSelect: actions.deleteTrip },
  ].filter(Boolean);

  const moreItems = [
    { label: 'Import CSV…', onSelect: actions.importCSV },
    { label: 'Export CSV', disabled: !hasPlan, onSelect: actions.exportCSV },
    { label: 'Add to Calendar (.ics)', disabled: !hasPlan, onSelect: actions.exportICS },
    '-',
    { heading: 'Appearance' },
    ...THEMES.map((theme) => ({
      label: theme.label,
      checked: prefs.theme === theme.value,
      onSelect: () => setPrefs({ theme: theme.value }),
    })),
  ];

  return html`
    <header class="toolbar">
      <div class="toolbar-inner">
        <div class="toolbar-trip">
          <span class="brand" aria-hidden="true"><${Icon} name="plane" size=${16} /></span>
          <${Menu} label="Trips" text=${trip?.name ?? 'WanderPlan'} items=${tripItems} align="start" />
        </div>
        <div class="toolbar-view">
          ${trip &&
          html`<${Segmented} label="View" value=${prefs.view} options=${VIEWS} onChange=${(view) => setPrefs({ view })} />`}
        </div>
        <div class="toolbar-actions">
          <button type="button" class="icon-btn" aria-label="Undo" title="Undo" disabled=${!store.canUndo()}
            onClick=${() => dispatch({ type: 'undo' })}>
            <${Icon} name="undo" />
          </button>
          <button type="button" class="icon-btn" aria-label="Redo" title="Redo" disabled=${!store.canRedo()}
            onClick=${() => dispatch({ type: 'redo' })}>
            <${Icon} name="redo" />
          </button>
          <${Menu} label="More" icon="more" items=${moreItems} />
          <button type="button" class="btn primary" disabled=${!trip} onClick=${() => actions.newSegment()}>
            <${Icon} name="plus" size=${16} /><span>Add</span>
          </button>
        </div>
      </div>
    </header>
  `;
}
