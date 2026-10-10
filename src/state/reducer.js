import { sampleTrip } from '../domain/sample.js';
import {
  addSegment,
  approveShifts,
  createTrip,
  dismissShifts,
  duplicateTrip,
  moveActivity,
  removeActivity,
  removeSegment,
  resizeStay,
  saveActivity,
  updateSegment,
} from '../domain/trip.js';

// `zoom` is the width of a day column in pixels, or 'fit' to show the whole trip.
export const DEFAULT_PREFS = { theme: 'auto', view: 'timeline', zoom: 132 };

export function createInitialState(saved, prefs = {}) {
  if (saved) {
    const { compact, ...rest } = saved.prefs;
    return { data: saved.data, prefs: { ...DEFAULT_PREFS, ...(compact ? { zoom: 'fit' } : {}), ...rest } };
  }
  const trip = createTrip(sampleTrip);
  return { data: { trips: [trip], activeTripId: trip.id }, prefs: { ...DEFAULT_PREFS, ...prefs } };
}

export const activeTrip = (state) => state.data.trips.find((trip) => trip.id === state.data.activeTripId) ?? null;

const editActive = (data, change) => ({
  ...data,
  trips: data.trips.map((trip) => (trip.id === data.activeTripId ? change(trip) : trip)),
});

function dataReducer(data, action) {
  switch (action.type) {
    case 'trip/select':
      return data.trips.some((trip) => trip.id === action.id) ? { ...data, activeTripId: action.id } : data;
    case 'trip/add':
      return { trips: [...data.trips, action.trip], activeTripId: action.trip.id };
    case 'trip/duplicate': {
      const source = data.trips.find((trip) => trip.id === action.id);
      if (!source) return data;
      const copy = duplicateTrip(source);
      return { trips: [...data.trips, copy], activeTripId: copy.id };
    }
    case 'trip/update':
      return editActive(data, (trip) => createTrip({ ...trip, ...action.patch, id: trip.id }));
    case 'trip/remove': {
      const trips = data.trips.filter((trip) => trip.id !== action.id);
      const activeTripId = data.activeTripId === action.id ? (trips[0]?.id ?? null) : data.activeTripId;
      return { trips, activeTripId };
    }
    case 'segment/add':
      return editActive(data, (trip) => addSegment(trip, action.segment));
    case 'segment/update':
      return editActive(data, (trip) => updateSegment(trip, action.id, action.patch));
    case 'segment/remove':
      return editActive(data, (trip) => removeSegment(trip, action.id));
    case 'segment/locate':
      return editActive(data, (trip) =>
        updateSegment(trip, action.id, { lat: action.lat, lng: action.lng, place: action.place }),
      );
    case 'stay/resize':
      return editActive(data, (trip) => resizeStay(trip, action.id, action.edge, action.date));
    case 'shift/approve':
      return editActive(data, (trip) => approveShifts(trip, action.ids));
    case 'shift/dismiss':
      return editActive(data, (trip) => dismissShifts(trip, action.ids));
    case 'activity/save':
      return editActive(data, (trip) => saveActivity(trip, action.segmentId, action.activity, action.fromSegmentId));
    case 'activity/move':
      return editActive(data, (trip) =>
        moveActivity(trip, action.fromSegmentId, action.activityId, action.toSegmentId, action.date),
      );
    case 'activity/remove':
      return editActive(data, (trip) => removeActivity(trip, action.segmentId, action.activityId));
    default:
      return data;
  }
}

export function reducer(state, action) {
  if (action.type === 'prefs/set') return { ...state, prefs: { ...state.prefs, ...action.prefs } };
  const data = dataReducer(state.data, action);
  return data === state.data ? state : { ...state, data };
}
