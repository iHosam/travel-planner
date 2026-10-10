// The globe view: the trip traced across a spinning Earth, with the route listed beside it.
// The list is the real interface (it works without sight or a pointer); the canvas illustrates it.

import { formatDay } from '../domain/dates.js';
import { buildRoute, nearestNeighbour, toVector } from '../domain/geo.js';
import { searchPlaces } from '../io/geocode.js';
import { cx } from './controls.js';
import { createGlobe } from './globe-renderer.js';
import { Icon, segmentIcon } from './icons.js';
import { html, useEffect, useMemo, useRef, useState } from './lib.js';

const paletteColor = (canvas, index) => getComputedStyle(canvas).getPropertyValue(`--stay-${(index % 6) + 1}`);

export function Globe({ trip, dispatch }) {
  const canvas = useRef(null);
  const globe = useRef(null);
  const route = useMemo(() => buildRoute(trip), [trip]);
  const [selectedId, setSelectedId] = useState(null);
  const [spin, setSpin] = useState(() => !matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [picker, setPicker] = useState(null); // { stopId, query, results, busy, message }
  const [locatingAll, setLocatingAll] = useState(false);

  const located = route.stops.filter((stop) => stop.located);
  const missing = route.stops.filter((stop) => !stop.located);
  const locatedKey = located.map((stop) => `${stop.id}@${stop.lat},${stop.lng}`).join('|');

  useEffect(() => {
    globe.current = createGlobe(canvas.current, { onSelect: setSelectedId });
    return () => globe.current.destroy();
  }, []);

  useEffect(() => {
    globe.current.setScene({
      selectedId,
      legs: route.legs,
      stops: located.map((stop) => ({
        id: stop.id,
        label: stop.name,
        lat: stop.lat,
        lng: stop.lng,
        color: paletteColor(canvas.current, route.stops.indexOf(stop)),
      })),
    });
  }, [route, selectedId]);

  // Frame the whole route when the trip opens or a place is added to the globe.
  useEffect(() => {
    globe.current.fit();
  }, [trip.id, locatedKey]);

  useEffect(() => {
    const stop = located.find((item) => item.id === selectedId);
    if (!stop) return;
    // Close enough to tell this place from its nearest neighbour (Kyoto and Osaka are 40 km apart).
    const others = located.filter((item) => item !== stop).map((item) => toVector(item.lat, item.lng));
    const gap = nearestNeighbour(toVector(stop.lat, stop.lng), others);
    globe.current.flyTo(stop.lat, stop.lng, gap ? globe.current.zoomToSeparate(gap, 90) : 3);
  }, [selectedId]);

  useEffect(() => globe.current.setSpin(spin), [spin]);

  const place = (stop, result) =>
    dispatch({ type: 'segment/locate', id: stop.segmentId, lat: result.lat, lng: result.lng, place: result.label });

  const search = async (stop, query) => {
    setPicker({ stopId: stop.id, query, results: [], busy: true });
    try {
      const results = await searchPlaces(query);
      setPicker({ stopId: stop.id, query, results, busy: false, message: results.length ? '' : 'No places found. Try adding the country.' });
    } catch (error) {
      setPicker({ stopId: stop.id, query, results: [], busy: false, message: error.message });
    }
  };

  // Takes the best match for each place; "Change" on a row offers the alternatives.
  const locateAll = async () => {
    setLocatingAll(true);
    setPicker(null);
    let failed = null;
    for (const stop of missing) {
      try {
        const [best] = await searchPlaces(stop.name);
        if (best) place(stop, best);
        else failed ??= { stopId: stop.id, query: stop.name, results: [], busy: false, message: 'No places found. Try adding the country.' };
      } catch (error) {
        failed = { stopId: stop.id, query: stop.name, results: [], busy: false, message: error.message };
        break;
      }
    }
    setLocatingAll(false);
    setPicker(failed);
  };

  const renderPicker = (stop) => html`
    <form class="place-picker"
      onSubmit=${(event) => {
        event.preventDefault();
        search(stop, picker.query);
      }}>
      <div class="place-search">
        <input class="input" aria-label="Place to search for" value=${picker.query} autocomplete="off"
          onInput=${(event) => setPicker({ ...picker, query: event.target.value })} />
        <button type="submit" class="btn tinted" disabled=${picker.busy}>${picker.busy ? 'Searching…' : 'Search'}</button>
      </div>
      ${picker.message && html`<p class="place-message" role="status">${picker.message}</p>`}
      ${picker.results.length > 0 &&
      html`
        <ul class="place-results">
          ${picker.results.map(
            (result) => html`
              <li>
                <button type="button" class="place-result"
                  onClick=${() => {
                    place(stop, result);
                    setPicker(null);
                    setSelectedId(stop.id);
                  }}>
                  ${result.label}
                </button>
              </li>
            `,
          )}
        </ul>
      `}
    </form>
  `;

  const renderStop = (stop, index) => {
    const leaving = route.legs.find((leg) => leg.from === stop.id);
    const dates = stop.kind === 'stay' && stop.startDate !== stop.endDate
      ? `${formatDay(stop.startDate)} – ${formatDay(stop.endDate)}`
      : formatDay(stop.startDate);
    const picking = picker?.stopId === stop.id;
    return html`
      <li key=${stop.id} class=${cx('stop', stop.id === selectedId && 'selected', !stop.located && 'unplaced')}
        style=${`--c:var(--stay-${(index % 6) + 1})`}>
        <div class="stop-row">
          <button type="button" class="stop-main" disabled=${!stop.located} aria-pressed=${String(stop.id === selectedId)}
            title=${stop.located ? `Fly to ${stop.name}` : undefined}
            onClick=${() => setSelectedId(stop.id === selectedId ? null : stop.id)}>
            <span class="stop-index">${index + 1}</span>
            <span class="stop-text">
              <strong>${stop.name}</strong>
              <small>${stop.located ? stop.place || 'On the globe' : 'Not on the globe yet'}</small>
              <small>${dates}</small>
            </span>
          </button>
          <button type="button" class="btn plain"
            onClick=${() => (picking ? setPicker(null) : search(stop, stop.name))}>
            ${picking ? 'Close' : stop.located ? 'Change' : 'Locate'}
          </button>
        </div>
        ${picking && renderPicker(stop)}
        ${leaving &&
        html`
          <p class="stop-leg">
            <${Icon} name=${leaving.method ? segmentIcon({ type: 'transit', method: leaving.method }) : 'chevron'} size=${14} />
            ${leaving.name || 'Travel not planned yet'}${leaving.name ? ` · ${formatDay(leaving.date)}` : ''}
          </p>
        `}
      </li>
    `;
  };

  const summary = located.length
    ? `Globe showing ${located.map((stop) => stop.name).join(', then ')}.`
    : 'Globe. No places from this trip are on it yet.';

  return html`
    <section class="globe" aria-label="Trip on the globe" data-lenis-prevent>
      <div class="globe-stage">
        <canvas ref=${canvas} class="globe-canvas" tabindex="0" role="img" aria-label=${`${summary} Arrow keys rotate, plus and minus zoom.`}></canvas>
        <div class="globe-controls" role="group" aria-label="Globe controls">
          <button type="button" class="icon-btn" aria-label="Zoom in" title="Zoom in" onClick=${() => globe.current.zoomBy(1.5)}>
            <${Icon} name="plus" size=${16} />
          </button>
          <button type="button" class="icon-btn" aria-label="Zoom out" title="Zoom out" onClick=${() => globe.current.zoomBy(1 / 1.5)}>
            <${Icon} name="minus" size=${16} />
          </button>
          <button type="button" class="icon-btn" aria-label="Show whole route" title="Show whole route"
            onClick=${() => {
              setSelectedId(null);
              globe.current.fit();
            }}>
            <${Icon} name="frame" size=${16} />
          </button>
          <button type="button" class="icon-btn" aria-label=${spin ? 'Stop spinning' : 'Spin'} title=${spin ? 'Stop spinning' : 'Spin'}
            aria-pressed=${String(spin)} onClick=${() => setSpin(!spin)}>
            <${Icon} name=${spin ? 'pause' : 'play'} size=${16} />
          </button>
        </div>
        <p class="globe-hint">Drag to turn · scroll or pinch to zoom · tap a place to fly there</p>
      </div>
      <aside class="globe-side">
        <h2 class="globe-heading">Route</h2>
        ${route.stops.length === 0 && html`<p class="globe-empty">Add a stay and it will appear here.</p>`}
        ${missing.length > 0 &&
        html`
          <div class="globe-notice">
            <p>
              ${missing.length === 1 ? '1 place is' : `${missing.length} places are`} not on the globe yet. Looking them up
              sends the place names to Open-Meteo.
            </p>
            <button type="button" class="btn primary" disabled=${locatingAll} onClick=${locateAll}>
              ${locatingAll ? 'Locating…' : missing.length === 1 ? 'Locate It' : 'Locate All'}
            </button>
          </div>
        `}
        <ol class="stops">${route.stops.map(renderStop)}</ol>
        <p class="globe-credit">Place search: Open-Meteo, GeoNames (CC BY 4.0). Land: Natural Earth.</p>
      </aside>
    </section>
  `;
}
