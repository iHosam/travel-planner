// The application shell: wires the store to the views and owns transient UI state
// (which sheet is open, which toast is showing).

import { formatDay } from '../domain/dates.js';
import { sampleTrip } from '../domain/sample.js';
import { checkPlacement, createTrip, pendingApprovals, suggestStart } from '../domain/trip.js';
import { segmentsFromCSV, tripToCSV } from '../io/csv.js';
import { downloadFile, fileSlug } from '../io/download.js';
import { tripToICS } from '../io/ics.js';
import { activeTrip } from '../state/reducer.js';
import { Agenda } from './agenda.js';
import { Approvals } from './approvals.js';
import { Toast } from './controls.js';
import { Editor } from './editor.js';
import { Globe } from './globe.js';
import { Icon } from './icons.js';
import { html, useEffect, useLayoutEffect, useMemo, useRef, useState } from './lib.js';
import { captureLayout, enterView, focusIn, holdScroll } from './motion.js';
import { Summary } from './summary.js';
import { Timeline } from './timeline.js';
import { Toolbar } from './toolbar.js';

function useStore(store) {
  const [state, setState] = useState(store.getState());
  useEffect(() => store.subscribe(setState), [store]);
  return state;
}

// Changes after which things on screen glide to their new place instead of jumping.
const MOVES = new Set(['activity/move', 'activity/save', 'segment/update', 'stay/resize', 'shift/approve', 'shift/dismiss', 'undo', 'redo']);

const editorKey = (editor) => [editor.kind, editor.segmentId, editor.activityId].join(':');

export function App({ store }) {
  const state = useStore(store);
  const dispatch = useMemo(
    () => (action) => {
      if (MOVES.has(action.type)) captureLayout();
      store.dispatch(action);
    },
    [store],
  );
  const { prefs } = state;
  const trip = activeTrip(state);
  const [editor, setEditor] = useState(null);
  const [toast, setToast] = useState(null);
  const [reviewing, setReviewing] = useState(false);
  const fileInput = useRef(null);
  const view = useRef(null);
  const empty = useRef(null);

  useLayoutEffect(() => enterView(view.current), [prefs.view, trip?.id]);
  useLayoutEffect(() => focusIn(empty.current?.querySelector('h2')), [trip?.id, trip?.segments.length === 0]);
  useEffect(() => holdScroll(Boolean(editor)), [editor]);

  const notify = (message, extra = {}) => setToast({ id: Date.now(), message, ...extra });
  const offerUndo = (message) =>
    notify(message, { data: store.getState().data, action: { label: 'Undo', run: () => dispatch({ type: 'undo' }) } });

  // An Undo offer is only valid while it still refers to the latest change.
  useEffect(() => {
    if (toast?.data && toast.data !== state.data) setToast(null);
  }, [state.data, toast]);

  useEffect(() => {
    if (prefs.theme === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = prefs.theme;
  }, [prefs.theme]);

  useEffect(() => {
    document.title = trip ? `${trip.name} – WanderPlan` : 'WanderPlan';
  }, [trip?.name]);

  useEffect(() => {
    const onKeyDown = (event) => {
      const key = event.key.toLowerCase();
      if (!(event.metaKey || event.ctrlKey) || (key !== 'z' && key !== 'y')) return;
      if (event.target.closest?.('input, textarea, select, dialog')) return;
      event.preventDefault();
      dispatch({ type: key === 'y' || event.shiftKey ? 'redo' : 'undo' });
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const actions = {
    newSegment: (type = 'city') => setEditor({ kind: 'segment', defaults: { type, ...suggestStart(trip) } }),
    editSegment: (segmentId) => setEditor({ kind: 'segment', segmentId }),
    newActivity: (segmentId, date) => setEditor({ kind: 'activity', segmentId, defaults: { date } }),
    editActivity: (segmentId, activityId) => setEditor({ kind: 'activity', segmentId, activityId }),

    moveActivity(fromSegmentId, activityId, toSegmentId, date) {
      const activity = trip.segments.find((s) => s.id === fromSegmentId)?.activities.find((a) => a.id === activityId);
      const target = trip.segments.find((s) => s.id === toSegmentId);
      if (!activity || (fromSegmentId === toSegmentId && activity.date === date)) return;
      const problem = checkPlacement(target, date, activity.time);
      if (problem) return notify(problem, { tone: 'error' });
      dispatch({ type: 'activity/move', fromSegmentId, activityId, toSegmentId, date });
      offerUndo(`Moved “${activity.name}” to ${formatDay(date, 'medium')}`);
    },

    // Bookings that depend on the moved edge are flagged, never moved; the popup asks about each.
    resizeStay(segmentId, edge, date) {
      const stay = trip.segments.find((s) => s.id === segmentId);
      dispatch({ type: 'stay/resize', id: segmentId, edge, date });
      const after = activeTrip(store.getState());
      if (after === trip) return;
      if (pendingApprovals(after).length) setReviewing(true);
      else offerUndo(`${stay.name} now ${edge === 'end' ? 'ends' : 'starts'} ${formatDay(date, 'medium')}`);
    },

    newTrip: () => dispatch({ type: 'trip/add', trip: createTrip({ name: 'New Trip', currency: trip?.currency }) }),
    loadSample: () => dispatch({ type: 'trip/add', trip: createTrip(sampleTrip) }),
    duplicateTrip: () => dispatch({ type: 'trip/duplicate', id: trip.id }),
    deleteTrip() {
      dispatch({ type: 'trip/remove', id: trip.id });
      offerUndo(`Deleted “${trip.name}”`);
    },

    importCSV: () => fileInput.current.click(),
    exportCSV: () => downloadFile(`${fileSlug(trip.name)}.csv`, 'text/csv;charset=utf-8', `﻿${tripToCSV(trip)}`),
    exportICS: () => downloadFile(`${fileSlug(trip.name)}.ics`, 'text/calendar;charset=utf-8', tripToICS(trip)),
  };

  // Importing never overwrites: the file becomes a new trip.
  const onFileChosen = async (event) => {
    const [file] = event.target.files;
    event.target.value = '';
    if (!file) return;
    try {
      const imported = createTrip({
        name: file.name.replace(/\.csv$/i, '').replace(/[_-]+/g, ' '),
        currency: trip?.currency,
        segments: segmentsFromCSV(await file.text()),
      });
      dispatch({ type: 'trip/add', trip: imported });
      offerUndo(`Imported “${imported.name}”`);
    } catch (error) {
      notify(error.message || 'That file could not be read.', { tone: 'error' });
    }
  };

  const renderTrip = () => {
    if (!trip.segments.length) {
      return html`
        <div class="card empty spotlight" ref=${empty}>
          <span class="empty-icon"><${Icon} name="pin" size=${28} /></span>
          <h2>Where to first?</h2>
          <p>Add a place to stay, then fill in the days.</p>
          <div class="empty-actions">
            <button type="button" class="btn primary" onClick=${() => actions.newSegment('city')}>Add a Stay</button>
            <button type="button" class="btn tinted" onClick=${() => actions.newSegment('transit')}>Add Travel</button>
          </div>
        </div>
      `;
    }
    if (prefs.view === 'globe') return html`<${Globe} key=${trip.id} trip=${trip} dispatch=${dispatch} />`;
    return prefs.view === 'agenda'
      ? html`<${Agenda} trip=${trip} actions=${actions} />`
      : html`
          <${Timeline} trip=${trip} zoom=${prefs.zoom} actions=${actions}
            onZoom=${(zoom) => dispatch({ type: 'prefs/set', prefs: { zoom } })} />
        `;
  };

  return html`
    <${Toolbar} state=${state} trip=${trip} store=${store} dispatch=${dispatch} actions=${actions} />
    <main class="page">
      ${trip
        ? html`
            <${Summary} key=${trip.id} trip=${trip} dispatch=${dispatch} actions=${actions} />
            <div class="view" ref=${view}>${renderTrip()}</div>
          `
        : html`
            <div class="card empty spotlight" ref=${empty}>
              <span class="empty-icon"><${Icon} name="plane" size=${28} /></span>
              <h2>No trips yet</h2>
              <p>Start from scratch, or open the sample to look around.</p>
              <div class="empty-actions">
                <button type="button" class="btn primary" onClick=${actions.newTrip}>New Trip</button>
                <button type="button" class="btn tinted" onClick=${actions.loadSample}>Open Sample</button>
              </div>
            </div>
          `}
    </main>
    <input ref=${fileInput} type="file" accept=".csv,text/csv" hidden=${true} onChange=${onFileChosen} />
    ${editor &&
    trip &&
    html`
      <${Editor} key=${editorKey(editor)} editor=${editor} trip=${trip} dispatch=${dispatch}
        onClose=${() => setEditor(null)} onNavigate=${setEditor} offerUndo=${offerUndo} />
    `}
    ${trip && html`<${Approvals} trip=${trip} open=${reviewing} onToggle=${setReviewing} dispatch=${dispatch} />`}
    <${Toast} toast=${toast} onDismiss=${() => setToast(null)} />
  `;
}
